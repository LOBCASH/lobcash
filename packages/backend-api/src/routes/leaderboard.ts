import { Router, type Request, type Response } from "express";
import db from "../db.js";

const router: Router = Router();

router.get("/", (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 20;
  res.json({ success: true, data: db.getLeaderboard(limit) });
});

export default router;
