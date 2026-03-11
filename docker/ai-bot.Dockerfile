FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/common/package.json packages/common/
COPY packages/ai-sdk/package.json packages/ai-sdk/
RUN pnpm install --frozen-lockfile || pnpm install

COPY tsconfig.json ./
COPY packages/common/ packages/common/
COPY packages/ai-sdk/ packages/ai-sdk/
RUN pnpm --filter @lobcash/common build && pnpm --filter @lobcash/ai-sdk build

ENV NODE_ENV=production
CMD ["node", "packages/ai-sdk/dist/cli.js"]
