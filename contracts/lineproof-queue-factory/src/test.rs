use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

use crate::{FactoryConfig, QueueFactory, QueueFactoryImpl};

fn setup() -> (Env, Address) {
    let env = Env::default();
    let admin = Address::generate(&env);
    (env, admin)
}

fn init(env: &Env, admin: &Address) {
    QueueFactoryImpl::initialize(env.clone(), admin.clone());
}

#[test]
fn test_initialize() {
    let (env, admin) = setup();
    init(&env, &admin);
    let key = Symbol::new(&env, "config");
    let config: FactoryConfig = env.storage().persistent().get(&key).unwrap();
    assert_eq!(config.admin, admin);
    assert_eq!(config.min_version, 1);
    assert_eq!(config.max_version, 1);
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_initialize_twice_panics() {
    let (env, admin) = setup();
    init(&env, &admin);
    init(&env, &admin);
}

#[test]
fn test_deploy_queue_registers_and_indexes() {
    let (env, admin) = setup();
    init(&env, &admin);
    let deployer = Address::generate(&env);
    let slug = Symbol::new(&env, "test-q");
    let wasm_hash = soroban_sdk::BytesN::from_array(&env, &[3u8; 32]);
    QueueFactoryImpl::deploy_queue(env.clone(), deployer, slug.clone(), Symbol::new(&env, "T"), 1, wasm_hash);

    let meta = QueueFactoryImpl::get_queue(env.clone(), slug.clone());
    assert!(meta.is_some());
    assert!(meta.unwrap().active);

    let slugs = QueueFactoryImpl::list_queues(env.clone());
    assert_eq!(slugs.len(), 1);

    let count = QueueFactoryImpl::queue_count(env.clone());
    assert_eq!(count, 1);
}

#[test]
fn test_list_queues_returns_all_slugs() {
    let (env, admin) = setup();
    init(&env, &admin);
    let deployer = Address::generate(&env);
    for i in 0u8..3 {
        let slug = Symbol::new(&env, &alloc::format!("q{}", i));
        let wasm_hash = soroban_sdk::BytesN::from_array(&env, &[i + 10; 32]);
        QueueFactoryImpl::deploy_queue(env.clone(), deployer.clone(), slug, Symbol::new(&env, "N"), 1, wasm_hash);
    }
    let slugs = QueueFactoryImpl::list_queues(env.clone());
    assert_eq!(slugs.len(), 3);
    assert_eq!(QueueFactoryImpl::queue_count(env), 3);
}

#[test]
fn test_deactivate_and_reactivate() {
    let (env, admin) = setup();
    init(&env, &admin);
    let deployer = Address::generate(&env);
    let slug = Symbol::new(&env, "toggle");
    let wasm_hash = soroban_sdk::BytesN::from_array(&env, &[7u8; 32]);
    QueueFactoryImpl::deploy_queue(env.clone(), deployer, slug.clone(), Symbol::new(&env, "T"), 1, wasm_hash);
    assert!(QueueFactoryImpl::verify_queue(env.clone(), slug.clone()));
    QueueFactoryImpl::deactivate_queue(env.clone(), admin.clone(), slug.clone());
    assert!(!QueueFactoryImpl::verify_queue(env.clone(), slug.clone()));
    QueueFactoryImpl::reactivate_queue(env.clone(), admin, slug.clone());
    assert!(QueueFactoryImpl::verify_queue(env.clone(), slug));
}

#[test]
fn test_get_queue_returns_none_for_unknown() {
    let (env, admin) = setup();
    init(&env, &admin);
    let result = QueueFactoryImpl::get_queue(env.clone(), Symbol::new(&env, "ghost"));
    assert!(result.is_none());
}

#[test]
#[should_panic(expected = "version out of bounds")]
fn test_deploy_rejects_bad_version() {
    let (env, admin) = setup();
    init(&env, &admin);
    let deployer = Address::generate(&env);
    let wasm_hash = soroban_sdk::BytesN::from_array(&env, &[3u8; 32]);
    QueueFactoryImpl::deploy_queue(env.clone(), deployer, Symbol::new(&env, "x"), Symbol::new(&env, "X"), 99, wasm_hash);
}

#[test]
#[should_panic(expected = "queue with this slug already exists")]
fn test_deploy_rejects_duplicate_slug() {
    let (env, admin) = setup();
    init(&env, &admin);
    let deployer = Address::generate(&env);
    let slug = Symbol::new(&env, "dup");
    QueueFactoryImpl::deploy_queue(env.clone(), deployer.clone(), slug.clone(), Symbol::new(&env, "D"), 1, soroban_sdk::BytesN::from_array(&env, &[3u8; 32]));
    QueueFactoryImpl::deploy_queue(env.clone(), deployer, slug, Symbol::new(&env, "D"), 1, soroban_sdk::BytesN::from_array(&env, &[4u8; 32]));
}
