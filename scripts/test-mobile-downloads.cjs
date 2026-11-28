const assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const path=require('node:path');
module.exports=async({base})=>{
  const XLSX=createRequire(path.resolve('artifacts/football-training-board/package.json'))('xlsx');
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet([{Giocatore:'Atleta di collaudo',Presenze:3}]),'Dati');
  const excel=XLSX.write(workbook,{bookType:'xlsx',type:'buffer'});
  const pdf=Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
  async function prepare(bytes,name,headers={}){const r=await fetch(base+'/export-downloads',{method:'POST',headers:{'content-type':'application/octet-stream','x-export-filename':encodeURIComponent(name),'x-role':'coach',...headers},body:bytes});return{status:r.status,data:await r.json()};}
  async function get(url,headers={}){return fetch(base+url.replace('/api',''),{headers:{'x-role':'coach',...headers}});}
  const p=await prepare(pdf,'Test motori à.pdf');assert.equal(p.status,201,JSON.stringify(p));
  const r=await get(p.data.url);assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/^attachment;/);assert.match(r.headers.get('content-disposition'),/filename\*=UTF-8''Test%20motori%20%C3%A0.pdf/);assert.match(r.headers.get('content-type'),/application\/pdf/);assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.match(r.headers.get('cache-control'),/no-store/);assert.deepEqual(Buffer.from(await r.arrayBuffer()),pdf);
  assert.match((await get(p.data.url+'?disposition=inline')).headers.get('content-disposition'),/^inline;/);
  for(const headers of [{'x-club':'2'},{'x-user':'2'},{'x-role':'parent'},{'x-child':'102'}])assert.equal((await get(p.data.url,headers)).status,404);
  assert.equal((await get(p.data.url,{'x-anonymous':'1'})).status,401);
  const x=await prepare(excel,'Registro.xlsx');assert.equal(x.status,201,JSON.stringify(x));const xr=await get(x.data.url);const actual=Buffer.from(await xr.arrayBuffer());assert.deepEqual(actual,excel);assert.equal(XLSX.utils.sheet_to_json(XLSX.read(actual,{type:'buffer'}).Sheets.Dati)[0].Presenze,3);
  assert.match((await get(x.data.url+'?disposition=inline')).headers.get('content-disposition'),/^attachment;/);
  assert.equal((await prepare(Buffer.from('html'),'file.html')).status,400);assert.equal((await prepare(Buffer.from('not pdf'),'file.pdf')).status,400);assert.equal((await prepare(Buffer.alloc(0),'file.pdf')).status,400);
  assert.equal((await prepare(pdf,'file.pdf',{'x-anonymous':'1'})).status,401);
  assert.equal((await prepare(pdf,'file.pdf',{'x-club':'0'})).status,403);
  const manager=await prepare(pdf,'presenze.pdf',{'x-role':'team_manager'});assert.equal(manager.status,201);assert.equal((await get(manager.data.url,{'x-role':'team_manager'})).status,200);
  for(let i=0;i<3;i++)assert.equal((await prepare(pdf,`altro-${i}.pdf`)).status,201);
  assert.equal((await get(p.data.url)).status,404,'per-profile cache evicts older exports');
  const last=await prepare(pdf,'scadenza.pdf');const original=Date.now;try{Date.now=()=>original()+11*60_000;assert.equal((await get(last.data.url)).status,404);}finally{Date.now=original;}
  console.log('PASS mobile HTTP downloads: exact PDF/XLSX bytes and workbook values, attachment/inline, filename, authentication, role/club/user/child isolation, format checks, manager access, bounded cache and expiry.');
};
