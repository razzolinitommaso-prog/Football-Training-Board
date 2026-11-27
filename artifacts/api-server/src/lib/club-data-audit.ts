import {createHash} from "node:crypto";
import {reconcileIncome,reconcileExpenses,type ClubDataAudit,type AuditIssue} from "@workspace/api-zod";

type Row=Record<string,any>;
type Relation={child:string;parent:string;columns:string[];targets:string[]};
const financialTables=new Set(["players","player_payments","member_dues","member_expense_receipts","player_finance_dues","player_finance_expense_receipts","warehouse_purchases","warehouse_expense_receipts"]);

/** Consume the complete snapshot without retaining document bodies or using a writable transaction. */
export async function auditClubData(chunks:AsyncIterable<string>,clubId:number,today:string):Promise<ClubDataAudit>{
  let header:Row|undefined,manifest:Row|undefined,pending="";
  const data=new Map<string,Row[]>(),states=new Map<string,{count:number;hash:ReturnType<typeof createHash>}>();
  const parentKeys=new Map<string,Set<string>>(),references:{source:string;record:string;target:string;value:string}[]=[];
  const key=(table:string,columns:string[])=>JSON.stringify([table,columns]);
  function consume(line:string){
    if(!line.trim())return;
    const item=JSON.parse(line) as Row;
    if(manifest)throw Error("Dati dopo il manifesto finale");
    if(!header){
      if(item.type!=="header"||item.format!=="ftb-club-backup"||item.version!==1||item.clubId!==clubId||!Array.isArray(item.tables)||new Set(item.tables).size!==item.tables.length)throw Error("Intestazione snapshot non valida");
      header=item;return;
    }
    if(item.type==="manifest"){manifest=item;return;}
    if(item.type!=="rows"||!header.tables.includes(item.table)||!Array.isArray(item.rows))throw Error("Blocco snapshot non valido");
    const state=states.get(item.table)??{count:0,hash:createHash("sha256")};states.set(item.table,state);
    for(const row of item.rows as Row[]){
      state.hash.update(JSON.stringify(row)+"\n");state.count++;
      for(const relation of (header.relationships??[]) as Relation[]){
        if(relation.parent===item.table){
          const target=key(item.table,relation.targets),values=relation.targets.map(column=>row[column]);
          const set=parentKeys.get(target)??new Set<string>();set.add(JSON.stringify(values));parentKeys.set(target,set);
        }
        if(relation.child===item.table){
          const values=relation.columns.map(column=>row[column]);
          if(values.some(value=>value==null))continue;
          references.push({source:item.table,record:String(row.id??state.count),target:key(relation.parent,relation.targets),value:JSON.stringify(values)});
        }
      }
    }
    if(financialTables.has(item.table)){const kept=data.get(item.table)??[];kept.push(...item.rows);data.set(item.table,kept);}
  }
  for await(const chunk of chunks){pending+=chunk;let split:number;while((split=pending.indexOf("\n"))>=0){consume(pending.slice(0,split));pending=pending.slice(split+1);}}
  if(pending.trim())consume(pending);
  if(!header||!manifest?.complete||!Array.isArray(manifest.tables)||manifest.tables.length!==header.tables.length||new Set(manifest.tables.map((table:Row)=>table.table)).size!==header.tables.length)throw Error("Snapshot incompleto");
  let rows=0;
  for(const table of manifest.tables as Row[]){
    if(!header.tables.includes(table.table))throw Error("Tabella non dichiarata");
    const state=states.get(table.table)??{count:0,hash:createHash("sha256")};
    if(state.count!==table.rows||state.hash.digest("hex")!==table.sha256)throw Error("Integrità snapshot non valida");
    rows+=state.count;
  }
  const players=new Map((data.get("players")??[]).map(row=>[row.id,row]));
  const payments=(data.get("player_payments")??[]).filter(row=>!players.get(row.player_id)?.is_test);
  const income=reconcileIncome(payments.map(row=>({id:row.id,playerId:row.player_id,amount:Number(row.amount),status:row.status,dueDate:row.due_date,paymentDate:row.payment_date,paymentType:row.payment_type,paymentMethod:row.payment_method,description:row.description})),today);
  function expenses(prefix:string,senior=false){
    const raw=data.get(prefix+"_dues")??[],byId=new Map(raw.map(row=>[row.id,row]));
    const receipts=(data.get(prefix+"_expense_receipts")??[]).filter(row=>!senior||!players.get(byId.get(row.due_id)?.player_id)?.is_test).map(row=>({id:String(row.id),dueId:row.due_id,amountCents:row.amount_cents}));
    const paid=new Map<number,number>();for(const receipt of receipts)paid.set(receipt.dueId,(paid.get(receipt.dueId)??0)+receipt.amountCents);
    const dues=raw.filter(row=>!row.canceled&&(!senior||!players.get(row.player_id)?.is_test)).map(row=>({id:row.id,amountCents:row.amount_cents,paidCents:paid.get(row.id)??0,details:{allocations:Array.isArray(row.details?.allocations)?row.details.allocations:[]}}));
    return {...reconcileExpenses({dues,receipts},prefix),available:header!.tables.includes(prefix+"_dues")&&header!.tables.includes(prefix+"_expense_receipts"),records:dues.length,receipts:receipts.length};
  }
  const warehousePurchases=data.get("warehouse_purchases")??[],warehouseIds=new Map(warehousePurchases.map((p,i)=>[p.id,i+1]));
  const warehouseReceipts=(data.get("warehouse_expense_receipts")??[]).map(r=>({id:String(r.id),dueId:warehouseIds.get(r.purchase_id)??0,amountCents:r.amount_cents}));
  const warehouseDues=warehousePurchases.map(p=>({id:warehouseIds.get(p.id)!,amountCents:p.amount_cents,paidCents:warehouseReceipts.filter(r=>r.dueId===warehouseIds.get(p.id)).reduce((n,r)=>n+r.amountCents,0),details:{allocations:[]}}));
  const warehouse={...reconcileExpenses({dues:warehouseDues,receipts:warehouseReceipts},"Fornitori KIT"),available:header.tables.includes("warehouse_purchases")&&header.tables.includes("warehouse_expense_receipts"),records:warehouseDues.length,receipts:warehouseReceipts.length};
  const missing=references.filter(ref=>!parentKeys.get(ref.target)?.has(ref.value));
  const issues:AuditIssue[]=missing.slice(0,100).map(ref=>({source:ref.source,record:ref.record,message:"Riferimento non trovato tra le tabelle incluse nello snapshot: "+JSON.parse(ref.target)[0]}));
  return {clubId,asOf:today,tables:header.tables.length,rows,integrity:true,externalReferences:Array.isArray(manifest.externalReferences)?manifest.externalReferences.length:0,
    scope:"Tutte le stagioni della società; registrazioni TEST escluse dai totali economici. Riferimenti controllati tra le tabelle incluse. Nessun confronto con banca o cassa.",
    income:{...income,available:header.tables.includes("players")&&header.tables.includes("player_payments"),records:payments.length,missingPlayers:payments.filter(row=>!players.has(row.player_id)).length},
    members:expenses("member"),senior:expenses("player_finance",true),warehouse,references:{checked:references.length,missing:missing.length,issues},
    warnings:[...(!Array.isArray(header.relationships)?["Snapshot privo di metadati dei riferimenti: relazioni non controllate."]:[]),"I documenti esterni e il file salvato sul dispositivo richiedono verifiche separate."]};
}
