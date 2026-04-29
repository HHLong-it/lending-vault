#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype,
    symbol_short, token, Address, Env,
};

const LTV_NUM: i128 = 100;
const LTV_DEN: i128 = 110;
const APR_BPS: i128 = 500;
const BPS_DEN: i128 = 10_000;
const SECONDS_PER_YEAR: i128 = 31_536_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AmountMustBePositive = 1,
    NotInitialized = 2,
    InsufficientCollateral = 3,
    LoanAlreadyOpen = 4,
    NoOpenLoan = 5,
    NotPastDeadline = 6,
    InsufficientLiquidity = 7,
    PoolEmpty = 8,
    DeadlinePassed = 9,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    LpShares,
    Xlm,
    TotalXlm,
    BorrowedXlm,
    Loan(Address),
}

fn xlm_client(env: &Env) -> Result<token::Client<'_>, Error> {
    let addr: Address = env
        .storage()
        .instance()
        .get(&DataKey::Xlm)
        .ok_or(Error::NotInitialized)?;
    Ok(token::Client::new(env, &addr))
}

#[contracttype]
#[derive(Clone)]
pub struct Loan {
    pub principal: i128,
    pub collateral: i128,
    pub opened_at: u64,
    pub deadline: u64,
}

#[contractclient(name = "LpClient")]
pub trait LpInterface {
    fn mint(env: Env, to: Address, amount: i128);
    fn burn(env: Env, from: Address, amount: i128);
    fn balance(env: Env, who: Address) -> i128;
    fn total_supply(env: Env) -> i128;
}

#[contract]
pub struct Vault;

#[contractimpl]
impl Vault {
    pub fn __constructor(env: Env, lp_shares: Address, xlm: Address) {
        env.storage().instance().set(&DataKey::LpShares, &lp_shares);
        env.storage().instance().set(&DataKey::Xlm, &xlm);
        env.storage().instance().set(&DataKey::TotalXlm, &0_i128);
        env.storage().instance().set(&DataKey::BorrowedXlm, &0_i128);
    }

    pub fn deposit(env: Env, lender: Address, amount: i128) -> Result<i128, Error> {
        lender.require_auth();
        if amount <= 0 {
            return Err(Error::AmountMustBePositive);
        }

        let total_xlm: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalXlm)
            .unwrap_or(0);
        let lp = lp_client(&env)?;
        let total_shares = lp.total_supply();

        let shares_out = if total_xlm == 0 || total_shares == 0 {
            amount
        } else {
            amount * total_shares / total_xlm
        };

        let xlm = xlm_client(&env)?;
        xlm.transfer(&lender, &env.current_contract_address(), &amount);

        env.storage()
            .instance()
            .set(&DataKey::TotalXlm, &(total_xlm + amount));
        lp.mint(&lender, &shares_out);

