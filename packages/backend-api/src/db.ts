import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, "lobcash.json");

export interface User {
  id: number;
  api_key: string;
  wallet_address: string;
  nickname: string;
  balance: number;
  is_blocked: boolean;
  created_at: string;
}

export interface Epoch {
  id: number;
  start_time: string;
  end_time?: string;
  total_pool: number;
  total_gold_extracted: number;
  player_count: number;
  status: "active" | "ended";
}

export interface EpochResult {
  epoch_id: number;
  user_id: number;
  gold_extracted: number;
  tokens_earned: number;
  rank: number;
}

export interface Withdrawal {
  id: number;
  user_id: number;
  amount: number;
  target_address: string;
  tx_hash?: string;
  status: string;
  created_at: string;
}

export interface PoolDeposit {
  id: number;
  amount: number;
  memo: string;
  created_at: string;
}

export interface PoolConfig {
  balance: number;           // 矿池当前余额
  per_epoch: number;         // 每个epoch分配多少（0=用全部余额）
  deposits: PoolDeposit[];   // 充值记录
  nextDepositId: number;
}

interface DbData {
  users: User[];
  epochs: Epoch[];
  epoch_results: EpochResult[];
  withdrawals: Withdrawal[];
  pool: PoolConfig;
  nextUserId: number;
  nextEpochId: number;
  nextWithdrawalId: number;
}

function loadDb(): DbData {
  if (fs.existsSync(DB_FILE)) {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  }
  return {
    users: [],
    epochs: [],
    epoch_results: [],
    withdrawals: [],
    pool: { balance: 0, per_epoch: 0, deposits: [], nextDepositId: 1 },
    nextUserId: 1,
    nextEpochId: 1,
    nextWithdrawalId: 1,
  };
}

