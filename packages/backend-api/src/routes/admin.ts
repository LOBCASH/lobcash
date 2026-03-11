import { Router, type Request, type Response } from "express";
import db from "../db.js";
import { getPoolBalance, getGasBalance, getChainStatus } from "../chain.js";

const router: Router = Router();

const ADMIN_KEY = process.env.ADMIN_KEY ?? "lobcash-admin-secret";

function requireAdmin(req: Request, res: Response): boolean {
  const key = req.headers.authorization?.replace("Bearer ", "");
  if (key !== ADMIN_KEY) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return false;
  }
  return true;
}

// ─── 矿池管理 ───

// 查看矿池状态（链上 + 配置）
router.get("/pool", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const pool = db.getPool();
  const onChain = await getPoolBalance();
  const gas = await getGasBalance();

  res.json({
    success: true,
    data: {
      onChainBalance: onChain.balance,
      poolAddress: onChain.address,
      gasBalance: gas,
      per_epoch: pool.per_epoch,
      chain: getChainStatus(),
    },
  });
});

// 设置每个 epoch 分配金额（0 = 用池子全部余额）
router.post("/pool/set-per-epoch", (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { amount } = req.body;
  if (amount === undefined || amount < 0) {
    res.status(400).json({ success: false, message: "Invalid amount" });
    return;
  }
  db.setPoolPerEpoch(amount);
  console.log(`[Admin] Pool per-epoch set to: ${amount} (0 = use full balance)`);
  res.json({ success: true, data: { per_epoch: amount } });
});

// ─── 概览 ───

router.get("/overview", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const pool = db.getPool();
  const onChain = await getPoolBalance();
  const gas = await getGasBalance();
  const users = db.getAllUsers();
  const totalUserBalance = users.reduce((s, u) => s + u.balance, 0);
  const epoch = db.getActiveEpoch();

  res.json({
    success: true,
    data: {
      pool: {
        onChainBalance: onChain.balance,
        address: onChain.address,
        gasBalance: gas,
        per_epoch: pool.per_epoch,
      },
      users: {
        total: users.length,
        totalInternalBalance: totalUserBalance,
        withWallet: users.filter(u => u.wallet_address?.startsWith("0x") && u.wallet_address.length === 42).length,
      },
      active_epoch: epoch?.id ?? null,
      chain: getChainStatus(),
    },
  });
});

export default router;
