import { Router, type Request, type Response } from "express";
import db from "../db.js";
import { getPoolBalance, batchTransfer } from "../chain.js";

const router: Router = Router();

router.get("/current", (_req: Request, res: Response) => {
  const epoch = db.getActiveEpoch();
  if (!epoch) {
    res.json({ success: true, data: { epochId: 0, status: "none" } });
    return;
  }
  res.json({ success: true, data: epoch });
});

router.get("/history", (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 10;
  res.json({ success: true, data: db.getEpochHistory(limit) });
});

router.get("/:epochId/results", (req: Request, res: Response) => {
  const epochId = parseInt(req.params.epochId as string);
  res.json({ success: true, data: db.getEpochResults(epochId) });
});

router.post("/start", (_req: Request, res: Response) => {
  const epoch = db.createEpoch();
  res.json({ success: true, data: { epochId: epoch.id } });
});

router.post("/end", (_req: Request, res: Response) => {
  const epoch = db.getActiveEpoch();
  if (!epoch) {
    res.status(404).json({ success: false, message: "No active epoch" });
    return;
  }
  db.endEpoch(epoch.id, epoch.total_gold_extracted, epoch.player_count);
  res.json({ success: true, data: { epochId: epoch.id } });
});

// Game server reports extraction results at epoch end
// → reads on-chain pool balance → auto-transfers tokens to players
router.post("/report", async (req: Request, res: Response) => {
  const { epochId, extractions } = req.body as {
    epochId: number;
    extractions: { playerName: string; apiKey: string; goldExtracted: number }[];
  };

  if (!epochId || !extractions) {
    res.status(400).json({ success: false, message: "Missing epochId or extractions" });
    return;
  }

  const epoch = db.getEpochById(epochId);
  if (!epoch) {
    res.status(404).json({ success: false, message: "Epoch not found" });
    return;
  }

  const totalGold = extractions.reduce((sum, e) => sum + e.goldExtracted, 0);
  if (totalGold === 0) {
    db.endEpoch(epochId, 0, extractions.length);
    res.json({ success: true, data: { epochId, totalGold: 0, distributed: 0 } });
    return;
  }

  // 1. 读链上池子余额
  const poolInfo = await getPoolBalance();
  const pool = db.getPool();
  const perEpoch = pool.per_epoch;

  // 本轮分配金额：per_epoch 设了就用，否则用链上全部余额
  let epochPool = perEpoch > 0 ? Math.min(perEpoch, poolInfo.balance) : poolInfo.balance;

  if (epochPool <= 0) {
    db.endEpoch(epochId, totalGold, extractions.length);
    console.log(`[Epoch ${epochId}] Pool empty (on-chain: ${poolInfo.balance}), no tokens distributed`);
    res.json({ success: true, data: { epochId, totalGold, distributed: 0, poolEmpty: true } });
    return;
  }

  // 2. 计算每人份额，准备转账列表
  const transfers: { address: string; amount: number; userName: string; userId: number }[] = [];
  const recordResults: { name: string; gold: number; tokens: number; userId: number }[] = [];

  for (const ext of extractions) {
    const share = ext.goldExtracted / totalGold;
    const tokensEarned = Math.floor(epochPool * share * 100) / 100; // 保留2位小数

    // 找到或创建用户
    let user = db.getUserByApiKey(ext.apiKey);
    if (!user) {
      user = db.createUser(ext.apiKey, "", ext.playerName);
    }

    recordResults.push({ name: ext.playerName, gold: ext.goldExtracted, tokens: tokensEarned, userId: user.id });

    // 只有设了钱包地址的用户才自动转账，否则存余额
    if (user.wallet_address && user.wallet_address.startsWith("0x") && user.wallet_address.length === 42) {
      transfers.push({ address: user.wallet_address, amount: tokensEarned, userName: ext.playerName, userId: user.id });
    } else {
      // 没钱包地址 → 存内部余额，等用户设置地址后手动提现
      db.updateUser(user.id, { balance: user.balance + tokensEarned });
    }

    // 记录 epoch 结果
    db.addEpochResult({
      epoch_id: epochId,
      user_id: user.id,
      gold_extracted: ext.goldExtracted,
      tokens_earned: tokensEarned,
      rank: 0,
    });
  }

  // 3. 批量链上转账
  let onChainDistributed = 0;
  let offChainDistributed = 0;
  const txResults: { name: string; amount: number; txHash?: string; error?: string }[] = [];

  if (transfers.length > 0) {
    console.log(`[Epoch ${epochId}] Sending tokens to ${transfers.length} wallets on-chain...`);
    const batch = await batchTransfer(transfers.map(t => ({ address: t.address, amount: t.amount })));

    for (let i = 0; i < batch.results.length; i++) {
      const r = batch.results[i];
      const t = transfers[i];
      txResults.push({ name: t.userName, amount: t.amount, txHash: r.txHash, error: r.error });

      if (r.txHash) {
        onChainDistributed += t.amount;
        // 记录提现记录
        db.createAutoWithdrawal(t.userId, t.amount, t.address, r.txHash);
      } else {
        // 转账失败 → 存到内部余额
        const user = db.getUserById(t.userId);
        if (user) db.updateUser(t.userId, { balance: user.balance + t.amount });
        offChainDistributed += t.amount;
      }
    }
  }

  // 没钱包地址的部分
  for (const r of recordResults) {
    const user = db.getUserById(r.userId);
    if (!transfers.find(t => t.userId === r.userId)) {
      offChainDistributed += r.tokens;
    }
  }

  db.endEpoch(epochId, totalGold, extractions.length);

  const totalDistributed = onChainDistributed + offChainDistributed;
  console.log(`[Epoch ${epochId}] Done: ${totalDistributed.toFixed(2)} tokens total`);
  console.log(`  On-chain: ${onChainDistributed.toFixed(2)} | Internal balance: ${offChainDistributed.toFixed(2)}`);
  for (const r of recordResults) {
    console.log(`  ${r.name}: ${r.gold} gold -> ${r.tokens.toFixed(2)} tokens`);
  }

  res.json({
    success: true,
    data: {
      epochId, totalGold,
      distributed: totalDistributed,
      onChain: onChainDistributed,
      offChain: offChainDistributed,
      players: recordResults.length,
      transfers: txResults,
    },
  });
});

// 公开接口：获取池子链上余额（前端用）
router.get("/pool", async (_req: Request, res: Response) => {
  const poolInfo = await getPoolBalance();
  const pool = db.getPool();
  res.json({
    success: true,
    data: {
      onChainBalance: poolInfo.balance,
      poolAddress: poolInfo.address,
      perEpoch: pool.per_epoch,
    },
  });
});

export default router;
