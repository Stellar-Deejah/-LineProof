use crate::{BindingStatus, IdentityImpl, IdentityImplClient};
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

fn setup() -> (Env, Address, Address) {
    let env = Env::default();
    let user = Address::generate(&env);
    let contract_id = env.register(IdentityImpl, ());
    env.mock_all_auths();
    (env, user, contract_id)
}

#[test]
fn test_bind_creates_record_with_timestamp() {
    let (env, user, contract_id) = setup();
    let client = IdentityImplClient::new(&env, &contract_id);
    let queue_id = Symbol::new(&env, "sneaker_drop");
    client.bind(&user, &queue_id);
    let record = client.get_record(&user).unwrap();
    assert!(record.queues.iter().any(|q| q == queue_id));
    assert!(matches!(record.status, BindingStatus::Bound));
    // bound_at should be set (ledger timestamp in tests defaults to 0)
    assert_eq!(record.bound_at, 0); // default test env timestamp
}

#[test]
fn test_unbind_removes_queue() {
    let (env, user, contract_id) = setup();
    let client = IdentityImplClient::new(&env, &contract_id);
    let queue_id = Symbol::new(&env, "concert");
    client.bind(&user, &queue_id);
    client.unbind(&user, &queue_id);
    assert!(!client.is_bound(&user, &queue_id));
}

#[test]
fn test_is_bound_returns_false_before_bind() {
    let (env, user, contract_id) = setup();
    let client = IdentityImplClient::new(&env, &contract_id);
    let queue_id = Symbol::new(&env, "new_queue");
    assert!(!client.is_bound(&user, &queue_id));
}

#[test]
fn test_can_transfer_returns_false_for_revoked_identity() {
    let (env, _user, contract_id) = setup();
    let client = IdentityImplClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    let user = Address::generate(&env);
    let other = Address::generate(&env);
    let queue_id = Symbol::new(&env, "q_transfer");
    client.bind(&user, &queue_id);
    client.set_transfer_allowed(&admin, &true);
    client.revoke(&admin, &user);
    assert!(!client.can_transfer(&user, &other, &queue_id));
}

#[test]
fn test_can_transfer_returns_false_when_unbound() {
    let (env, _user, contract_id) = setup();
    let client = IdentityImplClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    let user = Address::generate(&env);
    let other = Address::generate(&env);
    let queue_id = Symbol::new(&env, "q_unbound");
    client.set_transfer_allowed(&admin, &true);
    assert!(!client.can_transfer(&user, &other, &queue_id));
}

#[test]
fn test_can_transfer_returns_true_when_allowed_and_bound() {
    let (env, _user, contract_id) = setup();
    let client = IdentityImplClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    let user = Address::generate(&env);
    let other = Address::generate(&env);
    let queue_id = Symbol::new(&env, "q_allowed");
    client.bind(&user, &queue_id);
    client.set_transfer_allowed(&admin, &true);
    assert!(client.can_transfer(&user, &other, &queue_id));
}

#[test]
fn test_can_transfer_returns_false_when_not_allowed_but_bound() {
    let (env, _user, contract_id) = setup();
    let client = IdentityImplClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    let user = Address::generate(&env);
    let other = Address::generate(&env);
    let queue_id = Symbol::new(&env, "q_not_allowed");
    client.bind(&user, &queue_id);
    // Not setting transfer_allowed to true (default is false)
    assert!(!client.can_transfer(&user, &other, &queue_id));
}

#[test]
fn test_can_transfer_returns_true_same_identity() {
    let (env, user, contract_id) = setup();
    let client = IdentityImplClient::new(&env, &contract_id);
    let queue_id = Symbol::new(&env, "self");
    assert!(client.can_transfer(&user, &user, &queue_id));
}

#[test]
fn test_record_transfer_attempt_persists() {
    let (env, user, contract_id) = setup();
    let client = IdentityImplClient::new(&env, &contract_id);
    let other = Address::generate(&env);
    let queue_id = Symbol::new(&env, "drop");
    client.record_transfer_attempt(&user, &other, &queue_id);
    let key = IdentityImpl::attempt_key(&env, &user, &other, &queue_id);
    let attempt = env.as_contract(&contract_id, || {
        env.storage().persistent().get::<_, crate::TransferAttempt>(&key)
    });
    assert!(attempt.is_some());
    assert!(attempt.unwrap().reverted);
}

