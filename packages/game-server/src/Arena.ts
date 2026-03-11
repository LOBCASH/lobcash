import {
  ARENA_WIDTH, ARENA_HEIGHT,
  GOLD_COUNT, GOLD_BASE_VALUE, GOLD_RADIUS, GOLD_SPECIAL_CHANCE, GOLD_SPECIAL_VALUE,
  EXTRACTION_ZONE_RADIUS, EXTRACTION_ZONE_COUNT, EXTRACTION_ZONE_DURATION_MS, EXTRACTION_ZONE_COOLDOWN_MS, EXTRACTION_MIN_GOLD,
  SAFE_ZONE_INITIAL_RADIUS, SAFE_ZONE_MIN_RADIUS, SAFE_ZONE_SHRINK_INTERVAL_MS, SAFE_ZONE_SHRINK_DURATION_MS, SAFE_ZONE_DAMAGE_PER_TICK,
  PLAYER_EAT_RATIO, PLAYER_START_RADIUS,
  ActionType, EntityType,
  TICK_MS, EPOCH_DURATION_MS,
  vDistance, vSub, vNormalize, vScale, vAdd, vRandom, vRandomInCircle, vClamp,
  type Vector, type EntitySnapshot, type UpdateData,
} from "@lobcash/common";
import { PlayerEntity, GoldEntity, ExtractionZoneEntity, generateId } from "./entities.js";
import { SpatialGrid } from "./SpatialGrid.js";

export class Arena {
  players: Map<number, PlayerEntity> = new Map();
  gold: Map<number, GoldEntity> = new Map();
  extractionZones: Map<number, ExtractionZoneEntity> = new Map();

  safeZone = {
    center: { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 } as Vector,
    radius: SAFE_ZONE_INITIAL_RADIUS,
    targetRadius: SAFE_ZONE_INITIAL_RADIUS,
    shrinking: false,
    lastShrinkTime: 0,
  };

  tick: number = 0;
  epochStartTime: number = Date.now();
  epochId: number = 1;

  // Per-epoch extraction tracking: playerId -> total gold extracted
  epochExtractions: Map<number, number> = new Map();

  // Kill log: victimId -> killerName (consumed by server.ts for death messages)
  recentKills: Map<number, string> = new Map();

  private grid = new SpatialGrid(100);

  constructor() {
    this.spawnInitialGold();
    this.spawnExtractionZones();
  }

  // ─── Player management ───

  addPlayer(name: string, apiKey: string): PlayerEntity {
    const id = generateId();
    const spawnPos = this.findSafeSpawn();
    const player = new PlayerEntity(id, name, spawnPos, apiKey);
    this.players.set(id, player);
    return player;
  }

  removePlayer(id: number): void {
    this.players.delete(id);
  }

  private findSafeSpawn(): Vector {
    // Try to find a position away from other players
    for (let attempt = 0; attempt < 20; attempt++) {
      const pos = vRandomInCircle(this.safeZone.center, this.safeZone.radius * 0.8);
      const clamped = vClamp(pos, 50, 50, ARENA_WIDTH - 50, ARENA_HEIGHT - 50);
      let safe = true;
      for (const p of this.players.values()) {
        if (vDistance(clamped, p.position) < 100) {
          safe = false;
          break;
        }
      }
      if (safe) return clamped;
    }
    return vRandomInCircle(this.safeZone.center, this.safeZone.radius * 0.5);
  }

  // ─── Gold ───

  private spawnInitialGold(): void {
    for (let i = 0; i < GOLD_COUNT; i++) {
      this.spawnGold();
    }
  }

  private spawnGold(): GoldEntity {
    const id = generateId();
    const pos = vRandom(20, 20, ARENA_WIDTH - 20, ARENA_HEIGHT - 20);
    const value = Math.random() < GOLD_SPECIAL_CHANCE ? GOLD_SPECIAL_VALUE : GOLD_BASE_VALUE;
    const g = new GoldEntity(id, pos, value);
    this.gold.set(id, g);
    return g;
  }

  // ─── Extraction Zones ───

  private spawnExtractionZones(): void {
    const now = Date.now();
    for (let i = 0; i < EXTRACTION_ZONE_COUNT; i++) {
      const id = generateId();
      const pos = vRandomInCircle(this.safeZone.center, this.safeZone.radius * 0.6);
      const clamped = vClamp(pos, 100, 100, ARENA_WIDTH - 100, ARENA_HEIGHT - 100);
      const zone = new ExtractionZoneEntity(id, clamped, EXTRACTION_ZONE_RADIUS, now);
      this.extractionZones.set(id, zone);
    }
  }

