use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, Symbol, Vec};

/// TTL threshold: renew if remaining TTL is below this many ledgers (~13.8 hours at 5s/ledger)
const TTL_THRESHOLD: u32 = 10_000;
/// TTL extension target: extend to this many ledgers (~1 year at 5s/ledger)
const TTL_EXTEND_TO: u32 = 6_307_200;
/// Current version of the queue contract - stored in instance storage
const CURRENT_VERSION: u32 = 1;
/// Storage key for the contract version
const VERSION_KEY: &str = "version";

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AdvancementRule {
    Fifo,
    PriorityTier,
    VerifiableRandomness,
}

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
    pub advancement_rule: AdvancementRule,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Position {
    pub position_id: u32,
    pub enrolled_at: u64,
    pub identity: Address,
    pub status: PositionStatus,
    pub advanced_at: Option<u64>,
    pub priority_weight: Option<u32>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[contracttype]
pub enum PositionStatus {
    Pending,
    Advanced,
    Expired,
    Cancelled,
}

pub trait Queue {
    fn initialize(env: Env, admin: Address, config: QueueConfig);
    fn propose_admin(env: Env, current_admin: Address, proposed_admin: Address);
    fn accept_admin(env: Env, proposed_admin: Address);
    fn open_enrollment(env: Env, admin: Address);
    fn close_enrollment(env: Env, admin: Address);
    fn enroll_position(env: Env, identity: Address) -> u32;
    fn cancel_position(env: Env, identity: Address, position_id: u32);
    fn advance(env: Env, admin: Address, batch_size: u32) -> Vec<u32>;
    fn get_position(env: Env, position_id: u32) -> Option<Position>;
    fn get_config(env: Env) -> QueueConfig;
    fn current_position_index(env: Env) -> u32;
    fn total_enrolled(env: Env) -> u32;
    fn expire_position(env: Env, admin: Address, position_id: u32);
    fn expire_positions_batch(env: Env, admin: Address, position_ids: Vec<u32>);
    fn close(env: Env, admin: Address);
    fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>);
    fn migrate(env: Env, admin: Address, from_version: u32, to_version: u32);
}

#[contract]
pub struct QueueImpl;

