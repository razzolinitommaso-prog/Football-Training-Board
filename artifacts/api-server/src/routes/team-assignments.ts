import { Router, type IRouter } from "express";
import { db, teamStaffAssignmentsTable, teamsTable, usersTable, clubMembershipsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.get("/team-assignments", requireAuth, async (req, res): Promise<void> => {
  const assignments = await db
    .select({
      id: teamStaffAssignmentsTable.id,
      teamId: teamStaffAssignmentsTable.teamId,
      userId: teamStaffAssignmentsTable.userId,
      role: teamStaffAssignmentsTable.role,
      createdAt: teamStaffAssignmentsTable.createdAt,
      teamName: teamsTable.name,
      userFirstName: usersTable.firstName,
      userLastName: usersTable.lastName,
    })
    .from(teamStaffAssignmentsTable)
    .innerJoin(teamsTable, eq(teamStaffAssignmentsTable.teamId, teamsTable.id))
    .innerJoin(usersTable, eq(teamStaffAssignmentsTable.userId, usersTable.id))
    .where(eq(teamStaffAssignmentsTable.clubId, req.session.clubId!));

  res.json(assignments);
});

router.post("/team-assignments", requireAuth, async (req, res): Promise<void> => {
  const { teamId, userId, role } = req.body;
  if (!teamId || !userId || !role) {
    res.status(400).json({ error: "teamId, userId and role are required" });
    return;
  }

  const existing = await db
    .select()
    .from(teamStaffAssignmentsTable)
    .where(
      and(
        eq(teamStaffAssignmentsTable.teamId, teamId),
        eq(teamStaffAssignmentsTable.userId, userId),
        eq(teamStaffAssignmentsTable.clubId, req.session.clubId!)
      )
    );

  if (existing.length > 0) {
    res.status(400).json({ error: "Staff member already assigned to this team" });
    return;
  }

  const [assignment] = await db
    .insert(teamStaffAssignmentsTable)
    .values({ teamId, userId, clubId: req.session.clubId!, role })
    .returning();

  res.json(assignment);
});

router.delete("/team-assignments/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  await db
    .delete(teamStaffAssignmentsTable)
    .where(
      and(
        eq(teamStaffAssignmentsTable.id, id),
        eq(teamStaffAssignmentsTable.clubId, req.session.clubId!)
      )
    );
  res.json({ success: true });
});

export default router;
