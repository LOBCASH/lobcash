FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/common/package.json packages/common/
COPY packages/game-server/package.json packages/game-server/
RUN pnpm install --frozen-lockfile || pnpm install

COPY tsconfig.json ./
COPY packages/common/ packages/common/
COPY packages/game-server/ packages/game-server/
RUN pnpm --filter @lobcash/common build && pnpm --filter @lobcash/game-server build

ENV NODE_ENV=production
EXPOSE 19100
CMD ["node", "packages/game-server/dist/server.js"]
