// Real Express routes, isolated persistence adapter; never uses database credentials.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root,'node_modules/typescript'));
const express = require(path.join(root,'artifacts/api-server/node_modules/express'));
const tables = {};
for (const name of ['teamsTable','playersTable','teamStaffAssignmentsTable','trainingRosterGroupsTable','trainingRosterGroupTeamsTable','trainingRosterGroupPlayersTable']) tables[name]=new Proxy({tableName:name},{get:(obj,key)=>key in obj?obj[key]:String(key)});
let rows={
  teamsTable:[{id:1,clubId:1,coachId:10,seasonId:1,clubSection:'scuola_calcio',name:'Piccoli Amici'},{id:2,clubId:1,coachId:10,seasonId:1,clubSection:'scuola_calcio',name:'Primi Calci'},{id:3,clubId:2,coachId:20,seasonId:1,clubSection:'scuola_calcio',name:'Altro club'},{id:4,clubId:1,coachId:10,seasonId:2,clubSection:'scuola_calcio',name:'Altra stagione'},{id:5,clubId:1,coachId:10,seasonId:1,clubSection:'settore_giovanile',name:'Altro settore'}],
  playersTable:[{id:1,clubId:1,teamId:1,firstName:'Uno',lastName:'Test',dateOfBirth:'2019-02-01',available:true,notes:'[FTB_PLAYER_META]{"supplementalTeamId":2}\nNote'},{id:2,clubId:1,teamId:2,firstName:'Due',lastName:'Test',dateOfBirth:'02/03/2020',available:true,notes:null},{id:3,clubId:2,teamId:3,firstName:'Riservato',lastName:'Test',dateOfBirth:'2019-01-01',notes:null},{id:4,clubId:1,teamId:2,firstName:'Quattro',lastName:'Test',dateOfBirth:'2019-05-01',available:false,notes:null}],
  teamStaffAssignmentsTable:[],trainingRosterGroupsTable:[],trainingRosterGroupTeamsTable:[],trainingRosterGroupPlayersTable:[],
};
const orm={eq:(key,value)=>row=>row[key]===value,inArray:(key,values)=>row=>values.includes(row[key]),and:(...conditions)=>row=>conditions.every(fn=>fn(row)),sql:()=>null};
const db={execute:async()=>{},select:()=>({from:table=>({where:condition=>Promise.resolve(rows[table.tableName].filter(condition).map(row=>({...row})))})}),
  insert:table=>({values:values=>{const result=(Array.isArray(values)?values:[values]).map(value=>({...value}));if(table.tableName==='trainingRosterGroupTeamsTable'&&result.some(value=>rows[table.tableName].some(row=>row.teamId===value.teamId)))throw Object.assign(new Error('duplicate'),{code:'23505'});result.forEach(value=>{if(table.tableName==='trainingRosterGroupsTable'){value.id=Math.max(0,...rows[table.tableName].map(row=>row.id))+1;value.archived=false;}rows[table.tableName].push(value);});return{returning:async()=>result,then:resolve=>Promise.resolve(result).then(resolve)};}}),
  update:table=>({set:values=>({where:condition=>{const result=rows[table.tableName].filter(condition);result.forEach(row=>Object.assign(row,values));return{returning:async()=>result,then:resolve=>Promise.resolve(result).then(resolve)};}})}),
  delete:table=>({where:condition=>{rows[table.tableName]=rows[table.tableName].filter(row=>!condition(row));return Promise.resolve();}}),
  transaction:async fn=>{const snapshot=structuredClone(rows);try{return await fn(db);}catch(error){rows=snapshot;throw error;}},
};
function load(file,dependencies){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,require:key=>{if(!(key in dependencies))throw new Error(`Unexpected import ${key}`);return dependencies[key];},console});return exports;}
const policy=load(path.join(root,'artifacts/api-server/src/lib/training-roster-policy.ts'),{});
assert.equal(policy.playerBirthYear('02/03/2020'),2020);assert.equal(policy.playerBirthYear('2019-02-01'),2019);assert.equal(policy.playerBirthYear(null),null);assert.equal(policy.supplementalTrainingTeam('bad'),null);
const wide=role=>['admin','director','technical_director','secretary','presidente','sporting_director'].includes(role);
const router=load(path.join(root,'artifacts/api-server/src/routes/training-rosters.ts'),{express,'drizzle-orm':orm,'@workspace/db':{db,...tables},'../lib/auth':{requireAuth:(_req,_res,next)=>next()},'../lib/club-scope':{isClubWideListRole:wide,normalizeSessionRole:value=>value,resolveAllowedClubSections:async req=>req.session.sections},'../lib/training-roster-policy':policy}).default;
const app=express();app.use(express.json());let session={clubId:1,userId:10,role:'coach',sections:['scuola_calcio']};app.use((req,_res,next)=>{req.session=session;next();});app.use('/api',router);app.use((error,_req,res,_next)=>res.status(500).json({error:error.message}));
(async()=>{const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/api/training-rosters`;const call=async(suffix,method='GET',body)=>{const response=await fetch(base+suffix,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:response.status,data:await response.json()};};
try{
  let response=await call('/groups','POST',{kind:'shared',name:'Allenamento comune',teamIds:[1,2]});assert.equal(response.status,200);const sharedId=response.data.id;
  response=await call('/1?scope=shared');assert.deepEqual(response.data.players.map(p=>p.id),[1,2,4]);assert.deepEqual(response.data.teamPlayerIds,[1]);assert.equal(response.data.players.some(p=>p.notes),false);
  response=await call('/2?scope=team');assert.deepEqual(response.data.players.map(p=>p.id),[1,2,4]);
  assert.equal((await call('/3?scope=shared')).status,403);
  assert.equal((await call('/groups','POST',{kind:'shared',name:'Intrusione',teamIds:[1,3]})).status,400);
  assert.equal((await call('/groups','POST',{kind:'shared',name:'Stagioni',teamIds:[1,4]})).status,400);
  session.sections=undefined;assert.equal((await call('/groups','POST',{kind:'shared',name:'Settori',teamIds:[1,5]})).status,400);session.sections=['scuola_calcio'];
  assert.equal((await call('/groups','POST',{kind:'shared',name:'Sovrapposto',teamIds:[1,2]})).status,409);
  response=await call('/groups','POST',{kind:'work',name:'Annata 2019',anchorTeamId:1,criterion:'year',birthYear:2019});assert.equal(response.status,200);const yearId=response.data.id;
  response=await call('/1?scope=shared');assert.deepEqual(response.data.workGroups.find(g=>g.id===yearId).playerIds,[1,4]);
  response=await call('/groups','POST',{kind:'work',name:'Tecnica',anchorTeamId:1,criterion:'level',playerIds:[1,2,2]});assert.equal(response.status,200);const manualId=response.data.id;
  assert.equal((await call('/groups','POST',{kind:'work',name:'Intrusione',anchorTeamId:1,criterion:'manual',playerIds:[3]})).status,400);
  rows.playersTable.find(p=>p.id===2).dateOfBirth='2019-03-02';response=await call('/1?scope=shared');assert.deepEqual(response.data.workGroups.find(g=>g.id===yearId).playerIds,[1,2,4]);
  rows.teamsTable.find(t=>t.id===2).coachId=99;response=await call('/config');assert.equal(response.data.sharedGroups.length,0);assert.equal(response.data.workGroups.length,0);response=await call('/1?scope=shared');assert.deepEqual(response.data.players.map(p=>p.id),[1]);assert.equal((await call(`/groups/${sharedId}`,'DELETE')).status,403);
  rows.teamsTable.find(t=>t.id===2).coachId=10;assert.equal((await call(`/groups/${manualId}`,'PUT',{kind:'work',name:'Tecnica aggiornata',anchorTeamId:1,criterion:'manual',playerIds:[2]})).status,200);
  assert.equal((await call(`/groups/${sharedId}`,'DELETE')).status,200);response=await call('/1?scope=shared');assert.deepEqual(response.data.players.map(p=>p.id),[1]);
  session={clubId:2,userId:20,role:'coach',sections:['scuola_calcio']};assert.equal((await call(`/groups/${manualId}`,'DELETE')).status,403);
  session={clubId:1,userId:10,role:'parent',sections:['scuola_calcio']};response=await call('/config');assert.equal(response.data.teams.length,0);assert.equal((await call('/1')).status,403);
  console.log('PASS: shared rosters, supplemental deduplication, seasons/sections, overlap rollback, dynamic birth years, manual edits, club/staff/parent access and archival. Persistence mocked; PostgreSQL DDL not executed.');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1;});
