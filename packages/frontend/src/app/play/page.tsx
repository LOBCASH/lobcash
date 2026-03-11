"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:19100";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:19200";
const ARENA = 2000;
const PAD = 40;
const MAX_PARTICLES = 600;
const PLAYER_COLORS = [
  ["#ff4d6d", "#ff8fa3"],
  ["#4dabf7", "#74c0fc"],
  ["#38d9a9", "#63e6be"],
  ["#da77f2", "#e599f7"],
  ["#ffd43b", "#ffe066"],
  ["#ff922b", "#ffc078"],
  ["#66d9e8", "#99e9f2"],
  ["#94d82d", "#c0eb75"],
];

type LeaderboardEntry = { name: string; score: number };
type KillFeedEntry = { time: number; killer: string; victim: string };
type SafeZoneState = { cx: number; cy: number; radius: number; shrinking: boolean };
type Entity = {
  id: number;
  type: 0 | 1 | 2;
  x: number;
  y: number;
  radius: number;
  name?: string;
  gold?: number;
  score?: number;
  value?: number;
  active?: boolean;
  timeLeft?: number;
};
type GameState = {
  entities: Entity[];
  safeZone: SafeZoneState | null;
  leaderboard: LeaderboardEntry[];
  aliveCount: number;
  epochTimeLeft: number;
};
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: "death" | "collect" | "extract";
};
type TrailPoint = { x: number; y: number; time: number };
type Pos = { x: number; y: number; radius: number };
type View = { scale: number; tx: (n: number) => number; ty: (n: number) => number; ts: (n: number) => number };

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const entityKey = (e: Pick<Entity, "id" | "type">) => `${e.type}:${e.id}`;
const formatTime = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

class Interpolator {
  private target = new Map<string, Pos>();
  private current = new Map<string, Pos>();
  private prev = new Map<string, { x: number; y: number }>();

  update(entities: Entity[]) {
    const live = new Set(entities.map(entityKey));
    for (const key of [...this.target.keys()]) {
      if (!live.has(key)) {
        this.target.delete(key);
        this.current.delete(key);
        this.prev.delete(key);
      }
    }
    for (const entity of entities) {
      const key = entityKey(entity);
      const current = this.current.get(key);
      if (current) this.prev.set(key, { x: current.x, y: current.y });
      this.target.set(key, { x: entity.x, y: entity.y, radius: entity.radius });
      if (!current) {
        this.current.set(key, { x: entity.x, y: entity.y, radius: entity.radius });
        this.prev.set(key, { x: entity.x, y: entity.y });
      }
    }
  }

  step(factor: number) {
    for (const [key, target] of this.target) {
      const current = this.current.get(key);
      if (!current) continue;
      current.x += (target.x - current.x) * factor;
      current.y += (target.y - current.y) * factor;
      current.radius += (target.radius - current.radius) * factor;
    }
  }

  get(entity: Pick<Entity, "id" | "type">) {
    return this.current.get(entityKey(entity));
  }

  velocity(entity: Pick<Entity, "id" | "type">) {
    const key = entityKey(entity);
    const current = this.current.get(key);
    const prev = this.prev.get(key);
    if (!current || !prev) return { vx: 0, vy: 0 };
    return { vx: current.x - prev.x, vy: current.y - prev.y };
  }
}

function viewFor(width: number, height: number): View {
  const scale = Math.min((width - PAD * 2) / ARENA, (height - PAD * 2) / ARENA);
  const ox = (width - ARENA * scale) / 2;
  const oy = (height - ARENA * scale) / 2;
  return { scale, tx: (n) => ox + n * scale, ty: (n) => oy + n * scale, ts: (n) => n * scale };
}

function drawArenaBase(ctx: CanvasRenderingContext2D, width: number, height: number, view: View) {
  const ax = view.tx(0);
  const ay = view.ty(0);
  const as = view.ts(ARENA);
  ctx.fillStyle = "#0a0a14";
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.rect(ax, ay, as, as);
  ctx.clip();
  const bg = ctx.createLinearGradient(ax, ay, ax + as, ay + as);
  bg.addColorStop(0, "#131a2f");
  bg.addColorStop(1, "#090d18");
  ctx.fillStyle = bg;
  ctx.fillRect(ax, ay, as, as);
  ctx.strokeStyle = "rgba(120,140,220,0.12)";
  ctx.lineWidth = 1;
  for (let n = 0; n <= ARENA; n += 100) {
    ctx.beginPath();
    ctx.moveTo(view.tx(n), ay);
    ctx.lineTo(view.tx(n), ay + as);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ax, view.ty(n));
    ctx.lineTo(ax + as, view.ty(n));
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255,170,0,0.75)";
  ctx.lineWidth = 2;
  ctx.shadowColor = "rgba(255,160,40,0.3)";
  ctx.shadowBlur = 10;
  ctx.strokeRect(ax, ay, as, as);
  ctx.restore();
}

