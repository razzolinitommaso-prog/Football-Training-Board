// Read-only parser regression check in isolated Chromium; no application API/credentials.
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),assert=require("node:assert/strict"),cp=require("node:child_process"),{createRequire}=require("node:module");
const root=path.resolve(__dirname,".."),app=path.join(root,"artifacts/football-training-board"),req=createRequire(path.join(app,"package.json")),esbuild=createRequire(req.resolve("vite"))("esbuild");
const input=process.argv[2]; if(!input)throw Error("Usage: node scripts/test-tournament-dated-columns.cjs <pdf>");
const parserPath="artifacts/football-training-board/src/lib/match-calendar-pdf.ts";
(async()=>{
const dir=path.join(root,".tools/tournament-dated-tests");fs.mkdirSync(dir,{recursive:true});
fs.copyFileSync(input,path.join(dir,"input.pdf"));fs.copyFileSync(req.resolve("pdfjs-dist/build/pdf.worker.mjs"),path.join(dir,"worker.mjs"));
const baseline=cp.execFileSync("git",["show","346aba1:"+parserPath],{cwd:root,encoding:"utf8",maxBuffer:5e6});
const entry = [
'import * as current from "./src/lib/match-calendar-pdf";',
'import * as baseline from "baseline-parser";',
'import {readDatedTournamentColumns} from "./src/lib/tournament-dated-columns";',
'const options={teamName:"Primi Calci 1° anno",clubName:"ASD FORTIS JUVENTUS 1909",clubAliases:["FORTIS","FORTIS JUVENTUS","BORGO SAN LORENZO"],societyHint:"ASD FORTIS JUVENTUS 1909",documentMode:"tournament" as const,unifiedTournamentProgram:true,ocrEnabled:false};',
'const fixtures=[["TORNEO ESTATE 2026","GIRONE A","19/12/2026 10:00 FORTIS - SIECI","19/12/2026 10:15 PONTASSIEVE - FORTIS"],["TORNEO ESTATE 2026","GIRONE A","19/12/2026 10:00 BORGO SAN LORENZO - SIECI"],["TORNEO ESTATE 2026","GIRONE A","19/12/2026 10:00 FORTIS JUVENTUS - SIECI"],["TORNEO ESTATE 2026","GIRONE A","19/12/2026 10:00 FORTIS - PELAGO","GIRONE B","19/12/2026 10:30 SIECI - DICOMANO","FINALE","19/12/2026 11:30 1A - 1B"]];',
'async function main(){const regressions=fixtures.flatMap(lines=>[undefined,"clone"].map(parserVariant=>({lines,parserVariant,before:baseline.parseMatchCalendarTextLines(lines,undefined,{...options,parserVariant} as any),after:current.parseMatchCalendarTextLines(lines,undefined,{...options,parserVariant} as any)})));',
'const raw=await(await fetch("/input.pdf")).arrayBuffer(), file=new File([raw],"TORNEO NATALE 2019.pdf",{type:"application/pdf",lastModified:Date.parse("2026-11-17")});',
'const base=await current.parseMatchCalendarPdfFile(file,options);const clone=await current.parseMatchCalendarPdfFileClone(file,options);',
'const simple=[{str:"TORNEO 2026",x:10,y:300},{str:"GIRONE UNICO",x:10,y:280},{str:"SABATO 19 DICEMBRE",x:10,y:200},{str:"SABATO 02 GENNAIO",x:310,y:200},{str:"10.00 FORTIS - SIECI",x:10,y:170},{str:"10.30 SIECI - FORTIS",x:310,y:170},{str:"10.15 BORGO SAN LORENZO - PELAGO",x:10,y:140},{str:"10.45 PELAGO - BORGO SAN LORENZO",x:310,y:140}];',
'const guarded={good:readDatedTournamentColumns(simple),single:readDatedTournamentColumns(simple.filter(item=>item.x<300)),wrongWeekday:readDatedTournamentColumns(simple.map(item=>({...item,str:item.str.replace("SABATO 02","VENERDI 02")}))),finals:readDatedTournamentColumns([...simple,{str:"FINALE",x:10,y:100}]),noYear:readDatedTournamentColumns(simple.filter(item=>!item.str.startsWith("TORNEO")))};',
'(window as any).result={base,clone,regressions,guarded};document.body.textContent="OK";}main().catch(error=>{(window as any).failure=String(error);document.body.textContent=String(error)});'
].join("\n");
await esbuild.build({stdin:{contents:entry,resolveDir:app,loader:"ts"},bundle:true,platform:"browser",format:"esm",define:{"import.meta.env":'{"DEV":false}'},outfile:path.join(dir,"audit.js"),plugins:[{name:"test-readers",setup(build){
build.onResolve({filter:/^baseline-parser$/},()=>({path:"baseline-parser",namespace:"baseline"}));
build.onLoad({filter:/.*/,namespace:"baseline"},()=>({contents:baseline,loader:"ts",resolveDir:path.dirname(path.join(root,parserPath))}));
build.onResolve({filter:/pdf\.worker\.mjs\?url$/},()=>({path:"worker",namespace:"worker"}));
build.onLoad({filter:/.*/,namespace:"worker"},()=>({contents:'export default "/worker.mjs";',loader:"js"}));
}}]});
fs.writeFileSync(path.join(dir,"index.html"),'<html><body><script type="module" src="/audit.js"></script></body></html>');
const server=http.createServer((req,res)=>{const f=({"/":"index.html","/input.pdf":"input.pdf","/audit.js":"audit.js","/worker.mjs":"worker.mjs"})[req.url];if(!f){res.writeHead(404).end();return;}res.setHeader("Content-Type",f.endsWith(".js")||f.endsWith(".mjs")?"application/javascript":f.endsWith(".pdf")?"application/pdf":"text/html");res.end(fs.readFileSync(path.join(dir,f)));});
await new Promise(r=>server.listen(0,"127.0.0.1",r));let browser;
try{
const {chromium}=require("C:/Users/conce/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
browser=await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",headless:true});const page=await browser.newPage({timezoneId:"Europe/Rome"});
await page.goto("http://127.0.0.1:"+server.address().port);await page.waitForFunction(()=>window.result||window.failure,{timeout:45000});
const result=await page.evaluate(()=>window.result??window.failure);fs.writeFileSync(path.join(dir,"result.json"),JSON.stringify(result,null,2));
assert.equal(typeof result,"object",JSON.stringify(result));
for(const row of result.regressions)assert.deepEqual(row.after,row.before,"Legacy changed: "+row.lines.join(" | ")+" "+row.parserVariant);
assert.ok(result.regressions[0].before.recognized.length>0);
assert.ok(result.regressions.some(row=>row.lines.some(line=>line.includes("BORGO SAN LORENZO")) && row.before.recognized.length>0));
for(const [key,value]of Object.entries(result.guarded)){if(key==="good"){assert.equal(value.length,4);assert.ok(value[2].startsWith("02/01/2027"));}else assert.equal(value,null,key);}
for(const parsed of [result.base,result.clone]){
assert.equal(parsed.tournamentProgram.length,25,"Expected 25 program games");
assert.equal(parsed.recognized.length,9,"Expected 9 Fortis games");
const expected = ["2026-12-19 10:00 PONTASSIEVE|S.VIGNINI","2026-12-19 10:00 PELAGO|FORTIS","2026-12-19 10:15 DICOMANO|SIECI","2026-12-19 10:15 PONTASSIEVE|PELAGO","2026-12-19 10:30 DICOMANO|S.VIGNINI","2026-12-19 10:30 FORTIS|SIECI","2026-12-19 10:45 PONTASSIEVE|SIECI","2026-12-19 10:45 S.VIGNINI|PELAGO","2026-12-19 11:00 DICOMANO|FORTIS","2026-12-19 11:00 S.VIGNINI|SIECI","2026-12-19 11:15 DICOMANO|PELAGO","2026-12-19 11:15 FORTIS|PONTASSIEVE","2026-12-19 11:30 FORTIS|S.VIGNINI","2026-12-19 11:30 PELAGO|SIECI","2026-12-19 11:45 DICOMANO|PONTASSIEVE","2027-01-02 10:30 DICOMANO|SIECI","2027-01-02 10:30 PONTASSIEVE|FORTIS","2027-01-02 10:45 DICOMANO|S.VIGNINI","2027-01-02 10:45 SIECI|PONTASSIEVE","2027-01-02 11:00 DICOMANO|FORTIS","2027-01-02 11:00 SIECI|S.VIGNINI","2027-01-02 11:15 DICOMANO|PONTASSIEVE","2027-01-02 11:15 FORTIS|S.VIGNINI","2027-01-02 11:30 SIECI|FORTIS","2027-01-02 11:30 PONTASSIEVE|S.VIGNINI"];
const actual=parsed.tournamentProgram.map(entry=>{const date=new Date(entry.date);return new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Rome",year:"numeric",month:"2-digit",day:"2-digit"}).format(date)+" "+new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Rome",hour:"2-digit",minute:"2-digit"}).format(date)+" "+entry.homeTeam+"|"+entry.awayTeam;});
assert.deepEqual(actual.sort(),expected.sort(),"Every fixture/date/time must match the PDF");

const days={};for(const entry of parsed.tournamentProgram){const day=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Rome"}).format(new Date(entry.date));days[day]=(days[day]??0)+1;assert.equal(entry.finalsPolicy,"program-only");if(/PELAGO/.test(entry.homeTeam+" "+entry.awayTeam))assert.equal(day,"2026-12-19");}
assert.deepEqual(days,{"2026-12-19":15,"2027-01-02":10});
}
console.log("PASS dated columns: real PDF 25 games / 9 Fortis, dates 15+10, Pelago only December, base/clone; 8 exact legacy comparisons incl. Borgo alias; ambiguous layouts fall back");
}finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
