import type { Vector } from "@lobcash/common";
import {
  PLAYER_START_RADIUS,
  PLAYER_BASE_SPEED,
  PLAYER_MIN_SPEED,
  PLAYER_MAX_RADIUS,
} from "@lobcash/common";

let nextEntityId = 1;
export function generateId(): number {
  return nextEntityId++;
}

export class PlayerEntity {
  id: number;
  name: string;
  position: Vector;
  velocity: Vector = { x: 0, y: 0 };
  radius: number = PLAYER_START_RADIUS;
  gold: number = 0;
  score: number = 0; // total gold extracted across all extractions
  health: number = 100;
  alive: boolean = true;
  apiKey: string;

  // Input state
  movement = { up: false, down: false, left: false, right: false };
  pendingAction: number = 0; // ActionType

  // Split state
  splitParts: PlayerEntity[] = []; // sub-blobs after split
  mergeTimer: number = 0;

  // Rate limiting
  lastInputTime: number = 0;
  inputCount: number = 0;
  inputWindowStart: number = 0;

  // Extraction cooldown
  lastExtractTime: number = 0;

  constructor(id: number, name: string, position: Vector, apiKey: string) {
    this.id = id;
    this.name = name;
    this.position = position;
    this.apiKey = apiKey;
  }

  get speed(): number {
    // Larger players move slower
    const sizeFactor = (this.radius - PLAYER_START_RADIUS) / (PLAYER_MAX_RADIUS - PLAYER_START_RADIUS);
    return PLAYER_BASE_SPEED - (PLAYER_BASE_SPEED - PLAYER_MIN_SPEED) * sizeFactor;
  }

  grow(amount: number): void {
    // Area-based growth: new_area = old_area + amount * scale
    const area = Math.PI * this.radius * this.radius;
    const newArea = area + amount * 50;
    this.radius = Math.min(PLAYER_MAX_RADIUS, Math.sqrt(newArea / Math.PI));
  }

  shrink(amount: number): void {
    const area = Math.PI * this.radius * this.radius;
    const newArea = Math.max(Math.PI * PLAYER_START_RADIUS * PLAYER_START_RADIUS, area - amount * 50);
    this.radius = Math.sqrt(newArea / Math.PI);
  }
}

export class GoldEntity {
  id: number;
  position: Vector;
  value: number;
  radius: number = 4;

  constructor(id: number, position: Vector, value: number) {
    this.id = id;
    this.position = position;
    this.value = value;
  }
}

export class ExtractionZoneEntity {
  id: number;
  position: Vector;
  radius: number;
  active: boolean = true;
  activatedAt: number;
  deactivatedAt: number = 0;

  constructor(id: number, position: Vector, radius: number, now: number) {
    this.id = id;
    this.position = position;
    this.radius = radius;
    this.activatedAt = now;
  }
}
