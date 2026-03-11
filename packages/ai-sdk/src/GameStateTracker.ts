import {
  EntityType,
  type GameState, type UpdateData, type EntitySnapshot, type Vector,
} from "@lobcash/common";

export class GameStateTracker {
  playerId: number = -1;
  private entities: Map<number, EntitySnapshot> = new Map();

  private _gold: number = 0;
  private _score: number = 0;
  private _health: number = 100;
  private _tick: number = 0;
  private _epochTimeLeft: number = 0;
  private _aliveCount: number = 0;
  private _safeZone = { center: { x: 1000, y: 1000 } as Vector, radius: 1000, shrinking: false };
  private _leaderboard: Array<{ name: string; score: number }> = [];

  reset(): void {
    this.entities.clear();
    this._gold = 0;
    this._score = 0;
    this._health = 100;
  }

  applyUpdate(data: UpdateData): void {
    this._tick = data.tick;
    this._gold = data.myGold;
    this._score = data.myScore;
    this._health = data.myHealth;
    this._epochTimeLeft = data.epochTimeLeft;
    this._aliveCount = data.aliveCount;
    this._leaderboard = data.leaderboard;
    this._safeZone = {
      center: { x: data.safeZone.centerX, y: data.safeZone.centerY },
      radius: data.safeZone.radius,
      shrinking: data.safeZone.shrinking,
    };

    // Update entities
    for (const e of data.entities) {
      this.entities.set(e.id, e);
    }

    // Remove deleted
    for (const id of data.removedIds) {
      this.entities.delete(id);
    }
  }

  getState(): GameState | null {
    const myEntity = this.entities.get(this.playerId);
    if (!myEntity) return null;

    const nearbyPlayers: GameState["nearbyPlayers"] = [];
    const nearbyGold: GameState["nearbyGold"] = [];
    const extractionZones: GameState["extractionZones"] = [];

    for (const e of this.entities.values()) {
      switch (e.type) {
        case EntityType.Player:
          if (e.id !== this.playerId) {
            nearbyPlayers.push({
              id: e.id,
              position: { x: e.x, y: e.y },
              radius: e.radius,
              name: e.name ?? "",
              gold: e.gold ?? 0,
            });
          }
          break;
        case EntityType.Gold:
          nearbyGold.push({
            id: e.id,
            position: { x: e.x, y: e.y },
            value: e.value ?? 1,
          });
          break;
        case EntityType.ExtractionZone:
          extractionZones.push({
            id: e.id,
            position: { x: e.x, y: e.y },
            radius: e.radius,
            active: e.active ?? false,
            timeLeft: e.timeLeft ?? 0,
          });
          break;
      }
    }

    return {
      tick: this._tick,
      myPlayer: {
        id: this.playerId,
        position: { x: myEntity.x, y: myEntity.y },
        radius: myEntity.radius,
        gold: this._gold,
        score: this._score,
        health: this._health,
      },
      nearbyPlayers,
      nearbyGold,
      extractionZones,
      safeZone: this._safeZone,
      epochTimeLeft: this._epochTimeLeft,
      aliveCount: this._aliveCount,
      leaderboard: this._leaderboard,
    };
  }
}
