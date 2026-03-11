import { Router, type Request, type Response } from "express";
import db from "../db.js";
import { transferToken } from "../chain.js";

const router: Router = Router();

router.get("/balance", (req: Request, res: Response) => {
  const apiKey = req.headers.authorization?.replace("Bearer ", "");
  if (!apiKey) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }

  const user = db.getUserByApiKey(apiKey);
  if (!user) { res.status(404).json({ success: false, message: "User not found" }); return; }

  res.json({
    success: true,
    data: {
      balance: user.balance,
      wallet_address: user.wallet_address || null,
    },
  });
});

// 用户设置/更新钱包地址
router.post("/set-address", (req: Request, res: Response) => {
  const apiKey = req.headers.authorization?.replace("Bearer ", "");
  if (!apiKey) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }

  const user = db.getUserByApiKey(apiKey);
  if (!user) { res.status(404).json({ success: false, message: "User not found" }); return; }

  const { wallet_address } = req.body;
  if (!wallet_address || !wallet_address.startsWith("0x") || wallet_address.length !== 42) {
    res.status(400).json({ success: false, message: "Invalid BSC wallet address" });
    return;
  }

  db.updateUser(user.id, { wallet_address });
  console.log(`[Wallet] User "${user.nickname}" set wallet: ${wallet_address}`);
  res.json({ success: true, data: { wallet_address } });
});

// 用户手动提现内部余额 → 自动打到他的钱包
router.post("/withdraw", async (req: Request, res: Response) => {
  const apiKey = req.headers.authorization?.replace("Bearer ", "");
  if (!apiKey) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }

  const user = db.getUserByApiKey(apiKey);
  if (!user) { res.status(404).json({ success: false, message: "User not found" }); return; }

  const { amount } = req.body;
  const targetAddress = user.wallet_address;

  if (!targetAddress || !targetAddress.startsWith("0x") || targetAddress.length !== 42) {
    res.status(400).json({ success: false, message: "Please set your wallet address first (POST /api/wallet/set-address)" });
    return;
  }
  if (!amount || amount <= 0 || amount > user.balance) {
    res.status(400).json({ success: false, message: "Invalid amount or insufficient balance" });
    return;
  }

  // 先扣余额
  db.updateUser(user.id, { balance: user.balance - amount });

  // 链上转账
  const result = await transferToken(targetAddress, amount);

  if (result.success) {
    db.createAutoWithdrawal(user.id, amount, targetAddress, result.txHash!);
    console.log(`[Wallet] Auto-sent ${amount} tokens to ${targetAddress} (tx: ${result.txHash})`);
    res.json({
      success: true,
      data: {
        amount,
        target_address: targetAddress,
        tx_hash: result.txHash,
        status: "completed",
      },
    });
  } else {
    // 转账失败 → 退回余额
    const freshUser = db.getUserById(user.id)!;
    db.updateUser(user.id, { balance: freshUser.balance + amount });
    console.error(`[Wallet] Transfer failed for ${user.nickname}: ${result.error}`);
    res.status(500).json({
      success: false,
      message: `Transfer failed: ${result.error}. Balance refunded.`,
    });
  }
});

router.get("/withdrawals", (req: Request, res: Response) => {
  const apiKey = req.headers.authorization?.replace("Bearer ", "");
  if (!apiKey) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }

  const user = db.getUserByApiKey(apiKey);
  if (!user) { res.status(404).json({ success: false, message: "User not found" }); return; }

  res.json({ success: true, data: db.getUserWithdrawals(user.id) });
});

export default router;
