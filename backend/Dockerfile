# Build context must be the monorepo root: docker build -f backend/Dockerfile .
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /repo

# Copy workspace manifests first for better layer caching
FROM base AS deps
COPY pnpm-workspace.yaml package.json ./
COPY sdk/package.json ./sdk/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
# Install only backend + sdk dependencies
RUN pnpm install --no-frozen-lockfile --filter @lineproof/backend... 

# Build SDK first (backend depends on it)
FROM deps AS build-sdk
COPY sdk/ ./sdk/
RUN pnpm --filter @lineproof/sdk build

# Build backend
FROM build-sdk AS build-backend
COPY backend/ ./backend/
RUN pnpm --filter @lineproof/backend build

# Minimal runtime image
FROM node:20-alpine AS runtime
WORKDIR /app

COPY --from=build-backend /repo/backend/dist ./dist
COPY --from=build-backend /repo/backend/package.json ./
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/backend/node_modules ./backend/node_modules
# Flatten sdk build output so backend can resolve @lineproof/sdk
COPY --from=build-sdk /repo/sdk/dist /app/node_modules/@lineproof/sdk/dist
COPY --from=build-sdk /repo/sdk/package.json /app/node_modules/@lineproof/sdk/

ENV NODE_ENV=production
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
