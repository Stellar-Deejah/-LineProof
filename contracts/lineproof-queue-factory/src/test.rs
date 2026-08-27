use soroban_sdk::{testutils::Address as _, Address, Bytes, BytesN, Env, Symbol};

use crate::{FactoryConfig, QueueFactoryImpl, QueueFactoryImplClient};

/// Self-contained fixture of the deployed queue WASM so the deploy tests do not
/// depend on a prior workspace wasm build. `upload_contract_wasm` derives a
/// deterministic hash from these bytes, so identical bytes always yield the
/// same hash across tests.
const QUEUE_WASM: &[u8] = include_bytes!("../test-fixtures/queue.wasm");

struct Harness {
    env: Env,
    contract_id: Address,
    admin: Address,
}

impl Harness {
    fn new() -> Self {
        let env = Env::default();
        let contract_id = env.register(QueueFactoryImpl, ());
        env.mock_all_auths();
        let client = QueueFactoryImplClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        Harness {
            env,
            contract_id,
            admin,
        }
    }

    fn client(&self) -> QueueFactoryImplClient<'_> {
        QueueFactoryImplClient::new(&self.env, &self.contract_id)
    }

    fn wasm_hash(&self) -> BytesN<32> {
        let wasm = Bytes::from_slice(&self.env, QUEUE_WASM);
        self.env.deployer().upload_contract_wasm(wasm)
    }

    fn deploy(&self, deployer: &Address, slug: Symbol, version: u32, salt: BytesN<32>) -> Address {
        let client = self.client();
        client.deploy_queue(
            deployer,
            &slug,
            &Symbol::new(&self.env, "T"),
            &version,
            &self.wasm_hash(),
            &salt,
        )
    }
}

