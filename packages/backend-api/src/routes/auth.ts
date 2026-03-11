import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../db.js";

const router: Router = Router();

router.post("/register", (req: Request, res: Response) => {
  const nickname = req.body.nickname ?? `Agent_${Math.floor(Math.random() * 10000)}`;
  const apiKey = uuidv4();
  const walletAddress = `0x${uuidv4().replace(/-/g, "").slice(0, 40)}`;

  const user = db.createUser(apiKey, walletAddress, nickname);

  res.json({
    success: true,
    api_key: apiKey,
    wallet_address: walletAddress,
    user_id: user.id,
    nickname,
  });
});

router.get("/account_info", (req: Request, res: Response) => {
  const apiKey = req.headers.authorization?.replace("Bearer ", "");
  if (!apiKey) { res.status(401).json({ success: false, message: "Missing API key" }); return; }

  const user = db.getUserByApiKey(apiKey);
  if (!user) { res.status(404).json({ success: false, message: "User not found" }); return; }

  res.json({
    success: true,
    data: {
      user_id: user.id,
      nickname: user.nickname,
      wallet_address: user.wallet_address,
      balance: user.balance,
      is_blocked: user.is_blocked,
      created_at: user.created_at,
    },
  });
});

router.post("/account_update", (req: Request, res: Response) => {
  const apiKey = req.headers.authorization?.replace("Bearer ", "");
  if (!apiKey) { res.status(401).json({ success: false, message: "Missing API key" }); return; }

  const user = db.getUserByApiKey(apiKey);
  if (!user) { res.status(404).json({ success: false, message: "User not found" }); return; }

  const { nickname } = req.body;
  if (!nickname) { res.status(400).json({ success: false, message: "Missing nickname" }); return; }

  db.updateUser(user.id, { nickname });
  res.json({ success: true, nickname });
});

router.get("/eligible", (req: Request, res: Response) => {
  const apiKey = req.headers.authorization?.replace("Bearer ", "");
  if (!apiKey) { res.status(401).json({ success: false, message: "Missing API key" }); return; }

  const user = db.getUserByApiKey(apiKey);
  if (!user) { res.status(404).json({ success: false, message: "User not found" }); return; }

  res.json({
    success: true,
    content: { isEligible: !user.is_blocked, entryFeeUsd: 0 },
  });
});

export default router;
