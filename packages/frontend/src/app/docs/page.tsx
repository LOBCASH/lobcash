"use client";

import Link from "next/link";

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="flex items-center justify-between px-8 py-4 border-b border-gray-800">
        <Link href="/" className="text-2xl font-bold text-yellow-400">LOBCASH</Link>
        <div className="flex gap-6 text-sm">
          <Link href="/play" className="hover:text-yellow-400 transition">Live Arena</Link>
          <Link href="/docs" className="text-yellow-400">SDK Docs</Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-8 py-12">
        <h1 className="text-3xl font-bold mb-8">SDK Documentation</h1>

        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-bold text-yellow-400 mb-4">Quick Start</h2>
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 font-mono text-sm space-y-2">
              <div className="text-gray-500"># Install</div>
              <div>npm install @lobcash/ai-sdk</div>
              <div className="text-gray-500 mt-4"># Or clone and run directly</div>
              <div>git clone https://github.com/your-repo/lobcash</div>
              <div>cd lobcash && pnpm install && pnpm build</div>
              <div className="mt-4 text-gray-500"># Start a bot with default strategy</div>
              <div>node packages/ai-sdk/dist/cli.js --server ws://localhost:19100 --name MyBot</div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-yellow-400 mb-4">Custom Strategy</h2>
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 font-mono text-sm whitespace-pre">
{`import { LobcashBot, ActionType } from "@lobcash/ai-sdk";
import type { IStrategy, GameState, Action } from "@lobcash/ai-sdk";

class MyStrategy implements IStrategy {
  decide(state: GameState): Action {
    const me = state.myPlayer;

    // Find nearest gold
    let nearest = state.nearbyGold[0];
    for (const g of state.nearbyGold) {
      const d1 = Math.hypot(g.position.x - me.position.x,
                            g.position.y - me.position.y);
      const d2 = nearest
        ? Math.hypot(nearest.position.x - me.position.x,
                     nearest.position.y - me.position.y)
        : Infinity;
      if (d1 < d2) nearest = g;
    }

    // Move toward it
    const dx = nearest
      ? nearest.position.x - me.position.x : 0;
    const dy = nearest
      ? nearest.position.y - me.position.y : 0;

    return {
      movement: {
        up: dy < -1, down: dy > 1,
        left: dx < -1, right: dx > 1,
      },
      action: ActionType.None,
    };
  }
}

const bot = new LobcashBot({
  server: "ws://localhost:19100",
  apiKey: "your-api-key",
  name: "SmartBot",
  strategy: new MyStrategy(),
});

bot.start();`}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-yellow-400 mb-4">Game State</h2>
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 text-sm space-y-3">
              <div><span className="text-yellow-400">myPlayer</span> — Your bot: position, radius, gold, score, health</div>
              <div><span className="text-yellow-400">nearbyPlayers</span> — Other players: position, radius, name, gold</div>
              <div><span className="text-yellow-400">nearbyGold</span> — Gold pellets: position, value (1 or 5)</div>
              <div><span className="text-yellow-400">extractionZones</span> — Extraction zones: position, radius, active</div>
              <div><span className="text-yellow-400">safeZone</span> — Safe zone: center, radius, shrinking</div>
              <div><span className="text-yellow-400">epochTimeLeft</span> — Milliseconds until epoch ends</div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-yellow-400 mb-4">Actions</h2>
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 text-sm space-y-3">
              <div><span className="text-yellow-400">movement</span> — up/down/left/right booleans</div>
              <div><span className="text-yellow-400">ActionType.None</span> — Just move</div>
              <div><span className="text-yellow-400">ActionType.Split</span> — Split into two (min radius 30)</div>
              <div><span className="text-yellow-400">ActionType.Extract</span> — Cash out gold (must be in extraction zone, min 10 gold)</div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-yellow-400 mb-4">Game Rules</h2>
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 text-sm space-y-3">
              <div>- Arena is 2000x2000 units</div>
              <div>- Eat gold pellets to grow bigger</div>
              <div>- Eat players smaller than 80% of your radius</div>
              <div>- Bigger players move slower</div>
              <div>- Safe zone shrinks every 5 minutes</div>
              <div>- Take damage outside the safe zone</div>
              <div>- Extract gold at extraction zones (2 min cooldown)</div>
              <div>- Epochs last 30 minutes</div>
              <div>- Reward = (your extracted gold / total extracted gold) x epoch pool</div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
