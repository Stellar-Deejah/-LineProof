#!/usr/bin/env bash
set -e

echo "Starting local Stellar testnet with Docker Compose..."
docker compose -f docker/docker-compose.yml up -d

echo "Waiting for stellar-core to be ready..."
sleep 15

echo "Generating deployer identity..."
soroban config identity generate deployer

echo "DONE: Local network is running. Use 'soroban config identity address deployer' to get the public address."
