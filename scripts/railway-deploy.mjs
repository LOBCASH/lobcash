import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const rootRailwayToml = path.join(repoRoot, "railway.toml");

const serviceConfigMap = {
  "backend-api": "backend-api.toml",
  backend: "backend-api.toml",
  "game-server": "game-server.toml",
  game: "game-server.toml",
  "ai-bots": "ai-bots.toml",
  "ai-bot": "ai-bots.toml",
  bots: "ai-bots.toml",
};

function printHelp() {
  console.log(`Usage:
  node scripts/railway-deploy.mjs <service> [--service <selector>] [-- <extra railway args>]

Services:
  backend-api
  game-server
  ai-bots

Examples:
  node scripts/railway-deploy.mjs backend-api
  node scripts/railway-deploy.mjs backend-api --service b7c66876
  node scripts/railway-deploy.mjs game-server -- --detach
`);
}

function parseArgs(argv) {
  const positionals = [];
  const extraRailwayArgs = [];
  let serviceSelector;
  let passthrough = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (passthrough) {
      extraRailwayArgs.push(arg);
      continue;
    }

    if (arg === "--") {
      passthrough = true;
      continue;
    }

    if (arg === "--service" || arg === "-s") {
      serviceSelector = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    positionals.push(arg);
  }

  return {
    serviceKey: positionals[0],
    serviceSelector,
    extraRailwayArgs,
  };
}

const { serviceKey, serviceSelector, extraRailwayArgs } = parseArgs(process.argv.slice(2));

if (!serviceKey) {
  printHelp();
  process.exit(1);
}

const configName = serviceConfigMap[serviceKey];

if (!configName) {
  console.error(`Unknown service "${serviceKey}".`);
  printHelp();
  process.exit(1);
}

const selectedConfigPath = path.join(repoRoot, "railway", configName);

if (!existsSync(selectedConfigPath)) {
  console.error(`Missing Railway config: ${selectedConfigPath}`);
  process.exit(1);
}

const originalRootConfig = existsSync(rootRailwayToml)
  ? readFileSync(rootRailwayToml, "utf8")
  : null;
const selectedConfig = readFileSync(selectedConfigPath, "utf8");

writeFileSync(rootRailwayToml, selectedConfig);

const railwayArgs = ["up", "-s", serviceSelector ?? serviceKey, ...extraRailwayArgs];
const result = (() => {
  try {
    return spawnSync("railway", railwayArgs, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: true,
    });
  } finally {
    if (originalRootConfig !== null) {
      writeFileSync(rootRailwayToml, originalRootConfig);
    }
  }
})();

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
