FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/common/package.json packages/common/
COPY packages/frontend/package.json packages/frontend/
RUN pnpm install --frozen-lockfile || pnpm install

# Build
COPY tsconfig.json ./
COPY packages/common/ packages/common/
COPY packages/frontend/ packages/frontend/
RUN NEXT_STANDALONE=1 pnpm --filter @lobcash/common build && NEXT_STANDALONE=1 pnpm --filter @lobcash/frontend build

# Production
FROM node:20-slim AS runner
WORKDIR /app
COPY --from=base /app/packages/frontend/.next/standalone ./
COPY --from=base /app/packages/frontend/.next/static ./packages/frontend/.next/static
COPY --from=base /app/packages/frontend/public ./packages/frontend/public

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "packages/frontend/server.js"]
