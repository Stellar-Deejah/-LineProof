.PHONY: help install install-contracts install-sdk install-toolchain build-contracts build-sdk build \
  test-contracts test-sdk test lint docs-serve docker-up docker-down clean docker-clean deploy-localnet

CONTRACTS := contracts
SDK := sdk
EXAMPLES := examples
DOCKER_COMPOSE := docker/docker-compose.yml
LOCALNET_RPC ?= http://localhost:8000/friendbot

help:
	@echo "Targets:"
	@echo
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-30s\033[0m %s\n", $$1, $$2}'

install: ## Install root workspace dependencies
	pnpm install

install-toolchain: ## Install Rust toolchain and wasm32 target
	rustup target add wasm32-unknown-unknown
	cargo install --locked soroban-cli || true

build-contracts: ## Build Soroban contracts
	cd $(CONTRACTS) && cargo build --target wasm32-unknown-unknown --release

build-sdk: ## Build TypeScript SDK
	pnpm --filter @lineproof/sdk build

build: build-contracts build-sdk ## Build both contracts and SDK

lint: ## Lint Rust and TypeScript
	cd $(CONTRACTS) && cargo fmt -- --check && cargo clippy -p lineproof-queue-factory -p lineproof-queue -p lineproof-enrollment -p lineproof-escrow -p lineproof-identity
	pnpm --filter @lineproof/sdk lint

docs-serve: ## Preview documentation locally
	python3 -m http.server 8000 --directory docs

docker-up: ## Start local Stellar/Soroban testnet
	docker compose -f $(DOCKER_COMPOSE) up -d

docker-down: ## Stop local testnet
	docker compose -f $(DOCKER_COMPOSE) down

docker-clean: docker-down ## Remove local testnet state
	docker compose -f $(DOCKER_COMPOSE) down -v --remove-orphans

deploy-localnet: docker-up ## Deploy local testnet and fund accounts
	@until curl -s $(LOCALNET_RPC) >/dev/null; do echo "Waiting for Friendbot..."; sleep 2; done
	cd scripts && ./init_localnet.sh

clean: ## Remove build artifacts and local net data
	rm -rf $(CONTRACTS)/target $(SDK)/dist $(EXAMPLES)/*/node_modules $(EXAMPLES)/*/dist
