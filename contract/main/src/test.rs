#![cfg(test)]

use super::{Error, Vault, VaultClient};
use receipt_token::{ReceiptToken, ReceiptTokenClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env,
};

struct Ctx<'a> {
    env: Env,
    vault: VaultClient<'a>,
    lp: ReceiptTokenClient<'a>,
    xlm: TokenClient<'a>,
    xlm_admin: StellarAssetClient<'a>,
}

fn setup<'a>() -> Ctx<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let issuer = Address::generate(&env);
    let xlm_sac = env.register_stellar_asset_contract_v2(issuer);
    let xlm_addr = xlm_sac.address();

    let placeholder = Address::generate(&env);
    let lp_id = env.register(ReceiptToken, (placeholder,));

    let vault_id = env.register(Vault, (lp_id.clone(), xlm_addr.clone()));

    let lp = ReceiptTokenClient::new(&env, &lp_id);
    lp.set_admin(&vault_id);

    Ctx {
        vault: VaultClient::new(&env, &vault_id),
        lp,
        xlm: TokenClient::new(&env, &xlm_addr),
        xlm_admin: StellarAssetClient::new(&env, &xlm_addr),
        env,
    }
}

fn fund(ctx: &Ctx, who: &Address, amount: i128) {
    ctx.xlm_admin.mint(who, &amount);
}

fn advance(env: &Env, seconds: u64) {
    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp.saturating_add(seconds);
    });
}

#[test]
fn first_deposit_mints_one_for_one() {
    let ctx = setup();
    let alice = Address::generate(&ctx.env);
    fund(&ctx, &alice, 100_000_000);

    let shares = ctx.vault.deposit(&alice, &100_000_000);

    assert_eq!(shares, 100_000_000);
    assert_eq!(ctx.lp.balance(&alice), 100_000_000);
    assert_eq!(ctx.lp.total_supply(), 100_000_000);
    let (total, borrowed) = ctx.vault.pool_state();
    assert_eq!(total, 100_000_000);
    assert_eq!(borrowed, 0);
    // alice's XLM is now in the vault
    assert_eq!(ctx.xlm.balance(&alice), 0);
}

#[test]
fn subsequent_deposit_uses_share_price() {
    let ctx = setup();
    let alice = Address::generate(&ctx.env);
    let bob = Address::generate(&ctx.env);
    fund(&ctx, &alice, 100_000_000);
    fund(&ctx, &bob, 50_000_000);

    ctx.vault.deposit(&alice, &100_000_000);
    let bob_shares = ctx.vault.deposit(&bob, &50_000_000);

    assert_eq!(bob_shares, 50_000_000);
    assert_eq!(ctx.lp.balance(&bob), 50_000_000);
    assert_eq!(ctx.lp.total_supply(), 150_000_000);
}

#[test]
fn borrow_under_ltv_succeeds() {
    let ctx = setup();
    let alice = Address::generate(&ctx.env);
    let bob = Address::generate(&ctx.env);
    fund(&ctx, &alice, 200_000_000);
    fund(&ctx, &bob, 110_000_000); // collateral

    ctx.vault.deposit(&alice, &200_000_000);

    let deadline = ctx.vault.borrow(&bob, &100_000_000, &110_000_000, &86_400);

    assert!(deadline > 0);
    let loan = ctx.vault.loan_of(&bob).unwrap();
    assert_eq!(loan.principal, 100_000_000);
    assert_eq!(loan.collateral, 110_000_000);
    let (_, borrowed) = ctx.vault.pool_state();
    assert_eq!(borrowed, 100_000_000);
    // bob received the principal
    assert_eq!(ctx.xlm.balance(&bob), 100_000_000);
}

#[test]
fn borrow_over_ltv_returns_error() {
    let ctx = setup();
    let alice = Address::generate(&ctx.env);
    let bob = Address::generate(&ctx.env);
    fund(&ctx, &alice, 200_000_000);
    fund(&ctx, &bob, 109_000_000);

    ctx.vault.deposit(&alice, &200_000_000);

    let result = ctx.vault.try_borrow(&bob, &100_000_000, &109_000_000, &86_400);
    assert!(matches!(result, Err(Ok(Error::InsufficientCollateral))));
    assert!(ctx.vault.loan_of(&bob).is_none());
}

