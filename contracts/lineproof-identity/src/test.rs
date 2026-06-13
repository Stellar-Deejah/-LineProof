use std::panic;

use soroban_sdk::{testutils::Address as _, Address, Env, Symbol, Vec};

use crate::{BindingStatus, IdentityImpl, IdentityRecord, TransferAttempt};

fn setup() -> (Env, Address) {
    let env = Env::default();
    let user = Address::new(&env, &[1; 7]);
    (env, user)
}

#[test]
fn test_bind_creates_record() {
    let (env, user) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    let queue_id = Symbol::new(&env, "sneaker-drop");
    IdentityImpl::bind(env.clone(), user.clone(), queue_id.clone());
    let record = IdentityImpl::get_record(env.clone(), user.clone()).unwrap();
    assert!(record.queues.iter().any(|q| q == &queue_id));
    panic::set_hook(None);
}

#[test]
fn test_unbind_removes_queue() {
    let (env, user) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    let queue_id = Symbol::new(&env, "concert");
    IdentityImpl::bind(env.clone(), user.clone(), queue_id.clone());
    IdentityImpl::unbind(env.clone(), user.clone(), queue_id.clone());
    assert!(!IdentityImpl::is_bound(env.clone(), user.clone(), queue_id));
    panic::set_hook(None);
}

#[test]
fn test_non_transfer_enforcement() {
    let (env, user) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    let other = Address::new(&env, &[2; 7]);
    let queue_id = Symbol::new(&env, "sneaker-drop");
    IdentityImpl::bind(env.clone(), user.clone(), queue_id.clone());
    assert!(IdentityImpl::can_transfer(env.clone(), user.clone(), other.clone(), queue_id.clone()));
    // Transfer between two bound identities should fail (return false).
    // We record the failed attempt.
    IdentityImpl::record_transfer_attempt(env.clone(), user.clone(), other, queue_id.clone());
    assert!(!IdentityImpl::can_transfer(env, user, other, queue_id));
    panic::set_hook(None);
}

#[test]
fn test_attack_sequence_cannot_transfer() {
    let (env, user) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    let attacker = Address::new(&env, &[3u8; 7]);
    let queue_id = Symbol::new(&env, "drop");
    IdentityImpl::bind(env.clone(), user.clone(), queue_id.clone());
    assert!(!IdentityImpl::can_transfer(env.clone(), user.clone(), attacker.clone(), queue_id.clone()));
    // Record attempts should not change the non-transfer outcome.
    IdentityImpl::record_transfer_attempt(env, user, attacker, queue_id);
    panic::set_hook(None);
}

#[test]
fn test_rebind_after_revoke_fails() {
    let (env, user) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    let queue_id = Symbol::new(&env, "limited");
    IdentityImpl::bind(env.clone(), user.clone(), queue_id.clone());
    // Manually revoke status to simulate an admin revoke scenario.
    let mut record = IdentityImpl::get_record(env.clone(), user.clone()).unwrap();
    record.status = BindingStatus::Revoked;
    let key = IdentityImpl::record_key(&env, &user);
    env.storage().persistent().set(&key, &record);
    assert!(!IdentityImpl::is_bound(env.clone(), user.clone(), queue_id.clone()));
    // Further bind should panic with "identity revoked".
    panic::set_hook(Some(Box::new(|_| {})));
    IdentityImpl::bind(env, user, queue_id);
}
