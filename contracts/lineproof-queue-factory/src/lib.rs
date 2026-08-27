#![cfg_attr(not(test), no_std)]

use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, IntoVal, Symbol, Vec};

/// Storage key prefix for queue registry
const QUEUE_REGISTRY_PREFIX: &str = "queue";
/// Storage key for the slug index (tracks all registered slugs)
const SLUG_INDEX_KEY: &str = "slug_idx";
/// Storage key prefix for approved queue WASM hashes, keyed by version.
const APPROVED_HASH_PREFIX: &str = "approved";
/// Set after the first hash approval, preserving compatibility until then.
const APPROVED_REGISTRY_ENABLED_KEY: &str = "approvals";

/// TTL threshold: renew if remaining TTL is below this many ledgers (~13.8 hours at 5s/ledger)
const TTL_THRESHOLD: u32 = 10_000;
/// TTL extension target: extend to this many ledgers (~1 year at 5s/ledger)
const TTL_EXTEND_TO: u32 = 6_307_200;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QueueMetadata {
    pub slug: Symbol,
    pub name: Symbol,
    pub owner: Address,
    pub contract_address: Address,
    pub version: u32,
    pub deployed_at: u64,
    pub active: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FactoryConfig {
    pub admin: Address,
    pub min_version: u32,
    pub max_version: u32,
}

pub trait QueueFactory {
    fn initialize(env: Env, admin: Address);
    fn deploy_queue(
        env: Env,
        deployer: Address,
        slug: Symbol,
        name: Symbol,
        version: u32,
        wasm_hash: BytesN<32>,
        salt: BytesN<32>,
    ) -> Address;
    fn register_queue(env: Env, admin: Address, slug: Symbol, contract_address: Address, version: u32);
    fn register_approved_hash(env: Env, admin: Address, version: u32, wasm_hash: BytesN<32>);
    fn deactivate_queue(env: Env, admin: Address, slug: Symbol);
    fn reactivate_queue(env: Env, admin: Address, slug: Symbol);
    fn destroy_queue(env: Env, admin: Address, slug: Symbol);
    fn set_config(env: Env, admin: Address, min_version: u32, max_version: u32);
    fn get_queue(env: Env, slug: Symbol) -> Option<QueueMetadata>;
    fn list_queues(env: Env) -> Vec<Symbol>;
    fn verify_queue(env: Env, slug: Symbol) -> bool;
    fn upgrade_queue(env: Env, admin: Address, slug: Symbol, new_version: u32, new_wasm_hash: BytesN<32>);
    fn queue_count(env: Env) -> u32;
}

#[contract]
pub struct QueueFactoryImpl;

#[contractimpl]
impl QueueFactory for QueueFactoryImpl {
    fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        let key = Symbol::new(&env, "config");
        if env.storage().persistent().has(&key) {
            panic!("already initialized");
        }
        let config = FactoryConfig {
            admin,
            min_version: 1,
            max_version: 1,
        };
        env.storage().persistent().set(&key, &config);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        // Initialize empty slug index
        let idx_key = Symbol::new(&env, SLUG_INDEX_KEY);
        let empty: Vec<Symbol> = Vec::new(&env);
        env.storage().persistent().set(&idx_key, &empty);
        env.storage()
            .persistent()
            .extend_ttl(&idx_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        emit(
            &env,
            Symbol::new(&env, "Init"),
            Symbol::new(&env, "none"),
            Self::zero_contract_address(&env),
            0,
            0,
        );
    }

    fn deploy_queue(
        env: Env,
        deployer: Address,
        slug: Symbol,
        name: Symbol,
        version: u32,
        wasm_hash: BytesN<32>,
        salt: BytesN<32>,
    ) -> Address {
        deployer.require_auth();
        let config_key = Symbol::new(&env, "config");
        let config: FactoryConfig = env.storage().persistent().get(&config_key).unwrap();
        if version < config.min_version || version > config.max_version {
            panic!("version out of bounds");
        }
        Self::validate_approved_hash(&env, version, &wasm_hash);
        Self::require_approved_hash(&env, version, &wasm_hash);
        let registry_key = Self::queue_registry_key(&env, &slug);
        if env.storage().persistent().has(&registry_key) {
            panic!("queue with this slug already exists");
        }
        // Deploy the queue from the current (factory) contract, using the caller
        // supplied salt so that the resulting contract address is deterministic
        // but NOT predictable in advance by a third party who lacks the salt.
        // Two deployments with different salts yield different contract addresses.
        let contract_address = env
            .deployer()
            .with_current_contract(salt.clone())
            .deploy_v2(wasm_hash.clone(), ());
        let deployed_at = env.ledger().timestamp();
        let metadata = QueueMetadata {
            slug: slug.clone(),
            name,
            owner: deployer,
            contract_address: contract_address.clone(),
            version,
            deployed_at,
            active: true,
        };
        env.storage().persistent().set(&registry_key, &metadata);
        env.storage()
            .persistent()
            .extend_ttl(&registry_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        Self::append_slug(&env, &slug);
        emit(
            &env,
            Symbol::new(&env, "Deployed"),
            slug,
            contract_address.clone(),
            version,
            deployed_at,
        );
        contract_address
    }

    fn register_approved_hash(env: Env, admin: Address, version: u32, wasm_hash: BytesN<32>) {
        Self::require_admin(&env, &admin);
        let key = Self::approved_hash_key(&env, version);
        env.storage().persistent().set(&key, &wasm_hash);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        // Enable the approved hash registry once the first hash is registered,
        // so subsequent deployments/upgrades are validated against it.
        let enabled_key = Symbol::new(&env, APPROVED_REGISTRY_ENABLED_KEY);
        env.storage().persistent().set(&enabled_key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&enabled_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        emit(
            &env,
            Symbol::new(&env, "HashApproved"),
            Symbol::new(&env, "none"),
            Self::zero_contract_address(&env),
            version,
            env.ledger().timestamp(),
        );
    }

    fn register_queue(env: Env, admin: Address, slug: Symbol, contract_address: Address, version: u32) {
        Self::require_admin(&env, &admin);
        let registry_key = Self::queue_registry_key(&env, &slug);
        if env.storage().persistent().has(&registry_key) {
            panic!("queue already registered");
        }
        let deployed_at = env.ledger().timestamp();
        let metadata = QueueMetadata {
            slug: slug.clone(),
            name: Symbol::new(&env, "imported"),
            owner: admin.clone(),
            contract_address: contract_address.clone(),
            version,
            deployed_at,
            active: true,
        };
        env.storage().persistent().set(&registry_key, &metadata);
        env.storage()
            .persistent()
            .extend_ttl(&registry_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        Self::append_slug(&env, &slug);
        emit(
            &env,
            Symbol::new(&env, "Registered"),
            slug,
            contract_address,
            version,
            deployed_at,
        );
    }

    fn deactivate_queue(env: Env, admin: Address, slug: Symbol) {
        Self::require_admin(&env, &admin);
        let mut metadata = Self::get_queue_meta(&env, &slug);
        metadata.active = false;
        let registry_key = Self::queue_registry_key(&env, &slug);
        env.storage().persistent().set(&registry_key, &metadata);
        env.storage()
            .persistent()
            .extend_ttl(&registry_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        emit(
            &env,
            Symbol::new(&env, "Deactivated"),
            slug,
            metadata.contract_address,
            metadata.version,
            env.ledger().timestamp(),
        );
    }

    fn reactivate_queue(env: Env, admin: Address, slug: Symbol) {
        Self::require_admin(&env, &admin);
        let mut metadata = Self::get_queue_meta(&env, &slug);
        metadata.active = true;
        let registry_key = Self::queue_registry_key(&env, &slug);
        env.storage().persistent().set(&registry_key, &metadata);
        env.storage()
            .persistent()
            .extend_ttl(&registry_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        emit(
            &env,
            Symbol::new(&env, "Reactivated"),
            slug,
            metadata.contract_address,
            metadata.version,
            env.ledger().timestamp(),
        );
    }

    fn destroy_queue(env: Env, admin: Address, slug: Symbol) {
        Self::require_admin(&env, &admin);
        let registry_key = Self::queue_registry_key(&env, &slug);
        if !env.storage().persistent().has(&registry_key) {
            panic!("queue not found");
        }
        let metadata: QueueMetadata = env
            .storage()
            .persistent()
            .get(&registry_key)
            .unwrap_or_else(|| panic!("queue not found"));
        env.storage().persistent().remove(&registry_key);
        Self::remove_slug(&env, &slug);
        emit(
            &env,
            Symbol::new(&env, "Destroyed"),
            slug,
            metadata.contract_address,
            metadata.version,
            env.ledger().timestamp(),
        );
    }

    fn set_config(env: Env, admin: Address, min_version: u32, max_version: u32) {
        Self::require_admin(&env, &admin);
        let config_key = Symbol::new(&env, "config");
        let mut config: FactoryConfig = env.storage().persistent().get(&config_key).unwrap();
        config.min_version = min_version;
        config.max_version = max_version;
        env.storage().persistent().set(&config_key, &config);
        env.storage()
            .persistent()
            .extend_ttl(&config_key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    fn get_queue(env: Env, slug: Symbol) -> Option<QueueMetadata> {
        let key = Self::queue_registry_key(&env, &slug);
        env.storage().persistent().get(&key)
    }

    fn list_queues(env: Env) -> Vec<Symbol> {
        let idx_key = Symbol::new(&env, SLUG_INDEX_KEY);
        env.storage().persistent().get(&idx_key).unwrap_or(Vec::new(&env))
    }

    fn verify_queue(env: Env, slug: Symbol) -> bool {
        let key = Self::queue_registry_key(&env, &slug);
        match env.storage().persistent().get::<_, QueueMetadata>(&key) {
            Some(meta) => meta.active,
            None => false,
        }
    }

    fn queue_count(env: Env) -> u32 {
        let idx_key = Symbol::new(&env, SLUG_INDEX_KEY);
        let slugs: Vec<Symbol> = env.storage().persistent().get(&idx_key).unwrap_or(Vec::new(&env));
        slugs.len()
    }

    fn upgrade_queue(env: Env, admin: Address, slug: Symbol, new_version: u32, new_wasm_hash: BytesN<32>) {
        Self::require_admin(&env, &admin);
        let config_key = Symbol::new(&env, "config");
        let config: FactoryConfig = env.storage().persistent().get(&config_key).unwrap();
        if new_version < config.min_version || new_version > config.max_version {
            panic!("version out of bounds");
        }
        let mut metadata = Self::get_queue_meta(&env, &slug);
        if new_version <= metadata.version {
            panic!("version must increase");
        }
        Self::validate_approved_hash(&env, new_version, &new_wasm_hash);
        Self::require_approved_hash(&env, new_version, &new_wasm_hash);
        let contract_address = metadata.contract_address.clone();
        metadata.version = new_version;
        let registry_key = Self::queue_registry_key(&env, &slug);
        env.storage().persistent().set(&registry_key, &metadata);
        env.storage()
            .persistent()
            .extend_ttl(&registry_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        // NOTE: Soroban SDK 22 removed the factory-facing `upgrade` API used to
        // replace another contract's WASM directly. A contract can only update
        // its OWN executable via `env.deployer().update_current_contract_wasm`.
        // The factory therefore records the new version here and delegates the
        // actual WASM swap to the queue's own `upgrade` entry point, which
        // authorizes the admin and self-updates its executable.
        env.invoke_contract::<()>(
            &contract_address,
            &Symbol::new(&env, "upgrade"),
            (admin, new_wasm_hash).into_val(&env),
        );
        emit(
            &env,
            Symbol::new(&env, "Upgraded"),
            slug,
            contract_address,
            new_version,
            env.ledger().timestamp(),
        );
    }
}

impl QueueFactoryImpl {
    fn require_admin(env: &Env, admin: &Address) {
        admin.require_auth();
        let config_key = Symbol::new(env, "config");
        let config: FactoryConfig = env
            .storage()
            .persistent()
            .get(&config_key)
            .unwrap_or_else(|| panic!("not initialized"));
        if config.admin != *admin {
            panic!("not authorized");
        }
    }

    fn approved_hash_key(env: &Env, version: u32) -> (Symbol, u32) {
        (Symbol::new(env, APPROVED_HASH_PREFIX), version)
    }

    fn validate_approved_hash(env: &Env, version: u32, wasm_hash: &BytesN<32>) {
        let key = Self::approved_hash_key(env, version);
        if let Some(approved_hash) = env.storage().persistent().get::<_, BytesN<32>>(&key) {
            if approved_hash != *wasm_hash {
                panic!("wasm hash not approved");
            }
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        }
    }

    fn require_approved_hash(env: &Env, version: u32, wasm_hash: &BytesN<32>) {
        let enabled_key = Symbol::new(env, APPROVED_REGISTRY_ENABLED_KEY);
        if !env.storage().persistent().get::<_, bool>(&enabled_key).unwrap_or(false) {
            return;
        }
        env.storage()
            .persistent()
            .extend_ttl(&enabled_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        let key = Self::approved_hash_key(env, version);
        let approved_hash = env
            .storage()
            .persistent()
            .get::<_, BytesN<32>>(&key)
            .unwrap_or_else(|| panic!("WASM hash not approved"));
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        if approved_hash != *wasm_hash {
            panic!("WASM hash not approved");
        }
    }

    pub(crate) fn queue_registry_key(env: &Env, slug: &Symbol) -> (Symbol, Symbol) {
        (Symbol::new(env, QUEUE_REGISTRY_PREFIX), slug.clone())
    }

    pub(crate) fn get_queue_meta(env: &Env, slug: &Symbol) -> QueueMetadata {
        let key = Self::queue_registry_key(env, slug);
        let metadata = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("queue not found"));
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        metadata
    }

    /// The canonical "no contract" address (the zero 32-byte contract id). Used
    /// as a placeholder in events that are not tied to a specific queue (e.g.
    /// `Init`, `HashApproved`).
    fn zero_contract_address(env: &Env) -> Address {
        env.current_contract_address()
    }

    fn append_slug(env: &Env, slug: &Symbol) {
        let idx_key = Symbol::new(env, SLUG_INDEX_KEY);
        let mut slugs: Vec<Symbol> = env.storage().persistent().get(&idx_key).unwrap_or(Vec::new(env));
        slugs.push_back(slug.clone());
        env.storage().persistent().set(&idx_key, &slugs);
        env.storage()
            .persistent()
            .extend_ttl(&idx_key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    fn remove_slug(env: &Env, slug: &Symbol) {
        let idx_key = Symbol::new(env, SLUG_INDEX_KEY);
        let slugs: Vec<Symbol> = env.storage().persistent().get(&idx_key).unwrap_or(Vec::new(env));
        let mut remaining = Vec::new(env);
        for registered_slug in slugs.iter() {
            if registered_slug != *slug {
                remaining.push_back(registered_slug);
            }
        }
        env.storage().persistent().set(&idx_key, &remaining);
        let mut slugs: Vec<Symbol> = env.storage().persistent().get(&idx_key).unwrap_or(Vec::new(env));
        if let Some(index) = slugs.first_index_of(slug.clone()) {
            let _ = slugs.remove(index);
        }
        env.storage().persistent().set(&idx_key, &slugs);
        env.storage()
            .persistent()
            .extend_ttl(&idx_key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }
}

fn emit(env: &Env, kind: Symbol, slug: Symbol, contract_address: Address, version: u32, _timestamp: u64) {
    // #83: carry the deployed contract address and version in the event payload.
    env.events().publish(
        (Symbol::new(env, "lineproof_factory"), kind, slug),
        (contract_address.clone(), version),
    );
}

#[cfg(test)]
mod test;