function saveDb(data: DbData): void {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Simple in-memory DB with JSON persistence
class JsonDb {
  private data: DbData;

  constructor() {
    this.data = loadDb();
  }

  private save(): void {
    saveDb(this.data);
  }

  // Users
  createUser(apiKey: string, walletAddress: string, nickname: string): User {
    const user: User = {
      id: this.data.nextUserId++,
      api_key: apiKey,
      wallet_address: walletAddress,
      nickname,
      balance: 0,
      is_blocked: false,
      created_at: new Date().toISOString(),
    };
    this.data.users.push(user);
    this.save();
    return user;
  }

  getUserByApiKey(apiKey: string): User | undefined {
    return this.data.users.find((u) => u.api_key === apiKey);
  }

  getUserById(id: number): User | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  updateUser(id: number, updates: Partial<User>): void {
    const user = this.data.users.find((u) => u.id === id);
    if (user) {
      Object.assign(user, updates);
      this.save();
    }
  }

  // Epochs
  createEpoch(): Epoch {
    // End any active epoch
    for (const e of this.data.epochs) {
      if (e.status === "active") {
        e.status = "ended";
        e.end_time = new Date().toISOString();
      }
    }

    const epoch: Epoch = {
      id: this.data.nextEpochId++,
      start_time: new Date().toISOString(),
      total_pool: 0,
      total_gold_extracted: 0,
      player_count: 0,
      status: "active",
    };
    this.data.epochs.push(epoch);
    this.save();
    return epoch;
  }

  getActiveEpoch(): Epoch | undefined {
    return this.data.epochs.find((e) => e.status === "active");
  }

  getEpochById(id: number): Epoch | undefined {
    return this.data.epochs.find((e) => e.id === id);
  }

  getEpochHistory(limit: number): Epoch[] {
    return [...this.data.epochs].reverse().slice(0, limit);
  }

  endEpoch(id: number, totalGold: number, playerCount: number): void {
    const epoch = this.data.epochs.find((e) => e.id === id);
    if (epoch) {
      epoch.status = "ended";
      epoch.end_time = new Date().toISOString();
      epoch.total_gold_extracted = totalGold;
      epoch.player_count = playerCount;
      this.save();
    }
  }

  // Epoch Results
  addEpochResult(result: EpochResult): void {
    this.data.epoch_results.push(result);
    this.save();
  }

  getEpochResults(epochId: number): (EpochResult & { nickname?: string })[] {
    return this.data.epoch_results
      .filter((r) => r.epoch_id === epochId)
      .map((r) => ({
        ...r,
        nickname: this.getUserById(r.user_id)?.nickname,
      }))
      .sort((a, b) => b.tokens_earned - a.tokens_earned);
  }

  // Leaderboard
  getLeaderboard(limit: number): any[] {
    const userScores = new Map<number, { total_gold: number; total_tokens: number; epochs: number }>();
    for (const r of this.data.epoch_results) {
      const s = userScores.get(r.user_id) ?? { total_gold: 0, total_tokens: 0, epochs: 0 };
      s.total_gold += r.gold_extracted;
      s.total_tokens += r.tokens_earned;
      s.epochs++;
      userScores.set(r.user_id, s);
    }

    return [...userScores.entries()]
      .map(([userId, scores]) => {
        const user = this.getUserById(userId);
        return {
          id: userId,
          nickname: user?.nickname ?? "Unknown",
          balance: user?.balance ?? 0,
          ...scores,
        };
      })
      .sort((a, b) => b.total_tokens - a.total_tokens)
      .slice(0, limit);
  }

  // Withdrawals
  createWithdrawal(userId: number, amount: number, targetAddress: string): Withdrawal {
    const w: Withdrawal = {
      id: this.data.nextWithdrawalId++,
      user_id: userId,
      amount,
      target_address: targetAddress,
      status: "pending",
      created_at: new Date().toISOString(),
    };
    this.data.withdrawals.push(w);

    // Deduct balance
    const user = this.getUserById(userId);
    if (user) {
      user.balance -= amount;
    }

    this.save();
    return w;
  }

  getUserWithdrawals(userId: number): Withdrawal[] {
    return this.data.withdrawals
      .filter((w) => w.user_id === userId)
      .reverse();
  }

  getAllUsers(): User[] {
    return this.data.users;
  }

  // ─── Mining Pool ───

  getPool(): PoolConfig {
    // Migration: add pool if missing from old data
    if (!this.data.pool) {
      this.data.pool = { balance: 0, per_epoch: 0, deposits: [], nextDepositId: 1 };
      this.save();
    }
    return this.data.pool;
  }

  depositToPool(amount: number, memo: string): PoolDeposit {
    const pool = this.getPool();
    const deposit: PoolDeposit = {
      id: pool.nextDepositId++,
      amount,
      memo,
      created_at: new Date().toISOString(),
    };
    pool.balance += amount;
    pool.deposits.push(deposit);
    this.save();
    return deposit;
  }

  setPoolPerEpoch(amount: number): void {
    const pool = this.getPool();
    pool.per_epoch = amount;
    this.save();
  }

  // Deduct from pool for epoch distribution. Returns actual amount available.
  deductFromPool(requestedAmount: number): number {
    const pool = this.getPool();
    const actual = Math.min(requestedAmount, pool.balance);
    pool.balance -= actual;
    this.save();
    return actual;
  }

  // ─── Withdrawal management (admin) ───

  getAllPendingWithdrawals(): (Withdrawal & { nickname?: string })[] {
    return this.data.withdrawals
      .filter((w) => w.status === "pending")
      .map((w) => ({ ...w, nickname: this.getUserById(w.user_id)?.nickname }));
  }

  updateWithdrawal(id: number, updates: Partial<Withdrawal>): Withdrawal | undefined {
    const w = this.data.withdrawals.find((w) => w.id === id);
    if (w) {
      Object.assign(w, updates);
      this.save();
    }
    return w;
  }

  // Auto-withdrawal record (system sent tokens on-chain)
  createAutoWithdrawal(userId: number, amount: number, targetAddress: string, txHash: string): Withdrawal {
    const w: Withdrawal = {
      id: this.data.nextWithdrawalId++,
      user_id: userId,
      amount,
      target_address: targetAddress,
      tx_hash: txHash,
      status: "completed",
      created_at: new Date().toISOString(),
    };
    this.data.withdrawals.push(w);
    this.save();
    return w;
  }

  // Reject withdrawal: refund balance
  rejectWithdrawal(id: number): Withdrawal | undefined {
    const w = this.data.withdrawals.find((w) => w.id === id);
    if (!w || w.status !== "pending") return undefined;
    w.status = "rejected";
    const user = this.getUserById(w.user_id);
    if (user) user.balance += w.amount; // refund
    this.save();
    return w;
  }
}

const db = new JsonDb();
export default db;
