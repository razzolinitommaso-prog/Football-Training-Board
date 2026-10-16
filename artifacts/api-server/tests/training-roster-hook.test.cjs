const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root,'node_modules/typescript'));
const source = fs.readFileSync(path.join(root,'artifacts/football-training-board/src/pages/tactical-board/use-team-players.ts'),'utf8').replaceAll('import.meta.env.DEV','false');
async function run(training, matchId) {
  const calls = [], states = [];
  let effect;
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports,console,
    require:key=> key==='react'?{useState:value=>[value,next=>states.push(next)],useEffect:fn=>{effect=fn;}}:{withApi:path=>path},
    fetch:async url=>{calls.push(url);return{ok:true,json:async()=>url.includes('training-rosters')?{players:[{id:1,firstName:'Uno'},{id:2,firstName:'Due'}]}:url.includes('/members')?[{id:1,first_name:'Uno'}]:[{id:1,firstName:'Uno',available:false}]};},
  });
  exports.useTeamPlayers(1,matchId,training);const cleanup=effect();await new Promise(resolve=>setImmediate(resolve));cleanup();
  return{calls,players:states.findLast(Array.isArray)};
}
(async()=>{
  let result=await run(true,null);assert.equal(result.calls.length,1);assert.equal(result.calls[0],'/api/training-rosters/1?scope=shared');assert.equal(result.players.length,2);
  result=await run(false,8);assert.deepEqual(result.calls,['/api/players?teamId=1&matchId=8','/api/teams/1/members']);assert.equal(result.players.length,1);assert.equal(result.players[0].available,false);
  result=await run(true,8);assert.deepEqual(result.calls,['/api/players?teamId=1&matchId=8','/api/teams/1/members']);assert.equal(result.players.length,1);
  result=await run(false,null);assert.deepEqual(result.calls,['/api/players?teamId=1','/api/teams/1/members']);
  console.log('PASS: only exercise mode uses shared roster; match and ordinary roster requests unchanged, availability preserved.');
})().catch(error=>{console.error(error);process.exitCode=1;});
