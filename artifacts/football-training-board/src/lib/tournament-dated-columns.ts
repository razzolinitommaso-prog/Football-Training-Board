/**
 * Additive reader for side-by-side, weekday-dated round-robin schedules.
 * Unknown/ambiguous layouts return null and retain the established PDF reader.
 * Produces explicit fixture lines only; society/alias resolution stays in the parser.
 */
export type TournamentTextCell = { str: string; x: number; y: number };
const months = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
const weekdays = ["domenica","lunedi","martedi","mercoledi","giovedi","venerdi","sabato"];
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
export function readDatedTournamentColumns(items: TournamentTextCell[], fallbackDate?: string | null): string[] | null {
  const text = items.map(item => item.str).join(" ");
  if (!/\bgirone\s+unico\b/i.test(text) || /\b(final[ei]?|semifinal[ei]?|quarti|ottavi|spareggi)\b/i.test(text)) return null;
  const rows: { y: number; cells: TournamentTextCell[] }[] = [];
  for (const item of [...items].sort((a,b) => b.y-a.y || a.x-b.x)) {
    const row = rows.find(row => Math.abs(row.y-item.y)<3);
    if (row) row.cells.push(item); else rows.push({y:item.y,cells:[item]});
  }
  const datePattern = new RegExp("^("+weekdays.join("|")+")\\s+(\\d{1,2})\\s+("+months.join("|")+")(?:\\s+(20\\d{2}))?\\b");
  const headerRows = rows.map(row => ({...row, dates: row.cells.flatMap((cell,index) => {
    // Join fragmented words without crossing a separate date heading.
    for (let end=index;end<Math.min(index+5,row.cells.length);end++) {
      const value=normalize(row.cells.slice(index,end+1).map(cell=>cell.str).join(" "));
      const match=datePattern.exec(value);
      if (match) return [{x:cell.x,day:Number(match[2]),month:months.indexOf(match[3])+1,weekday:weekdays.indexOf(match[1]),year:match[4]?Number(match[4]):null}];
    }
    return [];
  })})).filter(row=>row.dates.length>=2);
  if (headerRows.length!==1) return null;
  const header=headerRows[0];
  const dates=header.dates.filter((date,i,all)=>!all.slice(0,i).some(prior=>prior.day===date.day&&prior.month===date.month&&Math.abs(prior.x-date.x)<100)).sort((a,b)=>a.x-b.x);
  if(dates.length<2 || dates.length>4 || dates.some((date,i)=>i>0&&date.x-dates[i-1].x<120))return null;
  const titleYear = rows.filter(row=>row.y>header.y).flatMap(row=>{
    const value=row.cells.map(cell=>cell.str).join(" ");
    return /\b(torneo|stagione)\b/i.test(value)?[...value.matchAll(/\b(20\d{2})\b/g)].map(match=>Number(match[1])):[];
  })[0];
  let year=dates[0].year??titleYear??(fallbackDate?Number(fallbackDate.slice(0,4)):NaN);
  if(!Number.isInteger(year))return null;
  const dated=dates.map((date,index)=>{
    if(date.year)year=date.year;
    else if(index>0 && dates[index-1].month-date.month>=6)year++;
    const actual=new Date(Date.UTC(year,date.month-1,date.day));
    if(actual.getUTCMonth()!==date.month-1 || actual.getUTCDay()!==date.weekday)return null;
    return { ...date, date:[String(date.day).padStart(2,"0"),String(date.month).padStart(2,"0"),year].join("/") };
  });
  if(dated.some(date=>date===null))return null;
  const output:string[]=[];
  for(let col=0;col<dated.length;col++){
    const date=dated[col]!;
    let time:string|null=null, count=0;
    const left=col===0?-Infinity:(dates[col-1].x+dates[col].x)/2;
    const right=col===dated.length-1?Infinity:(dates[col].x+dates[col+1].x)/2;
    for(const row of rows.filter(row=>row.y<header.y-5)){
      let value=row.cells.filter(cell=>cell.x>=left&&cell.x<right).sort((a,b)=>a.x-b.x).map(cell=>cell.str).join(" ").replace(/\s+/g," ").trim();
      if(!value)continue;
      const found=/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/.exec(value);
      if(found){time=found[1].padStart(2,"0")+":"+found[2];value=value.replace(found[0],"").trim();}
      value=value.replace(/^[\s□■☐☑▪•]+/,"");
      const sides=value.split(/\s*[-–—]\s*/);
      if(sides.length!==2 || !sides.every(side=>/[a-zàèéìòù]{2}/i.test(side)))continue;
      if(!time)return null;
      output.push(date.date+" "+time+" Girone UNICO "+sides[0].trim()+" - "+sides[1].trim());
      count++;
    }
    if(count<2)return null;
  }
  return output.length?output:null;
}
