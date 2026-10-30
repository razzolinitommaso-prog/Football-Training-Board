import { and, eq, inArray } from "drizzle-orm";
import { db, teamsTable, teamStaffAssignmentsTable } from "@workspace/db";
import { sessionTeamIds } from "@workspace/api-zod";
/** Access follows this specific shared session, never the other team's matches or documents. */
export async function assignedTrainingProgram(clubId:number,userId:number,session:{teamId:number|null;notes:string|null}) {
  if(!session.notes?.includes("[FTB_PROGRAM_TEAMS]"))return false;
  const ids=sessionTeamIds(session.teamId,session.notes);
  if(ids.length<2)return false;
  const [assignment]=await db.select({id:teamStaffAssignmentsTable.id}).from(teamStaffAssignmentsTable).where(and(eq(teamStaffAssignmentsTable.clubId,clubId),eq(teamStaffAssignmentsTable.userId,userId),inArray(teamStaffAssignmentsTable.teamId,ids))).limit(1);
  if(assignment)return true;
  const [team]=await db.select({id:teamsTable.id}).from(teamsTable).where(and(eq(teamsTable.clubId,clubId),eq(teamsTable.coachId,userId),inArray(teamsTable.id,ids))).limit(1);
  return !!team;
}