#[contractimpl]
impl QueueImpl {
    pub fn initialize(env: Env, admin: Address, config: QueueConfig) {
        admin.require_auth();
        if config.admin != admin {
            panic!("not_admin");
        }
        let key_config = Symbol::new(&env, "config");
        env.storage().persistent().set(&key_config, &config);
        env.storage()
            .persistent()
            .extend_ttl(&key_config, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage().persistent().set(&Symbol::new(&env, "next_id"), &1u32);
        env.storage()
            .persistent()
            .extend_ttl(&Symbol::new(&env, "next_id"), TTL_THRESHOLD, TTL_EXTEND_TO);
        let key_idx = Symbol::new(&env, "idx");
        env.storage().persistent().set(&key_idx, &0u32);
        env.storage()
            .persistent()
            .extend_ttl(&key_idx, TTL_THRESHOLD, TTL_EXTEND_TO);
        // Store the current version for tracking upgrades
        let version_key = Symbol::new(&env, VERSION_KEY);
        env.storage().persistent().set(&version_key, &CURRENT_VERSION);
        env.storage()
            .persistent()
            .extend_ttl(&version_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .persistent()
            .extend_ttl(&env.current_contract_address(), TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .persistent()
            .extend_ttl(&key_idx, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        emit(&env, Symbol::new(&env, "Initialized"), 0, &admin, 0);
    }

    pub fn propose_admin(env: Env, current_admin: Address, proposed_admin: Address) {
        let config = Self::get_config_internal(&env);
        Self::require_admin(&config, &current_admin);
        let key = Symbol::new(&env, "pending_admin");
        env.storage().persistent().set(&key, &proposed_admin);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    pub fn accept_admin(env: Env, proposed_admin: Address) {
        proposed_admin.require_auth();
        let pending_key = Symbol::new(&env, "pending_admin");
        let pending: Address = env
            .storage()
            .persistent()
            .get(&pending_key)
            .unwrap_or_else(|| panic!("not_pending_admin"));
        if pending != proposed_admin {
            panic!("not_pending_admin");
        }

        let mut config = Self::get_config_internal(&env);
        let previous_admin = config.admin;
        config.admin = proposed_admin.clone();
        let config_key = Symbol::new(&env, "config");
        env.storage().persistent().set(&config_key, &config);
        env.storage()
            .persistent()
            .extend_ttl(&config_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage().persistent().remove(&pending_key);
        env.events().publish(
            (
                soroban_sdk::String::from_str(&env, "lineproof.queue"),
                Symbol::new(&env, "OwnershipTransferred"),
                previous_admin,
                proposed_admin,
            ),
            (),
        );
    }

    pub fn open_enrollment(env: Env, admin: Address) {
        let mut config = Self::get_config_internal(&env);
        Self::require_admin(&config, &admin);
        if matches!(config.status, QueueStatus::Closed) {
            panic!("queue is closed");
        }
        if matches!(config.status, QueueStatus::EnrollmentOpen) {
            panic!("already open");
        }
        config.status = QueueStatus::EnrollmentOpen;
        let key_config = Symbol::new(&env, "config");
        env.storage().persistent().set(&key_config, &config);
        env.storage()
            .persistent()
            .extend_ttl(&key_config, TTL_THRESHOLD, TTL_EXTEND_TO);
        emit(
            &env,
            Symbol::new(&env, "EnrollmentOpened"),
            0,
            &admin,
            env.ledger().timestamp(),
        );
    }

    pub fn close_enrollment(env: Env, admin: Address) {
        let mut config = Self::get_config_internal(&env);
        Self::require_admin(&config, &admin);
        if matches!(config.status, QueueStatus::Closed) {
            panic!("queue is closed");
        }
        config.status = QueueStatus::EnrollmentClosed;
        let key_config = Symbol::new(&env, "config");
        env.storage().persistent().set(&key_config, &config);
        env.storage()
            .persistent()
            .extend_ttl(&key_config, TTL_THRESHOLD, TTL_EXTEND_TO);
        emit(
            &env,
            Symbol::new(&env, "EnrollmentClosed"),
            0,
            &admin,
            env.ledger().timestamp(),
        );
    }

    pub fn enroll_position(env: Env, identity: Address) -> u32 {
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
            priority_weight: None,
        };
        let key_pos = Self::position_key(&env, next_id);
        env.storage().persistent().set(&key_pos, &pos);
        env.storage()
            .persistent()
            .extend_ttl(&key_pos, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage().persistent().set(&next_id_key, &(next_id + 1));
        env.storage()
            .persistent()
            .extend_ttl(&next_id_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        emit(
            &env,
            Symbol::new(&env, "Enrolled"),
            next_id,
            &identity,
            env.ledger().timestamp(),
        );
        next_id
    }

    pub fn cancel_position(env: Env, identity: Address, position_id: u32) {
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
        env.storage()
            .persistent()
            .extend_ttl(&key_pos, TTL_THRESHOLD, TTL_EXTEND_TO);
        emit(
            &env,
            Symbol::new(&env, "Cancelled"),
            position_id,
            &identity,
            env.ledger().timestamp(),
        );
    }

    pub fn advance(env: Env, admin: Address, batch_size: u32) -> Vec<u32> {
        let mut config = Self::get_config_internal(&env);
        Self::require_admin(&config, &admin);
        if matches!(config.status, QueueStatus::Closed) {
            panic!("queue is closed");
        }
        // Allow advance from both EnrollmentClosed (first call) and AdvancementActive (subsequent calls)
        if !matches!(
            config.status,
            QueueStatus::EnrollmentClosed | QueueStatus::AdvancementActive
        ) {
            panic!("enrollment must be closed before advancing");
        }

        match config.advancement_rule {
            AdvancementRule::Fifo => {
                let mut advanced: Vec<u32> = Vec::new(&env);
                let mut skipped: Vec<u32> = Vec::new(&env);
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
                            env.storage()
                                .persistent()
                                .extend_ttl(&key_pos, TTL_THRESHOLD, TTL_EXTEND_TO);
                            advanced.push_back(id);
                        } else if matches!(pos.status, PositionStatus::Cancelled) {
                            // Emit Skipped event for cancelled positions
                            emit(&env, Symbol::new(&env, "Skipped"), id, &admin, env.ledger().timestamp());
                            skipped.push_back(id);
                        }
                        idx += 1;
                    } else {
                        break;
                    }
                }
                env.storage().persistent().set(&Symbol::new(&env, "idx"), &idx);
                env.storage()
                    .persistent()
                    .extend_ttl(&Symbol::new(&env, "idx"), TTL_THRESHOLD, TTL_EXTEND_TO);

                // Only transition to AdvancementActive if at least one position was advanced
                if !advanced.is_empty() && matches!(config.status, QueueStatus::EnrollmentClosed) {
                    config.status = QueueStatus::AdvancementActive;
                    let key_config = Symbol::new(&env, "config");
                    env.storage().persistent().set(&key_config, &config);
                    env.storage()
                        .persistent()
                        .extend_ttl(&key_config, TTL_THRESHOLD, TTL_EXTEND_TO);
                }

                // Emit Advanced events for successfully advanced positions
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
            AdvancementRule::PriorityTier => {
                panic!("priority_tier_not_implemented");
            }
            AdvancementRule::VerifiableRandomness => {
                panic!("vrf_not_implemented");
            }
        }
    }

    pub fn get_position(env: Env, position_id: u32) -> Option<Position> {
        if position_id == 0 {
            return None;
        }
        let key = Self::position_key(&env, position_id);
        let pos: Option<Position> = env.storage().persistent().get(&key);
        if let Some(ref _pos) = pos {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        }
        pos
    }

    pub fn get_config(env: Env) -> QueueConfig {
        Self::get_config_internal(&env)
    }

    pub fn current_position_index(env: Env) -> u32 {
        env.storage().persistent().get(&Symbol::new(&env, "idx")).unwrap_or(0)
    }

    pub fn total_enrolled(env: Env) -> u32 {
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

    pub fn close(env: Env, admin: Address) {
        let mut config = Self::get_config_internal(&env);
        Self::require_admin(&config, &admin);
        config.status = QueueStatus::Closed;
        let key_config = Symbol::new(&env, "config");
        env.storage().persistent().set(&key_config, &config);
        env.storage()
            .persistent()
            .extend_ttl(&key_config, TTL_THRESHOLD, TTL_EXTEND_TO);
        emit(
            &env,
            Symbol::new(&env, "QueueClosed"),
            0,
            &admin,
            env.ledger().timestamp(),
        );
    }

    pub fn expire_position(env: Env, admin: Address, position_id: u32) {
        let config = Self::get_config_internal(&env);
        Self::require_admin(&config, &admin);
        if !matches!(config.status, QueueStatus::AdvancementActive) && !matches!(config.status, QueueStatus::Closed) {
            panic!("queue must be in advancement or closed state");
        }
        let mut pos = Self::load_position(&env, position_id);
        if !matches!(pos.status, PositionStatus::Pending) {
            panic!("only pending positions can be expired");
        }
        pos.status = PositionStatus::Expired;
        let key_pos = Self::position_key(&env, position_id);
        env.storage().persistent().set(&key_pos, &pos);
        env.storage()
            .persistent()
            .extend_ttl(&key_pos, TTL_THRESHOLD, TTL_EXTEND_TO);
        emit(
            &env,
            Symbol::new(&env, "Expired"),
            position_id,
            &admin,
            env.ledger().timestamp(),
        );
    }

    pub fn expire_positions_batch(env: Env, admin: Address, position_ids: Vec<u32>) {
        let config = Self::get_config_internal(&env);
        Self::require_admin(&config, &admin);
        if !matches!(config.status, QueueStatus::AdvancementActive) && !matches!(config.status, QueueStatus::Closed) {
            panic!("queue must be in advancement or closed state");
        }
        for position_id in position_ids.iter() {
            let mut pos = Self::load_position(&env, position_id);
            if !matches!(pos.status, PositionStatus::Pending) {
                panic!("only pending positions can be expired");
            }
            pos.status = PositionStatus::Expired;
            let key_pos = Self::position_key(&env, position_id);
            env.storage().persistent().set(&key_pos, &pos);
            env.storage()
                .persistent()
                .extend_ttl(&key_pos, TTL_THRESHOLD, TTL_EXTEND_TO);
            emit(
                &env,
                Symbol::new(&env, "Expired"),
                position_id,
                &admin,
                env.ledger().timestamp(),
            );
        }
    }

    pub fn upgrade(env: Env, admin: Address, _new_wasm_hash: BytesN<32>) {
        admin.require_auth();
        let config = Self::get_config_internal(&env);
        if config.admin != admin {
            panic!("unauthorized: only queue admin can upgrade");
        }
        // Note: The actual WASM upgrade is performed by the factory contract
        // using env.deployer().with_current_contract(&new_wasm_hash).upgrade(&contract_id).
        // This function serves as an authorization checkpoint and event beacon
        // that the contract version is being upgraded.
        emit(&env, Symbol::new(&env, "Upgraded"), 0, &admin, env.ledger().timestamp());
    }

    pub fn migrate(env: Env, admin: Address, from_version: u32, to_version: u32) {
        admin.require_auth();
        let config = Self::get_config_internal(&env);
        if config.admin != admin {
            panic!("unauthorized: only queue admin can migrate");
        }
        let version_key = Symbol::new(&env, VERSION_KEY);
        let stored_version: u32 = env.storage().persistent().get(&version_key).unwrap_or(CURRENT_VERSION);
        if stored_version != from_version {
            panic!("version mismatch: stored version does not match from_version");
        }
        // Validate version progression
        if to_version <= from_version {
            panic!("to_version must be greater than from_version");
        }
        // Apply version-specific migrations
        // This is a skeleton that can be extended with actual storage transformations
        // as the contract evolves in future versions.
        match (from_version, to_version) {
            // Example: (1, 2) would handle v1 -> v2 migration
            _ => {
                // No migration logic needed for current version transition
            }
        }
        // Update stored version
        env.storage().persistent().set(&version_key, &to_version);
        env.storage()
            .persistent()
            .extend_ttl(&version_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        emit(
            &env,
            Symbol::new(&env, "Migrated"),
            from_version,
            &admin,
            to_version as u64,
        );
    }
}

impl QueueImpl {
    fn require_admin(config: &QueueConfig, admin: &Address) {
        if config.admin != *admin {
            panic!("not_admin");
        }
        admin.require_auth();
    }

    fn get_config_internal(env: &Env) -> QueueConfig {
        let key = Symbol::new(env, "config");
        let config = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("queue not initialized"));
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        config
    }

    fn load_position(env: &Env, id: u32) -> Position {
        let key = Self::position_key(env, id);
        let pos = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("position not found"));
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        pos
    }

    fn position_key(env: &Env, id: u32) -> (Symbol, u32) {
        (Symbol::new(env, "pos"), id)
    }
}

fn emit(env: &Env, kind: Symbol, position_id: u32, identity: &Address, timestamp: u64) {
    // #83: carry the identity and timestamp in the event payload so auditors can
    // rebuild queue history from events alone, instead of an empty `()` body.
    env.events().publish(
        (Symbol::new(env, "lineproof_queue"), kind, position_id),
        (identity.clone(), timestamp),
    );
}

#[cfg(test)]
mod test;
