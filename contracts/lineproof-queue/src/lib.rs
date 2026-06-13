use soroban_sdk::{contractimpl, contracttype, Address, Env, Symbol, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum QueueStatus {
    Draft,
    EnrollmentOpen,
    EnrollmentClosed,
    AdvancementActive,
    Closed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QueueConfig {
    pub slug: Symbol,
    pub name: Symbol,
    pub admin: Address,
    pub max_positions: u32,
    pub enrollment_open: u64,
    pub enrollment_close: u64,
    pub status: QueueStatus,
    pub version: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Position {
    pub position_id: u32,
    pub enrolled_at: u64,
    pub identity: Address,
    pub status: PositionStatus,
    pub advanced_at: Option<u64>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[contracttype]
pub enum PositionStatus {
    Pending,
    Advanced,
    Expired,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QueueEvent {
    pub kind: Symbol,
    pub position_id: u32,
    pub identity: Address,
    pub timestamp: u64,
}

#[contract]
pub trait Queue {
    fn initialize(env: Env, admin: Address, config: QueueConfig);
    fn open_enrollment(env: Env, admin: Address);
    fn close_enrollment(env: Env, admin: Address);
    fn advance(env: Env, admin: Address, batch_size: u32) -> Vec<u32>;
    fn get_position(env: Env, position_id: u32) -> Option<Position>;
    fn get_config(env: Env) -> QueueConfig;
    fn current_position_index(env: Env) -> u32;
    fn close(env: Env, admin: Address);
}

pub struct QueueImpl;

#[contractimpl]
impl Queue for QueueImpl {
    fn initialize(env: Env, admin: Address, config: QueueConfig) {
        admin.require_auth();
        let key_config = Symbol::new(&env, "config");
        env.storage().persistent().set(&key_config, &config);
        env.storage().persistent().set(&Symbol::new(&env, "next_id"), &1u32);
        let key_idx = Symbol::new(&env, "idx");
        env.storage().persistent().set(&key_idx, &0u32);
        emit(&env, Symbol::new(&env, "Initialized"), 0, &admin, 0);
    }

    fn open_enrollment(env: Env, admin: Address) {
        admin.require_auth();
        let mut config = Self::get_config_internal(&env);
        if matches!(config.status, QueueStatus::EnrollmentOpen) {
            panic!("already open");
        }
        config.status = QueueStatus::EnrollmentOpen;
        env.storage().persistent().set(&Symbol::new(&env, "config"), &config);
        emit(&env, Symbol::new(&env, "EnrollmentOpened"), 0, &admin, env.ledger().timestamp());
    }

    fn close_enrollment(env: Env, admin: Address) {
        admin.require_auth();
        let mut config = Self::get_config_internal(&env);
        config.status = QueueStatus::EnrollmentClosed;
        env.storage().persistent().set(&Symbol::new(&env, "config"), &config);
        emit(&env, Symbol::new(&env, "EnrollmentClosed"), 0, &admin, env.ledger().timestamp());
    }

    fn advance(env: Env, admin: Address, batch_size: u32) -> Vec<u32> {
        admin.require_auth();
        let mut config = Self::get_config_internal(&env);
        config.status = QueueStatus::AdvancementActive;
        env.storage().persistent().set(&Symbol::new(&env, "config"), &config);

        let mut advanced: Vec<u32> = Vec::new(&env);
        let mut idx: u32 = env.storage()
            .persistent()
            .get(&Symbol::new(&env, "idx"))
            .unwrap_or(0);

        for _ in 0..batch_size {
            if idx >= config.max_positions {
                break;
            }
            let id = idx + 1;
            if let Some(mut pos) = Self::get_position(&env, id) {
                pos.status = PositionStatus::Advanced;
                pos.advanced_at = Some(env.ledger().timestamp());
                let key_pos = Self::position_key(&env, id);
                env.storage().persistent().set(&key_pos, &pos);
                advanced.push_back(id);
                idx += 1;
            }
        }
        env.storage().persistent().set(&Symbol::new(&env, "idx"), &idx);
        config.status = QueueStatus::EnrollmentClosed;
        env.storage().persistent().set(&Symbol::new(&env, "config"), &config);
        for id in advanced.iter() {
            emit(&env, Symbol::new(&env, "Advanced"), *id, &admin, env.ledger().timestamp());
        }
        advanced
    }

    fn get_position(env: Env, position_id: u32) -> Option<Position> {
        if position_id == 0 {
            return None;
        }
        Some(Self::load_position(&env, position_id))
    }

    fn get_config(env: Env) -> QueueConfig {
        Self::get_config_internal(&env)
    }

    fn current_position_index(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&Symbol::new(&env, "idx"))
            .unwrap_or(0)
    }

    fn close(env: Env, admin: Address) {
        admin.require_auth();
        let mut config = Self::get_config_internal(&env);
        config.status = QueueStatus::Closed;
        env.storage().persistent().set(&Symbol::new(&env, "config"), &config);
        emit(&env, Symbol::new(&env, "QueueClosed"), 0, &admin, env.ledger().timestamp());
    }
}

impl QueueImpl {
    fn get_config_internal(env: &Env) -> QueueConfig {
        env.storage()
            .persistent()
            .get(&Symbol::new(env, "config"))
            .unwrap_or_else(|| panic!("queue not initialized"))
    }

    fn load_position(env: &Env, id: u32) -> Position {
        let key = Self::position_key(env, id);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("position not found"))
    }

    fn position_key(env: &Env, id: u32) -> (Symbol, u32) {
        (Symbol::new(env, "pos"), id)
    }
}

fn emit(env: &Env, kind: Symbol, position_id: u32, identity: &Address, timestamp: u64) {
    env.events().publish((
        Symbol::new(env, "lineproof.queue"),
        kind,
        position_id,
    ));
}

mod test;
