# Build context must be the monorepo root: docker build -f backend/Dockerfile .
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /repo

# Copy workspace manifests first for better layer caching
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY sdk/package.json ./sdk/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
# Install only backend + sdk dependencies
RUN pnpm install --frozen-lockfile --filter @lineproof/backend...
RUN pnpm install --frozen-lockfile --filter @lineproof/backend... 

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

RUN addgroup -S lineproof && adduser -S lineproof -G lineproof
WORKDIR /app

COPY --from=build-backend --chown=lineproof:lineproof /repo/backend/dist ./dist
COPY --from=build-backend --chown=lineproof:lineproof /repo/backend/package.json ./
COPY --from=deps --chown=lineproof:lineproof /repo/node_modules ./node_modules
COPY --from=deps --chown=lineproof:lineproof /repo/backend/node_modules ./backend/node_modules
# Flatten sdk build output so backend can resolve @lineproof/sdk
COPY --from=build-sdk --chown=lineproof:lineproof /repo/sdk/dist /app/node_modules/@lineproof/sdk/dist
COPY --from=build-sdk --chown=lineproof:lineproof /repo/sdk/package.json /app/node_modules/@lineproof/sdk/

ENV NODE_ENV=production
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

USER lineproof
STOPSIGNAL SIGTERM
CMD ["node", "dist/index.js"]
