// Isolated real UI + PDF reader test. API is mocked; never connects to production.
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),assert=require("node:assert/strict"),{createRequire}=require("node:module");
const root=path.resolve(__dirname,".."),app=path.join(root,"artifacts/football-training-board"),req=createRequire(path.join(app,"package.json")),esbuild=createRequire(req.resolve("vite"))("esbuild");
const [pdf2017,pdf2019]=process.argv.slice(2);if(!pdf2017||!pdf2019)throw Error("Usage: node scripts/test-shared-tournament-import-ui.cjs <2017.pdf> <2019.pdf>");
(async()=>{
const dir=path.join(root,".tools/shared-import-ui");fs.mkdirSync(dir,{recursive:true});
fs.copyFileSync(req.resolve("pdfjs-dist/build/pdf.worker.mjs"),path.join(dir,"worker.mjs"));
const entry=[
'import React,{useState}from"react";import{createRoot}from"react-dom/client";import{QueryClient,QueryClientProvider}from"@tanstack/react-query";',
'import SharedTournamentProgram from "./src/pages/calendari/SharedTournamentProgram";',
'function Demo(){const[team,setTeam]=useState(86),[end,setEnd]=useState("2027-01-02");return <main className="mx-auto max-w-5xl space-y-4 p-4"><p>Anteprima locale · dati di esempio</p><h1 className="text-xl font-semibold">Torneo di Natale · programmi per annata</h1><div className="flex gap-3"><button onClick={()=>setTeam(86)}>Annata 2017</button><button onClick={()=>setTeam(88)}>Annata 2019</button><button onClick={()=>setEnd("2026-12-20")}>Solo dicembre</button></div><SharedTournamentProgram key={team+end} id={1} teamId={team} teamName={team===86?"Pulcini 1° anno":"Primi Calci 1° anno"} startDate="2026-12-19" endDate={end} phases={[]} canManage={true} basePath="/calendari"/></main>}',
'createRoot(document.getElementById("root")!).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Demo/></QueryClientProvider>);'
].join("\n");
await esbuild.build({stdin:{contents:entry,resolveDir:app,loader:"tsx"},bundle:true,platform:"browser",jsx:"automatic",alias:{"@":path.join(app,"src")},define:{"import.meta.env":'{"PROD":false,"DEV":false,"BASE_URL":"/"}'},outfile:path.join(dir,"bundle.js"),plugins:[{name:"isolated",setup(build){
build.onResolve({filter:/hooks\/use-auth$/},()=>({path:"auth",namespace:"stub"}));
build.onResolve({filter:/^@workspace\/api-client-react$/},()=>({path:"club",namespace:"stub"}));
build.onLoad({filter:/.*/,namespace:"stub"},({path:file})=>({contents:file==="auth"?'export const useAuth=()=>({club:{id:1,name:"ASD FORTIS JUVENTUS 1909"},user:{id:1},role:"secretary"});':'export const useGetMyClub=()=>({data:{name:"ASD FORTIS JUVENTUS 1909",legalName:"FORTIS JUVENTUS"},isLoading:false});',loader:"js"}));
build.onResolve({filter:/pdf\.worker\.mjs\?url$/},()=>({path:"worker",namespace:"worker"}));build.onLoad({filter:/.*/,namespace:"worker"},()=>({contents:'export default "/worker.mjs";',loader:"js"}));
}}]});
const assets=path.join(app,"dist/public/assets");fs.copyFileSync(path.join(assets,fs.readdirSync(assets).find(file=>file.endsWith(".css"))),path.join(dir,"style.css"));
fs.writeFileSync(path.join(dir,"index.html"),'<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
const server=http.createServer((req,res)=>{const f=({"/":"index.html","/bundle.js":"bundle.js","/worker.mjs":"worker.mjs","/style.css":"style.css"})[req.url];if(!f){res.writeHead(404).end();return;}res.setHeader("Content-Type",f.endsWith("js")?"application/javascript":f.endsWith("css")?"text/css":"text/html");res.end(fs.readFileSync(path.join(dir,f)));});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));let browser;
try{
const{chromium}=require("C:/Users/conce/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");browser=await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900},timezoneId:"Europe/Rome"});
const programmes={86:[],88:[]},writes=[];let revision=3;
await page.route("**/api/**",async route=>{
const request=route.request(),url=new URL(request.url());
if(request.method()==="PUT"){const body=request.postDataJSON();writes.push(body);assert.equal(body.expectedRevision,revision);programmes[body.teamId]=structuredClone(body.program);revision++;return route.fulfill({contentType:"application/json",body:JSON.stringify({ok:true})});}
const team=Number(url.searchParams.get("teamId"));return route.fulfill({contentType:"application/json",body:JSON.stringify({revision,program:programmes[team]??[]})});
});
await page.goto("http://127.0.0.1:"+server.address().port);
await page.getByRole("button",{name:"Carica programma dell’annata",exact:true}).waitFor();
await page.getByLabel("Carica programma di Pulcini 1° anno",{exact:true}).setInputFiles(pdf2017);
await page.getByText(/12 gare nel programma/).waitFor({timeout:45000});
assert.ok(await page.getByText(/6 gare dell’annata/).isVisible());assert.equal(writes.length,0,"File read must not save automatically");
await page.getByRole("button",{name:"Salva programma dell’annata",exact:true}).click();
await page.getByRole("dialog").waitFor({state:"hidden"});
assert.equal(writes.length,1);assert.equal(writes[0].teamId,86);assert.equal(programmes[86].length,12);assert.equal(programmes[88].length,0);
const first=JSON.stringify(programmes[86]);
await page.getByRole("button",{name:"Annata 2019",exact:true}).click();
await page.getByText(/Programma da compilare/).waitFor();
await page.getByLabel("Carica programma di Primi Calci 1° anno",{exact:true}).setInputFiles(pdf2019);
await page.getByText(/25 gare nel programma/).waitFor({timeout:45000});assert.ok(await page.getByText(/9 gare dell’annata/).isVisible());
await page.screenshot({path:path.join(root,"../outputs/import-programma-annata-desktop.png"),fullPage:true});
await page.setViewportSize({width:390,height:844});
assert.equal(await page.getByRole("dialog").evaluate(el=>el.scrollWidth>el.clientWidth),false,"Mobile dialog must not overflow");
await page.screenshot({path:path.join(root,"../outputs/import-programma-annata-mobile.png"),fullPage:true});
await page.getByRole("button",{name:"Salva programma dell’annata",exact:true}).click();
await page.getByRole("dialog").waitFor({state:"hidden"});
assert.equal(writes.length,2);assert.equal(writes[1].teamId,88);assert.equal(programmes[88].length,25);assert.equal(JSON.stringify(programmes[86]),first,"Other team must remain untouched");
await page.getByLabel("Carica programma di Primi Calci 1° anno",{exact:true}).setInputFiles(pdf2019);
await page.getByText(/0 nuove gare, 25 già presenti/).waitFor({timeout:45000});
await page.getByRole("button",{name:"Annulla",exact:true}).click();assert.equal(writes.length,2);
await page.getByRole("button",{name:"Solo dicembre",exact:true}).click();
await page.getByRole("button",{name:"Prepara / modifica programma",exact:true}).click();
await page.getByText(/10 gare fuori dalle date del torneo/).waitFor();
assert.equal(await page.getByRole("button",{name:"Salva programma dell’annata",exact:true}).isEnabled(),false);
console.log("PASS actual UI/PDF flow: 2017 12/6, 2019 25/9, separate team saves, preview before write, safe reimport, cancel, out-of-range alert; desktop/mobile; mock API only");
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
