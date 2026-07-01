.PHONY: help install install-toolchain build-contracts build-sdk build \
  test-contracts test-sdk test-backend test lint docs-serve docker-up docker-down clean docker-clean deploy-localnet \
  test-all typecheck fmt build-all build-backend build-frontend

CONTRACTS := contracts
SDK := sdk
FRONTEND := frontend
BACKEND := backend
EXAMPLES := examples
DOCKER_COMPOSE := docker/docker-compose.yml
LOCALNET_RPC ?= http://localhost:8000/friendbot

help: ## Show all available targets
	@echo "LineProof development targets:"
	@echo
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-30s\033[0m %s\n", $$1, $$2}'

install: ## Install all workspace dependencies
	pnpm install

install-toolchain: ## Install Rust toolchain, wasm32 target, and soroban-cli
	rustup toolchain install stable
	rustup target add wasm32-unknown-unknown
	cargo install --locked soroban-cli || true

build-contracts: ## Build Soroban contracts to WASM
	cd $(CONTRACTS) && cargo build --target wasm32-unknown-unknown --release

build-sdk: ## Build TypeScript SDK
	pnpm --filter @lineproof/sdk build

build-backend: ## Build backend TypeScript
	pnpm --filter @lineproof/backend build

build-frontend: ## Build frontend application
	pnpm --filter @lineproof/frontend build

build: build-contracts build-sdk ## Build contracts and SDK

build-all: build-contracts build-sdk build-backend build-frontend ## Build everything

test-contracts: ## Run Soroban contract tests
	cd $(CONTRACTS) && cargo test --workspace

test-sdk: ## Run SDK unit tests
	pnpm --filter @lineproof/sdk test

test-backend: ## Run backend unit tests
	pnpm --filter @lineproof/backend test

test-all: test-contracts test-sdk test-backend ## Run all test suites

test: test-all ## Alias for test-all

fmt: ## Format Rust code
	cd $(CONTRACTS) && cargo fmt

typecheck: ## TypeScript type checks (no emit)
	pnpm --filter @lineproof/sdk typecheck
	pnpm --filter @lineproof/frontend tsc --noEmit

lint: ## Lint Rust and TypeScript
	cd $(CONTRACTS) && cargo fmt -- --check && cargo clippy -p lineproof-queue-factory -p lineproof-queue -p lineproof-enrollment -p lineproof-escrow -p lineproof-identity
	pnpm --filter @lineproof/sdk lint
	pnpm --filter @lineproof/frontend lint
	pnpm --filter @lineproof/backend lint

docs-serve: ## Preview documentation locally at http://localhost:8080
	python3 -m http.server 8080 --directory docs

docker-up: ## Start local Stellar/Soroban testnet
	docker compose -f $(DOCKER_COMPOSE) up -d

docker-down: ## Stop local testnet
	docker compose -f $(DOCKER_COMPOSE) down

docker-clean: docker-down ## Remove local testnet state and volumes
	docker compose -f $(DOCKER_COMPOSE) down -v --remove-orphans

deploy-localnet: docker-up ## Deploy contracts to local testnet
	@until curl -s $(LOCALNET_RPC) >/dev/null; do echo "Waiting for Friendbot..."; sleep 2; done
	./scripts/deploy_localnet.sh

clean: ## Remove build artifacts
	rm -rf $(CONTRACTS)/target $(SDK)/dist $(FRONTEND)/dist $(BACKEND)/dist $(EXAMPLES)/*/node_modules $(EXAMPLES)/*/dist
