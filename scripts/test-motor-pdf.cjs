// Exercise the actual downloadable PDF generator with simulated records, including long notes.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), {createRequire} = require('node:module');
const root = path.resolve(__dirname, '..'), web = createRequire(path.join(root, 'artifacts/football-training-board/package.json'));
const esbuild = createRequire(web.resolve('vite'))('esbuild');
const folder = path.join(root, '.tools/motor-pdf'); fs.mkdirSync(folder, {recursive:true});
esbuild.buildSync({stdin:{contents:`export {buildMotorTestPdf} from './artifacts/football-training-board/src/lib/motor-test-pdf'; export * from './lib/api-zod/src/index';`,resolveDir:root},outfile:path.join(folder,'generator.cjs'),bundle:true,platform:'node',format:'cjs',alias:{'@workspace/api-zod':path.join(root,'lib/api-zod/src/index.ts')}});
const {buildMotorTestPdf,motorTestCatalog,motorLegacyAssessment} = require(path.join(folder,'generator.cjs'));
const result = {measurement:172,score:8,notes:'Note aggiuntive: controllo della postura e dell’atterraggio. '.repeat(22)};
const long = motorLegacyAssessment('long-jump',result);
long.attempts[0].values.cm=152; long.attempts[1].values.cm=172;
long.attempts[1].observations={'0':{value:true,note:'Stacco simultaneo, esecuzione osservata.'}};
const march = motorLegacyAssessment('march',{measurement:0,score:null,notes:''});
march.attempts[1].values={seconds:20,coordination:'Buona',coordinationNote:'Alternanza regolare',spaceTime:'Ottima',spaceTimeNote:'Ritmo e orientamento mantenuti',rotationLevel:'Nessuna',degrees:0,movementLevel:'Nessuno',cm:0};
const session={id:'12121212-1212-1212-1212-121212121212',revision:1,teamId:11,date:'2026-11-18',cycle:'start',trainingSessionId:null,linkProgram:false,exerciseIds:{},tests:motorTestCatalog.map(t=>({id:t.id,minutes:t.minutes})),results:{949:{height:132,weight:20.6,tests:{'long-jump':{...result,assessment:long},march:{measurement:0,score:null,notes:'Nessuno spostamento.',assessment:march}}},950:{height:133,weight:27,tests:{}}}};
const roster=[{id:949,name:'Atleta dimostrativo Giulio',family:'available',coach:'present'},{id:950,name:'Secondo atleta',family:null,coach:'present'},{id:951,name:'Atleta senza rilevazioni',family:'unavailable',coach:'absent'}];
(async()=>{const blob=buildMotorTestPdf(session,roster,'Esordienti 2° anno');const buffer=Buffer.from(await blob.arrayBuffer()),raw=buffer.toString('ascii');
assert.equal(blob.type,'application/pdf');assert(raw.startsWith('%PDF-1.4'));
assert(raw.includes('coordina'));assert(raw.includes('Alternanza regolare'));assert(raw.includes('152 cm'));assert(raw.includes('172 cm'));assert(raw.includes('Nessuno spostamento.'));assert(raw.includes('20.6 kg'));assert(raw.includes('Tentativo 2'));assert(raw.includes('WinAnsiEncoding'));
const pageCount=Number(raw.match(/\/Count (\d+)/)[1]);assert(pageCount>=5);
const contents=[...raw.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(m=>m[1]);assert.equal(contents.length,pageCount);
for(const content of contents){assert(content.includes('Pagina '));assert(content.includes('TEST MOTORI'));for(const m of content.matchAll(/1 0 0 1 (\d+) ([\d.]+) Tm/g)){const y=Number(m[2]);assert(y===28||(y>=52&&y<=802),'Text outside printable area: '+y);}}
const out=process.argv[2]||path.join(folder,'motor-tests-layout.pdf');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,buffer);
console.log(`PASS motor PDF: ${pageCount} pages, repeated context, table bounds, zero measurements, notes and accents. ${out}`);
})().catch(error=>{console.error(error);process.exitCode=1;});
