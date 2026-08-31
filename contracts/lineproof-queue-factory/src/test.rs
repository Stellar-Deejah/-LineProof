use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, Symbol};

use crate::{QueueFactoryImpl, QueueFactoryImplClient};

fn setup() -> (Env, Address, Address) {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(QueueFactoryImpl, ());
    env.mock_all_auths();
    (env, admin, contract_id)
}

fn init<'a>(env: &'a Env, admin: &Address, contract_id: &Address) -> QueueFactoryImplClient<'a> {
    let client = QueueFactoryImplClient::new(env, contract_id);
    client.initialize(admin);
    client
}

#[test]
fn test_initialize() {
    let (env, admin, contract_id) = setup();
    let client = init(&env, &admin, &contract_id);
    let count = client.queue_count();
    assert_eq!(count, 0);
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_initialize_twice_panics() {
    let (env, admin, contract_id) = setup();
    let client = init(&env, &admin, &contract_id);
    client.initialize(&admin);
}

#[test]
fn test_register_and_index_queue() {
    let (env, admin, contract_id) = setup();
    let client = init(&env, &admin, &contract_id);
    let slug = Symbol::new(&env, "test_q");
    let queue_contract = Address::generate(&env);
    client.register_queue(&admin, &slug, &queue_contract, &1);

    let meta = client.get_queue(&slug);
    assert!(meta.is_some());
    assert!(meta.unwrap().active);

    let slugs = client.list_queues();
    assert_eq!(slugs.len(), 1);

    let count = client.queue_count();
    assert_eq!(count, 1);
}

#[test]
fn test_list_queues_returns_all_slugs() {
    let (env, admin, contract_id) = setup();
    let client = init(&env, &admin, &contract_id);
    for i in 0u8..3 {
        let slug = Symbol::new(&env, &format!("q{}", i));
        let queue_contract = Address::generate(&env);
        client.register_queue(&admin, &slug, &queue_contract, &1);
    }
    let slugs = client.list_queues();
    assert_eq!(slugs.len(), 3);
    assert_eq!(client.queue_count(), 3);
}

#[test]
fn test_deactivate_and_reactivate() {
    let (env, admin, contract_id) = setup();
    let client = init(&env, &admin, &contract_id);
    let slug = Symbol::new(&env, "toggle");
    let queue_contract = Address::generate(&env);
    client.register_queue(&admin, &slug, &queue_contract, &1);

    assert!(client.verify_queue(&slug));
    client.deactivate_queue(&admin, &slug);
    assert!(!client.verify_queue(&slug));
    client.reactivate_queue(&admin, &slug);
    assert!(client.verify_queue(&slug));
}

#[test]
fn test_get_queue_returns_none_for_unknown() {
    let (env, admin, contract_id) = setup();
    let client = init(&env, &admin, &contract_id);
    let result = client.get_queue(&Symbol::new(&env, "ghost"));
    assert!(result.is_none());
}

#[test]
#[should_panic(expected = "queue already registered")]
fn test_register_rejects_duplicate_slug() {
    let (env, admin, contract_id) = setup();
    let client = init(&env, &admin, &contract_id);
    let slug = Symbol::new(&env, "dup");
    client.register_queue(&admin, &slug, &Address::generate(&env), &1);
    client.register_queue(&admin, &slug, &Address::generate(&env), &1);
}

#[test]
#[should_panic(expected = "version must increase")]
fn test_upgrade_rejects_downgrade() {
    let (env, admin, contract_id) = setup();
    let client = init(&env, &admin, &contract_id);
    client.set_config(&admin, &1, &3);
    let slug = Symbol::new(&env, "downgrade");
    client.register_queue(&admin, &slug, &Address::generate(&env), &2);

    client.upgrade_queue(&admin, &slug, &1, &BytesN::from_array(&env, &[5u8; 32]));
}

#[test]
#[should_panic(expected = "wasm hash not approved")]
fn test_upgrade_rejects_unapproved_hash() {
    let (env, admin, contract_id) = setup();
    let client = init(&env, &admin, &contract_id);
    client.set_config(&admin, &1, &2);
    client.register_approved_hash(&admin, &2, &BytesN::from_array(&env, &[6u8; 32]));
    let slug = Symbol::new(&env, "secure");
    client.register_queue(&admin, &slug, &Address::generate(&env), &1);

    client.upgrade_queue(&admin, &slug, &2, &BytesN::from_array(&env, &[7u8; 32]));
}

#[test]
#[should_panic(expected = "wasm hash not approved")]
fn test_upgrade_rejects_hash_mismatch_with_registry_enabled() {
    let (env, admin, contract_id) = setup();
    let client = init(&env, &admin, &contract_id);
    client.set_config(&admin, &1, &2);
    client.register_approved_hash(&admin, &2, &BytesN::from_array(&env, &[7u8; 32]));
    let slug = Symbol::new(&env, "unapproved");
    client.register_queue(&admin, &slug, &Address::generate(&env), &1);
    client.upgrade_queue(&admin, &slug, &2, &BytesN::from_array(&env, &[8u8; 32]));
}

#[test]
fn test_destroy_removes_queue_and_allows_slug_reuse() {
    let (env, admin, contract_id) = setup();
    let client = init(&env, &admin, &contract_id);
    let slug = Symbol::new(&env, "reusable");
    client.register_queue(&admin, &slug, &Address::generate(&env), &1);

    client.destroy_queue(&admin, &slug);
    assert!(client.get_queue(&slug).is_none());
    assert_eq!(client.queue_count(), 0);

    client.register_queue(&admin, &slug, &Address::generate(&env), &1);
    assert!(client.get_queue(&slug).is_some());
    assert_eq!(client.queue_count(), 1);
}

// issue #176: `require_auth()` alone only proves the transaction was signed
// by whatever address is passed as `admin` — it does not prove that address
// is the *stored* admin. `env.mock_all_auths()` (see `setup()`) makes every
// `require_auth()` call succeed regardless of caller, which is exactly what
// isolates that gap in these tests: a `not_admin` address sails through
// `require_auth()` unmocked-signature-and-all, so if `require_admin` didn't
// also compare against `FactoryConfig.admin`, these calls would succeed
// instead of panicking. Asserting on `expected = "unauthorized"` (not a bare
// `#[should_panic]`) pins the failure to that specific check, not to an
// incidental panic (e.g. "not initialized") elsewhere in the call path.

#[test]
#[should_panic(expected = "unauthorized")]
fn test_set_config_non_admin_panics() {
    let (env, admin, contract_id) = setup();
    let client = init(&env, &admin, &contract_id);
    let not_admin = Address::generate(&env);
    client.set_config(&not_admin, &1, &2);
}

#[test]
#[should_panic(expected = "unauthorized")]
fn test_register_queue_non_admin_panics() {
    let (env, admin, contract_id) = setup();
    let client = init(&env, &admin, &contract_id);
    let not_admin = Address::generate(&env);
    let slug = Symbol::new(&env, "gatekept");
    client.register_queue(&not_admin, &slug, &Address::generate(&env), &1);
}

#[test]
#[should_panic(expected = "unauthorized")]
fn test_deactivate_queue_non_admin_panics() {
    let (env, admin, contract_id) = setup();
    let client = init(&env, &admin, &contract_id);
    let slug = Symbol::new(&env, "gatekept_deactivate");
    client.register_queue(&admin, &slug, &Address::generate(&env), &1);
    let not_admin = Address::generate(&env);
    client.deactivate_queue(&not_admin, &slug);
}

#[test]
#[should_panic(expected = "unauthorized")]
fn test_reactivate_queue_non_admin_panics() {
    let (env, admin, contract_id) = setup();
    let client = init(&env, &admin, &contract_id);
    let slug = Symbol::new(&env, "gatekept_reactivate");
    client.register_queue(&admin, &slug, &Address::generate(&env), &1);
    client.deactivate_queue(&admin, &slug);
    let not_admin = Address::generate(&env);
    client.reactivate_queue(&not_admin, &slug);
}

#[test]
#[should_panic(expected = "unauthorized")]
fn test_upgrade_queue_non_admin_panics() {
    let (env, admin, contract_id) = setup();
    let client = init(&env, &admin, &contract_id);
    client.set_config(&admin, &1, &2);
    let slug = Symbol::new(&env, "protected");
    client.register_queue(&admin, &slug, &Address::generate(&env), &1);
    let not_admin = Address::generate(&env);
    client.upgrade_queue(&not_admin, &slug, &2, &BytesN::from_array(&env, &[9u8; 32]));
}

// Not named in issue #176's acceptance criteria, but gated by the same
// `require_admin` helper — covered for completeness since the vulnerability
// (and the fix) is in the shared helper, not in any one caller.

#[test]
#[should_panic(expected = "unauthorized")]
fn test_register_approved_hash_non_admin_panics() {
    let (env, admin, contract_id) = setup();
    let client = init(&env, &admin, &contract_id);
    let not_admin = Address::generate(&env);
    client.register_approved_hash(&not_admin, &1, &BytesN::from_array(&env, &[1u8; 32]));
}

#[test]
#[should_panic(expected = "unauthorized")]
fn test_destroy_queue_non_admin_panics() {
    let (env, admin, contract_id) = setup();
    let client = init(&env, &admin, &contract_id);
    let slug = Symbol::new(&env, "gatekept_destroy");
    client.register_queue(&admin, &slug, &Address::generate(&env), &1);
    let not_admin = Address::generate(&env);
    client.destroy_queue(&not_admin, &slug);
}

#[test]
#[should_panic(expected = "version must increase")]
fn test_upgrade_queue_version_downgrade_panics() {
    let (env, admin, contract_id) = setup();
    let client = init(&env, &admin, &contract_id);
    client.set_config(&admin, &1, &3);
    let slug = Symbol::new(&env, "downgrade_ac");
    client.register_queue(&admin, &slug, &Address::generate(&env), &2);
    client.upgrade_queue(&admin, &slug, &1, &BytesN::from_array(&env, &[5u8; 32]));
}

#[test]
fn test_queue_count_includes_deactivated() {
    // Deactivation is a soft toggle on QueueMetadata.active; it does not
    // remove the slug from the registry index, so queue_count (which counts
    // the index) intentionally still includes deactivated queues. Only
    // destroy_queue removes a slug from the count.
    let (env, admin, contract_id) = setup();
    let client = init(&env, &admin, &contract_id);
    let slug = Symbol::new(&env, "counted_inactive");
    client.register_queue(&admin, &slug, &Address::generate(&env), &1);
    assert_eq!(client.queue_count(), 1);

    client.deactivate_queue(&admin, &slug);
    assert_eq!(client.queue_count(), 1);
    assert!(!client.verify_queue(&slug));
}
