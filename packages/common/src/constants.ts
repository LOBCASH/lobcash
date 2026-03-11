// Game world constants
export const ARENA_WIDTH = 2000;
export const ARENA_HEIGHT = 2000;
export const TICK_RATE = 20; // Server ticks per second
export const TICK_MS = 1000 / TICK_RATE;

// Player constants
export const PLAYER_START_RADIUS = 15;
export const PLAYER_MAX_RADIUS = 150;
export const PLAYER_BASE_SPEED = 10.0; // units per tick
export const PLAYER_MIN_SPEED = 3.5; // at max size
export const PLAYER_SPLIT_MIN_RADIUS = 30;
export const PLAYER_SPLIT_SPEED = 12; // burst speed on split
export const PLAYER_MERGE_COOLDOWN_MS = 10000;
export const PLAYER_EAT_RATIO = 0.8; // can eat player if target.radius < self.radius * ratio

// Gold constants
export const GOLD_COUNT = 300; // gold pellets in arena at any time
export const GOLD_BASE_VALUE = 1;
export const GOLD_RADIUS = 4;
export const GOLD_SPECIAL_CHANCE = 0.1; // 10% chance of high-value gold
export const GOLD_SPECIAL_VALUE = 5;

// Extraction zone
export const EXTRACTION_ZONE_RADIUS = 60;
export const EXTRACTION_ZONE_COUNT = 3;
export const EXTRACTION_ZONE_DURATION_MS = 60000; // active for 60s
export const EXTRACTION_ZONE_COOLDOWN_MS = 120000; // respawn after 120s
export const EXTRACTION_MIN_GOLD = 10; // minimum gold to extract

// Safe zone (shrinking circle)
export const SAFE_ZONE_INITIAL_RADIUS = Math.ceil(Math.hypot(ARENA_WIDTH / 2, ARENA_HEIGHT / 2)); // covers the full arena from center
export const SAFE_ZONE_MIN_RADIUS = 200;
export const SAFE_ZONE_SHRINK_INTERVAL_MS = 300000; // shrink every 5 min
export const SAFE_ZONE_SHRINK_DURATION_MS = 60000; // takes 60s to shrink
export const SAFE_ZONE_DAMAGE_PER_TICK = 0.5; // radius loss per tick outside zone

// Epoch
export const EPOCH_DURATION_MS = 1800000; // 30 minutes
export const EPOCH_SETTLEMENT_MS = 30000; // 30s settlement phase

// Network
export const MAX_INPUT_RATE = 30; // max input packets per second
export const MAX_NAME_LENGTH = 16;

// Packet types
export enum PacketType {
  // Client -> Server
  Join = 1,
  Input = 2,

  // Server -> Client
  Joined = 10,
  Update = 11,
  GameOver = 12,
  EpochInfo = 13,
  Death = 14,
}

// Entity types in update packets
export enum EntityType {
  Player = 0,
  Gold = 1,
  ExtractionZone = 2,
}

// Input actions
export enum ActionType {
  None = 0,
  Split = 1,
  Extract = 2,
}