function safeZoneFullMap(sz: SafeZoneState) {
  const farthest = Math.max(
    Math.hypot(sz.cx, sz.cy),
    Math.hypot(ARENA - sz.cx, sz.cy),
    Math.hypot(sz.cx, ARENA - sz.cy),
    Math.hypot(ARENA - sz.cx, ARENA - sz.cy),
  );
  return sz.radius >= farthest - 1;
}

function drawSafeZone(ctx: CanvasRenderingContext2D, view: View, sz: SafeZoneState | null, now: number) {
  if (!sz || safeZoneFullMap(sz)) return;
  const left = view.tx(0);
  const top = view.ty(0);
  const right = view.tx(ARENA);
  const bottom = view.ty(ARENA);
  const cx = view.tx(sz.cx);
  const cy = view.ty(sz.cy);
  const r = view.ts(clamp(sz.radius, 1, ARENA));

  ctx.save();
  ctx.fillStyle = "rgba(90,18,18,0.28)";
  const row = 2;
  const y0 = Math.max(top, Math.floor(cy - r));
  const y1 = Math.min(bottom, Math.ceil(cy + r));
  if (y0 > top) ctx.fillRect(left, top, right - left, y0 - top);
  if (y1 < bottom) ctx.fillRect(left, y1, right - left, bottom - y1);
  for (let y = y0; y < y1; y += row) {
    const dy = y + row * 0.5 - cy;
    const inside = r * r - dy * dy;
    if (inside <= 0) {
      ctx.fillRect(left, y, right - left, row);
      continue;
    }
    const dx = Math.sqrt(inside);
    const sx = clamp(cx - dx, left, right);
    const ex = clamp(cx + dx, left, right);
    if (sx > left) ctx.fillRect(left, y, sx - left, row);
    if (ex < right) ctx.fillRect(ex, y, right - ex, row);
  }
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.setLineDash([14, 10]);
  ctx.lineDashOffset = -now / 90;
  if (sz.shrinking) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 180);
    ctx.strokeStyle = `rgba(255,80,80,${0.55 + pulse * 0.35})`;
    ctx.lineWidth = 3;
    ctx.shadowColor = "rgba(255,80,80,0.7)";
    ctx.shadowBlur = 18;
  } else {
    ctx.strokeStyle = "rgba(255,95,95,0.65)";
    ctx.lineWidth = 2;
  }
  ctx.stroke();
  ctx.restore();
}

function drawExtractionZones(ctx: CanvasRenderingContext2D, zones: Entity[], view: View, now: number) {
  for (const zone of zones) {
    const x = view.tx(zone.x);
    const y = view.ty(zone.y);
    const r = Math.max(14, view.ts(zone.radius));
    const active = zone.active !== false;
    const pulse = 0.5 + 0.5 * Math.sin(now / 320 + zone.id * 0.4);

    ctx.save();
    const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.6);
    glow.addColorStop(0, active ? "rgba(0,255,140,0.22)" : "rgba(0,255,140,0.12)");
    glow.addColorStop(0.65, active ? "rgba(0,255,140,0.08)" : "rgba(0,255,140,0.04)");
    glow.addColorStop(1, "rgba(0,255,140,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = active ? `rgba(30,255,150,${0.13 + pulse * 0.08})` : "rgba(30,255,150,0.08)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = active ? `rgba(80,255,180,${0.75 + pulse * 0.2})` : "rgba(80,255,180,0.45)";
    ctx.lineWidth = active ? 3 : 2;
    ctx.shadowColor = "rgba(0,255,140,0.55)";
    ctx.shadowBlur = active ? 14 : 8;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(now / 1200 + zone.id * 0.2);
    ctx.setLineDash([9, 7]);
    ctx.lineDashOffset = -now / 80;
    ctx.strokeStyle = active ? "rgba(120,255,180,0.7)" : "rgba(120,255,180,0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.max(11, view.ts(14))}px "Courier New", monospace`;
    ctx.shadowColor = "rgba(0,255,140,0.65)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = active ? "rgba(170,255,210,0.98)" : "rgba(170,255,210,0.72)";
    ctx.fillText("EXTRACT", x, y - view.ts(6));
    ctx.restore();
  }
}