        env.events()
            .publish((symbol_short!("deposit"), lender), (amount, shares_out));
        Ok(shares_out)
    }

    pub fn withdraw(env: Env, lender: Address, shares: i128) -> Result<i128, Error> {
        lender.require_auth();
        if shares <= 0 {
            return Err(Error::AmountMustBePositive);
        }

        let total_xlm: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalXlm)
            .unwrap_or(0);
        let lp = lp_client(&env)?;
        let total_shares = lp.total_supply();

        if total_shares == 0 {
            return Err(Error::PoolEmpty);
        }

        let xlm_out = shares * total_xlm / total_shares;
        let borrowed: i128 = env
            .storage()
            .instance()
            .get(&DataKey::BorrowedXlm)
            .unwrap_or(0);
        let available = total_xlm - borrowed;
        if xlm_out > available {
            return Err(Error::InsufficientLiquidity);
        }

        lp.burn(&lender, &shares);
        env.storage()
            .instance()
            .set(&DataKey::TotalXlm, &(total_xlm - xlm_out));

        let xlm = xlm_client(&env)?;
        xlm.transfer(&env.current_contract_address(), &lender, &xlm_out);

        env.events()
            .publish((symbol_short!("withdraw"), lender), (shares, xlm_out));
        Ok(xlm_out)
    }

    pub fn borrow(
        env: Env,
        borrower: Address,
        principal: i128,
        collateral: i128,
        duration_seconds: u64,
    ) -> Result<u64, Error> {
        borrower.require_auth();
        if principal <= 0 || collateral <= 0 {
            return Err(Error::AmountMustBePositive);
        }
        if env
            .storage()
            .persistent()
            .has(&DataKey::Loan(borrower.clone()))
        {
            return Err(Error::LoanAlreadyOpen);
        }

        if collateral * LTV_NUM < principal * LTV_DEN {
            return Err(Error::InsufficientCollateral);
        }

        let total_xlm: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalXlm)
            .unwrap_or(0);
        let borrowed: i128 = env
            .storage()
            .instance()
            .get(&DataKey::BorrowedXlm)
            .unwrap_or(0);
        if borrowed + principal > total_xlm {
            return Err(Error::InsufficientLiquidity);
        }

        let now = env.ledger().timestamp();
        let deadline = now + duration_seconds;
        let loan = Loan {
            principal,
            collateral,
            opened_at: now,
            deadline,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Loan(borrower.clone()), &loan);
        env.storage()
            .instance()
            .set(&DataKey::BorrowedXlm, &(borrowed + principal));

        // collateral in, principal out
        let xlm = xlm_client(&env)?;
        xlm.transfer(&borrower, &env.current_contract_address(), &collateral);
        xlm.transfer(&env.current_contract_address(), &borrower, &principal);

        env.events().publish(
            (symbol_short!("borrow"), borrower),
            (principal, collateral, deadline),
        );
        Ok(deadline)
    }

    pub fn repay(env: Env, borrower: Address) -> Result<i128, Error> {
        borrower.require_auth();
        let key = DataKey::Loan(borrower.clone());
        let loan: Loan = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NoOpenLoan)?;

        if env.ledger().timestamp() >= loan.deadline {
            return Err(Error::DeadlinePassed);
        }

        let interest = accrued_interest(&env, &loan);
        env.storage().persistent().remove(&key);

        let borrowed: i128 = env
            .storage()
            .instance()
            .get(&DataKey::BorrowedXlm)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::BorrowedXlm, &(borrowed - loan.principal));
        let total_xlm: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalXlm)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalXlm, &(total_xlm + interest));

        // borrower repays principal + interest, collateral returns
        let xlm = xlm_client(&env)?;
        let owed = loan.principal + interest;
        xlm.transfer(&borrower, &env.current_contract_address(), &owed);
        xlm.transfer(&env.current_contract_address(), &borrower, &loan.collateral);

        env.events().publish(
            (symbol_short!("repay"), borrower),
            (loan.principal, interest),
        );
        Ok(interest)
    }

    pub fn liquidate(
        env: Env,
        liquidator: Address,
        borrower: Address,
    ) -> Result<i128, Error> {
        liquidator.require_auth();
        let key = DataKey::Loan(borrower.clone());
        let loan: Loan = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NoOpenLoan)?;

        let now = env.ledger().timestamp();
        if now < loan.deadline {
            return Err(Error::NotPastDeadline);
        }

        let interest = accrued_interest(&env, &loan);
        let debt = loan.principal + interest;
        env.storage().persistent().remove(&key);

        let borrowed: i128 = env
            .storage()
            .instance()
            .get(&DataKey::BorrowedXlm)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::BorrowedXlm, &(borrowed - loan.principal));
        let total_xlm: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalXlm)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalXlm, &(total_xlm + interest));

        // liquidator pays the debt to settle the loan, claims the collateral
        let xlm = xlm_client(&env)?;
        xlm.transfer(&liquidator, &env.current_contract_address(), &debt);
        xlm.transfer(&env.current_contract_address(), &liquidator, &loan.collateral);

        env.events().publish(
            (symbol_short!("liquidate"), liquidator, borrower),
            (loan.collateral, debt),
        );
        Ok(loan.collateral)
    }

    pub fn pool_state(env: Env) -> (i128, i128) {
        let total: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalXlm)
            .unwrap_or(0);
        let borrowed: i128 = env
            .storage()
            .instance()
            .get(&DataKey::BorrowedXlm)
            .unwrap_or(0);
        (total, borrowed)
    }

    pub fn loan_of(env: Env, borrower: Address) -> Option<Loan> {
        env.storage().persistent().get(&DataKey::Loan(borrower))
    }

    pub fn debt_of(env: Env, borrower: Address) -> i128 {
        match env
            .storage()
            .persistent()
            .get::<_, Loan>(&DataKey::Loan(borrower))
        {
            Some(loan) => loan.principal + accrued_interest(&env, &loan),
            None => 0,
        }
    }

    pub fn lp_contract(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::LpShares)
            .ok_or(Error::NotInitialized)
    }

    pub fn xlm_contract(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Xlm)
            .ok_or(Error::NotInitialized)
    }
}

fn lp_client<'a>(env: &Env) -> Result<LpClient<'a>, Error> {
    let addr: Address = env
        .storage()
        .instance()
        .get(&DataKey::LpShares)
        .ok_or(Error::NotInitialized)?;
    Ok(LpClient::new(env, &addr))
}

// interest stops accruing at the deadline. once a loan is past due the debt is
// pinned, which keeps liquidate's `transfer` args stable between simulation and
// submission so soroban auth doesn't mismatch.
fn accrued_interest(env: &Env, loan: &Loan) -> i128 {
    let now = env.ledger().timestamp();
    let cap = if now < loan.deadline { now } else { loan.deadline };
    let elapsed = cap.saturating_sub(loan.opened_at) as i128;
    loan.principal * APR_BPS * elapsed / (BPS_DEN * SECONDS_PER_YEAR)
}

#[cfg(test)]
mod test;
