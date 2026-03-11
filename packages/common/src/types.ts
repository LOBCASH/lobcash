import type { Vector } from "./vector.js";
import { ActionType, EntityType } from "./constants.js";

// ─── Client -> Server ───

export interface JoinData {
  name: string;
  apiKey: string;
}

export interface InputData {
  movement: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
  };
  action: ActionType;
}

// ─── Server -> Client ───

export interface JoinedData {
  playerId: number;
  arenaWidth: number;
  arenaHeight: number;
}

export interface EntitySnapshot {
  id: number;
  type: EntityType;
  x: number;
  y: number;
  radius: number;
  // Player-specific
  name?: string;
  gold?: number;
  score?: number;
  // Gold-specific
  value?: number;
  // Extraction zone-specific
  active?: boolean;
  timeLeft?: number;
}

export interface UpdateData {
  tick: number;
  // Our player state
  myGold: number;
  myScore: number;
  myHealth: number;
  // Entities visible to us
  entities: EntitySnapshot[];
  removedIds: number[];
  // Safe zone
  safeZone: {
    centerX: number;
    centerY: number;
    radius: number;
    shrinking: boolean;
  };
  // Epoch
  epochTimeLeft: number;
  aliveCount: number;
  // Leaderboard top 5
  leaderboard: Array<{ name: string; score: number }>;
}

export interface DeathData {
  killerName: string;
  goldLost: number;
  finalScore: number;
  rank: number;
}

export interface EpochInfoData {
  epochId: number;
  timeLeft: number;
  totalPool: number;
  playerCount: number;
}

export interface GameOverData {
  goldExtracted: number;
  tokensEarned: number;
  rank: number;
  epochId: number;
}

// ─── Game State for AI SDK ───

export interface GameState {
  tick: number;
  myPlayer: {
    id: number;
    position: Vector;
    radius: number;
    gold: number;
    score: number;
    health: number;
  };
  nearbyPlayers: Array<{
    id: number;
    position: Vector;
    radius: number;
    name: string;
    gold: number;
  }>;
  nearbyGold: Array<{
    id: number;
    position: Vector;
    value: number;
  }>;
  extractionZones: Array<{
    id: number;
    position: Vector;
    radius: number;
    active: boolean;
    timeLeft: number;
  }>;
  safeZone: {
    center: Vector;
    radius: number;
    shrinking: boolean;
  };
  epochTimeLeft: number;
  aliveCount: number;
  leaderboard: Array<{ name: string; score: number }>;
}

export interface Action {
  movement: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
  };
  action: ActionType;
}
