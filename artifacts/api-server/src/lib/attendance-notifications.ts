import { and, asc, eq, sql } from "drizzle-orm";
import { db, trainingAttendancesTable, trainingSessionsTable, playersTable, parentPlayerRelationsTable, parentNotificationsTable } from "@workspace/db";
import { sendParentNotificationEmail } from "./parent-email";

export async function saveAttendanceAndNotify(input:{clubId:number;sessionId:number;playerId:number;id?:number;status?:string;notes?:string|null}) {
  const result=await db.transaction(async tx=>{
    // All attendance write paths share this lock, including the first insert.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.clubId}|${input.sessionId}|${input.playerId}`}))`);
    const [existing]=await tx.select().from(trainingAttendancesTable).where(and(eq(trainingAttendancesTable.clubId,input.clubId),eq(trainingAttendancesTable.trainingSessionId,input.sessionId),eq(trainingAttendancesTable.playerId,input.playerId),input.id?eq(trainingAttendancesTable.id,input.id):undefined)).orderBy(asc(trainingAttendancesTable.id)).limit(1);
    if(input.id&&!existing)return null;
    const status=input.status??existing?.status??"present";
    const legacyParent=Boolean(existing&&["requested","absent"].includes(existing.status)&&(existing.notes??"").startsWith("Genitore:"));
    const incomingNotes=input.notes===undefined?existing?.notes:input.notes;
    const cleanNotes=(status==="present"||status==="absent")&&(incomingNotes??"").startsWith("Genitore:")?null:incomingNotes;
    const [record]=existing?await tx.update(trainingAttendancesTable).set({status,notes:cleanNotes}).where(eq(trainingAttendancesTable.id,existing.id)).returning():await tx.insert(trainingAttendancesTable).values({clubId:input.clubId,trainingSessionId:input.sessionId,playerId:input.playerId,status,notes:cleanNotes??null}).returning();
    const messages:{parentUserId:number;title:string;message:string}[]=[];
    if((status==="present"||status==="absent")&&(status!==existing?.status||legacyParent)){
      const [player]=await tx.select({firstName:playersTable.firstName,lastName:playersTable.lastName}).from(playersTable).where(and(eq(playersTable.clubId,input.clubId),eq(playersTable.id,input.playerId))).limit(1);
      const [session]=await tx.select({title:trainingSessionsTable.title,scheduledAt:trainingSessionsTable.scheduledAt}).from(trainingSessionsTable).where(and(eq(trainingSessionsTable.clubId,input.clubId),eq(trainingSessionsTable.id,input.sessionId))).limit(1);
      if(!player||!session)throw new Error("Sessione o giocatore non disponibili");
      const parents=await tx.select({id:parentPlayerRelationsTable.parentUserId}).from(parentPlayerRelationsTable).where(eq(parentPlayerRelationsTable.playerId,input.playerId));
      const correction=!legacyParent&&existing&&(existing.status==="present"||existing.status==="absent");
      const title=correction?"Aggiornamento appello allenamento":"Appello allenamento";
      const message=`${correction?"Rettifica: ":""}${player.firstName} ${player.lastName} risulta ${status==="present"?"presente":"assente"} all'allenamento "${session.title}" del ${session.scheduledAt.toLocaleString("it-IT",{timeZone:"Europe/Rome"})}.`;
      for(const parentUserId of new Set(parents.map(parent=>parent.id))){await tx.insert(parentNotificationsTable).values({clubId:input.clubId,parentUserId,type:"training_attendance",title,message});messages.push({parentUserId,title,message});}
    }
    return {record,created:!existing,messages};
  });
  if(!result)return null;
  // Persisted in-app notifications survive SMTP failures. The existing mail
  // service delivers only when SMTP and a parent's email are configured.
  await Promise.allSettled(result.messages.slice(0,1).map(message=>sendParentNotificationEmail({...message,clubId:input.clubId,playerId:input.playerId})));
  return {record:result.record,created:result.created};
}
