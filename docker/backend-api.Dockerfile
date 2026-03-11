FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/common/package.json packages/common/
COPY packages/backend-api/package.json packages/backend-api/
RUN pnpm install --frozen-lockfile || pnpm install

COPY tsconfig.json ./
COPY packages/common/ packages/common/
COPY packages/backend-api/ packages/backend-api/
RUN pnpm --filter @lobcash/common build && pnpm --filter @lobcash/backend-api build

ENV NODE_ENV=production
EXPOSE 19200
CMD ["node", "packages/backend-api/dist/app.js"]
