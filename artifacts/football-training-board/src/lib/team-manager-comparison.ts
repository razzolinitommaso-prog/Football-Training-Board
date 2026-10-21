import { format, startOfDay, startOfWeek, subDays } from "date-fns";
import { managerTrainingEvents, type ManagerTrainingCalendar, type ManagerTrainingSession } from "./team-manager-training-calendar";
export type ManagerComparison = {
  players: {id:number;firstName:string;lastName:string;called:boolean}[];
  sessions: {id:number;title:string;scheduledAt:string}[];
  records: {sessionId:number;playerId:number;attendance:"present"|"absent"|"unavailable"|null;availability:"available"|"unavailable"|null}[];
};
export type ComparisonState = "present"|"absent"|"unavailable"|"unknown"|"upcoming"|"conflict";
const key = (date:Date) => format(date,"yyyy-MM-dd|HH:mm");
export function managerComparisonRows(data:ManagerComparison,calendar:ManagerTrainingCalendar|null|undefined,matchDate:string,period:"week"|"four",now=new Date()) {
  const gameDay=startOfDay(new Date(matchDate));
  const from=period==="week"?startOfWeek(gameDay,{weekStartsOn:1}):subDays(gameDay,28);
  const to=subDays(gameDay,1);to.setHours(23,59,59,999);
  if(from>to)return {events:[],players:data.players.map(player=>({...player,cells:[],present:0,absent:0,recorded:0}))};
  const sessions:ManagerTrainingSession[]=data.sessions.map(session=>({...session,location:null,status:"scheduled"}));
  const events=managerTrainingEvents(calendar,sessions,from,to).filter(event=>event.status!=="cancelled"&&event.status!=="relocated");
  const sessionsByTime=new Map<string,number[]>();
  for(const session of data.sessions){const at=new Date(session.scheduledAt);if(!Number.isFinite(at.getTime()))continue;const k=key(at);sessionsByTime.set(k,[...(sessionsByTime.get(k)??[]),session.id]);}
  const records=new Map(data.records.map(record=>[`${record.playerId}|${record.sessionId}`,record]));
  const players=data.players.map(player=>{
    const cells=events.map(event=>{
      const at=new Date(event.date!);
      const rows=(sessionsByTime.get(key(at))??[]).flatMap(id=>{const row=records.get(`${player.id}|${id}`);return row?[row]:[];});
      const states=[...new Set(rows.map(row=>row.attendance).filter(Boolean))];
      const answers=[...new Set(rows.map(row=>row.availability).filter(Boolean))];
      const state:ComparisonState=at>now?"upcoming":states.length>1?"conflict":states[0]??"unknown";
      return {state,availability:answers.length===1?answers[0]:null};
    });
    const present=cells.filter(cell=>cell.state==="present").length,absent=cells.filter(cell=>cell.state==="absent").length;
    return {...player,cells,present,absent,recorded:present+absent};
  });
  return {events,players};
}
