import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { tacticalBoardsTable } from "@workspace/db/schema";
import { requireAuth } from "../lib/auth";

export const boardsRouter = Router();

const BOARD_EDIT_ROLES = ["admin", "director", "technical_director", "coach", "fitness_coach", "athletic_director"];

function parseBoardId(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return Number.parseInt(String(raw ?? ""), 10);
}

function normalizeBoardData(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function boardResponse(row: typeof tacticalBoardsTable.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    data: row.data,
    createdAt: row.createdAt?.toISOString?.() ?? String(row.createdAt),
    updatedAt: row.updatedAt?.toISOString?.() ?? String(row.updatedAt),
  };
}

function canEditBoards(role?: string | null): boolean {
  return BOARD_EDIT_ROLES.includes(role ?? "");
}

boardsRouter.get("/", requireAuth, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const rows = await db
    .select()
    .from(tacticalBoardsTable)
    .where(eq(tacticalBoardsTable.clubId, clubId))
    .orderBy(desc(tacticalBoardsTable.updatedAt), desc(tacticalBoardsTable.createdAt));

  res.json(rows.map(boardResponse));
});

boardsRouter.get("/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseBoardId(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ message: "Invalid board id" });
    return;
  }

  const [row] = await db
    .select()
    .from(tacticalBoardsTable)
    .where(and(eq(tacticalBoardsTable.id, id), eq(tacticalBoardsTable.clubId, req.session.clubId!)))
    .limit(1);

  if (!row) {
    res.status(404).json({ message: "Board not found" });
    return;
  }

  res.json(boardResponse(row));
});

boardsRouter.post("/", requireAuth, async (req, res): Promise<void> => {
  if (!canEditBoards(req.session.role)) {
    res.status(403).json({ message: "Non autorizzato a salvare lavagne tattiche" });
    return;
  }
  const data = normalizeBoardData(req.body?.data);
  const title = String(req.body?.title ?? "").trim() || "Untitled Board";

  const [row] = await db
    .insert(tacticalBoardsTable)
    .values({
      clubId: req.session.clubId!,
      createdByUserId: req.session.userId ?? null,
      teamId: parseOptionalNumber(data.teamId),
      title,
      boardType: typeof data.boardType === "string" ? data.boardType : null,
      data,
    })
    .returning();

  if (!row) {
    res.status(500).json({ message: "Board save failed" });
    return;
  }

  res.status(201).json(boardResponse(row));
});

boardsRouter.put("/:id", requireAuth, async (req, res): Promise<void> => {
  if (!canEditBoards(req.session.role)) {
    res.status(403).json({ message: "Non autorizzato a modificare lavagne tattiche" });
    return;
  }
  const id = parseBoardId(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ message: "Invalid board id" });
    return;
  }

  const data = req.body?.data === undefined ? undefined : normalizeBoardData(req.body.data);
  const titleRaw = req.body?.title === undefined ? undefined : String(req.body.title ?? "").trim();

  const updates: Partial<typeof tacticalBoardsTable.$inferInsert> = {};
  if (titleRaw !== undefined) updates.title = titleRaw || "Untitled Board";
  if (data !== undefined) {
    updates.data = data;
    updates.teamId = parseOptionalNumber(data.teamId);
    updates.boardType = typeof data.boardType === "string" ? data.boardType : null;
  }

  if (Object.keys(updates).length === 0) {
    const [current] = await db
      .select()
      .from(tacticalBoardsTable)
      .where(and(eq(tacticalBoardsTable.id, id), eq(tacticalBoardsTable.clubId, req.session.clubId!)))
      .limit(1);
    if (!current) {
      res.status(404).json({ message: "Board not found" });
      return;
    }
    res.json(boardResponse(current));
    return;
  }

  const [row] = await db
    .update(tacticalBoardsTable)
    .set(updates)
    .where(and(eq(tacticalBoardsTable.id, id), eq(tacticalBoardsTable.clubId, req.session.clubId!)))
    .returning();

  if (!row) {
    res.status(404).json({ message: "Board not found" });
    return;
  }

  res.json(boardResponse(row));
});

boardsRouter.delete("/:id", requireAuth, async (req, res): Promise<void> => {
  if (!canEditBoards(req.session.role)) {
    res.status(403).json({ message: "Non autorizzato a eliminare lavagne tattiche" });
    return;
  }
  const id = parseBoardId(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ message: "Invalid board id" });
    return;
  }

  const [row] = await db
    .delete(tacticalBoardsTable)
    .where(and(eq(tacticalBoardsTable.id, id), eq(tacticalBoardsTable.clubId, req.session.clubId!)))
    .returning();

  if (!row) {
    res.status(404).json({ message: "Board not found" });
    return;
  }

  res.json({ message: "Board deleted successfully", board: boardResponse(row) });
});