function drawGold(ctx: CanvasRenderingContext2D, pellets: Entity[], view: View, now: number) {
  for (const pellet of pellets) {
    const x = view.tx(pellet.x);
    const y = view.ty(pellet.y);
    const special = (pellet.value ?? 1) > 1;
    const base = Math.max(3.4, view.ts(pellet.radius) * 1.8);
    const r = special ? Math.max(6.4, base * 1.55) : base;

    ctx.save();
    const halo = ctx.createRadialGradient(x, y, 0, x, y, r * (special ? 1.9 : 1.45));
    halo.addColorStop(0, special ? "rgba(255,240,160,0.22)" : "rgba(255,225,80,0.16)");
    halo.addColorStop(0.55, special ? "rgba(255,200,30,0.11)" : "rgba(255,200,30,0.05)");
    halo.addColorStop(1, "rgba(255,200,30,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * (special ? 1.9 : 1.45), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (special) {
      const sparkle = 0.8 + 0.2 * Math.sin(now / 200 + pellet.id);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(now / 700 + pellet.id * 0.3);
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.68, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.68, 0);
      ctx.closePath();
      ctx.fillStyle = `rgba(255,200,30,${0.72 + sparkle * 0.18})`;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,245,180,0.95)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
      continue;
    }

    ctx.save();
    const core = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, 0, x, y, r);
    core.addColorStop(0, "rgba(255,248,210,0.96)");
    core.addColorStop(0.45, "rgba(255,224,90,0.95)");
    core.addColorStop(1, "rgba(255,185,24,0.92)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function aiState(player: Entity, pos: Pos, state: GameState, velocity: { vx: number; vy: number }, moving: boolean) {
  const speed = Math.hypot(velocity.vx, velocity.vy);
  for (const entity of state.entities) {
    if (entity.type !== 2 || entity.active === false) continue;
    const dx = entity.x - pos.x;
    const dy = entity.y - pos.y;
    if ((player.gold ?? 0) >= 10 && Math.hypot(dx, dy) < 220 && velocity.vx * dx + velocity.vy * dy > 0) return "EXTRACTING";
  }
  for (const entity of state.entities) {
    if (entity.type !== 0 || entity.id === player.id || entity.radius <= player.radius) continue;
    const dx = pos.x - entity.x;
    const dy = pos.y - entity.y;
    if (Math.hypot(dx, dy) < entity.radius * 4.2 && velocity.vx * dx + velocity.vy * dy > 0 && speed > 0.4) return "FLEEING";
  }
  if (player.radius > 20) {
    for (const entity of state.entities) {
      if (entity.type !== 0 || entity.id === player.id || entity.radius >= player.radius * 0.8) continue;
      const dx = entity.x - pos.x;
      const dy = entity.y - pos.y;
      if (Math.hypot(dx, dy) < 220 && velocity.vx * dx + velocity.vy * dy > 0 && speed > 0.4) return "HUNTING";
    }
  }
  if (!moving) return "WANDERING";
  return "COLLECTING";
}