#[test]
fn test_initialize_sets_admin() {
    let (env, _user, contract_id) = setup();
    let client = IdentityImplClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    let stored = client.get_admin();
    assert_eq!(stored, Some(admin));
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_initialize_twice_panics() {
    let (env, _user, contract_id) = setup();
    let client = IdentityImplClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    client.initialize(&admin);
}

#[test]
fn test_revoke_sets_revoked_status() {
    let (env, _user, contract_id) = setup();
    let client = IdentityImplClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    let user = Address::generate(&env);
    let queue_id = Symbol::new(&env, "q");
    client.bind(&user, &queue_id);
    client.revoke(&admin, &user);
    let record = client.get_record(&user).unwrap();
    assert!(matches!(record.status, BindingStatus::Revoked));
}

#[test]
#[should_panic(expected = "identity revoked")]
fn test_bind_after_revoke_panics() {
    let (env, _user, contract_id) = setup();
    let client = IdentityImplClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    let user = Address::generate(&env);
    let q1 = Symbol::new(&env, "q1");
    let q2 = Symbol::new(&env, "q2");
    client.bind(&user, &q1);
    client.revoke(&admin, &user);
    client.bind(&user, &q2);
}

#[test]
fn test_can_transfer_revoked_identity_returns_false() {
    // A revoked identity must never be transferable, even when it remains
    // bound to the queue and transfers are globally allowed.
    let (env, _user, contract_id) = setup();
    let client = IdentityImplClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    let user = Address::generate(&env);
    let other = Address::generate(&env);
    let queue_id = Symbol::new(&env, "q_revoked");
    client.bind(&user, &queue_id);
    client.set_transfer_allowed(&admin, &true);
    client.revoke(&admin, &user);
    assert!(!client.can_transfer(&user, &other, &queue_id));
}

#[test]
#[should_panic(expected = "unauthorized")]
fn test_revoke_by_non_admin_panics() {
    let (env, _user, contract_id) = setup();
    let client = IdentityImplClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    let user = Address::generate(&env);
    let not_admin = Address::generate(&env);
    client.revoke(&not_admin, &user);
}

#[test]
fn test_get_admin_returns_none_before_initialize() {
    let (env, _user, contract_id) = setup();
    let client = IdentityImplClient::new(&env, &contract_id);
    assert_eq!(client.get_admin(), None);
}

#[test]
fn test_unbind_on_non_bound_queue_is_noop() {
    let (env, user, contract_id) = setup();
    let client = IdentityImplClient::new(&env, &contract_id);
    let bound_queue = Symbol::new(&env, "bound");
    let other_queue = Symbol::new(&env, "not_bound");
    client.bind(&user, &bound_queue);
    client.unbind(&user, &other_queue);
    assert!(client.is_bound(&user, &bound_queue));
}

#[test]
#[should_panic(expected = "already_bound")]
fn test_double_bind_panics() {
    let (env, user, contract_id) = setup();
    let client = IdentityImplClient::new(&env, &contract_id);
    let queue_id = Symbol::new(&env, "duplicate_queue");
    client.bind(&user, &queue_id);
    client.bind(&user, &queue_id);
}

#[test]
#[should_panic(expected = "max_queues_reached")]
fn test_max_queues_reached_panics() {
    let (env, user, contract_id) = setup();
    let client = IdentityImplClient::new(&env, &contract_id);
    for i in 0..100 {
        let mut buf = [0u8; 5];
        buf[0] = b'q';
        buf[1] = b'_';
        buf[2] = b'0' + ((i / 100) % 10) as u8;
        buf[3] = b'0' + ((i / 10) % 10) as u8;
        buf[4] = b'0' + (i % 10) as u8;
        let s_str = core::str::from_utf8(&buf).unwrap();
        let symbol = Symbol::new(&env, s_str);
        client.bind(&user, &symbol);
    }
    let extra_symbol = Symbol::new(&env, "q_overflow");
    client.bind(&user, &extra_symbol);
}

#[test]
fn test_unbind_after_single_bind_leaves_empty_queues_vec() {
    let (env, user, contract_id) = setup();
    let client = IdentityImplClient::new(&env, &contract_id);
    let queue_id = Symbol::new(&env, "single_queue");
    client.bind(&user, &queue_id);
    assert!(client.is_bound(&user, &queue_id));
    client.unbind(&user, &queue_id);
    assert!(!client.is_bound(&user, &queue_id));
    let record = client.get_record(&user).unwrap();
    assert_eq!(record.queues.len(), 0);
}
