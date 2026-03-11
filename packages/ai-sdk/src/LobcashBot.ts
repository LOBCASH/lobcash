import WebSocket from "ws";
import {
  PacketType, ActionType,
  encodeJoin, encodeInput,
  decodePacket, decodeUpdate,
  type JoinedData, type DeathData,
} from "@lobcash/common";
import { GameStateTracker } from "./GameStateTracker.js";
import type { BotConfig, IStrategy } from "./types.js";

export class LobcashBot {
  private ws: WebSocket | null = null;
  private tracker = new GameStateTracker();
  private strategy: IStrategy;
  private config: BotConfig;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(config: BotConfig) {
    this.config = config;
    this.strategy = config.strategy;
  }

  async start(): Promise<void> {
    this.running = true;
    await this.connect();
  }

  stop(): void {
    this.running = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[Bot] Connecting to ${this.config.server}...`);
      const ws = new WebSocket(this.config.server);
      this.ws = ws;

      ws.on("open", () => {
        console.log("[Bot] Connected!");
        // Send join packet
        ws.send(encodeJoin({
          name: this.config.name,
          apiKey: this.config.apiKey,
        }));
        resolve();
      });

      ws.on("message", (raw) => {
        try {
          const msg = raw.toString();
          const packet = decodePacket(msg);
          this.handlePacket(packet.type, packet.data);
        } catch (err) {
          console.error("[Bot] Bad packet:", err);
        }
      });

      ws.on("close", () => {
        console.log("[Bot] Disconnected");
        if (this.tickTimer) {
          clearInterval(this.tickTimer);
          this.tickTimer = null;
        }

        if (this.running && (this.config.autoReconnect ?? true)) {
          console.log("[Bot] Reconnecting in 3s...");
          setTimeout(() => {
            if (this.running) this.connect();
          }, 3000);
        }
      });

      ws.on("error", (err) => {
        console.error("[Bot] WS error:", err.message);
        if (!this.tickTimer) reject(err); // only reject if not yet started
      });
    });
  }

  private handlePacket(type: PacketType, data: any): void {
    switch (type) {
      case PacketType.Joined: {
        const joined = data as JoinedData;
        this.tracker.playerId = joined.playerId;
        this.tracker.reset();
        this.strategy.onJoined?.(joined.playerId);

        // Start tick loop
        if (this.tickTimer) clearInterval(this.tickTimer);
        this.tickTimer = setInterval(() => this.tick(), this.config.tickInterval ?? 50);
        break;
      }

      case PacketType.Update: {
        const update = decodeUpdate(data);
        this.tracker.applyUpdate(update);
        break;
      }

      case PacketType.Death: {
        const death = data as DeathData;
        this.strategy.onDeath?.(death.killerName, death.finalScore);
        // Tracker will be reset on next Joined packet
        break;
      }

      case PacketType.GameOver: {
        console.log("[Bot] Game over:", data);
        break;
      }

      case PacketType.EpochInfo: {
        this.strategy.onEpochEnd?.(data.epochId);
        break;
      }
    }
  }

  private tick(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const state = this.tracker.getState();
    if (!state) return;

    const action = this.strategy.decide(state);
    this.ws.send(encodeInput({
      movement: action.movement,
      action: action.action,
    }));
  }
}
