#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short,
    Address, Env, String,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    InvalidAmount = 2,
    InsufficientBalance = 3,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Balance(Address),
    TotalSupply,
}

const NAME: &str = "Vault LP Shares";
const SYMBOL: &str = "vLP";

// LP shares minted by the lending vault. The vault is the only admin, so
// only the vault can mint (on deposit) and burn (on withdraw). Holders can
// transfer shares freely - that's a feature, not a constraint, for an LP token.
#[contract]
pub struct ReceiptToken;

#[contractimpl]
impl ReceiptToken {
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn mint(env: Env, to: Address, amount: i128) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let key = DataKey::Balance(to.clone());
        let prev: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(prev + amount));

        let total: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::TotalSupply, &(total + amount));

        env.events().publish((symbol_short!("mint"),), (to, amount));
        Ok(())
    }

    pub fn burn(env: Env, from: Address, amount: i128) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let key = DataKey::Balance(from.clone());
        let prev: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if prev < amount {
            return Err(Error::InsufficientBalance);
        }
        env.storage().persistent().set(&key, &(prev - amount));

        let total: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::TotalSupply, &(total - amount));

        env.events().publish((symbol_short!("burn"),), (from, amount));
        Ok(())
    }

    pub fn balance(env: Env, of: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(of))
            .unwrap_or(0)
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0)
    }

    pub fn decimals(_env: Env) -> u32 {
        7
    }

    pub fn name(env: Env) -> String {
        String::from_str(&env, NAME)
    }

    pub fn symbol(env: Env) -> String {
        String::from_str(&env, SYMBOL)
    }

    pub fn admin(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }

    pub fn set_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        Ok(())
    }
}

#[cfg(test)]
mod test;