#[test]
fn repay_with_interest_releases_loan() {
    let ctx = setup();
    let alice = Address::generate(&ctx.env);
    let bob = Address::generate(&ctx.env);
    fund(&ctx, &alice, 200_000_000);
    fund(&ctx, &bob, 110_000_000); // collateral; principal arrives during borrow

    ctx.vault.deposit(&alice, &200_000_000);
    ctx.vault.borrow(&bob, &100_000_000, &110_000_000, &86_400);

    // accrue interest but stay strictly before the deadline
    advance(&ctx.env, 80_000);

    // top up bob to cover the small interest amount on top of the principal he holds
    fund(&ctx, &bob, 10_000_000);

    let interest = ctx.vault.repay(&bob);

    assert!(interest > 0);
    assert!(ctx.vault.loan_of(&bob).is_none());
    let (total, borrowed) = ctx.vault.pool_state();
    assert_eq!(borrowed, 0);
    assert_eq!(total, 200_000_000 + interest);
}

#[test]
fn repay_after_deadline_returns_error() {
    let ctx = setup();
    let alice = Address::generate(&ctx.env);
    let bob = Address::generate(&ctx.env);
    fund(&ctx, &alice, 200_000_000);
    fund(&ctx, &bob, 110_000_000);

    ctx.vault.deposit(&alice, &200_000_000);
    ctx.vault.borrow(&bob, &100_000_000, &110_000_000, &86_400);

    advance(&ctx.env, 86_400);

    let result = ctx.vault.try_repay(&bob);
    assert_eq!(result, Err(Ok(Error::DeadlinePassed)));
    // loan must still be open so a liquidator can claim the collateral
    assert!(ctx.vault.loan_of(&bob).is_some());
}

#[test]
fn liquidate_past_deadline_clears_loan() {
    let ctx = setup();
    let alice = Address::generate(&ctx.env);
    let bob = Address::generate(&ctx.env);
    let carol = Address::generate(&ctx.env);
    fund(&ctx, &alice, 200_000_000);
    fund(&ctx, &bob, 110_000_000);
    fund(&ctx, &carol, 200_000_000); // liquidator pays the debt

    ctx.vault.deposit(&alice, &200_000_000);
    ctx.vault.borrow(&bob, &100_000_000, &110_000_000, &86_400);

    advance(&ctx.env, 86_401);

    let collateral_claimed = ctx.vault.liquidate(&carol, &bob);

    assert_eq!(collateral_claimed, 110_000_000);
    assert!(ctx.vault.loan_of(&bob).is_none());
    let (_, borrowed) = ctx.vault.pool_state();
    assert_eq!(borrowed, 0);
    // carol now holds the collateral
    assert!(ctx.xlm.balance(&carol) >= 110_000_000);
}

#[test]
fn liquidate_before_deadline_returns_error() {
    let ctx = setup();
    let alice = Address::generate(&ctx.env);
    let bob = Address::generate(&ctx.env);
    let carol = Address::generate(&ctx.env);
    fund(&ctx, &alice, 200_000_000);
    fund(&ctx, &bob, 110_000_000);
    fund(&ctx, &carol, 200_000_000);

    ctx.vault.deposit(&alice, &200_000_000);
    ctx.vault.borrow(&bob, &100_000_000, &110_000_000, &86_400);

    advance(&ctx.env, 1000);

    let result = ctx.vault.try_liquidate(&carol, &bob);
    assert!(matches!(result, Err(Ok(Error::NotPastDeadline))));
}

#[test]
fn debt_grows_over_time() {
    let ctx = setup();
    let alice = Address::generate(&ctx.env);
    let bob = Address::generate(&ctx.env);
    fund(&ctx, &alice, 200_000_000);
    fund(&ctx, &bob, 110_000_000);

    ctx.vault.deposit(&alice, &200_000_000);
    ctx.vault.borrow(&bob, &100_000_000, &110_000_000, &86_400);

    let debt_at_open = ctx.vault.debt_of(&bob);
    advance(&ctx.env, 30_000);
    let debt_30k_secs_later = ctx.vault.debt_of(&bob);

    assert!(debt_30k_secs_later > debt_at_open);
}

#[test]
fn debt_pins_at_deadline() {
    let ctx = setup();
    let alice = Address::generate(&ctx.env);
    let bob = Address::generate(&ctx.env);
    fund(&ctx, &alice, 200_000_000);
    fund(&ctx, &bob, 110_000_000);

    ctx.vault.deposit(&alice, &200_000_000);
    ctx.vault.borrow(&bob, &100_000_000, &110_000_000, &86_400);

    advance(&ctx.env, 86_400);
    let debt_at_deadline = ctx.vault.debt_of(&bob);

    advance(&ctx.env, 60);
    assert_eq!(ctx.vault.debt_of(&bob), debt_at_deadline);

    advance(&ctx.env, 86_400 * 7);
    assert_eq!(ctx.vault.debt_of(&bob), debt_at_deadline);
}
