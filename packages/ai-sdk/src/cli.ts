import * as fs from "fs";
import { LobcashBot } from "./LobcashBot.js";
import { DefaultStrategy } from "./DefaultStrategy.js";
import { AggressiveStrategy } from "./strategies/AggressiveStrategy.js";
import { FarmerStrategy } from "./strategies/FarmerStrategy.js";
import type { IStrategy } from "./types.js";

interface CliConfig {
  server: string;
  apiKey: string;
  name: string;
  strategy: string;
}

const STRATEGIES: Record<string, () => IStrategy> = {
  default: () => new DefaultStrategy(),
  aggressive: () => new AggressiveStrategy(),
  farmer: () => new FarmerStrategy(),
  mixed: () => { // randomly pick a strategy
    const all = [DefaultStrategy, AggressiveStrategy, FarmerStrategy];
    return new all[Math.floor(Math.random() * all.length)]();
  },
};

function printHelp(): void {
  console.log(`
LOBCASH AI Bot - CLI Runner

Usage:
  lobcash-bot [options]

Options:
  --config <path>       Config JSON file (default: ./config.json)
  --server <url>        Server URL (default: ws://localhost:19100)
  --name <name>         Bot name (default: AI_Bot_XXX)
  --api-key <key>       API key for auth
  --count <n>           Number of bots (default: 1)
  --strategy <name>     Strategy: default, aggressive, farmer, mixed (default: mixed)
  --help                Show this help

Strategies:
  default      Balanced - collects gold, hunts small players, extracts when able
  aggressive   Hunter - prioritizes eating other players
  farmer       Safe - avoids combat, focuses on gold collection and quick extractions
  mixed        Randomly assigns a strategy to each bot
`);
}

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help")) { printHelp(); return; }

  let config: Partial<CliConfig> = {};

  // Load config file
  const configPath = getArg(args, "--config") ?? "config.json";
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    console.log(`Loaded config from ${configPath}`);
  }

  // CLI overrides
  config.server = getArg(args, "--server") ?? config.server ?? "ws://localhost:19100";
  config.name = getArg(args, "--name") ?? config.name ?? `Bot_${Math.floor(Math.random() * 1000)}`;
  config.apiKey = getArg(args, "--api-key") ?? config.apiKey ?? "dev-key";
  config.strategy = getArg(args, "--strategy") ?? config.strategy ?? "mixed";

  const botCount = parseInt(getArg(args, "--count") ?? "1", 10);
  const strategyName = config.strategy!;

  if (!STRATEGIES[strategyName]) {
    console.error(`Unknown strategy: ${strategyName}. Use: ${Object.keys(STRATEGIES).join(", ")}`);
    process.exit(1);
  }

  console.log(`Starting ${botCount} bot(s) with strategy: ${strategyName}`);
  console.log(`Server: ${config.server}`);
  console.log("");

  const bots: LobcashBot[] = [];

  for (let i = 0; i < botCount; i++) {
    const botName = botCount > 1 ? `${config.name}_${i + 1}` : config.name!;
    const strategy = STRATEGIES[strategyName]();
    const stratLabel = strategy.constructor.name;

    const bot = new LobcashBot({
      server: config.server!,
      apiKey: config.apiKey!,
      name: botName,
      strategy,
    });
    bots.push(bot);

    try {
      await bot.start();
      console.log(`  [${i + 1}/${botCount}] ${botName} started (${stratLabel})`);
    } catch (err: any) {
      console.error(`  [${i + 1}/${botCount}] ${botName} failed: ${err.message}`);
    }

    if (i < botCount - 1) await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nAll ${bots.length} bots running. Press Ctrl+C to stop.\n`);

  process.on("SIGINT", () => {
    console.log("\nStopping bots...");
    for (const bot of bots) bot.stop();
    process.exit(0);
  });
}

main().catch(console.error);
