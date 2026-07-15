#![no_std]
use soroban_sdk::{contract, contractclient, contractimpl, contracttype, Address, BytesN, Env, Symbol, Vec};

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

#[contractclient(name = "QueueClient")]
pub trait Queue {
    fn initialize(env: Env, admin: Address, config: QueueConfig);
    fn open_enrollment(env: Env, admin: Address);
    fn close_enrollment(env: Env, admin: Address);
    fn enroll_position(env: Env, identity: Address) -> u32;
    fn cancel_position(env: Env, identity: Address, position_id: u32);
    fn advance(env: Env, admin: Address, batch_size: u32) -> Vec<u32>;
    fn get_position(env: Env, position_id: u32) -> Option<Position>;
    fn get_config(env: Env) -> QueueConfig;
    fn current_position_index(env: Env) -> u32;
    fn total_enrolled(env: Env) -> u32;
    fn close(env: Env, admin: Address);
    fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>);
}

#[contract]
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
        emit(
            &env,
            Symbol::new(&env, "EnrollmentOpened"),
            0,
            &admin,
            env.ledger().timestamp(),
        );
    }

    fn close_enrollment(env: Env, admin: Address) {
        admin.require_auth();
        let mut config = Self::get_config_internal(&env);
        config.status = QueueStatus::EnrollmentClosed;
        env.storage().persistent().set(&Symbol::new(&env, "config"), &config);
        emit(
            &env,
            Symbol::new(&env, "EnrollmentClosed"),
            0,
            &admin,
            env.ledger().timestamp(),
        );
    }

    fn enroll_position(env: Env, identity: Address) -> u32 {
        identity.require_auth();
        let config = Self::get_config_internal(&env);
        if !matches!(config.status, QueueStatus::EnrollmentOpen) {
            panic!("enrollment is not open");
        }
        let next_id_key = Symbol::new(&env, "next_id");
        let next_id: u32 = env.storage().persistent().get(&next_id_key).unwrap_or(1);
        if next_id > config.max_positions {
            panic!("queue is full");
        }
        let pos = Position {
            position_id: next_id,
            enrolled_at: env.ledger().timestamp(),
            identity: identity.clone(),
            status: PositionStatus::Pending,
            advanced_at: None,
        };
        let key_pos = Self::position_key(&env, next_id);
        env.storage().persistent().set(&key_pos, &pos);
        env.storage().persistent().set(&next_id_key, &(next_id + 1));
        emit(
            &env,
            Symbol::new(&env, "Enrolled"),
            next_id,
            &identity,
            env.ledger().timestamp(),
        );
        next_id
    }

    fn cancel_position(env: Env, identity: Address, position_id: u32) {
        identity.require_auth();
        let mut pos = Self::load_position(&env, position_id);
        if pos.identity != identity {
            panic!("not your position");
        }
        if !matches!(pos.status, PositionStatus::Pending) {
            panic!("only pending positions can be cancelled");
        }
        pos.status = PositionStatus::Cancelled;
        let key_pos = Self::position_key(&env, position_id);
        env.storage().persistent().set(&key_pos, &pos);
        emit(
            &env,
            Symbol::new(&env, "Cancelled"),
            position_id,
            &identity,
            env.ledger().timestamp(),
        );
    }

    fn advance(env: Env, admin: Address, batch_size: u32) -> Vec<u32> {
        admin.require_auth();
        let mut config = Self::get_config_internal(&env);
        if !matches!(config.status, QueueStatus::EnrollmentClosed) {
            panic!("enrollment must be closed before advancing");
        }
        config.status = QueueStatus::AdvancementActive;
        env.storage().persistent().set(&Symbol::new(&env, "config"), &config);

        let mut advanced: Vec<u32> = Vec::new(&env);
        let mut idx: u32 = env.storage().persistent().get(&Symbol::new(&env, "idx")).unwrap_or(0);

        for _ in 0..batch_size {
            if idx >= config.max_positions {
                break;
            }
            let id = idx + 1;
            if let Some(mut pos) = Self::get_position(env.clone(), id) {
                if matches!(pos.status, PositionStatus::Pending) {
                    pos.status = PositionStatus::Advanced;
                    pos.advanced_at = Some(env.ledger().timestamp());
                    let key_pos = Self::position_key(&env, id);
                    env.storage().persistent().set(&key_pos, &pos);
                    advanced.push_back(id);
                }
                idx += 1;
            } else {
                break;
            }
        }
        env.storage().persistent().set(&Symbol::new(&env, "idx"), &idx);
        // Remain in AdvancementActive so callers can issue further advance() batches
        for id in advanced.iter() {
            emit(
                &env,
                Symbol::new(&env, "Advanced"),
                id,
                &admin,
                env.ledger().timestamp(),
            );
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
        env.storage().persistent().get(&Symbol::new(&env, "idx")).unwrap_or(0)
    }

    fn total_enrolled(env: Env) -> u32 {
        let next_id: u32 = env
            .storage()
            .persistent()
            .get(&Symbol::new(&env, "next_id"))
            .unwrap_or(1);
        if next_id == 0 {
            0
        } else {
            next_id - 1
        }
    }

    fn close(env: Env, admin: Address) {
        admin.require_auth();
        let mut config = Self::get_config_internal(&env);
        config.status = QueueStatus::Closed;
        env.storage().persistent().set(&Symbol::new(&env, "config"), &config);
        emit(
            &env,
            Symbol::new(&env, "QueueClosed"),
            0,
            &admin,
            env.ledger().timestamp(),
        );
    }

    fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) {
        admin.require_auth();
        let config = Self::get_config_internal(&env);
        if config.admin != admin {
            panic!("not admin");
        }
        env.deployer().update_current_contract_wasm(new_wasm_hash);
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

fn emit(env: &Env, kind: Symbol, position_id: u32, _identity: &Address, _timestamp: u64) {
    env.events()
        .publish((Symbol::new(env, "lineproof.queue"), kind, position_id), ());
}

#[cfg(test)]
mod test;
