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
    await pg.exec('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    let text='';for await(const chunk of clubBackup({query:(t,v)=>pg.query(t,v)},1)) text+=chunk;
    await pg.exec('COMMIT');
    assert(!text.includes('HASH_A'));assert(!text.includes('secretA'));assert(!text.includes('privateB'));assert(!text.includes('Kit B'));assert(!text.includes('b@example.test'));assert(text.includes('Kit A'));assert(text.includes('retired_definitive'));assert(text.includes('QUJD'));
    const zipped=gzipSync(text);fs.writeFileSync(path.join(dir,'backup.ndjson.gz'),zipped);
    const result=await verifyBackup(Readable.from([gunzipSync(zipped)]));assert.equal(result.valid,true);assert.equal(result.externalReferences,2);
    const records=text.trim().split('\n').map(JSON.parse);assert.equal(records.filter(r=>r.type==='rows'&&r.table==='player_payments').flatMap(r=>r.rows).length,27);assert(text.includes('nested.pdf'));assert(!text.includes('OTHER_CLUB'));assert(!records[0].tables.includes('player_summary'));
    await assert.rejects(()=>verifyBackup(Readable.from([text.slice(0,text.lastIndexOf('{"type":"manifest"'))])),/incompleto/);
    await assert.rejects(()=>verifyBackup(Readable.from([text.replace('Kit A','Kit X')])),/Integrità/);
    console.log('PASS backup: club isolation, dependent KIT rows, archived players, attachment bytes, credential exclusion, gzip round trip, truncation and tamper rejection');
  } finally {await pg.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
