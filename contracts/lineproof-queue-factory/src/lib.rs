#![no_std]
#[cfg(test)]
extern crate alloc;
use soroban_sdk::{contract, contractclient, contractimpl, contracttype, Address, BytesN, Env, IntoVal, Symbol, Vec};

/// Storage key prefix for queue registry
const QUEUE_REGISTRY_PREFIX: &str = "queue";
/// Storage key for the slug index (tracks all registered slugs)
const SLUG_INDEX_KEY: &str = "slug_idx";

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QueueMetadata {
    pub slug: Symbol,
    pub name: Symbol,
    pub owner: Address,
    pub contract_id: Address,
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

#[contractclient(name = "QueueFactoryClient")]
pub trait QueueFactory {
    fn initialize(env: Env, admin: Address);
    fn deploy_queue(
        env: Env,
        deployer: Address,
        slug: Symbol,
        name: Symbol,
        version: u32,
        wasm_hash: BytesN<32>,
    ) -> Address;
    fn register_queue(env: Env, admin: Address, slug: Symbol, contract_id: Address, version: u32);
    fn deactivate_queue(env: Env, admin: Address, slug: Symbol);
    fn reactivate_queue(env: Env, admin: Address, slug: Symbol);
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
            admin: admin.clone(),
            min_version: 1,
            max_version: 1,
        };
        env.storage().persistent().set(&key, &config);
        // Initialize empty slug index
        let idx_key = Symbol::new(&env, SLUG_INDEX_KEY);
        let empty: Vec<Symbol> = Vec::new(&env);
        env.storage().persistent().set(&idx_key, &empty);
        emit(
            &env,
            Symbol::new(&env, "Init"),
            Symbol::new(&env, ""),
            admin.clone(),
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
    ) -> Address {
        deployer.require_auth();
        let config_key = Symbol::new(&env, "config");
        let config: FactoryConfig = env.storage().persistent().get(&config_key).unwrap();
        if version < config.min_version || version > config.max_version {
            panic!("version out of bounds");
        }
        let registry_key = Self::queue_registry_key(&env, &slug);
        if env.storage().persistent().has(&registry_key) {
            panic!("queue with this slug already exists");
        }
        let contract_id = env
            .deployer()
            .with_current_contract(wasm_hash.clone())
            .deploy_v2(wasm_hash, ());
        let deployed_at = env.ledger().timestamp();
        let metadata = QueueMetadata {
            slug: slug.clone(),
            name,
            owner: deployer,
            contract_id: contract_id.clone(),
            version,
            deployed_at,
            active: true,
        };
        env.storage().persistent().set(&registry_key, &metadata);
        Self::append_slug(&env, &slug);
        emit(
            &env,
            Symbol::new(&env, "Deployed"),
            slug,
            contract_id.clone(),
            version,
            deployed_at,
        );
        contract_id
    }

    fn register_queue(env: Env, admin: Address, slug: Symbol, contract_id: Address, version: u32) {
        admin.require_auth();
        let registry_key = Self::queue_registry_key(&env, &slug);
        if env.storage().persistent().has(&registry_key) {
            panic!("queue already registered");
        }
        let deployed_at = env.ledger().timestamp();
        let metadata = QueueMetadata {
            slug: slug.clone(),
            name: Symbol::new(&env, "(imported)"),
            owner: admin.clone(),
            contract_id: contract_id.clone(),
            version,
            deployed_at,
            active: true,
        };
        env.storage().persistent().set(&registry_key, &metadata);
        Self::append_slug(&env, &slug);
        emit(
            &env,
            Symbol::new(&env, "Registered"),
            slug,
            contract_id,
            version,
            deployed_at,
        );
    }

    fn deactivate_queue(env: Env, admin: Address, slug: Symbol) {
        admin.require_auth();
        let mut metadata = Self::get_queue_meta(&env, &slug);
        metadata.active = false;
        let registry_key = Self::queue_registry_key(&env, &slug);
        env.storage().persistent().set(&registry_key, &metadata);
        emit(
            &env,
            Symbol::new(&env, "Deactivated"),
            slug,
            metadata.contract_id,
            metadata.version,
            env.ledger().timestamp(),
        );
    }

    fn reactivate_queue(env: Env, admin: Address, slug: Symbol) {
        admin.require_auth();
        let mut metadata = Self::get_queue_meta(&env, &slug);
        metadata.active = true;
        let registry_key = Self::queue_registry_key(&env, &slug);
        env.storage().persistent().set(&registry_key, &metadata);
        emit(
            &env,
            Symbol::new(&env, "Reactivated"),
            slug,
            metadata.contract_id,
            metadata.version,
            env.ledger().timestamp(),
        );
    }

    fn set_config(env: Env, admin: Address, min_version: u32, max_version: u32) {
        admin.require_auth();
        let config_key = Symbol::new(&env, "config");
        let mut config: FactoryConfig = env.storage().persistent().get(&config_key).unwrap();
        config.min_version = min_version;
        config.max_version = max_version;
        env.storage().persistent().set(&config_key, &config);
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
        admin.require_auth();
        let config_key = Symbol::new(&env, "config");
        let config: FactoryConfig = env.storage().persistent().get(&config_key).unwrap();
        if new_version < config.min_version || new_version > config.max_version {
            panic!("version out of bounds");
        }
        let mut metadata = Self::get_queue_meta(&env, &slug);
        let contract_id = metadata.contract_id.clone();
        metadata.version = new_version;
        let registry_key = Self::queue_registry_key(&env, &slug);
        env.storage().persistent().set(&registry_key, &metadata);
        env.invoke_contract::<()>(
            &contract_id,
            &Symbol::new(&env, "upgrade"),
            soroban_sdk::vec![&env, admin.into_val(&env), new_wasm_hash.into_val(&env)],
        );
        emit(
            &env,
            Symbol::new(&env, "Upgraded"),
            slug,
            contract_id,
            new_version,
            env.ledger().timestamp(),
        );
    }
}

impl QueueFactoryImpl {
    pub(crate) fn queue_registry_key(env: &Env, slug: &Symbol) -> (Symbol, Symbol) {
        (Symbol::new(env, QUEUE_REGISTRY_PREFIX), slug.clone())
    }

    pub(crate) fn get_queue_meta(env: &Env, slug: &Symbol) -> QueueMetadata {
        let key = Self::queue_registry_key(env, slug);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("queue not found"))
    }

    fn append_slug(env: &Env, slug: &Symbol) {
        let idx_key = Symbol::new(env, SLUG_INDEX_KEY);
        let mut slugs: Vec<Symbol> = env.storage().persistent().get(&idx_key).unwrap_or(Vec::new(env));
        slugs.push_back(slug.clone());
        env.storage().persistent().set(&idx_key, &slugs);
    }
}

fn emit(env: &Env, kind: Symbol, slug: Symbol, _contract_id: Address, version: u32, _timestamp: u64) {
    env.events()
        .publish((Symbol::new(env, "lineproof.factory"), kind, slug, version), ());
}

#[cfg(test)]
mod test;
