# Multi-stage Dockerfile for LOBCASH services
FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/common/package.json packages/common/
COPY packages/game-server/package.json packages/game-server/
COPY packages/backend-api/package.json packages/backend-api/
COPY packages/ai-sdk/package.json packages/ai-sdk/
COPY packages/frontend/package.json packages/frontend/
RUN pnpm install --frozen-lockfile || pnpm install

# Build all packages
FROM deps AS build
COPY tsconfig.json ./
COPY packages/common/ packages/common/
COPY packages/game-server/ packages/game-server/
COPY packages/backend-api/ packages/backend-api/
COPY packages/ai-sdk/ packages/ai-sdk/
COPY packages/frontend/ packages/frontend/
RUN pnpm build

# ─── Game Server ───
FROM base AS game-server
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/common/node_modules ./packages/common/node_modules
COPY --from=deps /app/packages/game-server/node_modules ./packages/game-server/node_modules
COPY --from=build /app/packages/common/dist ./packages/common/dist
COPY --from=build /app/packages/game-server/dist ./packages/game-server/dist
COPY packages/common/package.json packages/common/
COPY packages/game-server/package.json packages/game-server/
COPY package.json pnpm-workspace.yaml ./
ENV NODE_ENV=production
EXPOSE 19100
CMD ["node", "packages/game-server/dist/server.js"]

# ─── Backend API ───
FROM base AS backend-api
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/common/node_modules ./packages/common/node_modules
COPY --from=deps /app/packages/backend-api/node_modules ./packages/backend-api/node_modules
COPY --from=build /app/packages/common/dist ./packages/common/dist
COPY --from=build /app/packages/backend-api/dist ./packages/backend-api/dist
COPY packages/common/package.json packages/common/
COPY packages/backend-api/package.json packages/backend-api/
COPY package.json pnpm-workspace.yaml ./
ENV NODE_ENV=production
EXPOSE 19200
CMD ["node", "packages/backend-api/dist/app.js"]

# ─── AI SDK (Bot Runner) ───
FROM base AS ai-bot
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/common/node_modules ./packages/common/node_modules
COPY --from=deps /app/packages/ai-sdk/node_modules ./packages/ai-sdk/node_modules
COPY --from=build /app/packages/common/dist ./packages/common/dist
COPY --from=build /app/packages/ai-sdk/dist ./packages/ai-sdk/dist
COPY packages/common/package.json packages/common/
COPY packages/ai-sdk/package.json packages/ai-sdk/
COPY package.json pnpm-workspace.yaml ./
ENV NODE_ENV=production
CMD ["node", "packages/ai-sdk/dist/cli.js"]
