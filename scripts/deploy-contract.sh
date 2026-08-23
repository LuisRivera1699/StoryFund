#!/usr/bin/env bash
# Deploy StoryFund contract to Stellar Testnet (or configured network).
# Requires: stellar CLI, funded deployer key in STELLAR_SECRET_KEY (never commit).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/contracts"

NETWORK="${STELLAR_NETWORK:-testnet}"
RPC_URL="${SOROBAN_RPC_URL:-https://soroban-testnet.stellar.org}"
TOKEN="${TOKEN_CONTRACT_ID:-CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA}"
REVIEW_WINDOW="${DEFAULT_REVIEW_WINDOW:-172800}"

if [[ -z "${STELLAR_SECRET_KEY:-}" ]]; then
  echo "Set STELLAR_SECRET_KEY to a funded Testnet secret (S...). Never commit it."
  exit 1
fi

if ! command -v stellar >/dev/null 2>&1; then
  echo "stellar CLI not found. Install: https://developers.stellar.org/docs/tools/cli"
  exit 1
fi

echo "==> Building contract wasm"
stellar contract build

WASM=$(ls -1 target/wasm32v1-none/release/*.wasm 2>/dev/null | head -1 || ls -1 target/wasm32-unknown-unknown/release/*.wasm 2>/dev/null | head -1)
if [[ -z "${WASM}" ]]; then
  echo "Wasm not found after build"
  exit 1
fi

echo "==> Installing wasm: $WASM"
WASM_HASH=$(stellar contract upload \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --source-account "$STELLAR_SECRET_KEY" \
  --wasm "$WASM" | tail -1)

echo "Wasm hash: $WASM_HASH"

echo "==> Deploying instance"
CONTRACT_ID=$(stellar contract deploy \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --source-account "$STELLAR_SECRET_KEY" \
  --wasm-hash "$WASM_HASH" | tail -1)

echo "Contract ID: $CONTRACT_ID"

echo "==> Initializing (token=$TOKEN, review_window=$REVIEW_WINDOW)"
stellar contract invoke \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --source-account "$STELLAR_SECRET_KEY" \
  --id "$CONTRACT_ID" \
  -- \
  initialize \
  --token "$TOKEN" \
  --default-review-window "$REVIEW_WINDOW"

echo ""
echo "Done. Add to .env.local:"
echo "NEXT_PUBLIC_CONTRACT_ID=$CONTRACT_ID"
echo "NEXT_PUBLIC_TOKEN_CONTRACT_ID=$TOKEN"
echo "NEXT_PUBLIC_STELLAR_NETWORK=$NETWORK"
