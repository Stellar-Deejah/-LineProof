FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json ./
RUN pnpm install --no-frozen-lockfile

# Build
FROM deps AS build
ARG VITE_API_BASE_URL=http://localhost:4000/api
ARG VITE_STELLAR_NETWORK="Test SDF Network ; September 2015"
ARG VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_STELLAR_NETWORK=$VITE_STELLAR_NETWORK
ENV VITE_SOROBAN_RPC_URL=$VITE_SOROBAN_RPC_URL
COPY . .
RUN pnpm build

# Serve with nginx
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
