#!/bin/bash
# Augment metadata.jsonl from the SAME chain (runtime upgrades).
# For a different genesis, use: RPC=<new-genesis-rpc> npm run meta:add
# Usage: ./regenerate_metadata.sh

set -e

echo "🔄 Regenerating metadata from RPC endpoint..."

if [ -f .env ]; then
  set -a
  . .env
  set +a
fi

if [ -z "$RPC" ]; then
  RPC="$RPC_ENDPOINT"
fi

if [ -z "$RPC" ]; then
  echo "❌ Please set RPC or RPC_ENDPOINT in .env"
  exit 1
fi

echo "Using RPC: $RPC"
RPC="$RPC" npm run meta:update

echo "✅ Metadata updated successfully! Run 'npm run gen:types' next."
