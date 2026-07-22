use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, Symbol, Vec};

/// Storage key prefix for queue registry
const QUEUE_REGISTRY_PREFIX: &str = "queue";
/// Storage key for the slug index (tracks all registered slugs)
const SLUG_INDEX_KEY: &str = "slug_idx";
/// Storage key prefix for approved queue WASM hashes, keyed by version.
const APPROVED_HASH_PREFIX: &str = "approved";
/// Storage key prefix for version-to-WASM-hash approvals.
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

pub trait QueueFactory {
    fn initialize(env: Env, admin: Address);
    fn deploy_queue(
        env: Env,
        deployer: Address,
        slug: Symbol,
        name: Symbol,
        version: u32,
        wasm_hash: BytesN<32>,
    ) -> BytesN<32>;
    fn register_queue(env: Env, admin: Address, slug: Symbol, contract_id: BytesN<32>, version: u32);
    fn register_approved_hash(env: Env, admin: Address, version: u32, wasm_hash: BytesN<32>);
    fn deactivate_queue(env: Env, admin: Address, slug: Symbol);
    fn reactivate_queue(env: Env, admin: Address, slug: Symbol);
    fn destroy_queue(env: Env, admin: Address, slug: Symbol);
    fn register_approved_hash(env: Env, admin: Address, version: u32, wasm_hash: BytesN<32>);
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
        env.storage()
            .persistent()
            .extend_ttl(&env.current_contract_address(), TTL_THRESHOLD, TTL_EXTEND_TO);
        emit(
            &env,
            Symbol::new(&env, "Init"),
            Symbol::new(&env, ""),
            BytesN::new(&env, &[0u8; 32]),
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
    ) -> BytesN<32> {
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
        let contract_id = env.deployer().with_current_contract(&wasm_hash).deploy();
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
        env.storage()
            .persistent()
            .extend_ttl(&registry_key, TTL_THRESHOLD, TTL_EXTEND_TO);
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

    fn register_queue(env: Env, admin: Address, slug: Symbol, contract_id: BytesN<32>, version: u32) {
        Self::require_admin(&env, &admin);
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
        env.storage()
            .persistent()
            .extend_ttl(&registry_key, TTL_THRESHOLD, TTL_EXTEND_TO);
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

    fn register_approved_hash(env: Env, admin: Address, version: u32, wasm_hash: BytesN<32>) {
        Self::require_admin(&env, &admin);
        let key = Self::approved_hash_key(&env, version);
        env.storage().persistent().set(&key, &wasm_hash);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
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
            metadata.contract_id,
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
            metadata.contract_id,
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
            BytesN::new(&env, &[0u8; 32]),
            0,
            metadata.contract_id,
            metadata.version,
            env.ledger().timestamp(),
        );
    }

    fn register_approved_hash(env: Env, admin: Address, version: u32, wasm_hash: BytesN<32>) {
        Self::require_admin(&env, &admin);
        let key = Self::approved_hash_key(&env, version);
        env.storage().persistent().set(&key, &wasm_hash);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        let enabled_key = Symbol::new(&env, APPROVED_REGISTRY_ENABLED_KEY);
        env.storage().persistent().set(&enabled_key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&enabled_key, TTL_THRESHOLD, TTL_EXTEND_TO);
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
        let contract_id = metadata.contract_id.clone();
        metadata.version = new_version;
        let registry_key = Self::queue_registry_key(&env, &slug);
        env.storage().persistent().set(&registry_key, &metadata);
        env.storage()
            .persistent()
            .extend_ttl(&registry_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.deployer()
            .with_current_contract(&new_wasm_hash)
            .upgrade(&contract_id);
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
    fn require_admin(env: &Env, admin: &Address) {
        admin.require_auth();
        let config_key = Symbol::new(env, "config");
        let config: FactoryConfig = env.storage().persistent().get(&config_key).unwrap();
        if config.admin != *admin {
            panic!("unauthorized admin");
        let config: FactoryConfig = env
            .storage()
            .persistent()
            .get(&Symbol::new(env, "config"))
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

fn emit(env: &Env, kind: Symbol, slug: Symbol, _contract_id: BytesN<32>, version: u32, _timestamp: u64) {
    env.events()
        .publish((Symbol::new(env, "lineproof.factory"), kind, slug, version));
        .publish((Symbol::new(env, "lineproof_factory"), kind, slug, version), ());
}

#[cfg(test)]
mod test;
