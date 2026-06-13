use soroban_sdk::{contractimpl, contracttype, Address, BytesN, Env, Symbol, Vec};

/// Storage key prefix for queue registry
const QUEUE_REGISTRY_PREFIX: &str = "queue";

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QueueMetadata {
    pub slug: Symbol,
    pub name: Symbol,
    pub owner: Address,
    pub contract_id: BytesN<32>,
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

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FactoryEvent {
    pub kind: Symbol,
    pub queue_slug: Symbol,
    pub contract_id: BytesN<32>,
    pub version: u32,
    pub timestamp: u64,
}

#[contract]
pub trait QueueFactory {
    /// Initialize the factory with an administrator
    fn initialize(env: Env, admin: Address);

    /// Deploy a new queue contract and register it
    fn deploy_queue(
        env: Env,
        deployer: Address,
        slug: Symbol,
        name: Symbol,
        version: u32,
        wasm_hash: BytesN<32>,
    ) -> BytesN<32>;

    /// Register an already-deployed queue
    fn register_queue(env: Env, admin: Address, slug: Symbol, contract_id: BytesN<32>, version: u32);

    /// Deactivate a queue (stops accepting new enrollments)
    fn deactivate_queue(env: Env, admin: Address, slug: Symbol);

    /// Reactivate a previously deactivated queue
    fn reactivate_queue(env: Env, admin: Address, slug: Symbol);

    /// Update factory configuration
    fn set_config(env: Env, admin: Address, min_version: u32, max_version: u32);

    /// Query a queue's metadata by slug
    fn get_queue(env: Env, slug: Symbol) -> Option<QueueMetadata>;

    /// List all registered queue slugs
    fn list_queues(env: Env) -> Vec<Symbol>;

    /// Verify a queue exists and is active
    fn verify_queue(env: Env, slug: Symbol) -> bool;

    /// Upgrade an existing queue (requires admin approval)
    fn upgrade_queue(env: Env, admin: Address, slug: Symbol, new_version: u32, new_wasm_hash: BytesN<32>);
}

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
        emit(&env, Symbol::new(&env, "Init"), Symbol::new(&env, ""), BytesN::new(&env, &[0u8; 32]), 0, 0);
    }

    fn deploy_queue(
        env: Env,
        deployer: Address,
        slug: Symbol,
        name: Symbol,
        version: u32,
        wasm_hash: BytesN<32>,
    ) -> BytesN<32> {
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

        let contract_id = env.deployer().with_current_contract(&wasm_hash).deploy();
        let deployed_at = env.ledger().timestamp();

        let metadata = QueueMetadata {
            slug,
            name,
            owner: deployer,
            contract_id: contract_id.clone(),
            version,
            deployed_at,
            active: true,
        };

        env.storage().persistent().set(&registry_key, &metadata);
        emit(&env, Symbol::new(&env, "Deployed"), slug, contract_id.clone(), version, deployed_at);
        contract_id
    }

    fn register_queue(env: Env, admin: Address, slug: Symbol, contract_id: BytesN<32>, version: u32) {
        admin.require_auth();
        let registry_key = Self::queue_registry_key(&env, &slug);
        if env.storage().persistent().has(&registry_key) {
            panic!("queue already registered");
        }
        let deployed_at = env.ledger().timestamp();
        let metadata = QueueMetadata {
            slug,
            name: Symbol::new(&env, "(imported)"),
            owner: admin.clone(),
            contract_id: contract_id.clone(),
            version,
            deployed_at,
            active: true,
        };
        env.storage().persistent().set(&registry_key, &metadata);
        emit(&env, Symbol::new(&env, "Registered"), slug, contract_id, version, deployed_at);
    }

    fn deactivate_queue(env: Env, admin: Address, slug: Symbol) {
        admin.require_auth();
        let mut metadata = Self::get_queue_meta(&env, &slug);
        metadata.active = false;
        let registry_key = Self::queue_registry_key(&env, &slug);
        env.storage().persistent().set(&registry_key, &metadata);
        emit(&env, Symbol::new(&env, "Deactivated"), slug, metadata.contract_id, metadata.version, env.ledger().timestamp());
    }

    fn reactivate_queue(env: Env, admin: Address, slug: Symbol) {
        admin.require_auth();
        let mut metadata = Self::get_queue_meta(&env, &slug);
        metadata.active = true;
        let registry_key = Self::queue_registry_key(&env, &slug);
        env.storage().persistent().set(&registry_key, &metadata);
        emit(&env, Symbol::new(&env, "Reactivated"), slug, metadata.contract_id, metadata.version, env.ledger().timestamp());
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
        Some(Self::get_queue_meta(&env, &slug))
    }

    fn list_queues(env: Env) -> Vec<Symbol> {
        let prefix = Symbol::new(&env, QUEUE_REGISTRY_PREFIX);
        let mut slugs: Vec<Symbol> = Vec::new(&env);
        // Iteration pattern: enumerate by prefix in production implementation.
        // Skeleton omits full iteration for brevity.
        slugs
    }

    fn verify_queue(env: Env, slug: Symbol) -> bool {
        match Self::get_queue_meta(&env, &slug) {
            Some(meta) => meta.active,
            None => false,
        }
    }

    fn upgrade_queue(env: Env, admin: Address, slug: Symbol, new_version: u32, new_wasm_hash: BytesN<32>) {
        admin.require_auth();
        let config_key = Symbol::new(&env, "config");
        let config: FactoryConfig = env.storage().persistent().get(&config_key).unwrap();
        if new_version < config.min_version || new_version > config.max_version {
            panic!("version out of bounds");
        }
        // Upgrade worker contract (contract binding pattern).
        let metadata = Self::get_queue_meta(&env, &slug);
        let contract_id = metadata.contract_id;
        env.deployer().with_current_contract(&new_wasm_hash).upgrade(&contract_id);
        emit(&env, Symbol::new(&env, "Upgraded"), slug, contract_id, new_version, env.ledger().timestamp());
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
}

fn emit(env: &Env, kind: Symbol, slug: Symbol, contract_id: BytesN<32>, version: u32, timestamp: u64) {
    let event = FactoryEvent { kind, queue_slug: slug, contract_id, version, timestamp };
    env.events().publish((
        Symbol::new(env, "lineproof.factory"),
        event.kind,
        event.queue_slug,
        event.version,
    ));
}

mod test;