  // ─── Main tick ───

  update(): { removedIds: number[] } {
    this.tick++;
    const now = Date.now();
    const removedIds: number[] = [];

    // Rebuild spatial grid
    this.grid.clear();
    for (const p of this.players.values()) {
      if (p.alive) this.grid.insert(p.id, p.position, p.radius);
    }
    for (const g of this.gold.values()) {
      this.grid.insert(g.id, g.position, g.radius);
    }

    // Update players
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      this.updatePlayerMovement(player);
      this.checkPlayerGoldCollision(player, removedIds);
      this.checkPlayerPlayerCollision(player, removedIds);
      this.checkPlayerExtraction(player, now);
      this.checkSafeZoneDamage(player);
    }

    // Remove dead players
    for (const player of this.players.values()) {
      if (!player.alive) {
        removedIds.push(player.id);
      }
    }

    // Replenish gold
    while (this.gold.size < GOLD_COUNT) {
      this.spawnGold();
    }

    // Update extraction zones
    this.updateExtractionZones(now, removedIds);

    // Update safe zone
    this.updateSafeZone(now);

    // Check epoch
    this.checkEpoch(now);

    return { removedIds };
  }

  private updatePlayerMovement(player: PlayerEntity): void {
    const m = player.movement;
    let dx = 0, dy = 0;

    if (m.up) dy -= 1;
    if (m.down) dy += 1;
    if (m.left) dx -= 1;
    if (m.right) dx += 1;

    if (dx !== 0 || dy !== 0) {
      const dir = vNormalize({ x: dx, y: dy });
      const speed = player.speed;
      player.position.x += dir.x * speed;
      player.position.y += dir.y * speed;

      // Clamp to arena bounds
      const r = player.radius;
      player.position.x = Math.max(r, Math.min(ARENA_WIDTH - r, player.position.x));
      player.position.y = Math.max(r, Math.min(ARENA_HEIGHT - r, player.position.y));
    }
  }

  private checkPlayerGoldCollision(player: PlayerEntity, removedIds: number[]): void {
    const nearby = this.grid.query(player.position, player.radius + GOLD_RADIUS);
    for (const id of nearby) {
      const g = this.gold.get(id);
      if (!g) continue;
      const dist = vDistance(player.position, g.position);
      if (dist < player.radius + g.radius) {
        player.gold += g.value;
        player.grow(g.value);
        this.gold.delete(id);
        removedIds.push(id);
      }
    }
  }

  private checkPlayerPlayerCollision(player: PlayerEntity, removedIds: number[]): void {
    const nearby = this.grid.query(player.position, player.radius * 2);
    for (const id of nearby) {
      if (id === player.id) continue;
      const other = this.players.get(id);
      if (!other || !other.alive) continue;

      const dist = vDistance(player.position, other.position);
      if (dist >= player.radius) continue;

      // Larger eats smaller
      if (other.radius < player.radius * PLAYER_EAT_RATIO) {
        // Player eats other
        const stolenGold = Math.floor(other.gold * 0.5);
        player.gold += stolenGold;
        player.grow(other.radius * 0.5);
        other.alive = false;
        other.gold = 0;
        this.recentKills.set(other.id, player.name);
        removedIds.push(other.id);
        console.log(`[Arena] "${player.name}" ate "${other.name}" (+${stolenGold} gold)`);
      }
    }
  }

  private checkPlayerExtraction(player: PlayerEntity, now: number): void {
    if (player.pendingAction !== ActionType.Extract) return;
    player.pendingAction = ActionType.None;

    if (player.gold < EXTRACTION_MIN_GOLD) return;
    if (now - player.lastExtractTime < 120000) return; // 2min cooldown

    // Check if inside an active extraction zone
    for (const zone of this.extractionZones.values()) {
      if (!zone.active) continue;
      const dist = vDistance(player.position, zone.position);
      if (dist < zone.radius) {
        // Extract!
        const extracted = player.gold;
        player.score += extracted;
        player.gold = 0;
        player.shrink(player.radius * 0.3); // lose some size
        player.lastExtractTime = now;

        // Track for epoch rewards
        const prev = this.epochExtractions.get(player.id) ?? 0;
        this.epochExtractions.set(player.id, prev + extracted);

        console.log(`[Arena] Player "${player.name}" extracted ${extracted} gold (total score: ${player.score})`);
        return;
      }
    }
  }

  private checkSafeZoneDamage(player: PlayerEntity): void {
    if (!this.safeZone.shrinking && this.safeZone.radius >= SAFE_ZONE_INITIAL_RADIUS) return;
    const dist = vDistance(player.position, this.safeZone.center);
    if (dist > this.safeZone.radius) {
      player.health -= SAFE_ZONE_DAMAGE_PER_TICK;
      if (player.health <= 0) {
        player.alive = false;
        player.health = 0;
      }
    }
  }

  private updateExtractionZones(now: number, removedIds: number[]): void {
    for (const [id, zone] of this.extractionZones) {
      if (zone.active) {
        if (now - zone.activatedAt > EXTRACTION_ZONE_DURATION_MS) {
          zone.active = false;
          zone.deactivatedAt = now;
        }
      } else {
        if (now - zone.deactivatedAt > EXTRACTION_ZONE_COOLDOWN_MS) {
          // Respawn at new position
          removedIds.push(id);
          this.extractionZones.delete(id);

          const newId = generateId();
          const pos = vRandomInCircle(this.safeZone.center, this.safeZone.radius * 0.6);
          const clamped = vClamp(pos, 100, 100, ARENA_WIDTH - 100, ARENA_HEIGHT - 100);
          const newZone = new ExtractionZoneEntity(newId, clamped, EXTRACTION_ZONE_RADIUS, now);
          this.extractionZones.set(newId, newZone);
        }
      }
    }
  }

  private updateSafeZone(now: number): void {
    if (this.safeZone.radius <= SAFE_ZONE_MIN_RADIUS) {
      this.safeZone.shrinking = false;
      return;
    }

    const timeSinceEpochStart = now - this.epochStartTime;
    const shrinkCycle = Math.floor(timeSinceEpochStart / SAFE_ZONE_SHRINK_INTERVAL_MS);

    if (shrinkCycle > this.safeZone.lastShrinkTime) {
      this.safeZone.lastShrinkTime = shrinkCycle;
      this.safeZone.targetRadius = Math.max(
        SAFE_ZONE_MIN_RADIUS,
        SAFE_ZONE_INITIAL_RADIUS - shrinkCycle * 150
      );
      this.safeZone.shrinking = true;
      // Large early circles cannot shift without exposing map corners.
      const minCenterX = this.safeZone.targetRadius;
      const minCenterY = this.safeZone.targetRadius;
      const maxCenterX = ARENA_WIDTH - this.safeZone.targetRadius;
      const maxCenterY = ARENA_HEIGHT - this.safeZone.targetRadius;

      if (minCenterX <= maxCenterX && minCenterY <= maxCenterY) {
        this.safeZone.center = vClamp(
          vAdd(this.safeZone.center, { x: (Math.random() - 0.5) * 100, y: (Math.random() - 0.5) * 100 }),
          minCenterX, minCenterY,
          maxCenterX, maxCenterY
        );
      } else {
        this.safeZone.center = { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };
      }
    }

    if (this.safeZone.shrinking && this.safeZone.radius > this.safeZone.targetRadius) {
      const shrinkRate = (SAFE_ZONE_INITIAL_RADIUS - SAFE_ZONE_MIN_RADIUS) / (SAFE_ZONE_SHRINK_DURATION_MS / TICK_MS);
      this.safeZone.radius = Math.max(this.safeZone.targetRadius, this.safeZone.radius - shrinkRate);
      if (this.safeZone.radius <= this.safeZone.targetRadius) {
        this.safeZone.shrinking = false;
      }
    }
  }

  private checkEpoch(now: number): void {
    if (now - this.epochStartTime >= EPOCH_DURATION_MS) {
      this.endEpoch();
    }
  }

  endEpoch(): { epochId: number; results: Map<number, number> } {
    const results = new Map(this.epochExtractions);
    const epochId = this.epochId;

    console.log(`[Arena] Epoch ${epochId} ended. ${results.size} players extracted gold.`);
    for (const [pid, gold] of results) {
      const player = this.players.get(pid);
      console.log(`  - ${player?.name ?? pid}: ${gold} gold extracted`);
    }

    // Reset epoch
    this.epochId++;
    this.epochStartTime = Date.now();
    this.epochExtractions.clear();

    // Reset safe zone
    this.safeZone.radius = SAFE_ZONE_INITIAL_RADIUS;
    this.safeZone.targetRadius = SAFE_ZONE_INITIAL_RADIUS;
    this.safeZone.shrinking = false;
    this.safeZone.lastShrinkTime = 0;
    this.safeZone.center = { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };

    return { epochId, results };
  }

  // ─── Snapshot for client ───

  getUpdateForPlayer(player: PlayerEntity): UpdateData {
    const now = Date.now();
    const entities: EntitySnapshot[] = [];

    // All players
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      entities.push({
        id: p.id,
        type: EntityType.Player,
        x: p.position.x,
        y: p.position.y,
        radius: p.radius,
        name: p.name,
        gold: p.gold,
        score: p.score,
      });
    }

    // Visible gold (within reasonable range)
    for (const g of this.gold.values()) {
      if (vDistance(player.position, g.position) < 500) {
        entities.push({
          id: g.id,
          type: EntityType.Gold,
          x: g.position.x,
          y: g.position.y,
          radius: g.radius,
          value: g.value,
        });
      }
    }

    // Extraction zones
    for (const z of this.extractionZones.values()) {
      entities.push({
        id: z.id,
        type: EntityType.ExtractionZone,
        x: z.position.x,
        y: z.position.y,
        radius: z.radius,
        active: z.active,
        timeLeft: z.active
          ? Math.max(0, EXTRACTION_ZONE_DURATION_MS - (now - z.activatedAt))
          : 0,
      });
    }

    // Leaderboard
    const leaderboard = [...this.players.values()]
      .filter(p => p.alive)
      .sort((a, b) => (b.score + b.gold) - (a.score + a.gold))
      .slice(0, 5)
      .map(p => ({ name: p.name, score: p.score + p.gold }));

    return {
      tick: this.tick,
      myGold: player.gold,
      myScore: player.score,
      myHealth: player.health,
      entities,
      removedIds: [],
      safeZone: {
        centerX: this.safeZone.center.x,
        centerY: this.safeZone.center.y,
        radius: this.safeZone.radius,
        shrinking: this.safeZone.shrinking,
      },
      epochTimeLeft: Math.max(0, EPOCH_DURATION_MS - (now - this.epochStartTime)),
      aliveCount: [...this.players.values()].filter(p => p.alive).length,
      leaderboard,
    };
  }

  // ─── Spectator view (sees everything) ───

  getSpectatorUpdate(): UpdateData {
    const now = Date.now();
    const entities: EntitySnapshot[] = [];

    // ALL players
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      entities.push({
        id: p.id,
        type: EntityType.Player,
        x: p.position.x,
        y: p.position.y,
        radius: p.radius,
        name: p.name,
        gold: p.gold,
        score: p.score,
      });
    }

    // ALL gold
    for (const g of this.gold.values()) {
      entities.push({
        id: g.id,
        type: EntityType.Gold,
        x: g.position.x,
        y: g.position.y,
        radius: g.radius,
        value: g.value,
      });
    }

    // Extraction zones
    for (const z of this.extractionZones.values()) {
      entities.push({
        id: z.id,
        type: EntityType.ExtractionZone,
        x: z.position.x,
        y: z.position.y,
        radius: z.radius,
        active: z.active,
        timeLeft: z.active ? Math.max(0, EXTRACTION_ZONE_DURATION_MS - (now - z.activatedAt)) : 0,
      });
    }

    const leaderboard = [...this.players.values()]
      .filter(p => p.alive)
      .sort((a, b) => (b.score + b.gold) - (a.score + a.gold))
      .slice(0, 10)
      .map(p => ({ name: p.name, score: p.score + p.gold }));

    return {
      tick: this.tick,
      myGold: 0,
      myScore: 0,
      myHealth: 100,
      entities,
      removedIds: [],
      safeZone: {
        centerX: this.safeZone.center.x,
        centerY: this.safeZone.center.y,
        radius: this.safeZone.radius,
        shrinking: this.safeZone.shrinking,
      },
      epochTimeLeft: Math.max(0, EPOCH_DURATION_MS - (now - this.epochStartTime)),
      aliveCount: [...this.players.values()].filter(p => p.alive).length,
      leaderboard,
    };
  }
}
