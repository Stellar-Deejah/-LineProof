use soroban_sdk::{contractimpl, contracttype, Address, Env, Symbol, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    Active,
    Released,
    Refunded,
    Expired,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowRecord {
    pub queue_id: Symbol,
    pub identity: Address,
    pub amount: i128,
    pub asset: Address,
    pub status: EscrowStatus,
    pub created_at: u64,
    pub expires_at: u64,
    pub released_at: Option<u64>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowConfig {
    pub queue_id: Symbol,
    pub min_deposit: i128,
    pub max_deposit: i128,
    pub hold_period_days: u64,
    pub admin: Address,
}

#[contract]
pub trait Escrow {
    fn deposit(env: Env, caller: Address, queue_id: Symbol, amount: i128, asset: Address);
    fn release(env: Env, admin: Address, identity: Address, queue_id: Symbol);
    fn refund(env: Env, admin: Address, identity: Address, queue_id: Symbol);
    fn expire(env: Env, identity: Address, queue_id: Symbol);
    fn get_record(env: Env, identity: Address, queue_id: Symbol) -> Option<EscrowRecord>;
    fn get_config(env: Env, queue_id: Symbol) -> EscrowConfig;
    fn set_config(env: Env, admin: Address, config: EscrowConfig);
}

pub struct EscrowImpl;

#[contractimpl]
impl Escrow for EscrowImpl {
    fn deposit(env: Env, caller: Address, queue_id: Symbol, amount: i128, asset: Address) {
        caller.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }
        let key = Self::record_key(&env, &caller, &queue_id);
        if env.storage().persistent().has(&key) {
            panic!("existing escrow record");
        }
        let created_at = env.ledger().timestamp();
        let config_key = Symbol::new(&env, "config");
        let config: EscrowConfig = env.storage().persistent().get(&config_key).unwrap_or(EscrowConfig {
            queue_id: queue_id.clone(),
            min_deposit: 0,
            max_deposit: i128::MAX,
            hold_period_days: 30,
        });
        if amount < config.min_deposit || amount > config.max_deposit {
            panic!("amount outside configured bounds");
        }
        let record = EscrowRecord {
            queue_id: queue_id.clone(),
            identity: caller.clone(),
            amount,
            asset,
            status: EscrowStatus::Active,
            created_at,
            expires_at: created_at + (config.hold_period_days * 86400),
            released_at: None,
        };
        env.storage().persistent().set(&key, &record);
        emit(&env, Symbol::new(&env, "Deposited"), queue_id, &caller, amount);
    }

    fn release(env: Env, admin: Address, identity: Address, queue_id: Symbol) {
        admin.require_auth();
        let mut record = Self::load_record(&env, &identity, &queue_id);
        if !matches!(record.status, EscrowStatus::Active) {
            panic!("escrow not active");
        }
        record.status = EscrowStatus::Released;
        record.released_at = Some(env.ledger().timestamp());
        let key = Self::record_key(&env, &identity, &queue_id);
        env.storage().persistent().set(&key, &record);
        emit(&env, Symbol::new(&env, "Released"), queue_id, &identity, record.amount);
    }

    fn refund(env: Env, admin: Address, identity: Address, queue_id: Symbol) {
        admin.require_auth();
        let mut record = Self::load_record(&env, &identity, &queue_id);
        if !matches!(record.status, EscrowStatus::Active) {
            panic!("escrow not active");
        }
        record.status = EscrowStatus::Refunded;
        record.released_at = Some(env.ledger().timestamp());
        let key = Self::record_key(&env, &identity, &queue_id);
        env.storage().persistent().set(&key, &record);
        emit(&env, Symbol::new(&env, "Refunded"), queue_id, &identity, record.amount);
    }

    fn expire(env: Env, identity: Address, queue_id: Symbol) {
        let mut record = Self::load_record(&env, &identity, &queue_id);
        if env.ledger().timestamp() < record.expires_at {
            panic!("not expired");
        }
        if !matches!(record.status, EscrowStatus::Active) {
            panic!("escrow not active");
        }
        record.status = EscrowStatus::Expired;
        record.released_at = Some(env.ledger().timestamp());
        let key = Self::record_key(&env, &identity, &queue_id);
        env.storage().persistent().set(&key, &record);
        emit(&env, Symbol::new(&env, "Expired"), queue_id, &identity, record.amount);
    }

    fn get_record(env: Env, identity: Address, queue_id: Symbol) -> Option<EscrowRecord> {
        let key = Self::record_key(&env, &identity, &queue_id);
        if env.storage().persistent().has(&key) {
            Some(Self::load_record(&env, &identity, &queue_id))
        } else {
            None
        }
    }

    fn get_config(env: Env, queue_id: Symbol) -> EscrowConfig {
        let key = Self::config_key(&env, &queue_id);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or(EscrowConfig {
                queue_id,
                min_deposit: 0,
                max_deposit: i128::MAX,
                hold_period_days: 30,
            })
    }

    fn set_config(env: Env, admin: Address, config: EscrowConfig) {
        admin.require_auth();
        let key = Self::config_key(&env, &config.queue_id);
        env.storage().persistent().set(&key, &config);
    }
}

impl EscrowImpl {
    fn load_record(env: &Env, identity: &Address, queue_id: &Symbol) -> EscrowRecord {
        let key = Self::record_key(env, identity, queue_id);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("escrow record not found"))
    }

    fn record_key(env: &Env, identity: &Address, queue_id: &Symbol) -> (Symbol, Symbol, Address) {
        (Symbol::new(env, "escrow"), queue_id.clone(), identity.clone())
    }

    fn config_key(env: &Env, queue_id: &Symbol) -> (Symbol, Symbol) {
        (Symbol::new(env, "escrow_config"), queue_id.clone())
    }
}

fn emit(env: &Env, kind: Symbol, queue_id: Symbol, identity: &Address, amount: i128) {
    env.events().publish((
        Symbol::new(env, "lineproof.escrow"),
        kind,
        queue_id,
    ));
}

mod test;
