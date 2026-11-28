const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(path.resolve('artifacts/football-training-board/src/lib/export-download.ts'),'utf8');
let token='profile-a',width=390,requests=0,clicks=0,status=201,changeProfile=false;
const events=[],moduleState={exports:{}};
const context={module:moduleState,exports:moduleState.exports,Blob,Error,Promise,CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},navigator:{userAgent:'Android',maxTouchPoints:1},URL:{createObjectURL:()=> 'blob:local-file',revokeObjectURL:()=>{}},window:{matchMedia:()=>({matches:width<=767}),dispatchEvent:event=>events.push(event.detail)},document:{createElement:()=>({style:{},click:()=>clicks++,remove(){}}),body:{append(){}}},fetch:async(_url,request)=>{requests++;assert.equal(request.credentials,'include');assert.equal(request.headers['Content-Type'],'application/octet-stream');assert.ok(request.body instanceof Blob);if(changeProfile)token='profile-b';return{ok:status===201,status,json:async()=>status===201?{url:'/api/export-downloads/'+'a'.repeat(64),filename:'test.pdf',expiresAt:'2099-01-01'}:{error:'Server non disponibile'}};},require:name=>name==='./api-base'?{withApi:path=>path}:name==='./auth-token'?{getAuthToken:()=>token}:(()=>{throw Error(name)})()};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
(async()=>{
  const api=moduleState.exports,pdf=new Blob(['%PDF-1.4 test'],{type:'application/pdf'});
  let file=await api.downloadExport(pdf,'test.pdf');assert.match(file.url,/^\/api\/export-downloads\//);assert.equal(clicks,0,'mobile needs a visible real HTTP link');assert.equal(requests,1);assert.equal(events.at(-1).artifact.filename,'test.pdf');
  status=503;file=await api.downloadExport(pdf,'test.pdf');assert.equal(file,undefined);assert.equal(events.at(-1).error,'Server non disponibile');
  status=201;changeProfile=true;file=await api.downloadExport(pdf,'test.pdf');assert.equal(file,undefined);assert.match(events.at(-1).error,/profilo è cambiato/);changeProfile=false;
  file=await api.downloadExport(new Blob([]),'empty.pdf');assert.equal(file,undefined);assert.match(events.at(-1).error,/vuoto/);
  width=1280;context.navigator.userAgent='Desktop';context.navigator.maxTouchPoints=0;const before=requests;file=await api.downloadExport(pdf,'test.pdf');assert.equal(file.url,'blob:local-file');assert.equal(clicks,1);assert.equal(requests,before,'desktop keeps local export');
  console.log('PASS export client: mobile HTTP preparation, explicit retry link, visible error, empty file, account change isolation and desktop local download.');
})().catch(error=>{console.error(error);process.exitCode=1;});
