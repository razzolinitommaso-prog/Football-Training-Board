const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),web=createRequire(path.join(root,'artifacts/football-training-board/package.json'));
const output=path.join(root,'.tools/kit-potential-detail.cjs');fs.mkdirSync(path.dirname(output),{recursive:true});
createRequire(web.resolve('vite'))('esbuild').buildSync({entryPoints:[path.join(root,'artifacts/football-training-board/src/lib/kit-potential.ts')],outfile:output,bundle:true,platform:'node',format:'cjs',alias:{'@workspace/api-zod':path.join(root,'lib/api-zod/src/index.ts')}});
const {estimateKitPotential}=require(output);
const catalog=[{id:1,name:'Maglia allenamento',kitSlots:['training_shirt'],price:9.5},{id:2,name:'Stessa voce',kitSlots:['training_shirt'],price:8},{id:3,name:'Inattivo',kitSlots:['training_shirt'],price:1,isActive:0},{id:4,name:'Quota',kitSlots:['training_shirt'],price:100,itemType:'annual_fee'},{id:5,name:'Gratuito',kitSlots:['training_socks'],price:0}];
const estimate=(payments=[])=>estimateKitPotential([1,2],[],catalog,[],payments);
let result=estimate();
assert.equal(result.cents,1600);assert.equal(result.withoutKit,2);
assert.equal(result.breakdown.reduce((sum,line)=>sum+line.cents,0),result.cents);
assert.equal(result.breakdown.filter(line=>line.unitCents===null).reduce((sum,line)=>sum+line.quantity,0),result.unpricedItems);
assert.equal(result.breakdown.find(line=>line.key==='training_shirt').unitCents,800);
assert.equal(result.breakdown.find(line=>line.key==='training_socks').unitCents,0);
result=estimate([{id:10,playerId:1,paymentType:'kit_article',amount:8,status:'paid',kitArticle:{id:2}}]);
assert.equal(result.cents,800);assert.equal(result.withoutKit,1);assert.equal(result.partialKit,1);
assert.equal(result.breakdown.find(line=>line.key==='training_shirt').quantity,1);
result=estimate([{id:11,playerId:2,paymentType:'kit_payment',amount:30,status:'paid'}]);
assert.equal(result.toVerify,1);assert.equal(result.withoutKit,1);assert.equal(result.cents,800);
assert.equal(result.breakdown.find(line=>line.key==='training_shirt').quantity,1);
console.log('PASS KIT detail: subtotal, missing prices, free articles, lowest active price, linked receipts and ambiguous receipts');
const winter=estimateKitPotential([1],[],[
  {id:20,name:'Pinocchietto invernale',category:'Pinocchietto invernale',price:12.5,itemType:'kit'},
  {id:21,name:'Tuta invernale allenamento',price:37.5,itemType:'kit'},
],[],[]);
assert.equal(winter.breakdown.find(line=>line.key==='winter_pinocchietto').unitCents,1250);
assert.equal(winter.breakdown.find(line=>line.key==='winter_tracksuit').unitCents,3750);
assert.equal(winter.cents,5000);
const excluded=estimateKitPotential([1],[],[{id:22,name:'Pinocchietto invernale',price:12.5,kitSlots:[]}],[],[]);
assert.equal(excluded.breakdown.find(line=>line.key==='winter_pinocchietto').unitCents,null,'explicit empty links must remain authoritative');
console.log('PASS canonical winter catalog categories and explicit exclusions');
