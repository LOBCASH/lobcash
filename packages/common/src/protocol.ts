import { PacketType, ActionType, EntityType } from "./constants.js";
import type {
  JoinData,
  InputData,
  JoinedData,
  UpdateData,
  DeathData,
  EpochInfoData,
  EntitySnapshot,
} from "./types.js";

// Simple JSON-based protocol for now.
// Can be optimized to binary later if bandwidth becomes an issue.

export interface Packet {
  type: PacketType;
  data: unknown;
}

// ─── Encode (serialize to send) ───

export function encodeJoin(data: JoinData): string {
  return JSON.stringify({ type: PacketType.Join, data });
}

export function encodeInput(data: InputData): string {
  // Compact encoding: movement as bitmask
  const m = data.movement;
  const moveBits = (m.up ? 1 : 0) | (m.down ? 2 : 0) | (m.left ? 4 : 0) | (m.right ? 8 : 0);
  return JSON.stringify({ type: PacketType.Input, data: { m: moveBits, a: data.action } });
}

export function encodeJoined(data: JoinedData): string {
  return JSON.stringify({ type: PacketType.Joined, data });
}

export function encodeUpdate(data: UpdateData): string {
  // Compact entity encoding
  const entities = data.entities.map((e) => {
    const compact: number[] = [e.id, e.type, Math.round(e.x), Math.round(e.y), Math.round(e.radius)];
    if (e.type === EntityType.Player) {
      compact.push(e.gold ?? 0, e.score ?? 0);
    } else if (e.type === EntityType.Gold) {
      compact.push(e.value ?? 1);
    } else if (e.type === EntityType.ExtractionZone) {
      compact.push(e.active ? 1 : 0, Math.round(e.timeLeft ?? 0));
    }
    return compact;
  });

  return JSON.stringify({
    type: PacketType.Update,
    data: {
      t: data.tick,
      g: data.myGold,
      s: data.myScore,
      h: Math.round(data.myHealth),
      e: entities,
      r: data.removedIds,
      sz: [
        Math.round(data.safeZone.centerX),
        Math.round(data.safeZone.centerY),
        Math.round(data.safeZone.radius),
        data.safeZone.shrinking ? 1 : 0,
      ],
      et: Math.round(data.epochTimeLeft),
      ac: data.aliveCount,
      lb: data.leaderboard,
      // Entity names sent separately to avoid repetition
      n: Object.fromEntries(
        data.entities
          .filter((e) => e.type === EntityType.Player && e.name)
          .map((e) => [e.id, e.name])
      ),
    },
  });
}

export function encodeDeath(data: DeathData): string {
  return JSON.stringify({ type: PacketType.Death, data });
}

export function encodeEpochInfo(data: EpochInfoData): string {
  return JSON.stringify({ type: PacketType.EpochInfo, data });
}

export function encodeGameOver(data: { goldExtracted: number; tokensEarned: number; rank: number; epochId: number }): string {
  return JSON.stringify({ type: PacketType.GameOver, data });
}

// ─── Decode (deserialize on receive) ───

export function decodePacket(raw: string): Packet {
  return JSON.parse(raw) as Packet;
}

export function decodeInput(data: { m: number; a: number }): InputData {
  return {
    movement: {
      up: (data.m & 1) !== 0,
      down: (data.m & 2) !== 0,
      left: (data.m & 4) !== 0,
      right: (data.m & 8) !== 0,
    },
    action: data.a as ActionType,
  };
}

export function decodeUpdate(raw: any): UpdateData {
  const d = raw;
  const entities: EntitySnapshot[] = (d.e as number[][]).map((arr) => {
    const base: EntitySnapshot = {
      id: arr[0],
      type: arr[1] as EntityType,
      x: arr[2],
      y: arr[3],
      radius: arr[4],
    };
    if (base.type === EntityType.Player) {
      base.gold = arr[5];
      base.score = arr[6];
      base.name = d.n?.[arr[0]] ?? "";
    } else if (base.type === EntityType.Gold) {
      base.value = arr[5];
    } else if (base.type === EntityType.ExtractionZone) {
      base.active = arr[5] === 1;
      base.timeLeft = arr[6];
    }
    return base;
  });

  return {
    tick: d.t,
    myGold: d.g,
    myScore: d.s,
    myHealth: d.h,
    entities,
    removedIds: d.r,
    safeZone: {
      centerX: d.sz[0],
      centerY: d.sz[1],
      radius: d.sz[2],
      shrinking: d.sz[3] === 1,
    },
    epochTimeLeft: d.et,
    aliveCount: d.ac,
    leaderboard: d.lb,
  };
}
