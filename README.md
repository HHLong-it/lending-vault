# Lending Vault

Over-collateralized XLM lending pool on Stellar Testnet. Vault contract orchestrates an SEP-41 LP-shares contract via inter-contract `mint` / `burn`. Borrowers post 110% XLM collateral, accrue 5% APR linear interest, and either repay before deadline or get liquidated by any third party willing to settle the debt.

[![CI](https://github.com/HHLong-it/lending-vault/actions/workflows/ci.yml/badge.svg)](https://github.com/HHLong-it/lending-vault/actions)

```text
network:    Stellar Testnet
vault:      CBHQYXE4F5VRQI33TSGYBYRCXIP72HXGJPZXOSJ3BHMARRL4RZHCZTF4
            https://stellar.expert/explorer/testnet/contract/CBHQYXE4F5VRQI33TSGYBYRCXIP72HXGJPZXOSJ3BHMARRL4RZHCZTF4
lp_shares:  CB4NUBETYAIIOO2CO4QTVMB6JTVZR7KKRZS2BCTS5XXZIGW6APE566FM
            https://stellar.expert/explorer/testnet/contract/CB4NUBETYAIIOO2CO4QTVMB6JTVZR7KKRZS2BCTS5XXZIGW6APE566FM
demo: https://lending-vault-dun.vercel.app/
video: https://drive.google.com/file/d/1lo0K5qAlsBXkDnD1DGl5mG7Q8jaAcNx2/view?usp=sharing    
```

## Features

- **Over-collateralised loans.** Borrowers post 110% XLM collateral. Under-collateralised borrows return a typed `InsufficientCollateral` error rather than panicking.
- **Linear interest accrual.** 5% APR computed from `elapsed * APR_BPS / SECONDS_PER_YEAR`. Repay or liquidate both compute the live debt at call time.
- **Public liquidation.** Once a loan is past deadline, any third party can call `liquidate(...)` to settle it. No bot-only path, no admin.
- **LP shares mint/burn.** The vault is the only admin of a SEP-41 LP-shares token. Deposits mint shares pro-rata; withdrawals burn them.
- **Dark fintech UI.** Tabular numbers, debt-clock countdown, utilisation bars. Designed for skim-reading on a phone.

## Architecture

```
                        wallet
                          │
                     sign │ deposit / withdraw / borrow / repay / liquidate
                          ▼
              ┌─────────────────────────────┐         ┌──────────────────┐
              │       Vault                 │ ──────► │   LP Shares      │
              │  - deposit(lender, amount)  │ mint()  │  - mint(to, n)   │
              │  - withdraw(lender, shares) │ burn()  │  - burn(from, n) │
              │  - borrow(...)              │         │  - balance(addr) │
              │  - repay(borrower)          │         │  (SEP-41)        │
              │  - liquidate(...)           │         └──────────────────┘
              │  - emits 5 event types      │
              └─────────────────────────────┘
                          │
                          ▼
                    Soroban RPC
                          │
                          ▼
                  getEvents → live UI
```

Two contracts in `contract/`:

| Contract | Crate | Role |
|---|---|---|
| `Vault` | `main` | Orchestrates the pool. Owns total XLM and per-borrower loans. Calls into LP Shares for mint/burn. |
| `ReceiptToken` (SEP-41) | `receipt` | LP shares token. Vault is its only admin (ownership transferred during deploy). |

## State Model

### Vault storage

| Key | Type | Notes |
|---|---|---|
| `LpShares` | `Address` (instance) | Address of the LP-shares contract; set in `__constructor` |
| `TotalXlm` | `i128` (instance, stroops) | Sum of deposits + accrued interest |
| `BorrowedXlm` | `i128` (instance, stroops) | Sum of outstanding loan principals |
| `Loan(addr)` | `Loan` (persistent) | At most one open loan per borrower |

```rust
struct Loan {
    principal: i128,        // stroops
    collateral: i128,       // stroops
    opened_at: u64,         // ledger seconds
    deadline: u64,          // ledger seconds
}
```

### Constants

| Name | Value | Meaning |
|---|---|---|
| `LTV_NUM` / `LTV_DEN` | 100 / 110 | Collateral must be ≥ 110% of principal |
| `APR_BPS` / `BPS_DEN` | 500 / 10_000 | 5% APR (basis points) |
| `SECONDS_PER_YEAR` | 31_536_000 | Used for linear interest accrual |

## Sequence of Calls

### Deposit (lender → pool)
1. Lender signs `deposit(lender, amount)`
2. Vault computes `shares_out`:
   - First deposit (or empty pool): `shares_out = amount` (1:1)
   - Subsequent: `shares_out = amount * total_shares / total_xlm` (proportional)
3. Vault increments `TotalXlm` by `amount`
4. Vault calls `LpShares.mint(lender, shares_out)` (inter-contract; Vault is admin)
5. Vault emits `("deposit", lender) -> (amount, shares_out)`

### Borrow (borrower opens position)
1. Borrower signs `borrow(borrower, principal, collateral, duration)`
2. Vault asserts `collateral * 100 >= principal * 110` (LTV gate)
3. Vault asserts pool has enough idle XLM (`TotalXlm - BorrowedXlm >= principal`)
4. Vault writes `Loan(borrower) = { principal, collateral, opened_at = now, deadline = now + duration }`
5. Vault increments `BorrowedXlm` by `principal`
6. Vault emits `("borrow", borrower) -> (principal, collateral, deadline)`

### Repay (borrower closes own position)
1. Borrower signs `repay(borrower)`
2. Vault loads `Loan(borrower)`
3. Vault computes `interest = principal * APR_BPS * elapsed / (BPS_DEN * SECONDS_PER_YEAR)`
4. Vault deletes `Loan(borrower)`, decrements `BorrowedXlm` by `principal`, increments `TotalXlm` by `interest` (interest stays in the pool, raising share price)
5. Vault emits `("repay", borrower) -> (principal, interest)`

### Liquidate (third party, only after deadline)
1. Liquidator signs `liquidate(liquidator, borrower)`
2. Vault asserts `now >= loan.deadline` (else `Error::NotPastDeadline`)
3. Same accounting as Repay (interest credited to pool, loan cleared)
4. Vault emits `("liquidate", liquidator, borrower) -> (collateral, debt_settled)`

## Contract API

### `Vault` (main)

| Method | Sig | Returns | Errors |
|---|---|---|---|
| `__constructor(env, lp_shares)` | `Address` | - | - |
| `deposit(lender, amount)` | `Address, i128` | `i128` (shares minted) | `AmountMustBePositive`, `NotInitialized` |
| `withdraw(lender, shares)` | `Address, i128` | `i128` (XLM out) | `AmountMustBePositive`, `PoolEmpty`, `InsufficientLiquidity` |
| `borrow(borrower, principal, collateral, duration_seconds)` | `Address, i128, i128, u64` | `u64` (deadline) | `AmountMustBePositive`, `LoanAlreadyOpen`, `InsufficientCollateral`, `InsufficientLiquidity` |
| `repay(borrower)` | `Address` | `i128` (interest paid) | `NoOpenLoan`, `DeadlinePassed` |
| `liquidate(liquidator, borrower)` | `Address, Address` | `i128` (collateral claimed) | `NoOpenLoan`, `NotPastDeadline` |
| `pool_state()` | - | `(i128, i128)` total / borrowed | - |
| `loan_of(borrower)` | `Address` | `Option<Loan>` | - |
| `debt_of(borrower)` | `Address` | `i128` | - |
| `lp_contract()` | - | `Address` | `NotInitialized` |

### `ReceiptToken` (receipt - LP shares)

| Method | Sig | Returns | Auth |
|---|---|---|---|
| `mint(to, amount)` | `Address, i128` | - | admin (Vault) |
| `burn(from, amount)` | `Address, i128` | - | admin (Vault) |
| `balance(of)` | `Address` | `i128` | - |
| `total_supply()` | - | `i128` | - |
| `name() / symbol() / decimals()` | - | `"Vault LP Shares" / "vLP" / 7` | - |
| `set_admin(new_admin)` | `Address` | - | current admin |

## Frontend ↔ Contract Mapping

| Hook | Contract method | Result type | Notes |
|---|---|---|---|
| `useDeposit(addr).mutate(xlm)` | `Vault.deposit` | `{hash}` | `xlm` is human-readable; converted to stroops |
| `useWithdraw(addr).mutate(shares)` | `Vault.withdraw` | `{hash}` | shares as decimal LP units |
| `useBorrow(addr).mutate({principal, collateral, durationDays})` | `Vault.borrow` | `{hash}` | days converted to seconds |
| `useRepay(addr).mutate()` | `Vault.repay` | `{hash}` | no args; vault uses caller |
| `useLiquidate(addr).mutate(borrowerAddr)` | `Vault.liquidate` | `{hash}` | any third party can call |
| `usePoolState()` | `Vault.pool_state` + `LP.total_supply` | `PoolState` | computes utilization + share price |
| `useLpBalance(addr)` | `LP.balance` | `bigint` | LP-share balance for the user |
| `useLoan(addr)` | `Vault.loan_of` + `Vault.debt_of` | `{loan, debt}` | active loan + accrued debt |

## Errors

Vault errors (`Error` enum):

| Variant | When |
|---|---|
| `AmountMustBePositive` | Any zero/negative amount input |
| `NotInitialized` | LP-shares address missing (only on misconstructed instance) |
| `InsufficientCollateral` | `collateral * 100 < principal * 110` on borrow |
| `LoanAlreadyOpen` | Borrower tries to open a second concurrent loan |
| `NoOpenLoan` | repay/liquidate called with no matching loan |
| `NotPastDeadline` | Liquidator tried before `now >= deadline` |
| `DeadlinePassed` | Borrower tried `repay` after `now >= deadline` (loan must be liquidated instead) |
| `InsufficientLiquidity` | Pool's idle XLM can't cover the borrow / withdraw |
| `PoolEmpty` | Withdraw called on empty pool |

Frontend `lib/errors.ts` maps SDK rejection / underfunded payloads onto `UserRejectedError` and `InsufficientBalanceError` for friendly UI messages.

## Tests

```bash
cd contract && cargo test
```

Vault (`contract/main/src/test.rs`):

| Test | Covers |
|---|---|
| `first_deposit_mints_one_for_one` | Empty-pool deposit edge case |
| `subsequent_deposit_uses_share_price` | Proportional minting with non-empty pool |
| `borrow_under_ltv_succeeds` | Happy path open-loan + state mutation |
| `borrow_over_ltv_returns_error` | Typed `InsufficientCollateral` on under-collateralized borrow |
| `repay_with_interest_releases_loan` | Time-advanced repay; interest > 0; pool grows |
| `repay_after_deadline_returns_error` | Typed `DeadlinePassed` blocks self-repay once expired; loan stays open for liquidator |
| `liquidate_past_deadline_clears_loan` | Third-party liquidation after deadline |
| `liquidate_before_deadline_returns_error` | Typed `NotPastDeadline` if too early |
| `debt_grows_over_time` | Interest accrual is monotonic |

LP Shares (`contract/receipt/src/test.rs`):

| Test | Covers |
|---|---|
| `mint_increases_balance_and_supply` | Happy mint |
| `multiple_mints_accumulate` | Cross-account mint accumulation |
| `burn_decreases_balance_and_supply` | Happy burn |
| `burn_more_than_balance_returns_error` | Typed `InsufficientBalance` |
| `negative_mint_returns_error` | Typed `InvalidAmount` |
| `metadata_is_correct` | name / symbol / decimals constants |
| `admin_can_be_transferred` | `set_admin` works |

16 tests total. CI runs them on every push.

## Build & Deploy

```bash
git clone https://github.com/HHLong-it/lending-vault.git
cd lending-vault
npm install
cp .env.example .env.local
```

Deploy contracts to Testnet (one-time):

```bash
stellar keys generate alice --network testnet --fund   # if needed
./scripts/deploy.sh alice
```

The deploy script:
1. Builds both wasms (`stellar contract build` per crate)
2. Deploys `receipt` with `alice` as the initial admin
3. Deploys `main` (vault) pointing at receipt
4. Calls `receipt.set_admin(<vault_address>)` so future mints come from the vault
5. Writes `NEXT_PUBLIC_MAIN_CONTRACT_ID` and `NEXT_PUBLIC_TOKEN_CONTRACT_ID` into `.env.local`
6. Prints Stellar Expert links

Run the dev server:

```bash
npm run dev
```

Visit http://localhost:3000, connect a wallet, deposit some XLM.

## CI / CD

`.github/workflows/ci.yml` runs on every push and pull request:
- `frontend` job: `npm install`, `npx tsc --noEmit`, `npm run build`
- `contract` job: `cargo test` in `contract/` with `Swatinem/rust-cache`

Cancels older runs on the same ref via the `concurrency` block.

Deploy:
- Frontend: Vercel auto-builds on push (`vercel.json` declares the framework + build command)
- Contract: manual via `scripts/deploy.sh` (signing keys stay off CI)

See [`deploy.md`](./deploy.md) for the full walkthrough.

## Screenshots

| | |
|---|---|
| Pool stats | <img width="1187" height="521" alt="image" src="https://github.com/user-attachments/assets/8208e211-aac0-4f7a-a2a6-f67da3e4bb2c" />|
| Lender + Borrower form | <img width="1161" height="555" alt="image" src="https://github.com/user-attachments/assets/e371e48c-9011-4acb-8752-54432d7d3e2a" />|
| Live activity feed | <img width="1185" height="704" alt="image" src="https://github.com/user-attachments/assets/404426e3-df11-41d3-b2d8-3bffbd9e6730" />|
| Mobile view | <img width="390" height="621" alt="image" src="https://github.com/user-attachments/assets/6baa251b-222e-4ae3-a9d3-5a1ff43a7d53" />|
| CI passing | <img width="907" height="160" alt="image" src="https://github.com/user-attachments/assets/ceeb3d50-2464-4aab-a3c3-8fd29a85e580" />|
| Cargo test output | <img width="665" height="452" alt="image" src="https://github.com/user-attachments/assets/9ba79899-fee4-4593-bc6e-612c99919726" />|

## Addtion

- Amounts on the contract are i128 stroops. The frontend converts via `xlmToStroops("1.5")` so there's no float drift.
- The vault contract is an accounting ledger - XLM movement happens via Horizon payments alongside the contract calls (same pattern as Tip Jar). A production version would integrate the Stellar Asset Contract for native XLM custody.
- Interest accrued on repay/liquidate is credited to the pool, raising the share price for all LPs proportionally. There's no separate "yield" claim flow; lenders realize gains by withdrawing more XLM than they deposited.
- LP shares are a normal SEP-41 (transferable). Admin-only mint and burn restrict supply to the vault's discretion, so shares can't be inflated outside deposits.
- Liquidation in this design transfers the entire collateral to the pool (not the liquidator), since collateral and principal are both XLM. A more complex design with multi-asset collateral would split the gain.
