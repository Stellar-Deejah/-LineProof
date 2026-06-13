use std::panic;

use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

use crate::{FactoryConfig, QueueFactoryImpl, QueueMetadata};

fn setup() -> (Env, Address) {
    let env = Env::default();
    let admin = Address::new(&env, &[1; 7]);
    (env, admin)
}

#[test]
fn test_initialize() {
    let (env, admin) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    QueueFactoryImpl::initialize(env.clone(), admin.clone());
    let key = Symbol::new(&env, "config");
    let config: FactoryConfig = env.storage().persistent().get(&key).unwrap();
    assert_eq!(config.admin, admin);
    assert_eq!(config.min_version, 1);
    assert_eq!(config.max_version, 1);
    panic::set_hook(None);
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_initialize_twice_panics() {
    let (env, admin) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    QueueFactoryImpl::initialize(env.clone(), admin.clone());
    QueueFactoryImpl::initialize(env, admin);
}

#[test]
fn test_deploy_queue() {
    let (env, admin) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    QueueFactoryImpl::initialize(env.clone(), admin);
    let deployer = Address::new(&env, &[2u8; 7]);
    let slug = Symbol::new(&env, "sneaker-drop");
    let name = Symbol::new(&env, "Sneaker Drop");
    let wasm_hash = soroban_sdk::BytesN::new(&env, &[3u8; 32]);
    let contract_id = QueueFactoryImpl::deploy_queue(
        env.clone(),
        deployer.clone(),
        slug.clone(),
        name.clone(),
        1,
        wasm_hash,
    );
    let meta: QueueMetadata = env
        .storage()
        .persistent()
        .get(&QueueFactoryImpl::queue_registry_key(&env, &slug))
        .unwrap();
    assert_eq!(meta.contract_id, contract_id);
    assert_eq!(meta.version, 1);
    assert!(meta.active);
    panic::set_hook(None);
}

#[test]
#[should_panic(expected = "version out of bounds")]
fn test_deploy_queue_rejects_bad_version() {
    let (env, admin) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    QueueFactoryImpl::initialize(env.clone(), admin);
    let deployer = Address::new(&env, &[2u8; 7]);
    let slug = Symbol::new(&env, "test");
    let name = Symbol::new(&env, "T");
    let wasm_hash = soroban_sdk::BytesN::new(&env, &[3u8; 32]);
    QueueFactoryImpl::deploy_queue(env, deployer, slug, name, 9, wasm_hash);
}

#[test]
#[should_panic(expected = "queue with this slug already exists")]
fn test_deploy_queue_rejects_duplicate_slug() {
    let (env, admin) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    QueueFactoryImpl::initialize(env.clone(), admin.clone());
    let deployer = Address::new(&env, &[2u8; 7]);
    let slug = Symbol::new(&env, "dup");
    let name = Symbol::new(&env, "Dup");
    let wasm_hash = soroban_sdk::BytesN::new(&env, &[3u8; 32]);
    QueueFactoryImpl::deploy_queue(
        env.clone(),
        deployer.clone(),
        slug.clone(),
        name.clone(),
        1,
        wasm_hash,
    );
    let wasm_hash2 = soroban_sdk::BytesN::new(&env, &[4u8; 32]);
    QueueFactoryImpl::deploy_queue(env, deployer, slug, name, 1, wasm_hash2);
}

#[test]
fn test_register_queue() {
    let (env, admin) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    QueueFactoryImpl::initialize(env.clone(), admin.clone());
    let slug = Symbol::new(&env, "imported");
    let contract_id = soroban_sdk::BytesN::new(&env, &[5u8; 32]);
    QueueFactoryImpl::register_queue(env.clone(), admin.clone(), slug.clone(), contract_id.clone(), 2);
    let meta = QueueFactoryImpl::get_queue(env, slug);
    assert!(meta.is_some());
    assert_eq!(meta.unwrap().contract_id, contract_id);
    panic::set_hook(None);
}

#[test]
#[should_panic(expected = "queue already registered")]
fn test_register_queue_rejects_duplicate() {
    let (env, admin) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    QueueFactoryImpl::initialize(env.clone(), admin.clone());
    let slug = Symbol::new(&env, "reg-dup");
    let cid = soroban_sdk::BytesN::new(&env, &[6u8; 32]);
    QueueFactoryImpl::register_queue(env.clone(), admin.clone(), slug.clone(), cid, 1);
    QueueFactoryImpl::register_queue(env, admin, slug, cid, 1);
}

#[test]
fn test_deactivate_and_reactivate() {
    let (env, admin) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    QueueFactoryImpl::initialize(env.clone(), admin.clone());
    let deployer = Address::new(&env, &[2u8; 7]);
    let slug = Symbol::new(&env, "toggle");
    let wasm_hash = soroban_sdk::BytesN::new(&env, &[7u8; 32]);
    QueueFactoryImpl::deploy_queue(
        env.clone(),
        deployer,
        slug.clone(),
        Symbol::new(&env, "T"),
        1,
        wasm_hash,
    );
    assert!(QueueFactoryImpl::verify_queue(env.clone(), slug.clone()));
    QueueFactoryImpl::deactivate_queue(env.clone(), admin.clone(), slug.clone());
    assert!(!QueueFactoryImpl::verify_queue(env.clone(), slug.clone()));
    QueueFactoryImpl::reactivate_queue(env.clone(), admin, slug.clone());
    assert!(QueueFactoryImpl::verify_queue(env, slug));
    panic::set_hook(None);
}

#[test]
fn test_get_queue_not_found() {
    let (env, _admin) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    let slug = Symbol::new(&env, "nonexistent");
    let meta = QueueFactoryImpl::get_queue(env, slug);
    assert!(meta.is_none());
    panic::set_hook(None);
}

#[test]
#[should_panic(expected = "queue not found")]
fn test_verify_queue_missing() {
    let (env, _admin) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    let slug = Symbol::new(&env, "missing");
    QueueFactoryImpl::verify_queue(env, slug);
}
