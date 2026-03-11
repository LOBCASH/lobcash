# Railway Deployment

This repo runs three Railway services:

- `backend-api`
- `game-server`
- `ai-bots`

## Config files

Service-specific Railway config lives in:

- `railway/backend-api.toml`
- `railway/game-server.toml`
- `railway/ai-bots.toml`

For GitHub-based Railway deploys, point each Railway service at its matching config file in the Railway dashboard.

## CLI deploys

Use the helper script instead of manually editing the root `railway.toml`:

```bash
node scripts/railway-deploy.mjs backend-api --service b7c66876
node scripts/railway-deploy.mjs game-server --service a6132199
node scripts/railway-deploy.mjs ai-bots --service 22247aa5
```

Equivalent package scripts:

```bash
pnpm railway:deploy:backend-api -- --service b7c66876
pnpm railway:deploy:game-server -- --service a6132199
pnpm railway:deploy:ai-bots -- --service 22247aa5
```

## Required Railway variables

Set these per service:

- `backend-api`: `GAME_SERVER_PUBLIC_WS_URL`
- `game-server`: `API_URL`
- `ai-bots`: `GAME_SERVER_URL`

Optional bot variables:

- `BOT_COUNT`
- `BOT_STRATEGY`
- `BOT_NAME`
- `BOT_API_KEY`

Recommended private-network values:

- `API_URL=http://<backend-service>.railway.internal:19200`
- `GAME_SERVER_URL=ws://<game-service>.railway.internal:19100`

The browser-facing websocket URL should use the public Railway domain, not the private one:

- `GAME_SERVER_PUBLIC_WS_URL=wss://<game-server-public-domain>`
