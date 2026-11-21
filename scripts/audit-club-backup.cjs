// Read-only reconciliation of the entire club snapshot; never connects to a live database.
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module'),{createGunzip}=require('node:zlib'),{createInterface}=require('node:readline');
const {verifyBackup}=require('./verify-club-backup.cjs');
function open(file){const src=fs.createReadStream(file),zip=createGunzip();src.on('error',e=>zip.destroy(e));return src.pipe(zip);}
async function auditBackup(file,today){
  const verification=await verifyBackup(open(file));
  const wanted=['players','player_payments','member_dues','member_expense_receipts','player_finance_dues','player_finance_expense_receipts'];
  const data=Object.fromEntries(wanted.map(n=>[n,[]]));let header;
  for await(const line of createInterface({input:open(file),crlfDelay:Infinity})){
    const row=JSON.parse(line);if(row.type==='header')header=row;
    if(row.type==='rows'&&wanted.includes(row.table))data[row.table].push(...row.rows);
  }
  const root=path.resolve(__dirname,'..'),web=createRequire(path.join(root,'artifacts/football-training-board/package.json'));
  const out=path.join(root,'.tools/financial-backup-audit.cjs');fs.mkdirSync(path.dirname(out),{recursive:true});
  await createRequire(web.resolve('vite'))('esbuild').build({entryPoints:[path.join(root,'artifacts/football-training-board/src/lib/financial-reconciliation.ts')],outfile:out,bundle:true,platform:'node',format:'cjs'});
  const {reconcileIncome,reconcileExpenses}=require(out);
  const players=new Map(data.players.map(p=>[p.id,p]));const missingPlayers=[];
  const income=data.player_payments.filter(r=>!players.get(r.player_id)?.is_test).map(r=>{
    if(!players.has(r.player_id))missingPlayers.push(r.id);
    return {id:r.id,playerId:r.player_id,amount:Number(r.amount),status:r.status,dueDate:r.due_date,paymentDate:r.payment_date,paymentType:r.payment_type,paymentMethod:r.payment_method,description:r.description};
  });
  function cost(prefix,senior){
    if(!header.tables.includes(prefix+'_dues'))return {available:false,reason:'Registro non presente nel database esportato'};
    const allDues=data[prefix+'_dues'];const byId=new Map(allDues.map(r=>[r.id,r]));
    const receipts=data[prefix+'_expense_receipts'].filter(r=>!senior||!players.get(byId.get(r.due_id)?.player_id)?.is_test).map(r=>({id:r.id,dueId:r.due_id,amountCents:r.amount_cents}));
    const dues=allDues.filter(r=>!r.canceled&&(!senior||!players.get(r.player_id)?.is_test)).map(r=>({id:r.id,amountCents:r.amount_cents,paidCents:receipts.filter(p=>p.dueId===r.id).reduce((n,p)=>n+p.amountCents,0),details:{...r.details,allocations:r.details?.allocations||[]}}));
    return {available:true,records:dues.length,receipts:receipts.length,...reconcileExpenses({dues,receipts},prefix)};
  }
  return {clubId:verification.clubId,asOf:today,currency:'EUR',unit:'cents',scope:'All exported club records; TEST excluded. No filters or bank comparison.',income:{records:income.length,missingPlayerReferences:missingPlayers,...reconcileIncome(income,today)},members:cost('member',false),senior:cost('player_finance',true)};
}
module.exports={auditBackup};
if(require.main===module){
  const [file,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome'}).format(new Date())]=process.argv.slice(2);
  if(!file)throw Error('Uso: node scripts/audit-club-backup.cjs <backup.ndjson.gz> [YYYY-MM-DD]');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(today))throw Error('Data non valida');
  auditBackup(file,today).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
