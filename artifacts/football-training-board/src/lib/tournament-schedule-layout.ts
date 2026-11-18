import type { TournamentTextCell } from "./tournament-dated-columns";
export type SpatialTournamentFixture = { dateTime: string; homeTeam: string; awayTeam: string; group: string; phase: string; placeholder?: boolean };
const months=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
const weekdays=["domenica","lunedi","martedi","mercoledi","giovedi","venerdi","sabato"];
const normalize=(text:string)=>text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
const clock=/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/;
const unknown=(name:string)=>/^\d{1,2}$/.test(name)?"Squadra "+name+" (da definire)":name;

/** Fallback only: explicit dated headers, group columns, centred time labels and printed final references. */
export function readSpatialTournamentSchedule(items:TournamentTextCell[],fallbackDate?:string|null):SpatialTournamentFixture[]|null{
  const rows:{y:number;cells:TournamentTextCell[]}[]=[];
  for(const item of [...items].sort((a,b)=>b.y-a.y||a.x-b.x)){
    const row=rows.find(row=>Math.abs(row.y-item.y)<3);
    if(row)row.cells.push(item);else rows.push({y:item.y,cells:[item]});
  }
  for(const row of rows)row.cells.sort((a,b)=>a.x-b.x);
  const pattern=new RegExp("^("+weekdays.join("|")+")\\s+(\\d{1,2})\\s+("+months.join("|")+")(?:\\s+(20\\d{2}))?$");
  const headings=rows.flatMap(row=>row.cells.flatMap(cell=>{
    const match=pattern.exec(normalize(cell.str));
    return match?[{y:row.y,x:cell.x,day:Number(match[2]),month:months.indexOf(match[3])+1,weekday:weekdays.indexOf(match[1]),year:match[4]?Number(match[4]):null}]:[];
  }));
  if(headings.length<2)return null;
  const groups=rows.filter(row=>row.y>headings[0].y).flatMap(row=>row.cells.flatMap(cell=>{
    const match=/^girone\s+(unico|[a-z])$/i.exec(normalize(cell.str));
    return match?[{x:cell.x,label:"Girone "+match[1].toUpperCase()}]:[];
  })).sort((a,b)=>a.x-b.x);
  if(!groups.length)return null;
  const titleYear=rows.filter(row=>row.y>headings[0].y).flatMap(row=>{
    const text=row.cells.map(cell=>cell.str).join(" ");
    return /\b(torneo|stagione)\b/i.test(text)?[...text.matchAll(/\b(20\d{2})\b/g)].map(match=>Number(match[1])):[];
  })[0];
  let year=headings[0].year??titleYear??(fallbackDate?Number(fallbackDate.slice(0,4)):NaN);
  if(!Number.isInteger(year))return null;
  const fixtures:SpatialTournamentFixture[]=[];
  for(let h=0;h<headings.length;h++){
    const heading=headings[h];
    if(heading.year)year=heading.year;else if(h>0&&headings[h-1].month-heading.month>=6)year++;
    const date=new Date(Date.UTC(year,heading.month-1,heading.day));
    if(date.getUTCMonth()!==heading.month-1||date.getUTCDay()!==heading.weekday)return null;
    const dateLabel=[String(heading.day).padStart(2,"0"),String(heading.month).padStart(2,"0"),year].join("/");
    const bottom=headings.filter(other=>other.y<heading.y-3).sort((a,b)=>b.y-a.y)[0]?.y??-Infinity;
    const body=rows.filter(row=>row.y<heading.y-4&&row.y>bottom+3);
    const peers=headings.filter(other=>Math.abs(other.y-heading.y)<3).sort((a,b)=>a.x-b.x);
    const index=peers.indexOf(heading);
    const regions=peers.length>1?[{
      left:index===0?-Infinity:(peers[index-1].x+heading.x)/2,
      right:index===peers.length-1?Infinity:(heading.x+peers[index+1].x)/2,
      group:groups.length===1?groups[0].label:"",
    }]:groups.map((group,g)=>({left:g===0?-Infinity:(groups[g-1].x+group.x)/2,right:g===groups.length-1?Infinity:(group.x+groups[g+1].x)/2,group:group.label}));
    const before=fixtures.length;
    const finalRows=new Set<number>();
    if(peers.length===1){
      for(const row of body){
        const text=row.cells.map(cell=>cell.str).join(" ");
        if(!/\bfinale\b/i.test(text))continue;
        const time=clock.exec(text),refs=[...text.matchAll(/\b(\d{1,2})\s*G\s*([A-Z])\b/gi)];
        if(!time||refs.length!==2)continue;
        const placement=/finale\s+(\d{1,2})\s*[-–—]\s*(\d{1,2})/i.exec(text);
        fixtures.push({dateTime:dateLabel+" "+time[1].padStart(2,"0")+":"+time[2],homeTeam:refs[0][1]+"ª Girone "+refs[0][2].toUpperCase(),awayTeam:refs[1][1]+"ª Girone "+refs[1][2].toUpperCase(),phase:"Finale",group:placement?"Finale "+placement[1]+"°–"+placement[2]+"° posto":"Finali",placeholder:true});
        finalRows.add(row.y);
      }
    }
    for(const region of regions){
      const cells=body.map(row=>({y:row.y,text:row.cells.filter(cell=>cell.x>=region.left&&cell.x<region.right).map(cell=>cell.str).join(" ").trim()}));
      const anchors=cells.flatMap(row=>{const time=clock.exec(row.text);return time?[{y:row.y,time:time[1].padStart(2,"0")+":"+time[2]}]:[];});
      for(const row of cells){
        if(finalRows.has(row.y)||!row.text||/\bfinal[ei]\b/i.test(row.text))continue;
        const explicit=clock.exec(row.text);
        const value=(explicit?row.text.replace(explicit[0],""):row.text).trim().replace(/^[\s□■☐☑▪•]+/,"");
        const pair=value.split(/\s*[-–—]\s*/);
        if(pair.length!==2||!pair.every(side=>/^\d{1,2}$/.test(side.trim())||/[a-zàèéìòù]{2}/i.test(side)))continue;
        const nearest=[...anchors].sort((a,b)=>Math.abs(a.y-row.y)-Math.abs(b.y-row.y));
        if(!nearest.length||(!explicit&&nearest[1]&&Math.abs(Math.abs(nearest[0].y-row.y)-Math.abs(nearest[1].y-row.y))<0.1))return null;
        const time=explicit?explicit[1].padStart(2,"0")+":"+explicit[2]:nearest[0].time;
        fixtures.push({dateTime:dateLabel+" "+time,homeTeam:unknown(pair[0].trim()),awayTeam:unknown(pair[1].trim()),group:region.group||"Girone UNICO",phase:"Gironi"});
      }
    }
    if(fixtures.length-before<2)return null;
  }
  return fixtures.length?fixtures:null;
}
