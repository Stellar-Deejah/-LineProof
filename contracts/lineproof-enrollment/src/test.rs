use std::panic;

use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

use crate::{EnrollmentImpl, EnrollmentRecord};

fn setup() -> (Env, Address) {
    let env = Env::default();
    let caller = Address::new(&env, &[1; 7]);
    (env, caller)
}

#[test]
fn test_enroll_creates_record() {
    let (env, caller) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    let queue_id = Symbol::new(&env, "sneaker-drop");
    let proof = EnrollmentImpl::enroll(env.clone(), caller.clone(), queue_id.clone());
    assert_eq!(proof.identity, caller);
    assert_eq!(proof.queue_id, queue_id);
    let record = EnrollmentImpl::enrollment_record(env.clone(), caller.clone(), queue_id.clone()).unwrap();
    assert_eq!(record.identity, caller);
    assert_eq!(record.queue_id, queue_id);
    assert!(!record.finalized);
    panic::set_hook(None);
}

#[test]
#[should_panic(expected = "duplicate enrollment")]
fn test_enroll_rejects_duplicate() {
    let (env, caller) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    let queue_id = Symbol::new(&env, "concert");
    EnrollmentImpl::enroll(env.clone(), caller.clone(), queue_id.clone());
    EnrollmentImpl::enroll(env, caller, queue_id);
}

#[test]
fn test_is_enrolled_returns_true_after_enrollment() {
    let (env, caller) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    let queue_id = Symbol::new(&env, "visa");
    assert!(!EnrollmentImpl::is_enrolled(
        env.clone(),
        caller.clone(),
        queue_id.clone()
    ));
    EnrollmentImpl::enroll(env.clone(), caller.clone(), queue_id.clone());
    assert!(EnrollmentImpl::is_enrolled(env, caller, queue_id));
    panic::set_hook(None);
}

#[test]
fn test_cancel_removes_record() {
    let (env, caller) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    let queue_id = Symbol::new(&env, "health");
    EnrollmentImpl::enroll(env.clone(), caller.clone(), queue_id.clone());
    EnrollmentImpl::cancel(env.clone(), caller.clone(), queue_id.clone());
    assert!(!EnrollmentImpl::is_enrolled(env, caller, queue_id));
    panic::set_hook(None);
}

#[test]
#[should_panic(expected = "not enrolled")]
fn test_cancel_panics_when_not_enrolled() {
    let (env, caller) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    let queue_id = Symbol::new(&env, "absent");
    EnrollmentImpl::cancel(env, caller, queue_id);
}

#[test]
fn test_enrollment_record_queries() {
    let (env, caller) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    let queue_id = Symbol::new(&env, "query");
    EnrollmentImpl::enroll(env.clone(), caller.clone(), queue_id.clone());
    let record = EnrollmentImpl::enrollment_record(env.clone(), caller.clone(), queue_id.clone()).unwrap();
    assert_eq!(record.queue_id, queue_id);
    assert_eq!(record.identity, caller);
    assert_eq!(record.finalized, false);
    assert_eq!(record.duplicate_count, 0);
    panic::set_hook(None);
}

#[test]
fn test_enrollment_record_returns_none_when_missing() {
    let (env, caller) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    let queue_id = Symbol::new(&env, "missing");
    let record = EnrollmentImpl::enrollment_record(env, caller, queue_id);
    assert!(record.is_none());
    panic::set_hook(None);
}

#[test]
fn test_multiple_users_same_queue() {
    let (env, _a) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    let caller1 = Address::new(&env, &[1u8; 7]);
    let caller2 = Address::new(&env, &[2u8; 7]);
    let queue_id = Symbol::new(&env, "shared");
    EnrollmentImpl::enroll(env.clone(), caller1.clone(), queue_id.clone());
    EnrollmentImpl::enroll(env.clone(), caller2.clone(), queue_id.clone());
    assert!(EnrollmentImpl::is_enrolled(env.clone(), caller1, queue_id.clone()));
    assert!(EnrollmentImpl::is_enrolled(env, caller2, queue_id));
    panic::set_hook(None);
}

#[test]
fn test_set_duplicate_behavior() {
    let (env, caller) = setup();
    panic::set_hook(Some(Box::new(|_| {})));
    let queue_id = Symbol::new(&env, "behavior");
    EnrollmentImpl::set_duplicate_behavior(env.clone(), caller.clone(), crate::DuplicateBehavior::GrantWaitingList);
    // The behavior goes into storage; here we only verify no panic.
    panic::set_hook(None);
}
