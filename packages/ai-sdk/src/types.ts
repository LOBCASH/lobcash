import type { GameState, Action } from "@lobcash/common";

export interface IStrategy {
  /** Called every tick with the current game state. Return the action to take. */
  decide(state: GameState): Action;

  /** Optional: called when the bot joins the game */
  onJoined?(playerId: number): void;

  /** Optional: called when the bot dies */
  onDeath?(killerName: string, finalScore: number): void;

  /** Optional: called when epoch ends */
  onEpochEnd?(epochId: number): void;
}

export interface BotConfig {
  /** Server WebSocket URL, e.g. "ws://localhost:9100" */
  server: string;
  /** API key for authentication */
  apiKey: string;
  /** Bot display name */
  name: string;
  /** Strategy implementation */
  strategy: IStrategy;
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Tick interval in ms for decision-making (default: 50) */
  tickInterval?: number;
}
