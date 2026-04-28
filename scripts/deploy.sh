#!/usr/bin/env bash
# Build + deploy contracts to Stellar testnet, then write contract ids into .env.local.
#
# Behavior depends on whether the project's contract/ workspace contains a `receipt/` crate:
#   - If receipt/ EXISTS   (uses_custom_token: true)  -> deploys receipt + main, transfers admin
#   - If receipt/ MISSING  (uses_custom_token: false) -> deploys main only
#
# new-project.sh removes contract/receipt/ for projects that don't use a custom token.
#
# Usage: scripts/deploy.sh [stellar-key-name]
# Default key is "alice".

set -euo pipefail

cd "$(dirname "$0")/.."

SOURCE="${1:-alice}"
NETWORK="testnet"
ENV_FILE=.env.local

USES_TOKEN=0
if [ -d "contract/receipt" ]; then
  USES_TOKEN=1
fi

ADMIN=$(stellar keys address "$SOURCE")
echo "==> deployer: $ADMIN"

write_env() {
  local key="$1" value="$2"
  if [ -f "$ENV_FILE" ] && grep -q "^$key=" "$ENV_FILE"; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^$key=.*|$key=$value|" "$ENV_FILE"
    else
      sed -i "s|^$key=.*|$key=$value|" "$ENV_FILE"
    fi
  else
    echo "$key=$value" >> "$ENV_FILE"
  fi
}

RECEIPT=""
if [ "$USES_TOKEN" -eq 1 ]; then
  echo "==> building receipt"
  stellar contract build --manifest-path contract/receipt/Cargo.toml >/dev/null
  RECEIPT_WASM=contract/target/wasm32v1-none/release/receipt_token.wasm

  echo "==> deploying receipt token (admin: deployer for now)"
  RECEIPT=$(stellar contract deploy \
    --wasm "$RECEIPT_WASM" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    -- --admin "$ADMIN" \
    2>&1 | tail -1)
  [[ "$RECEIPT" =~ ^C[A-Z0-9]{55}$ ]] || { echo "receipt deploy failed: $RECEIPT"; exit 1; }
  echo "    -> $RECEIPT"
fi

echo "==> building main"
stellar contract build --manifest-path contract/main/Cargo.toml >/dev/null
MAIN_WASM=contract/target/wasm32v1-none/release/main_contract.wasm

echo "==> deploying main contract"
if [ "$USES_TOKEN" -eq 1 ]; then
  MAIN=$(stellar contract deploy \
    --wasm "$MAIN_WASM" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    -- --lp_shares "$RECEIPT" \
    2>&1 | tail -1)
else
  MAIN=$(stellar contract deploy \
    --wasm "$MAIN_WASM" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    2>&1 | tail -1)
fi
[[ "$MAIN" =~ ^C[A-Z0-9]{55}$ ]] || { echo "main deploy failed: $MAIN"; exit 1; }
echo "    -> $MAIN"

if [ "$USES_TOKEN" -eq 1 ]; then
  echo "==> transferring receipt admin to main contract"
  stellar contract invoke \
    --id "$RECEIPT" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    -- set_admin --new_admin "$MAIN" >/dev/null
fi

write_env NEXT_PUBLIC_MAIN_CONTRACT_ID "$MAIN"
if [ "$USES_TOKEN" -eq 1 ]; then
  write_env NEXT_PUBLIC_TOKEN_CONTRACT_ID "$RECEIPT"
fi

echo "==> wrote ids to $ENV_FILE"
echo
echo "main:    https://stellar.expert/explorer/testnet/contract/$MAIN"
if [ "$USES_TOKEN" -eq 1 ]; then
  echo "token:   https://stellar.expert/explorer/testnet/contract/$RECEIPT"
fi