#[test]
fn test_initialize() {
    let h = Harness::new();
    let key = Symbol::new(&h.env, "config");
    let config: FactoryConfig = h
        .env
        .as_contract(&h.contract_id, || h.env.storage().persistent().get(&key).unwrap());
    assert_eq!(config.admin, h.admin);
    assert_eq!(config.min_version, 1);
    assert_eq!(config.max_version, 1);
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_initialize_twice_panics() {
    let h = Harness::new();
    let client = h.client();
    client.initialize(&h.admin);
}

#[test]
fn test_deploy_queue_registers_and_indexes() {
    let h = Harness::new();
    let client = h.client();
    let deployer = Address::generate(&h.env);
    let slug = Symbol::new(&h.env, "test_q");
    let deployed = h.deploy(&deployer, slug.clone(), 1, BytesN::from_array(&h.env, &[3u8; 32]));

    let meta = client.get_queue(&slug).unwrap();
    assert!(meta.active);
    assert_eq!(meta.owner, deployer);
    assert_eq!(meta.contract_address, deployed);
    assert_eq!(meta.slug, slug);
    assert_eq!(meta.version, 1);

    assert_eq!(client.list_queues().len(), 1);
    assert_eq!(client.queue_count(), 1);
}

#[test]
#[should_panic(expected = "version out of bounds")]
fn test_deploy_rejects_bad_version() {
    let h = Harness::new();
    let deployer = Address::generate(&h.env);
    h.deploy(
        &deployer,
        Symbol::new(&h.env, "x"),
        99,
        BytesN::from_array(&h.env, &[3u8; 32]),
    );
}

#[test]
#[should_panic(expected = "queue with this slug already exists")]
fn test_deploy_rejects_duplicate_slug() {
    let h = Harness::new();
    let deployer = Address::generate(&h.env);
    let slug = Symbol::new(&h.env, "dup");
    h.deploy(&deployer, slug.clone(), 1, BytesN::from_array(&h.env, &[3u8; 32]));
    h.deploy(&deployer, slug, 1, BytesN::from_array(&h.env, &[4u8; 32]));
}

#[test]
fn test_same_wasm_different_salt_yields_different_addresses() {
    // Acceptance criterion for #206: deploying the same queue WASM from the
    // same factory with a different salt must produce distinct contract
    // addresses. A caller-supplied salt makes the address deterministic for a
    // known salt but not front-runnable by a third party who lacks it.
    let h = Harness::new();
    let client = h.client();
    let deployer = Address::generate(&h.env);
    let salt_a = BytesN::from_array(&h.env, &[1u8; 32]);
    let salt_b = BytesN::from_array(&h.env, &[2u8; 32]);

    let addr_a = h.deploy(&deployer, Symbol::new(&h.env, "qa"), 1, salt_a);
    let addr_b = h.deploy(&deployer, Symbol::new(&h.env, "qb"), 1, salt_b);

    assert_ne!(addr_a, addr_b);

    let meta_a = client.get_queue(&Symbol::new(&h.env, "qa")).unwrap();
    let meta_b = client.get_queue(&Symbol::new(&h.env, "qb")).unwrap();
    assert_ne!(meta_a.contract_address, meta_b.contract_address);
    assert_eq!(meta_a.contract_address, addr_a);
    assert_eq!(meta_b.contract_address, addr_b);
}

#[test]
fn test_list_queues_returns_all_slugs() {
    let h = Harness::new();
    let client = h.client();
    let deployer = Address::generate(&h.env);
    for i in 0u8..3 {
        h.deploy(
            &deployer,
            Symbol::new(&h.env, &format!("q{}", i)),
            1,
            BytesN::from_array(&h.env, &[10 + i; 32]),
        );
    }
    assert_eq!(client.list_queues().len(), 3);
    assert_eq!(client.queue_count(), 3);
}

#[test]
fn test_deactivate_and_reactivate() {
    let h = Harness::new();
    let client = h.client();
    let deployer = Address::generate(&h.env);
    let slug = Symbol::new(&h.env, "toggle");
    h.deploy(&deployer, slug.clone(), 1, BytesN::from_array(&h.env, &[7u8; 32]));
    assert!(client.verify_queue(&slug));
    client.deactivate_queue(&h.admin, &slug);
    assert!(!client.verify_queue(&slug));
    client.reactivate_queue(&h.admin, &slug);
    assert!(client.verify_queue(&slug));
}

#[test]
fn test_get_queue_returns_none_for_unknown() {
    let h = Harness::new();
    let client = h.client();
    assert!(client.get_queue(&Symbol::new(&h.env, "ghost")).is_none());
}

#[test]
#[should_panic(expected = "version must increase")]
fn test_upgrade_rejects_downgrade() {
    let h = Harness::new();
    let client = h.client();
    client.set_config(&h.admin, &1, &3);
    let slug = Symbol::new(&h.env, "downgrade");
    let addr = Address::generate(&h.env);
    client.register_queue(&h.admin, &slug, &addr, &2);

    client.upgrade_queue(&h.admin, &slug, &1, &BytesN::from_array(&h.env, &[5u8; 32]));
}

#[test]
#[should_panic(expected = "wasm hash not approved")]
fn test_upgrade_rejects_unapproved_hash() {
    let h = Harness::new();
    let client = h.client();
    client.set_config(&h.admin, &1, &3);
    client.register_approved_hash(&h.admin, &3, &BytesN::from_array(&h.env, &[6u8; 32]));
    let slug = Symbol::new(&h.env, "secure");
    let addr = Address::generate(&h.env);
    client.register_queue(&h.admin, &slug, &addr, &2);

    client.upgrade_queue(&h.admin, &slug, &3, &BytesN::from_array(&h.env, &[7u8; 32]));
}

#[test]
#[should_panic(expected = "wasm hash not approved")]
fn test_deploy_rejects_unapproved_hash() {
    let h = Harness::new();
    let client = h.client();
    // Register a version-1 hash different from the deployed fixture so the
    // approved-hash registry is enabled and then rejects the mismatched deploy.
    client.register_approved_hash(&h.admin, &1, &BytesN::from_array(&h.env, &[6u8; 32]));

    let deployer = Address::generate(&h.env);
    client.deploy_queue(
        &deployer,
        &Symbol::new(&h.env, "secure"),
        &Symbol::new(&h.env, "S"),
        &1,
        &h.wasm_hash(),
        &BytesN::from_array(&h.env, &[9u8; 32]),
    );
}

#[test]
fn test_register_queue_imports_existing_contract() {
    let h = Harness::new();
    let client = h.client();
    let slug = Symbol::new(&h.env, "imported");
    let addr = Address::generate(&h.env);
    client.register_queue(&h.admin, &slug, &addr, &3);

    let meta = client.get_queue(&slug).unwrap();
    assert_eq!(meta.contract_address, addr);
    assert_eq!(meta.version, 3);
    assert_eq!(client.queue_count(), 1);
    assert_eq!(client.list_queues().len(), 1);
}

#[test]
#[should_panic(expected = "queue already registered")]
fn test_register_queue_rejects_duplicate() {
    let h = Harness::new();
    let client = h.client();
    let slug = Symbol::new(&h.env, "dup_import");
    let addr = Address::generate(&h.env);
    client.register_queue(&h.admin, &slug, &addr, &1);
    client.register_queue(&h.admin, &slug, &addr, &2);
}

#[test]
fn test_destroy_removes_queue_and_allows_slug_reuse() {
    let h = Harness::new();
    let client = h.client();
    let slug = Symbol::new(&h.env, "reusable");
    let addr = Address::generate(&h.env);

    client.register_queue(&h.admin, &slug, &addr, &1);
    client.destroy_queue(&h.admin, &slug);
    assert!(client.get_queue(&slug).is_none());
    assert_eq!(client.queue_count(), 0);

    let addr2 = Address::generate(&h.env);
    client.register_queue(&h.admin, &slug, &addr2, &1);
    assert_eq!(client.list_queues().len(), 1);
    assert!(client.get_queue(&slug).is_some());
    assert_eq!(client.queue_count(), 1);
}
