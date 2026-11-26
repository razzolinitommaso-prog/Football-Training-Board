const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module'),{Readable}=require('node:stream'),{gzipSync,gunzipSync}=require('node:zlib');
const {verifyBackup}=require('./verify-club-backup.cjs');
const root=path.resolve(__dirname,'..'),web=createRequire(path.join(root,'artifacts/football-training-board/package.json'));
(async()=>{
  const {PGlite}=require(process.argv[2]||'@electric-sql/pglite'); const pg=new PGlite();
  try {
    const dir=path.join(root,'.tools/backup-test');fs.mkdirSync(dir,{recursive:true});
    await createRequire(web.resolve('vite'))('esbuild').build({entryPoints:[path.join(root,'artifacts/api-server/src/lib/club-backup.ts')],outfile:path.join(dir,'backup.cjs'),bundle:true,platform:'node',format:'cjs'});
    const {clubBackup,canBackupClub}=require(path.join(dir,'backup.cjs'));
    assert(canBackupClub('admin'));assert(canBackupClub('presidente'));for(const r of ['coach','parent','secretary','director','technical_director',null]) assert(!canBackupClub(r));
    await pg.exec(`CREATE TABLE clubs(id int PRIMARY KEY,name text,access_code text);CREATE TABLE users(id int PRIMARY KEY,email text,password_hash text);CREATE TABLE club_memberships(id int PRIMARY KEY,club_id int REFERENCES clubs(id),user_id int REFERENCES users(id));
      CREATE TABLE players(id int PRIMARY KEY,club_id int REFERENCES clubs(id),status text);
      CREATE TABLE player_documents(id int PRIMARY KEY,club_id int REFERENCES clubs(id),player_id int REFERENCES players(id),file_data text,file_url text);
      CREATE TABLE player_payments(id int PRIMARY KEY,club_id int REFERENCES clubs(id),player_id int REFERENCES players(id),amount numeric);
      CREATE TABLE player_payment_kit_items(payment_id int PRIMARY KEY REFERENCES player_payments(id),article jsonb);
      CREATE TABLE sessions(sid text PRIMARY KEY,sess jsonb);
      INSERT INTO clubs VALUES(1,'A','secretA'),(2,'B','secretB');INSERT INTO users VALUES(1,'a@example.test','HASH_A'),(2,'b@example.test','HASH_B');
      INSERT INTO club_memberships VALUES(1,1,1),(2,2,2);INSERT INTO players VALUES(1,1,'retired_definitive'),(2,2,'active');
      INSERT INTO player_documents VALUES(1,1,1,'data:application/pdf;base64,QUJD','https://example.test/document.pdf'),(2,2,2,'privateB',null);
      INSERT INTO player_payments VALUES(1,1,1,25),(2,2,2,99);INSERT INTO player_payment_kit_items VALUES(1,'{"name":"Kit A"}'),(2,'{"name":"Kit B"}');INSERT INTO sessions VALUES('SECRET','{}');`);
    await pg.exec(`CREATE TABLE future_club_registry(id int PRIMARY KEY,club_id int REFERENCES clubs(id),payload jsonb);INSERT INTO future_club_registry VALUES(1,1,'{"attachment":"https://example.test/nested.pdf"}'),(2,2,'{"private":"OTHER_CLUB"}');CREATE VIEW player_summary AS SELECT * FROM players;INSERT INTO player_payments SELECT n,1,1,5 FROM generate_series(100,125) n;`);
    // Use the production pg parsers on catalog arrays: PGlite alone returns name[]
    // as arrays whereas node-postgres leaves that unsupported OID as a string.
    const api=createRequire(path.join(root,'artifacts/api-server/package.json'));
    const driverTypes=api('pg').types;
    assert.equal(Array.isArray(driverTypes.getTypeParser(1003)('{user_id}')),false);
    const reader={query:async(t,v)=>{
      const result=await pg.query(t,v);
      if(t.includes('FROM pg_constraint')) {
        for(const row of result.rows) for(const key of ['columns','targets']) {
          const field=result.fields.find(field=>field.name===key);
          assert(field,'Catalog field metadata required');
          const wire='{'+row[key].map(value=>'"'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"').join(',')+'}';
          row[key]=driverTypes.getTypeParser(field.dataTypeID)(wire);
        }
      }
      return result;
    }};
    await pg.exec('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    let text='';for await(const chunk of clubBackup(reader,1)) text+=chunk;
    await pg.exec('COMMIT');
    assert(!text.includes('HASH_A'));assert(!text.includes('secretA'));assert(!text.includes('privateB'));assert(!text.includes('Kit B'));assert(!text.includes('b@example.test'));assert(text.includes('Kit A'));assert(text.includes('retired_definitive'));assert(text.includes('QUJD'));
    const zipped=gzipSync(text);fs.writeFileSync(path.join(dir,'backup.ndjson.gz'),zipped);
    const result=await verifyBackup(Readable.from([gunzipSync(zipped)]));assert.equal(result.valid,true);assert.equal(result.externalReferences,2);
    const records=text.trim().split('\n').map(JSON.parse);assert.equal(records.filter(r=>r.type==='rows'&&r.table==='player_payments').flatMap(r=>r.rows).length,27);assert(text.includes('nested.pdf'));assert(!text.includes('OTHER_CLUB'));assert(!records[0].tables.includes('player_summary'));
    const audit=await require('./audit-club-backup.cjs').auditBackup(path.join(dir,'backup.ndjson.gz'),'2026-11-21');assert.equal(audit.income.registered,15500);assert.equal(audit.income.records,27);assert.equal(audit.members.available,false);assert(audit.income.issues.length>0);
    await assert.rejects(()=>verifyBackup(Readable.from([text.slice(0,text.lastIndexOf('{"type":"manifest"'))])),/incompleto/);
    await assert.rejects(()=>verifyBackup(Readable.from([text.replace('Kit A','Kit X')])),/Integrità/);
    // Exercise the actual HTTP route and streamed gzip, not just its generator.
    globalThis.backupTestPg=reader;
    fs.writeFileSync(path.join(dir,'db.ts'),`export const pool={connect:async()=>({query:(q:string,v?:unknown[])=>globalThis.backupTestPg.query(q,v),release(){}})};`);
    fs.writeFileSync(path.join(dir,'auth.ts'),`export function requireAuth(req:any,res:any,next:any){if(!req.headers['x-role'])return res.status(401).end();req.session={role:req.headers['x-role'],clubId:Number(req.headers['x-club']||1)};next();}`);
    await createRequire(web.resolve('vite'))('esbuild').build({entryPoints:[path.join(root,'artifacts/api-server/src/routes/club-backup.ts')],outfile:path.join(dir,'route.cjs'),bundle:true,platform:'node',format:'cjs',plugins:[{name:'isolated-backup',setup(b){b.onResolve({filter:/^@workspace\/db$/},()=>({path:path.join(dir,'db.ts')}));b.onResolve({filter:/\/lib\/auth$/},()=>({path:path.join(dir,'auth.ts')}));}}],nodePaths:[path.join(root,'artifacts/api-server/node_modules')]});
    const app=api('express')();app.use(require(path.join(dir,'route.cjs')).default);
    const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    try {
      const url='http://127.0.0.1:'+server.address().port+'/club-backup';
      assert.equal((await fetch(url)).status,401);
      for(const role of ['parent','coach','secretary','director','technical_director'])assert.equal((await fetch(url,{headers:{'x-role':role}})).status,403);
      const response=await fetch(url,{headers:{'x-role':'presidente'}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
      const payload=Buffer.from(await response.arrayBuffer());assert.equal((await verifyBackup(Readable.from([gunzipSync(payload)]))).valid,true);
      globalThis.backupTestPg={query:async(t,v)=>{if(t.includes('information_schema.columns'))throw Error('PRIVATE_SQL_DIAGNOSTIC');return reader.query(t,v);}};
      const failure=await fetch(url,{headers:{'x-role':'presidente'}});
      assert.equal(failure.status,500,'Metadata failures return JSON rather than destroying the response');
      assert.equal(failure.headers.get('content-disposition'),null);
      const failureBody=await failure.json();assert.equal(failureBody.code,'BACKUP_PREPARATION_FAILED');
      assert(!JSON.stringify(failureBody).includes('PRIVATE_SQL_DIAGNOSTIC'));
      globalThis.backupTestPg=reader;
    } finally {await new Promise(r=>server.close(r));delete globalThis.backupTestPg;}
    console.log('PASS backup: club isolation, dependent KIT rows, archived players, attachment bytes, credential exclusion, gzip round trip, truncation and tamper rejection');
  } finally {await pg.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
