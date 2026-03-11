import {
  ActionType,
  vDistance, vSub,
  type GameState, type Action, type Vector,
  EXTRACTION_MIN_GOLD,
} from "@lobcash/common";
import type { IStrategy } from "../types.js";

/**
 * Farmer strategy: focuses on safe gold collection and frequent extractions.
 * Avoids combat, stays in safe areas, extracts as soon as possible.
 */
export class FarmerStrategy implements IStrategy {
  private lastExtractTime = 0;

  decide(state: GameState): Action {
    const me = state.myPlayer;
    const now = Date.now();

    // 1. Always flee from safe zone
    if (this.outsideSafeZone(me.position, state)) {
      return this.toward(me.position, state.safeZone.center);
    }

    // 2. Flee from ANY player that could eat us (very cautious)
    const threat = this.findAnyThreat(me, state);
    if (threat) return this.away(me.position, threat);

    // 3. Extract gold ASAP (lower threshold than default)
    if (me.gold >= EXTRACTION_MIN_GOLD && now - this.lastExtractTime > 125000) {
      const zone = this.nearestActiveZone(me.position, state);
      if (zone) {
        const dist = vDistance(me.position, zone.pos);
        if (dist < zone.radius) {
          this.lastExtractTime = now;
          return this.action(me.position, zone.pos, ActionType.Extract);
        }
        return this.toward(me.position, zone.pos);
      }
    }

    // 4. Collect gold, but avoid areas near big players
    const safeGold = this.findSafeGold(me, state);
    if (safeGold) return this.toward(me.position, safeGold);

    // 5. Stay near extraction zones for quick deposits
    const zone = this.nearestActiveZone(me.position, state);
    if (zone && vDistance(me.position, zone.pos) > 200) {
      return this.toward(me.position, zone.pos);
    }

    // 6. Wander near center
    return this.toward(me.position, state.safeZone.center);
  }

  private findAnyThreat(me: GameState["myPlayer"], state: GameState): Vector | null {
    for (const p of state.nearbyPlayers) {
      if (p.radius >= me.radius * 0.7) { // very cautious — flee from anyone near our size
        const dist = vDistance(me.position, p.position);
        if (dist < 150) return p.position;
      }
    }
    return null;
  }

  private findSafeGold(me: GameState["myPlayer"], state: GameState): Vector | null {
    const dangerZones: Vector[] = state.nearbyPlayers
      .filter(p => p.radius >= me.radius * 0.7)
      .map(p => p.position);

    let best: { pos: Vector; dist: number } | null = null;
    for (const g of state.nearbyGold) {
      const dist = vDistance(me.position, g.position);
      // Skip gold near dangerous players
      let safe = true;
      for (const dz of dangerZones) {
        if (vDistance(g.position, dz) < 100) { safe = false; break; }
      }
      if (!safe) continue;
      if (!best || dist < best.dist) best = { pos: g.position, dist };
    }
    return best?.pos ?? null;
  }

  private outsideSafeZone(pos: Vector, state: GameState): boolean {
    return vDistance(pos, state.safeZone.center) > state.safeZone.radius - 60;
  }

  private nearestActiveZone(pos: Vector, state: GameState): { pos: Vector; radius: number } | null {
    let best: { pos: Vector; radius: number; dist: number } | null = null;
    for (const z of state.extractionZones) {
      if (!z.active) continue;
      const dist = vDistance(pos, z.position);
      if (!best || dist < best.dist) best = { pos: z.position, radius: z.radius, dist };
    }
    return best;
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

  onJoined(id: number) { console.log(`[Farmer] Joined as ${id}`); }
  onDeath(killer: string) { console.log(`[Farmer] Killed by ${killer}, will collect more carefully`); }
}
