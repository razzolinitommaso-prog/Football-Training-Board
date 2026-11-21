const {createReadStream}=require('node:fs');
const {createGunzip}=require('node:zlib');
const {createInterface}=require('node:readline');
const {createHash}=require('node:crypto');
async function verifyBackup(stream) {
  const tables=new Map(); let header,manifest;
  for await(const line of createInterface({input:stream,crlfDelay:Infinity})) {
    if(!line.trim()) continue;
    const item=JSON.parse(line);
    if(manifest) throw Error('Dati dopo il manifesto finale');
    if(!header) {
      if(item.type!=='header'||item.format!=='ftb-club-backup'||item.version!==1) throw Error('Formato backup sconosciuto');
      header=item; continue;
    }
    if(item.type==='rows') {
      if(!header.tables.includes(item.table)) throw Error('Tabella inattesa');
      if(!tables.has(item.table)) tables.set(item.table,{count:0,hash:createHash('sha256')});
      const state=tables.get(item.table);
      for(const row of item.rows) {state.hash.update(JSON.stringify(row)+'\n');state.count++;}
    } else if(item.type==='manifest') manifest=item;
    else throw Error('Blocco inatteso');
  }
  if(!manifest?.complete) throw Error('Backup incompleto: manifesto finale mancante');
  if(manifest.tables.length!==header.tables.length||new Set(manifest.tables.map(t=>t.table)).size!==header.tables.length) throw Error('Manifesto incoerente');
  for(const table of manifest.tables) {
    if(!header.tables.includes(table.table)) throw Error('Tabella non dichiarata');
    const state=tables.get(table.table)||{count:0,hash:createHash('sha256')};
    if(state.count!==table.rows||state.hash.digest('hex')!==table.sha256) throw Error('Integrità non valida: '+table.table);
  }
  return {clubId:header.clubId,tables:manifest.tables.length,rows:manifest.tables.reduce((n,t)=>n+t.rows,0),externalReferences:manifest.externalReferences.length,valid:true};
}
module.exports={verifyBackup};
if(require.main===module) {
  if(!process.argv[2]) throw Error('Uso: node scripts/verify-club-backup.cjs <backup.ndjson.gz>');
  const file=createReadStream(process.argv[2]);const unzip=createGunzip();file.on('error',e=>unzip.destroy(e));file.pipe(unzip);
  verifyBackup(unzip).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
