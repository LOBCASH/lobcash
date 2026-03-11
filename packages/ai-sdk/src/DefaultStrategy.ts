import {
  ActionType,
  vDistance, vSub, vNormalize,
  type GameState, type Action, type Vector,
  EXTRACTION_MIN_GOLD,
} from "@lobcash/common";
import type { IStrategy } from "./types.js";

/**
 * Default greedy strategy:
 * 1. If outside safe zone -> move toward safe zone center
 * 2. If gold >= threshold and near active extraction zone -> go extract
 * 3. If a smaller player is nearby -> chase them
 * 4. Otherwise -> collect nearest gold
 */
export class DefaultStrategy implements IStrategy {
  private lastTarget: Vector | null = null;
  private wanderTarget: Vector | null = null;
  private lastWanderTime: number = 0;

  decide(state: GameState): Action {
    const me = state.myPlayer;

    // 1. Flee from safe zone
    if (this.isOutsideSafeZone(me.position, state)) {
      return this.moveToward(me.position, state.safeZone.center);
    }

    // 2. Flee from bigger players that are close
    const threat = this.findThreat(state);
    if (threat) {
      return this.moveAway(me.position, threat.position);
    }

    // 3. Extract if we have enough gold and near extraction zone
    if (me.gold >= EXTRACTION_MIN_GOLD) {
      const zone = this.findNearestActiveZone(state);
      if (zone) {
        const dist = vDistance(me.position, zone.position);
        if (dist < zone.radius) {
          // We're inside the zone, extract!
          return this.makeAction(me.position, zone.position, ActionType.Extract);
        }
        // Move toward zone
        return this.moveToward(me.position, zone.position);
      }
    }

    // 4. Hunt smaller players if we're big enough
    const prey = this.findPrey(state);
    if (prey && me.radius > 30) {
      return this.moveToward(me.position, prey.position);
    }

    // 5. Collect nearest gold
    const gold = this.findNearestGold(state);
    if (gold) {
      return this.moveToward(me.position, gold.position);
    }

    // 6. Wander
    return this.wander(me.position, state);
  }

  private isOutsideSafeZone(pos: Vector, state: GameState): boolean {
    return vDistance(pos, state.safeZone.center) > state.safeZone.radius - 30;
  }

  private findThreat(state: GameState): { position: Vector } | null {
    const me = state.myPlayer;
    let closest: { position: Vector; dist: number } | null = null;

    for (const p of state.nearbyPlayers) {
      if (p.radius <= me.radius * 0.8) continue; // not a threat
      const dist = vDistance(me.position, p.position);
      if (dist < p.radius * 3 && (!closest || dist < closest.dist)) {
        closest = { position: p.position, dist };
      }
    }
    return closest;
  }

  private findPrey(state: GameState): { position: Vector } | null {
    const me = state.myPlayer;
    let closest: { position: Vector; dist: number } | null = null;

    for (const p of state.nearbyPlayers) {
      if (p.radius >= me.radius * 0.8) continue; // too big to eat
      const dist = vDistance(me.position, p.position);
      if (dist < 200 && (!closest || dist < closest.dist)) {
        closest = { position: p.position, dist };
      }
    }
    return closest;
  }

  private findNearestActiveZone(state: GameState): { position: Vector; radius: number } | null {
    let closest: { position: Vector; radius: number; dist: number } | null = null;
    for (const z of state.extractionZones) {
      if (!z.active) continue;
      const dist = vDistance(state.myPlayer.position, z.position);
      if (!closest || dist < closest.dist) {
        closest = { position: z.position, radius: z.radius, dist };
      }
    }
    return closest;
  }

  private findNearestGold(state: GameState): { position: Vector } | null {
    let closest: { position: Vector; dist: number } | null = null;
    for (const g of state.nearbyGold) {
      const dist = vDistance(state.myPlayer.position, g.position);
      if (!closest || dist < closest.dist) {
        closest = { position: g.position, dist };
      }
    }
    return closest;
  }

  private dirToMovement(d: Vector) {
    return { up: d.y < -0.1, down: d.y > 0.1, left: d.x < -0.1, right: d.x > 0.1 };
  }

  private moveToward(from: Vector, to: Vector): Action {
    return { movement: this.dirToMovement(vSub(to, from)), action: ActionType.None };
  }

  private moveAway(from: Vector, threat: Vector): Action {
    return { movement: this.dirToMovement(vSub(from, threat)), action: ActionType.None };
  }

  private makeAction(from: Vector, to: Vector, action: ActionType): Action {
    return { movement: this.dirToMovement(vSub(to, from)), action };
  }

  private wander(pos: Vector, state: GameState): Action {
    const now = Date.now();
    if (!this.wanderTarget || now - this.lastWanderTime > 5000) {
      // Pick a random point within safe zone
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * state.safeZone.radius * 0.6;
      this.wanderTarget = {
        x: state.safeZone.center.x + Math.cos(angle) * r,
        y: state.safeZone.center.y + Math.sin(angle) * r,
      };
      this.lastWanderTime = now;
    }
    return this.moveToward(pos, this.wanderTarget);
  }

  onJoined(playerId: number): void {
    console.log(`[DefaultStrategy] Joined with ID ${playerId}`);
  }

  onDeath(killerName: string, finalScore: number): void {
    console.log(`[DefaultStrategy] Died! Killer: ${killerName}, Score: ${finalScore}`);
  }
}
