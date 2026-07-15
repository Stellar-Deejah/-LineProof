use crate::{BindingStatus, Identity, IdentityImpl};
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

fn setup() -> (Env, Address) {
    let env = Env::default();
    let user = Address::generate(&env);
    (env, user)
}

#[test]
fn test_bind_creates_record_with_timestamp() {
    let (env, user) = setup();
    let queue_id = Symbol::new(&env, "sneaker-drop");
    IdentityImpl::bind(env.clone(), user.clone(), queue_id.clone());
    let record = IdentityImpl::get_record(env.clone(), user.clone()).unwrap();
    assert!(record.queues.iter().any(|q| q == queue_id));
    assert!(matches!(record.status, BindingStatus::Bound));
    // bound_at should be set (ledger timestamp in tests defaults to 0)
    assert_eq!(record.bound_at, 0); // default test env timestamp
}

#[test]
fn test_unbind_removes_queue() {
    let (env, user) = setup();
    let queue_id = Symbol::new(&env, "concert");
    IdentityImpl::bind(env.clone(), user.clone(), queue_id.clone());
    IdentityImpl::unbind(env.clone(), user.clone(), queue_id.clone());
    assert!(!IdentityImpl::is_bound(env.clone(), user.clone(), queue_id));
}

#[test]
fn test_is_bound_returns_false_before_bind() {
    let (env, user) = setup();
    let queue_id = Symbol::new(&env, "new-queue");
    assert!(!IdentityImpl::is_bound(env, user, queue_id));
}

#[test]
fn test_can_transfer_returns_false_for_different_identities() {
    let (env, user) = setup();
    let other = Address::generate(&env);
    let queue_id = Symbol::new(&env, "drop");
    IdentityImpl::bind(env.clone(), user.clone(), queue_id.clone());
    assert!(!IdentityImpl::can_transfer(env, user, other, queue_id));
}

#[test]
fn test_can_transfer_returns_true_same_identity() {
    let (env, user) = setup();
    let queue_id = Symbol::new(&env, "self");
    assert!(IdentityImpl::can_transfer(env, user.clone(), user, queue_id));
}

#[test]
fn test_record_transfer_attempt_persists() {
    let (env, user) = setup();
    let other = Address::generate(&env);
    let queue_id = Symbol::new(&env, "drop");
    IdentityImpl::record_transfer_attempt(env.clone(), user.clone(), other.clone(), queue_id.clone());
    let key = IdentityImpl::attempt_key(&env, &user, &other, &queue_id);
    let attempt = env.storage().persistent().get::<_, crate::TransferAttempt>(&key);
    assert!(attempt.is_some());
    assert!(attempt.unwrap().reverted);
}

#[test]
fn test_initialize_sets_admin() {
    let (env, admin) = setup();
    IdentityImpl::initialize(env.clone(), admin.clone());
    let stored = IdentityImpl::get_admin(env.clone());
    assert_eq!(stored, Some(admin));
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_initialize_twice_panics() {
    let (env, admin) = setup();
    IdentityImpl::initialize(env.clone(), admin.clone());
    IdentityImpl::initialize(env, admin);
}

#[test]
fn test_revoke_sets_revoked_status() {
    let (env, admin) = setup();
    IdentityImpl::initialize(env.clone(), admin.clone());
    let user = Address::generate(&env);
    let queue_id = Symbol::new(&env, "q");
    IdentityImpl::bind(env.clone(), user.clone(), queue_id);
    IdentityImpl::revoke(env.clone(), admin.clone(), user.clone());
    let record = IdentityImpl::get_record(env, user).unwrap();
    assert!(matches!(record.status, BindingStatus::Revoked));
}

#[test]
#[should_panic(expected = "identity revoked")]
fn test_bind_after_revoke_panics() {
    let (env, admin) = setup();
    IdentityImpl::initialize(env.clone(), admin.clone());
    let user = Address::generate(&env);
    let q1 = Symbol::new(&env, "q1");
    let q2 = Symbol::new(&env, "q2");
    IdentityImpl::bind(env.clone(), user.clone(), q1);
    IdentityImpl::revoke(env.clone(), admin, user.clone());
    IdentityImpl::bind(env, user, q2);
}
