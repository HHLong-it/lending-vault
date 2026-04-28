# Lending Vault Deployment Guide

This guide walks through deploying Lending Vault from a fresh clone to a working live demo. Two pieces deploy independently:

- **Frontend**: Vercel auto-builds on every push to `main` once the GitHub integration is connected.
- **Contracts**: deployed manually with the Stellar CLI via `scripts/deploy.sh`.

## Frontend Deployment (Vercel)

1. **Connect the repo on Vercel.** Sign in to https://vercel.com, import this GitHub repository, accept the auto-detected Next.js framework. Vercel reads `vercel.json` for the build command.
2. **Set environment variables in the Vercel dashboard** (Project Settings -> Environment Variables):

```
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
NEXT_PUBLIC_MAIN_CONTRACT_ID=<filled by scripts/deploy.sh>
NEXT_PUBLIC_TOKEN_CONTRACT_ID=<filled by scripts/deploy.sh>
```

3. **Trigger a deploy.** Push to `main` or click Redeploy in the Vercel dashboard. The build runs `npm install` then `npm run build`, and the output is published from `.next/`.
4. **Smoke test on phone.** Open the live URL in your phone's browser, connect a wallet, run one transaction. Mobile responsiveness is a Risein Level 4 requirement.

## Contract Deployment (Stellar Testnet)

Soroban contracts cannot be deployed safely from CI without exposing signing keys, so this stays manual.

### Prerequisites

- Stellar CLI 25 or higher: `cargo install --locked stellar-cli`
- Rust + the wasm target: `rustup target add wasm32v1-none`
- A funded testnet identity:
  ```bash
  stellar keys generate alice --network testnet --fund
  ```

### Run the deploy script

```bash
./scripts/deploy.sh alice
```

The script:

1. Builds both crates to `wasm32v1-none/release`.
2. Deploys the LP-shares token (deployer is initial admin).
3. Deploys the vault contract with `--lp_shares <id>`.
4. Calls `set_admin(<vault>)` on the LP-shares contract so the vault is its only admin.
5. Writes `NEXT_PUBLIC_MAIN_CONTRACT_ID` and `NEXT_PUBLIC_TOKEN_CONTRACT_ID` into `.env.local`.

### Custom token

vLP - SEP-41 LP shares token, vault is admin (mint on deposit, burn on withdraw). The deploy script transfers the token's admin role to the main contract during the run, so post-deploy only the main contract can mint.

When it finishes, you will see Stellar Expert links printed to the terminal. Copy them into the README's deployed-contracts block.

## Verifying the Deploy

After both pieces are live:

| Check | How |
|---|---|
| Frontend on phone | Open the Vercel URL on a phone, connect a wallet, run a transaction. |
| Contract reachable | `stellar contract invoke --id $MAIN --source alice --network testnet -- <read method>` returns expected state. |
| Events flowing | The activity feed in the UI shows new events within 6-8 seconds of a write. |
| CI green | Latest workflow run on `main` shows green for both `frontend` and `contract` jobs. |

## Risein Level 4 Submission Checklist

- [ ] Live demo URL working on a phone
- [ ] Deployed contract id(s) pasted into README
- [ ] Sample tx hash linked to Stellar Expert
- [ ] CI badge green on `main`
- [ ] 1-minute demo video linked in README
- [ ] Mobile screenshot in `docs/screenshots/`
- [ ] Cargo test screenshot in `docs/screenshots/`
