#![cfg(test)]

use super::{Error, ReceiptToken, ReceiptTokenClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn setup() -> (Env, ReceiptTokenClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(ReceiptToken, (admin.clone(),));
    let client = ReceiptTokenClient::new(&env, &contract_id);
    (env, client, admin)
}

#[test]
fn mint_increases_balance_and_supply() {
    let (env, client, _admin) = setup();
    let alice = Address::generate(&env);

    client.mint(&alice, &5);

    assert_eq!(client.balance(&alice), 5);
    assert_eq!(client.total_supply(), 5);
}

#[test]
fn multiple_mints_accumulate() {
    let (env, client, _admin) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    client.mint(&alice, &3);
    client.mint(&bob, &7);
    client.mint(&alice, &2);

    assert_eq!(client.balance(&alice), 5);
    assert_eq!(client.balance(&bob), 7);
    assert_eq!(client.total_supply(), 12);
}

#[test]
fn burn_decreases_balance_and_supply() {
    let (env, client, _admin) = setup();
    let alice = Address::generate(&env);

    client.mint(&alice, &10);
    client.burn(&alice, &4);

    assert_eq!(client.balance(&alice), 6);
    assert_eq!(client.total_supply(), 6);
}

#[test]
fn burn_more_than_balance_returns_error() {
    let (env, client, _admin) = setup();
    let alice = Address::generate(&env);

    client.mint(&alice, &3);
    let result = client.try_burn(&alice, &5);
    assert!(matches!(result, Err(Ok(Error::InsufficientBalance))));
}

#[test]
fn negative_mint_returns_error() {
    let (env, client, _admin) = setup();
    let alice = Address::generate(&env);

    let result = client.try_mint(&alice, &-1);
    assert!(matches!(result, Err(Ok(Error::InvalidAmount))));
}

#[test]
fn metadata_is_correct() {
    let (env, client, _admin) = setup();
    assert_eq!(client.name(), String::from_str(&env, "Vault LP Shares"));
    assert_eq!(client.symbol(), String::from_str(&env, "vLP"));
    assert_eq!(client.decimals(), 7);
}

#[test]
fn admin_can_be_transferred() {
    let (env, client, admin) = setup();
    let new_admin = Address::generate(&env);

    client.set_admin(&new_admin);

    assert_eq!(client.admin(), new_admin);
    assert_ne!(client.admin(), admin);
}
