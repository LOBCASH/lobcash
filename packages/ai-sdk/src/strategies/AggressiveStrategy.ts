import {
  ActionType,
  vDistance, vSub,
  type GameState, type Action, type Vector,
  EXTRACTION_MIN_GOLD,
} from "@lobcash/common";
import type { IStrategy } from "../types.js";

/**
 * Aggressive strategy: prioritizes hunting smaller players over collecting gold.
 * Extracts quickly when possible to bank score.
 */
export class AggressiveStrategy implements IStrategy {
  decide(state: GameState): Action {
    const me = state.myPlayer;

    // 1. Flee from safe zone
    if (this.outsideSafeZone(me.position, state)) {
      return this.toward(me.position, state.safeZone.center);
    }

    // 2. Flee from bigger threats
    const threat = this.findThreat(me, state);
    if (threat) return this.away(me.position, threat);

    // 3. Extract if we have enough gold and near a zone
    if (me.gold >= EXTRACTION_MIN_GOLD * 2) {
      const zone = this.nearestActiveZone(me.position, state);
      if (zone) {
        const dist = vDistance(me.position, zone);
        if (dist < 60) return this.action(me.position, zone, ActionType.Extract);
        if (dist < 300) return this.toward(me.position, zone);
      }
    }

    // 4. HUNT smaller players aggressively
    const prey = this.findBestPrey(me, state);
    if (prey) return this.toward(me.position, prey);

    // 5. Collect gold
    const gold = this.findBestGold(me, state);
    if (gold) return this.toward(me.position, gold);

    // 6. Move toward center
    return this.toward(me.position, state.safeZone.center);
  }

  private findThreat(me: GameState["myPlayer"], state: GameState): Vector | null {
    for (const p of state.nearbyPlayers) {
      if (p.radius > me.radius * 1.1) {
        const dist = vDistance(me.position, p.position);
        if (dist < p.radius * 4) return p.position;
      }
    }
    return null;
  }

  private findBestPrey(me: GameState["myPlayer"], state: GameState): Vector | null {
    let best: { pos: Vector; score: number } | null = null;
    for (const p of state.nearbyPlayers) {
      if (p.radius >= me.radius * 0.8) continue;
      const dist = vDistance(me.position, p.position);
      if (dist > 300) continue;
      // Prefer players with more gold and that are closer
      const score = (p.gold + 5) / (dist + 10);
      if (!best || score > best.score) {
        best = { pos: p.position, score };
      }
    }
    return best?.pos ?? null;
  }

  private findBestGold(me: GameState["myPlayer"], state: GameState): Vector | null {
    let best: { pos: Vector; score: number } | null = null;
    for (const g of state.nearbyGold) {
      const dist = vDistance(me.position, g.position);
      const score = g.value / (dist + 5);
      if (!best || score > best.score) {
        best = { pos: g.position, score };
      }
    }
    return best?.pos ?? null;
  }

  private outsideSafeZone(pos: Vector, state: GameState): boolean {
    return vDistance(pos, state.safeZone.center) > state.safeZone.radius - 40;
  }

  private nearestActiveZone(pos: Vector, state: GameState): Vector | null {
    let best: { pos: Vector; dist: number } | null = null;
    for (const z of state.extractionZones) {
      if (!z.active) continue;
      const dist = vDistance(pos, z.position);
      if (!best || dist < best.dist) best = { pos: z.position, dist };
    }
    return best?.pos ?? null;
  }

  private dir(d: Vector) {
    return { up: d.y < -0.1, down: d.y > 0.1, left: d.x < -0.1, right: d.x > 0.1 };
  }

  private toward(from: Vector, to: Vector): Action {
    return { movement: this.dir(vSub(to, from)), action: ActionType.None };
  }

  private away(from: Vector, threat: Vector): Action {
    return { movement: this.dir(vSub(from, threat)), action: ActionType.None };
  }

  private action(from: Vector, to: Vector, act: ActionType): Action {
    return { movement: this.dir(vSub(to, from)), action: act };
  }

  onJoined(id: number) { console.log(`[Aggressive] Joined as ${id}`); }
  onDeath(killer: string) { console.log(`[Aggressive] Killed by ${killer}`); }
}
