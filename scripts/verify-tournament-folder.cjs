const assert=require("node:assert/strict");
module.exports=function(result){
const names={D:"DICOMANO",F:"FORTIS",P:"PONTASSIEVE",A:"AFFRICO",V:"S.VIGNINI",R:"RUFINA",S:"SALES",L:"PELAGO",B:"BAGNOaRIPOLI","3":"Squadra 3 (da definire)","4":"Squadra 4 (da definire)"};
function expected(day,slots,group="Girone UNICO"){return slots.flatMap(([time,pairs,g])=>pairs.split(",").map(pair=>{const[a,b]=pair.split("-");return [day+" "+time,names[a],names[b],g||group,"match"].join("|")}));}
function actual(entries){return entries.map(e=>{const d=new Date(e.date),date=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Rome",year:"numeric",month:"2-digit",day:"2-digit"}).format(d),time=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Rome",hour:"2-digit",minute:"2-digit"}).format(d);return [date+" "+time,e.homeTeam.replace("FORTIS JUVENTUS","FORTIS"),e.awayTeam.replace("FORTIS JUVENTUS","FORTIS"),e.group,e.kind].join("|")});}
function finals(day,times){return times.map((time,i)=>[day+" "+time,(3-i)+"ª Girone A",(3-i)+"ª Girone B",["Finale 5°–6° posto","Finale 3°–4° posto","Finale 1°–2° posto"][i],"fixture_placeholder"].join("|"))}
const checks={
"2014":[...expected("2026-12-20",[["16:00","D-F","Girone A"],["16:30","F-3","Girone A"],["17:00","3-D","Girone A"],["17:00","A-V","Girone B"],["17:30","R-A","Girone B"],["18:00","V-R","Girone B"]]),...finals("2027-01-03",["16:00","17:00","18:00"])],
"2015-16":[...expected("2026-12-20",[["09:30","P-F","Girone A"],["10:00","A-P","Girone A"],["11:00","F-A","Girone A"],["11:30","V-3","Girone B"],["12:00","3-D","Girone B"],["12:30","D-V","Girone B"]]),...finals("2027-01-03",["09:30","10:30","11:30"])],
"2018":[...expected("2026-12-19",[["15:00","D-R,4-F"],["15:30","D-F,R-4"],["16:00","D-4,F-R"]]),...expected("2027-01-02",[["15:00","D-4,F-R"],["15:30","D-R,4-F"],["16:00","D-F,R-4"]])],
"2020-21":[...expected("2026-12-20",[["15:00","P-S,L-B"],["15:10","D-S,P-L"],["15:20","D-B,S-L"],["15:30","D-L,B-P"],["15:40","D-P,B-S"]]),...expected("2027-01-03",[["15:00","D-B,S-L,F-P"],["15:10","D-P,B-S,L-F"],["15:20","P-S,L-B,D-F"],["15:30","D-S,P-L,F-B"],["15:40","D-L,B-P,F-S"]])]
};
let count=0,own=0;
for(const [file,p]of Object.entries(result)){assert.ok(Array.isArray(p.tournamentProgram),file);count+=p.tournamentProgram.length;own+=p.recognized.length;for(const e of p.tournamentProgram)assert.equal(e.finalsPolicy,"program-only");const key=file.replace("TORNEO NATALE ","").replace(".pdf","");if(checks[key])assert.deepEqual(actual(p.tournamentProgram).sort(),checks[key].sort(),file);}
assert.equal(count,92);assert.equal(own,30);for(const key of["2014","2015-16"])assert.equal(result["TORNEO NATALE "+key+".pdf"].recognized.length,2);
};