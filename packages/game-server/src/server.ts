import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import { Arena } from "./Arena.js";
import { PlayerEntity } from "./entities.js";
import {
  PacketType, ActionType, ARENA_WIDTH, ARENA_HEIGHT,
  TICK_MS, MAX_INPUT_RATE, MAX_NAME_LENGTH, EPOCH_DURATION_MS,
  encodeJoined, encodeUpdate, encodeDeath, encodeEpochInfo, encodeGameOver,
  decodePacket, decodeInput,
  type JoinData,
} from "@lobcash/common";

const PORT = parseInt(process.env.PORT ?? "19100", 10);
const API_URL = process.env.API_URL ?? "http://localhost:19200";

interface ClientSession {
  ws: WebSocket;
  player: PlayerEntity | null;
  spectator: boolean;
  authenticated: boolean;
}

const arena = new Arena();
const clients: Map<WebSocket, ClientSession> = new Map();


// ─── HTTP health endpoint ───
const httpServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      players: arena.players.size,
      tick: arena.tick,
      epochId: arena.epochId,
    }));
    return;
  }
  // Stats endpoint for frontend
  if (req.url === "/stats") {
    const now = Date.now();
    const players = [...arena.players.values()].filter(p => p.alive);
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({
      players: players.length,
      epochId: arena.epochId,
      epochTimeLeft: Math.max(0, EPOCH_DURATION_MS - (now - arena.epochStartTime)),
      topPlayers: players
        .sort((a, b) => (b.score + b.gold) - (a.score + a.gold))
        .slice(0, 10)
        .map(p => ({ name: p.name, gold: p.gold, score: p.score })),
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

// ─── WebSocket Server ───
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  const session: ClientSession = { ws, player: null, spectator: false, authenticated: false };
  clients.set(ws, session);

  ws.on("message", (raw) => {
    try {
      const msg = raw.toString();
      const packet = decodePacket(msg);
      handlePacket(session, packet.type, packet.data);
    } catch (err) {
      console.error("[Server] Bad packet:", err);
    }
  });

  ws.on("close", () => {
    if (session.player) {
      console.log(`[Server] Player "${session.player.name}" disconnected`);
      arena.removePlayer(session.player.id);
    }
    clients.delete(ws);
  });

  ws.on("error", () => {});
});

// ─── Auth validation ───
const DEV_MODE = process.env.NODE_ENV !== "production";

async function validateApiKey(apiKey: string): Promise<{ valid: boolean; nickname?: string }> {
  if (!apiKey || apiKey === "spectator") {
    return { valid: true }; // spectator mode
  }

  try {
    const res = await fetch(`${API_URL}/api/auth/eligible`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      const data = await res.json() as any;
      if (data.success && data.content?.isEligible) {
        const infoRes = await fetch(`${API_URL}/api/auth/account_info`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        const infoData = await infoRes.json() as any;
        return { valid: true, nickname: infoData?.data?.nickname };
      }
    }
    // Unknown key — allow in dev mode
    if (DEV_MODE) {
      console.warn(`[Server] API key not registered, allowing (dev mode)`);
      return { valid: true };
    }
    return { valid: false };
  } catch {
    // API unavailable — allow connection in dev mode
    if (DEV_MODE) {
      console.warn("[Server] API unreachable, allowing connection (dev mode)");
      return { valid: true };
    }
    return { valid: false };
  }
}

function handlePacket(session: ClientSession, type: PacketType, data: any): void {
  switch (type) {
    case PacketType.Join:
      handleJoin(session, data as JoinData);
      break;
    case PacketType.Input:
      handleInput(session, data);
      break;
  }
}

async function handleJoin(session: ClientSession, data: JoinData): Promise<void> {
  if (session.player || session.spectator) return;

  const apiKey = data.apiKey ?? "";
  const requestedName = (data.name ?? "Agent").substring(0, MAX_NAME_LENGTH);

  // Spectator mode
  if (apiKey === "spectator" || requestedName === "Spectator") {
    session.spectator = true;
    session.authenticated = true;
    console.log("[Server] Spectator connected");

    // Send a dummy joined packet so client knows arena size
    session.ws.send(encodeJoined({
      playerId: -1,
      arenaWidth: ARENA_WIDTH,
      arenaHeight: ARENA_HEIGHT,
    }));
    return;
  }

  // Validate API key
  const auth = await validateApiKey(apiKey);
  if (!auth.valid) {
    session.ws.send(JSON.stringify({ type: "error", message: "Invalid API key or not eligible" }));
    session.ws.close();
    return;
  }

  session.authenticated = true;
  const name = auth.nickname ?? requestedName;
  const player = arena.addPlayer(name, apiKey);
  session.player = player;
  playerRegistry.set(player.id, { name, apiKey });

  console.log(`[Server] Player "${name}" joined (id=${player.id})`);

  session.ws.send(encodeJoined({
    playerId: player.id,
    arenaWidth: ARENA_WIDTH,
    arenaHeight: ARENA_HEIGHT,
  }));
}

function handleInput(session: ClientSession, data: any): void {
  if (!session.player || !session.player.alive) return;

  const now = Date.now();
  if (now - session.player.inputWindowStart > 1000) {
    session.player.inputWindowStart = now;
    session.player.inputCount = 0;
  }
  session.player.inputCount++;
  if (session.player.inputCount > MAX_INPUT_RATE) return;

  const input = decodeInput(data);
  session.player.movement = input.movement;
  session.player.pendingAction = input.action;
}

// ─── Epoch management ───
let lastEpochId = arena.epochId;

// Track player info for epoch reporting (survives respawns)
const playerRegistry: Map<number, { name: string; apiKey: string }> = new Map();

async function reportEpochToApi(epochId: number, results: Map<number, number>): Promise<void> {
  console.log(`[Server] Reporting epoch ${epochId} results to API (${results.size} extractors)...`);
  try {
    const extractions: { playerName: string; apiKey: string; goldExtracted: number }[] = [];

    for (const [playerId, gold] of results) {
      const player = arena.players.get(playerId);
      const info = player
        ? { name: player.name, apiKey: player.apiKey }
        : playerRegistry.get(playerId);

      if (!info) continue;
      extractions.push({
        playerName: info.name,
        apiKey: info.apiKey,
        goldExtracted: gold,
      });
    }

    if (extractions.length === 0) {
      console.log(`[Server] No extractions to report for epoch ${epochId}`);
      return;
    }

    const res = await fetch(`${API_URL}/api/epoch/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epochId, extractions }),
    });

    const data = await res.json() as any;
    if (data.success) {
      console.log(`[Server] Epoch ${epochId}: ${data.data.distributed?.toFixed(2)} tokens distributed to ${data.data.players} players`);
    } else {
      console.error(`[Server] Epoch report failed:`, data.message);
    }

    // Start new epoch on API side
    await fetch(`${API_URL}/api/epoch/start`, { method: "POST" });
  } catch (err) {
    console.error("[Server] Failed to report epoch:", err);
  }
}

// ─── Game Loop ───
function gameTick(): void {
  const { removedIds } = arena.update();

  // Check if epoch changed
  if (arena.epochId !== lastEpochId) {
    const prevEpochId = lastEpochId;
    lastEpochId = arena.epochId;

    // Send epoch end to all players
    for (const [ws, session] of clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (session.player) {
        const extracted = arena.epochExtractions.get(session.player.id) ?? 0;
        ws.send(encodeGameOver({
          goldExtracted: extracted,
          tokensEarned: 0, // calculated by backend
          rank: 0,
          epochId: prevEpochId,
        }));
      }
      ws.send(encodeEpochInfo({
        epochId: arena.epochId,
        timeLeft: EPOCH_DURATION_MS,
        totalPool: 0,
        playerCount: arena.players.size,
      }));
    }

    // Report to API asynchronously
    reportEpochToApi(prevEpochId, arena.epochExtractions);
  }

  // Broadcast updates
  for (const [ws, session] of clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;

    // Spectator: send global view
    if (session.spectator) {
      const spectatorUpdate = arena.getSpectatorUpdate();
      spectatorUpdate.removedIds = removedIds;
      ws.send(encodeUpdate(spectatorUpdate));
      continue;
    }

    if (!session.player) continue;

    if (!session.player.alive) {
      const killerName = arena.recentKills.get(session.player.id) ?? "Zone";
      arena.recentKills.delete(session.player.id);

      ws.send(encodeDeath({
        killerName,
        goldLost: 0,
        finalScore: session.player.score,
        rank: 0,
      }));

      // Respawn
      const oldName = session.player.name;
      const oldApiKey = session.player.apiKey;
      arena.removePlayer(session.player.id);
      const newPlayer = arena.addPlayer(oldName, oldApiKey);
      session.player = newPlayer;
      playerRegistry.set(newPlayer.id, { name: oldName, apiKey: oldApiKey });

      ws.send(encodeJoined({
        playerId: newPlayer.id,
        arenaWidth: ARENA_WIDTH,
        arenaHeight: ARENA_HEIGHT,
      }));
      continue;
    }

    const update = arena.getUpdateForPlayer(session.player);
    update.removedIds = removedIds;
    ws.send(encodeUpdate(update));
  }
}

// Start game loop
setInterval(gameTick, TICK_MS);

// Periodic stats logging
setInterval(() => {
  const players = [...arena.players.values()].filter(p => p.alive);
  const spectators = [...clients.values()].filter(s => s.spectator).length;
  const epochTimeLeft = Math.max(0, EPOCH_DURATION_MS - (Date.now() - arena.epochStartTime));
  const mins = Math.floor(epochTimeLeft / 60000);
  const secs = Math.floor((epochTimeLeft % 60000) / 1000);

  console.log(
    `[Server] Players: ${players.length} | Spectators: ${spectators} | ` +
    `Epoch ${arena.epochId} (${mins}m${secs}s left) | Tick: ${arena.tick}`
  );
}, 30000);

httpServer.listen(PORT, () => {
  console.log(`[LOBCASH Game Server] Running on port ${PORT}`);
  console.log(`[LOBCASH Game Server] Tick rate: ${1000 / TICK_MS} TPS`);
  console.log(`[LOBCASH Game Server] Arena: ${ARENA_WIDTH}x${ARENA_HEIGHT}`);
  console.log(`[LOBCASH Game Server] API: ${API_URL}`);
  console.log(`[LOBCASH Game Server] Endpoints: ws://localhost:${PORT} (game) | http://localhost:${PORT}/health | /stats`);
});
