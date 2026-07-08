# Build context must be the monorepo root: docker build -f frontend/Dockerfile .
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json ./
COPY sdk/package.json ./sdk/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN pnpm install --no-frozen-lockfile --filter @lineproof/frontend...

FROM deps AS build
ARG VITE_API_BASE_URL=http://localhost:4000/api
ARG VITE_STELLAR_NETWORK="Test SDF Network ; September 2015"
ARG VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_STELLAR_NETWORK=$VITE_STELLAR_NETWORK
ENV VITE_SOROBAN_RPC_URL=$VITE_SOROBAN_RPC_URL
COPY sdk/ ./sdk/
COPY frontend/ ./frontend/
RUN pnpm --filter @lineproof/sdk build
RUN pnpm --filter @lineproof/frontend build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /repo/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