function drawTrails(ctx: CanvasRenderingContext2D, players: Entity[], trails: Map<number, TrailPoint[]>, view: View, now: number) {
  for (const player of players) {
    const trail = trails.get(player.id);
    if (!trail || trail.length < 2) continue;
    const color = PLAYER_COLORS[player.id % PLAYER_COLORS.length][0];
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < trail.length; i += 1) {
      const age = (now - trail[i].time) / 1000;
      if (age > 2.6) continue;
      const fade = 1 - age / 2.6;
      const alpha = Math.round(clamp(fade * 0.45, 0, 1) * 255).toString(16).padStart(2, "0");
      ctx.strokeStyle = `${color}${alpha}`;
      ctx.lineWidth = Math.max(1, view.ts(player.radius * 0.45) * fade);
      ctx.beginPath();
      ctx.moveTo(view.tx(trail[i - 1].x), view.ty(trail[i - 1].y));
      ctx.lineTo(view.tx(trail[i].x), view.ty(trail[i].y));
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawPlayers(ctx: CanvasRenderingContext2D, players: Entity[], state: GameState, interp: Interpolator, view: View) {
  for (const player of players) {
    const pos = interp.get(player) ?? { x: player.x, y: player.y, radius: player.radius };
    const vel = interp.velocity(player);
    const moving = Math.hypot(vel.vx, vel.vy) > 0.45;
    const colors = PLAYER_COLORS[player.id % PLAYER_COLORS.length];
    const x = view.tx(pos.x);
    const y = view.ty(pos.y);
    const r = Math.max(7, view.ts(pos.radius));

    ctx.save();
    ctx.shadowColor = `${colors[0]}88`;
    ctx.shadowBlur = r * 0.55 + (moving ? 8 : 3);
    const body = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
    body.addColorStop(0, colors[1]);
    body.addColorStop(0.55, colors[0]);
    body.addColorStop(1, `${colors[0]}99`);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    const highlight = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x - r * 0.35, y - r * 0.4, r * 0.6);
    highlight.addColorStop(0, "rgba(255,255,255,0.38)");
    highlight.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = highlight;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (moving && r > 8) {
      const angle = Math.atan2(vel.vy, vel.vx);
      const dist = r + 10 + Math.min(12, Math.hypot(vel.vx, vel.vy) * 2);
      const ax = x + Math.cos(angle) * dist;
      const ay = y + Math.sin(angle) * dist;
      const size = Math.max(3, r * 0.22);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(angle);
      ctx.fillStyle = `${colors[0]}cc`;
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * 0.65, -size * 0.5);
      ctx.lineTo(-size * 0.65, size * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const name = player.name ?? `#${player.id}`;
    const font = Math.max(9, Math.min(14, r * 0.65));
    const pillH = font + 8;
    ctx.save();
    ctx.font = `bold ${font}px system-ui, sans-serif`;
    const pillW = ctx.measureText(name).width + 14;
    const pillX = x - pillW / 2;
    const pillY = y - r - pillH - 8;
    ctx.fillStyle = "rgba(0,0,0,0.68)";
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 5);
    ctx.fill();
    ctx.strokeStyle = `${colors[0]}66`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, x, pillY + pillH / 2);
    ctx.restore();

    if (r > 10) {
      const palette: Record<string, string> = {
        COLLECTING: "#ffd43b",
        HUNTING: "#ff6b6b",
        EXTRACTING: "#38d9a9",
        FLEEING: "#ff922b",
        WANDERING: "#adb5bd",
      };
      const label = aiState(player, pos, state, vel, moving);
      ctx.save();
      ctx.fillStyle = `${palette[label] ?? "#adb5bd"}bb`;
      ctx.font = `bold ${Math.max(7, font * 0.62)}px "Courier New", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(label, x, pillY - font * 0.8 - 2);
      ctx.restore();
    }

    if ((player.gold ?? 0) > 0 && r > 12) {
      ctx.save();
      ctx.fillStyle = "#ffd43b";
      ctx.font = `bold ${Math.max(8, r * 0.5)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 3;
      ctx.fillText(String(player.gold ?? 0), x, y);
      ctx.restore();
    }

    if ((player.score ?? 0) > 0 && r > 8) {
      ctx.save();
      ctx.fillStyle = "rgba(255,212,59,0.72)";
      ctx.font = `${Math.max(7, font - 2)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(`STAR ${player.score}`, x, y + r + 6);
      ctx.restore();
    }
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], view: View) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.95;
    p.vy *= 0.95;
    p.life -= 1;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    const alpha = p.life / p.maxLife;
    const x = view.tx(p.x);
    const y = view.ty(p.y);
    const s = Math.max(0.6, view.ts(p.size) * alpha);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (p.type === "death") { ctx.shadowColor = p.color; ctx.shadowBlur = 12; }
    if (p.type === "collect") { ctx.shadowColor = "rgba(255,212,59,0.85)"; ctx.shadowBlur = 9; }
    if (p.type === "extract") { ctx.shadowColor = "rgba(56,217,169,0.85)"; ctx.shadowBlur = 9; }
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export default function PlayPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpRef = useRef(new Interpolator());
  const namesRef = useRef<Map<number, string>>(new Map());
  const trailsRef = useRef<Map<number, TrailPoint[]>>(new Map());
  const particlesRef = useRef<Particle[]>([]);
  const prevGoldRef = useRef<Map<number, number>>(new Map());
  const prevPlayersRef = useRef<Map<number, { name: string; x: number; y: number }>>(new Map());
  const lastUiSyncRef = useRef(0);
  const stateRef = useRef<GameState>({ entities: [], safeZone: null, leaderboard: [], aliveCount: 0, epochTimeLeft: 0 });

  const [connected, setConnected] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [aliveCount, setAliveCount] = useState(0);
  const [epochTimeLeft, setEpochTimeLeft] = useState(0);
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([]);
  const [poolBalance, setPoolBalance] = useState<number | null>(null);
  const [perEpoch, setPerEpoch] = useState(0);

  const spawnParticles = useCallback((
    x: number, y: number, count: number, color: string, type: Particle["type"],
    speed = 3, life = 32, minSize = 1, maxSize = 3,
  ) => {
    const next: Particle[] = [];
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (0.4 + Math.random() * 0.7);
      next.push({
        x, y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life, maxLife: life,
        size: minSize + Math.random() * (maxSize - minSize),
        color, type,
      });
    }
    particlesRef.current.push(...next);
    if (particlesRef.current.length > MAX_PARTICLES) particlesRef.current.splice(0, particlesRef.current.length - MAX_PARTICLES);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadPool = async () => {
      try {
        const response = await fetch(`${API_URL}/api/epoch/pool`);
        const payload = await response.json();
        if (!cancelled && payload.success) {
          setPoolBalance(payload.data.onChainBalance);
          setPerEpoch(payload.data.perEpoch);
        }
      } catch {}
    };
    loadPool();
    const id = window.setInterval(loadPool, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnect: number | null = null;
    let frame = 0;
    let lastTs = 0;
    let lastAmbient = 0;

    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(WS_URL);
      socket.onopen = () => {
        if (disposed) return;
        setConnected(true);
        socket?.send(JSON.stringify({ type: 1, data: { name: "Spectator", apiKey: "spectator" } }));
      };
      socket.onmessage = (event) => {
        try {
          const packet = JSON.parse(event.data);
          if (packet.type !== 11) return;
          const data = packet.data;
          const entities: Entity[] = Array.isArray(data.e) ? data.e.map((row: number[]) => ({
            id: row[0], type: row[1], x: row[2], y: row[3], radius: row[4],
            gold: row[1] === 0 ? row[5] : undefined,
            score: row[1] === 0 ? row[6] : undefined,
            value: row[1] === 1 ? row[5] : undefined,
            active: row[1] === 2 ? row[5] !== 0 : undefined,
            timeLeft: row[1] === 2 ? row[6] : undefined,
          })) : [];

          if (data.n && typeof data.n === "object") {
            for (const [id, name] of Object.entries(data.n)) namesRef.current.set(Number(id), String(name));
          }
          for (const entity of entities) if (entity.type === 0) entity.name = namesRef.current.get(entity.id) ?? `#${entity.id}`;

          const players = entities.filter((entity) => entity.type === 0);
          const now = performance.now();
          for (const player of players) {
            const prevGold = prevGoldRef.current.get(player.id) ?? 0;
            if ((player.gold ?? 0) > prevGold && prevGold > 0) spawnParticles(player.x, player.y, 6, "#ffd43b", "collect", 2.2, 22, 1, 2.2);
            prevGoldRef.current.set(player.id, player.gold ?? 0);

            const trail = trailsRef.current.get(player.id) ?? [];
            trail.push({ x: player.x, y: player.y, time: now });
            while (trail.length > 20) trail.shift();
            trailsRef.current.set(player.id, trail);
          }

          const currentPlayers = new Map<number, { name: string; x: number; y: number }>();
          for (const player of players) currentPlayers.set(player.id, { name: player.name ?? `#${player.id}`, x: player.x, y: player.y });
          for (const [id, oldPlayer] of prevPlayersRef.current.entries()) {
            if (currentPlayers.has(id)) continue;
            trailsRef.current.delete(id);
            const killer = players
              .map((player) => ({ player, distance: Math.hypot(player.x - oldPlayer.x, player.y - oldPlayer.y) }))
              .sort((a, b) => a.distance - b.distance)[0]?.player;
            const killerName = killer?.name ?? "Safe Zone";
            spawnParticles(oldPlayer.x, oldPlayer.y, 26, PLAYER_COLORS[id % PLAYER_COLORS.length][0], "death", 4.2, 44, 1.5, 4.5);
            setKillFeed((items) => [{ time: Date.now(), killer: killerName, victim: oldPlayer.name }, ...items].slice(0, 10));
          }
          prevPlayersRef.current = currentPlayers;

          const rawSz = Array.isArray(data.sz) ? data.sz : null;
          const safeZone = rawSz && Number.isFinite(rawSz[0]) && Number.isFinite(rawSz[1]) && Number.isFinite(rawSz[2])
            ? {
                cx: clamp(Number(rawSz[0]), 0, ARENA),
                cy: clamp(Number(rawSz[1]), 0, ARENA),
                radius: clamp(Number(rawSz[2]), 1, ARENA),
                shrinking: rawSz[3] === 1 || rawSz[3] === true,
              }
            : stateRef.current.safeZone;

          interpRef.current.update(entities);
          stateRef.current = {
            entities,
            safeZone,
            leaderboard: Array.isArray(data.lb) ? data.lb : [],
            aliveCount: Number.isFinite(data.ac) ? data.ac : 0,
            epochTimeLeft: Number.isFinite(data.et) ? data.et : 0,
          };
          if (now - lastUiSyncRef.current > 250) {
            setLeaderboard(stateRef.current.leaderboard);
            setAliveCount(stateRef.current.aliveCount);
            setEpochTimeLeft(stateRef.current.epochTimeLeft);
            lastUiSyncRef.current = now;
          }
        } catch {}
      };
      socket.onerror = () => {};
      socket.onclose = () => {
        if (disposed) return;
        setConnected(false);
        if (reconnect !== null) return;
        reconnect = window.setTimeout(() => {
          reconnect = null;
          connect();
        }, 3000);
      };
    };

    const render = (ts: number) => {
      if (disposed) return;
      const canvas = canvasRef.current;
      if (!canvas) { frame = window.requestAnimationFrame(render); return; }
      const ctx = canvas.getContext("2d");
      if (!ctx) { frame = window.requestAnimationFrame(render); return; }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const dt = lastTs === 0 ? 16.67 : ts - lastTs;
      lastTs = ts;
      interpRef.current.step(Math.min(1, dt * 0.015));

      const state = stateRef.current;
      const view = viewFor(width, height);
      drawArenaBase(ctx, width, height, view);
      drawSafeZone(ctx, view, state.safeZone, ts);

      const zones = state.entities.filter((entity) => entity.type === 2);
      const gold = state.entities.filter((entity) => entity.type === 1);
      const players = state.entities.filter((entity) => entity.type === 0).sort((a, b) => a.radius - b.radius);

      drawExtractionZones(ctx, zones, view, ts);
      drawGold(ctx, gold, view, ts);
      drawTrails(ctx, players, trailsRef.current, view, performance.now());
      drawPlayers(ctx, players, state, interpRef.current, view);

      if (ts - lastAmbient > 140) {
        lastAmbient = ts;
        for (const zone of zones) {
          if (zone.active === false || Math.random() > 0.7) continue;
          const angle = Math.random() * Math.PI * 2;
          const dist = zone.radius * (0.25 + Math.random() * 0.55);
          spawnParticles(zone.x + Math.cos(angle) * dist, zone.y + Math.sin(angle) * dist, 1, "#38d9a9", "extract", 1.2, 18, 0.8, 1.4);
        }
      }

      drawParticles(ctx, particlesRef.current, view);
      frame = window.requestAnimationFrame(render);
    };

    connect();
    frame = window.requestAnimationFrame(render);
    return () => {
      disposed = true;
      if (reconnect !== null) window.clearTimeout(reconnect);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      }
      window.cancelAnimationFrame(frame);
    };
  }, [spawnParticles]);

  return (
    <div className="h-screen bg-[#030308] text-white flex flex-col overflow-hidden select-none">
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/5 bg-black/60 backdrop-blur-md z-10">
        <Link href="/" className="text-lg font-black tracking-tight">
          <span className="text-yellow-400">LOB</span><span className="text-white/80">CASH</span>
          <span className="text-[9px] text-white/20 ml-2 font-normal">ARENA</span>
        </Link>

        <div className="flex gap-5 items-center text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)] animate-pulse" : "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]"}`} />
            <span className={connected ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>{connected ? "LIVE" : "OFFLINE"}</span>
          </div>

          <div className="flex items-center gap-1.5 text-white/40">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
            </svg>
            <span className="text-white font-bold">{aliveCount}</span>
          </div>

          <div className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10">
            <span className="text-white/40 mr-1.5 text-[10px]">EPOCH</span>
            <span className="text-yellow-400 font-mono font-bold text-sm">{formatTime(epochTimeLeft)}</span>
          </div>

          <div className="px-3 py-1.5 rounded-md bg-yellow-400/5 border border-yellow-400/20">
            <span className="text-yellow-400/50 mr-1.5 text-[10px]">POOL</span>
            <span className="text-yellow-400 font-mono font-bold">{poolBalance !== null ? poolBalance.toLocaleString() : "--"}</span>
            {perEpoch > 0 && <span className="text-yellow-400/30 ml-1 text-[9px]">({perEpoch}/ep)</span>}
          </div>
        </div>

        <div className="flex gap-3 text-[11px]">
          <Link href="/leaderboard" className="text-white/30 hover:text-yellow-400 transition">Leaderboard</Link>
          <Link href="/docs" className="text-white/30 hover:text-yellow-400 transition">SDK Docs</Link>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 relative">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
          {!connected && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-20">
              <div className="text-center">
                <div className="w-10 h-10 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <div className="text-white/50 text-sm">Connecting to arena...</div>
                <div className="text-white/20 text-xs mt-2">ws://{WS_URL.replace("ws://", "")}</div>
              </div>
            </div>
          )}
        </div>

        <div className="w-64 border-l border-white/5 flex flex-col bg-black/50 backdrop-blur-md">
          <div className="p-4 border-b border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-yellow-400 rounded-full" />
              <h3 className="text-[11px] font-bold text-white/50 tracking-[0.2em]">LEADERBOARD</h3>
            </div>
            <div className="space-y-1.5">
              {leaderboard.map((entry, i) => {
                const rankColors = ["text-yellow-400 bg-yellow-400/15", "text-gray-300 bg-white/8", "text-orange-400 bg-orange-400/10"];
                return (
                  <div key={`${entry.name}-${i}`} className="flex items-center gap-2 group hover:bg-white/3 rounded px-1 py-0.5 transition">
                    <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-black ${rankColors[i] ?? "bg-white/3 text-white/25"}`}>{i + 1}</span>
                    <span className="text-[12px] text-white/70 truncate flex-1 group-hover:text-white transition">{entry.name}</span>
                    <span className={`text-[12px] font-mono font-bold tabular-nums ${i === 0 ? "text-yellow-400" : "text-white/40"}`}>{entry.score}</span>
                  </div>
                );
              })}
              {leaderboard.length === 0 && <div className="text-white/15 text-[11px] py-8 text-center">Waiting for players...</div>}
            </div>
          </div>

          <div className="p-4 flex-1 overflow-hidden">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-red-500 rounded-full" />
              <h3 className="text-[11px] font-bold text-white/50 tracking-[0.2em]">KILL FEED</h3>
            </div>
            <div className="space-y-2">
              {killFeed.map((entry, i) => {
                const age = (Date.now() - entry.time) / 1000;
                const opacity = Math.max(0.1, 1 - age / 30);
                return (
                  <div key={`${entry.time}-${i}`} className="text-[11px] leading-tight flex items-start gap-1" style={{ opacity }}>
                    <span className="text-red-400/60 shrink-0">x</span>
                    <span>
                      <span className="text-red-400/90 font-semibold">{entry.killer}</span>
                      <span className="text-white/25"> ate </span>
                      <span className="text-white/50">{entry.victim}</span>
                    </span>
                  </div>
                );
              })}
              {killFeed.length === 0 && <div className="text-white/10 text-[11px] py-8 text-center">No kills yet...</div>}
            </div>
          </div>

          <div className="p-4 border-t border-white/5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-4 bg-blue-500 rounded-full" />
              <h3 className="text-[11px] font-bold text-white/50 tracking-[0.2em]">LEGEND</h3>
            </div>
            <div className="space-y-1.5 text-[10px] text-white/30">
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400" /><span>Gold Pellet</span></div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /><span>Extraction Zone</span></div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full border border-red-500/40" /><span>Safe Zone Border</span></div>
            </div>
          </div>

          <div className="p-4 border-t border-white/5 text-[10px] text-white/15 space-y-0.5">
            <div>Arena: 2000x2000 | 20 TPS</div>
            <div className="flex items-center gap-1"><span className="text-yellow-400/30">LOBCASH</span><span>AI Mining Arena</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
