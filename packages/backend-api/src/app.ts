import express from "express";
import authRouter from "./routes/auth.js";
import epochRouter from "./routes/epoch.js";
import leaderboardRouter from "./routes/leaderboard.js";
import walletRouter from "./routes/wallet.js";
import gameRouter from "./routes/game.js";
import adminRouter from "./routes/admin.js";

const app = express();
const PORT = parseInt(process.env.API_PORT ?? "19200", 10);

app.use(express.json());

// CORS
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  next();
});

// Routes
app.use("/api/auth", authRouter);
app.use("/api/epoch", epochRouter);
app.use("/api/leaderboard", leaderboardRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/game", gameRouter);
app.use("/api/admin", adminRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", version: "0.1.0" });
});

app.listen(PORT, () => {
  console.log(`[LOBCASH API] Running on http://localhost:${PORT}`);
  console.log(`[LOBCASH API] Endpoints:`);
  console.log(`  POST /api/auth/register`);
  console.log(`  GET  /api/auth/account_info`);
  console.log(`  GET  /api/auth/eligible`);
  console.log(`  GET  /api/game/getGame`);
  console.log(`  GET  /api/epoch/current`);
  console.log(`  POST /api/epoch/start`);
  console.log(`  POST /api/epoch/end`);
  console.log(`  GET  /api/leaderboard`);
  console.log(`  GET  /api/wallet/balance`);
  console.log(`  POST /api/wallet/set-address`);
  console.log(`  POST /api/wallet/withdraw`);
  console.log(`  GET  /api/epoch/pool          (public: pool balance)`);
  console.log(`  --- Admin ---`);
  console.log(`  GET  /api/admin/overview`);
  console.log(`  GET  /api/admin/pool`);
  console.log(`  POST /api/admin/pool/set-per-epoch`);
});
