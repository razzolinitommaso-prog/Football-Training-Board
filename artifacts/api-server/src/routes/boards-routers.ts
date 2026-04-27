import { Router } from "express";

type Board = {
  id: number;
  title: string;
  data: any;
  createdAt: string;
};

const boards: Board[] = [];

export const boardsRouter = Router();

/**
 * GET ALL BOARDS
 */
boardsRouter.get("/", (_req, res) => {
  console.log("✅ HIT /boards");
  return res.json(boards);
});

/**
 * GET SINGLE BOARD
 */
boardsRouter.get("/:id", (req, res) => {
  const id = Number(req.params.id);

  const board = boards.find((b) => b.id === id);

  if (!board) {
    return res.status(404).json({ message: "Board not found" });
  }

  return res.json(board);
});

/**
 * CREATE BOARD
 */
boardsRouter.post("/", (req, res) => {
  const { title, data } = req.body;

  const newBoard: Board = {
    id: Date.now(),
    title: title || "Untitled Board",
    data: data || {},
    createdAt: new Date().toISOString(),
  };

  boards.push(newBoard);

  return res.status(201).json(newBoard);
});

/**
 * UPDATE BOARD
 */
boardsRouter.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const { title, data } = req.body;

  const boardIndex = boards.findIndex((b) => b.id === id);

  if (boardIndex === -1) {
    return res.status(404).json({ message: "Board not found" });
  }

  boards[boardIndex] = {
    ...boards[boardIndex],
    title: title ?? boards[boardIndex].title,
    data: data ?? boards[boardIndex].data,
  };

  return res.json(boards[boardIndex]);
});

/**
 * DELETE BOARD
 */
boardsRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);

  const boardIndex = boards.findIndex((b) => b.id === id);

  if (boardIndex === -1) {
    return res.status(404).json({ message: "Board not found" });
  }

  const deletedBoard = boards.splice(boardIndex, 1);

  return res.json({
    message: "Board deleted successfully",
    board: deletedBoard[0],
  });
});