// Real router + PostgreSQL in memory. No application credentials or live data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),req=createRequire(path.join(root,'artifacts/api-server/package.json'));
const express=req('express'),front=createRequire(path.join(root,'artifacts/football-training-board/package.json')),esbuild=createRequire(front.resolve('vite'))('esbuild');
const {PGlite}=require(process.argv[2]);
(async()=>{
 const pg=new PGlite();let server;
 try{
 await pg.exec(`CREATE TABLE clubs(id int PRIMARY KEY);INSERT INTO clubs VALUES(1),(2);
 CREATE TABLE seasons(id int PRIMARY KEY);CREATE TABLE teams(id int PRIMARY KEY,club_id int);INSERT INTO teams VALUES(11,1),(12,1),(21,2);
 CREATE TABLE players(id int PRIMARY KEY,club_id int,team_id int);INSERT INTO players VALUES(101,1,11),(102,1,12),(103,2,21);
 CREATE TABLE matches(id serial PRIMARY KEY,club_id int,team_id int,season_id int,opponent text,date timestamptz,competition text,location text,home_away text);
 CREATE TABLE call_ups(id serial PRIMARY KEY,match_id int REFERENCES matches(id) ON DELETE CASCADE,player_id int,status text,created_at timestamptz DEFAULT now());
 CREATE TABLE tournament_states(competition text,program jsonb,club_id int,team_id int);
 CREATE FUNCTION pg_advisory_xact_lock(integer) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;`);
 const temp=path.join(root,'.tools/parent-tournament-tests');fs.mkdirSync(temp,{recursive:true});
 globalThis.parentTournamentTest={pg,failSync:false};
 const fake=path.join(temp,'db.ts');fs.writeFileSync(fake,`const f=(globalThis as any).parentTournamentTest;const query=async(text:string,params?:unknown[])=>{if(f.failSync&&text.startsWith('UPDATE call_ups'))throw Error('Injected sync failure');if(!params?.length&&(text.includes('CREATE TABLE')||text.includes('ALTER TABLE'))){await f.pg.exec(text);return{rows:[]}}return f.pg.query(text,params)};export const pool={query,connect:async()=>({query,release(){}})};`);
 const bundle=path.join(temp,'route.cjs');await esbuild.build({stdin:{contents:`export {default,parentTournamentDeadline} from './artifacts/api-server/src/routes/parent-tournaments';export * from './artifacts/api-server/src/lib/parent-tournament-availability';`,resolveDir:root,loader:'ts'},outfile:bundle,bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'isolated',setup(b){b.onResolve({filter:/^@workspace\/db$/},()=>({path:fake}))}}],nodePaths:[path.join(root,'artifacts/api-server/node_modules')]});
 const Module=require('node:module').Module,m=new Module(bundle,module);m.filename=bundle;m.paths=[path.join(root,'artifacts/api-server/node_modules')];m._compile(fs.readFileSync(bundle,'utf8'),bundle);const api=m.exports;
 await api.ensureParentTournamentAvailability();
 await pg.exec(`INSERT INTO shared_tournaments(id,club_id,club_section,name,start_date,end_date) VALUES(1,1,'scuola_calcio','Natale','2099-12-19','2100-01-03'),(2,2,'scuola_calcio','Privato','2099-12-19','2100-01-03'),(3,1,'scuola_calcio','Altra annata','2099-12-19','2100-01-03'),(4,1,'scuola_calcio','Storico','2020-01-04','2020-01-04');
 INSERT INTO shared_tournament_teams(tournament_id,team_id) VALUES(1,11),(2,21),(3,12),(4,11);
 INSERT INTO matches(id,club_id,team_id,season_id,opponent,date,competition,home_away) VALUES(1,1,11,1,'Alfa','2099-12-19 10:00+01','Torneo: Natale','home'),(2,1,11,1,'Beta','2100-01-03 11:00+01','Torneo: Natale','away'),(3,2,21,1,'Privato','2099-12-19 10:00+01','Torneo: Privato','home'),(4,1,11,1,'Gamma','2099-12-20 10:00+01','Torneo legacy','home'),(5,1,11,1,'Storico','2020-01-04 10:00+01','Torneo: Storico','home');
 INSERT INTO shared_tournament_matches(tournament_id,match_id,entry_id) VALUES(1,1,'a'),(1,2,'b'),(2,3,'c'),(4,5,'old');
 INSERT INTO call_ups(match_id,player_id,status) VALUES(1,101,'called'),(1,101,'availability'),(1,102,'called');`);
 await pg.query('INSERT INTO tournament_states VALUES($1,$2,1,11)',['Torneo: Natale',JSON.stringify([{id:'a',date:'2099-12-19T09:00:00Z',homeTeam:'Club',awayTeam:'Alfa',kind:'match'},{id:'external',date:'2099-12-19T09:00:00Z',homeTeam:'Alfa',awayTeam:'Esterno',kind:'match'},{id:'b',date:'2100-01-03T10:00:00Z',homeTeam:'Beta',awayTeam:'Club',kind:'match'}])]);
 const app=express();app.use(express.json());app.use((r,s,n)=>{r.session={role:r.headers['x-role']??'parent',clubId:Number(r.headers['x-club']??1),parentPlayerId:Number(r.headers['x-player']??101)};n()});app.use(api.default);app.use((e,r,s,n)=>s.status(500).json({error:e.message}));server=await new Promise(ok=>{const s=app.listen(0,'127.0.0.1',()=>ok(s))});const base='http://127.0.0.1:'+server.address().port;
 async function request(method='GET',body,headers={}){const r=await fetch(base+'/parent/tournaments',{method,headers:{'content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined});return{status:r.status,body:await r.json()}}
 await pg.query('UPDATE shared_tournaments SET phases=$1::jsonb WHERE id=1',[JSON.stringify([{id:'dec',name:'Dicembre',startDate:'2099-12-19',endDate:'2099-12-20'},{id:'jan',name:'Gennaio',startDate:'2100-01-02',endDate:'2100-01-03'}])]);
 let r=await request();assert.equal(r.status,200);assert.equal(r.body.length,3);let t=r.body.find(t=>t.key==='shared:1');assert.equal(t.program.length,3);assert.equal(t.program.find(e=>e.id==='external').matchId,null);assert.deepEqual(t.matchIds,[1,2]);assert.equal(t.parentAvailability,null);assert.deepEqual(t.dates,['2099-12-19','2099-12-20','2100-01-02','2100-01-03'],'All phase days, even without own fixtures');
 assert.equal((await request('GET',null,{'x-role':'coach'})).status,403);
 for(const key of['shared:2','shared:3'])assert.equal((await request('PATCH',{key,status:'available'})).status,404);
 assert.equal((await request('PATCH',{key:'shared:1',status:'partial'})).status,400);
 assert.equal((await request('PATCH',{key:'shared:1',status:'unavailable'})).status,400);
 assert.equal((await request('PATCH',{key:'shared:4',status:'available'})).status,409);
 r=await request('PATCH',{key:'shared:1',status:'available',playerId:102});assert.equal(r.status,200);assert.equal(r.body.parentAvailability.status,'available');
 let rows=(await pg.query('SELECT * FROM call_ups WHERE player_id=101 ORDER BY id')).rows;assert.equal(rows.length,3);assert.equal(rows.find(c=>c.match_id===1).status,'called');assert.ok(rows.every(c=>c.parent_availability_status==='available'));assert.equal((await pg.query('SELECT parent_availability_status FROM call_ups WHERE player_id=102')).rows[0].parent_availability_status,null);
 r=await request('PATCH',{key:'shared:1',status:'unavailable',reason:'family',notes:'Assenza per tutto il torneo'});assert.equal(r.status,200);assert.equal(r.body.parentAvailability.reasonLabel,'motivi familiari');
 await pg.exec(`INSERT INTO matches(id,club_id,team_id,opponent,date,competition,home_away) VALUES(6,1,11,'Nuova','2100-01-03 12:00+01','Torneo: Natale','home');INSERT INTO shared_tournament_matches(tournament_id,match_id,entry_id) VALUES(1,6,'new');`);await api.syncMatchTournamentReply(6);assert.equal((await pg.query('SELECT parent_availability_status FROM call_ups WHERE match_id=6 AND player_id=101')).rows[0].parent_availability_status,'unavailable');
 globalThis.parentTournamentTest.failSync=true;r=await request('PATCH',{key:'shared:1',status:'available'});assert.equal(r.status,500);globalThis.parentTournamentTest.failSync=false;assert.equal((await request()).body.find(t=>t.key==='shared:1').parentAvailability.status,'unavailable');
 const legacy=(await request()).body.find(t=>t.key.startsWith('legacy:'));assert.equal((await request('PATCH',{key:legacy.key,status:'available'})).status,200);assert.equal((await pg.query('SELECT parent_availability_status FROM call_ups WHERE match_id=4 AND player_id=101')).rows[0].parent_availability_status,'available');
 for(const dates of [[],['2099-12-21'],['2099-02-30'],[1]])assert.equal((await request('PATCH',{key:'shared:1',mode:'dates',dates,reason:'family'})).status,400);
 r=await request('PATCH',{key:'shared:1',mode:'dates',dates:['2099-12-19','2100-01-02'],reason:'family'});assert.equal(r.status,200);assert.equal(r.body.parentAvailability.mode,'dates');assert.equal(r.body.parentAvailability.status,'partial');assert.deepEqual(r.body.parentAvailability.availableDates,['2099-12-19','2100-01-02']);
 await pg.exec(`INSERT INTO matches(id,club_id,team_id,opponent,date,competition,home_away) VALUES(7,1,11,'Stessa data','2099-12-19 15:00+01','Torneo: Natale','home'),(8,1,11,'Altra data','2099-12-20 10:00+01','Torneo: Natale','home'),(9,1,11,'Gennaio','2100-01-02 10:00+01','Torneo: Natale','home'),(10,1,11,'Data locale','2099-12-18 23:30+00','Torneo: Natale','home');INSERT INTO shared_tournament_matches(tournament_id,match_id,entry_id) VALUES(1,7,'same-day'),(1,8,'other-day'),(1,9,'january'),(1,10,'rome-day');`);
 for(const id of [7,8,9,10])await api.syncMatchTournamentReply(id);
 const byMatch=new Map((await pg.query('SELECT match_id,parent_availability_status FROM call_ups WHERE player_id=101')).rows.map(r=>[r.match_id,r.parent_availability_status]));
 for(const id of [1,7,9,10])assert.equal(byMatch.get(id),'available','Selected day fixture '+id);
 for(const id of [2,6,8])assert.equal(byMatch.get(id),'unavailable','Unselected day fixture '+id);
 assert.equal((await pg.query("SELECT status FROM call_ups WHERE match_id=1 AND player_id=101 ORDER BY id LIMIT 1")).rows[0].status,'called');
 r=await request('PATCH',{key:'shared:1',status:'available'});assert.equal(r.status,200);assert.equal(r.body.parentAvailability.mode,'all');assert.deepEqual(r.body.parentAvailability.availableDates,[]);assert.ok((await pg.query('SELECT parent_availability_status FROM call_ups WHERE player_id=101 AND match_id<>4')).rows.every(r=>r.parent_availability_status==='available'));
 assert.equal(api.parentTournamentDeadline('2027-07-04T10:00:00Z').toISOString(),'2027-06-30T21:59:59.999Z');assert.equal(api.parentTournamentDeadline('2027-01-03T10:00:00Z').toISOString(),'2026-12-30T22:59:59.999Z');
 console.log('PASS real parent tournament API: whole event or dates, all four phase days, invalid dates rejected, every game on same day aligned, future fixture inheritance by date, mode switch, coach status, isolation, legacy, rollback and Rome DST deadline. Advisory lock contention not simulated.');
 }finally{if(server)await new Promise(r=>server.close(r));await pg.close();delete globalThis.parentTournamentTest;}
})().catch(e=>{console.error(e);process.exitCode=1});
