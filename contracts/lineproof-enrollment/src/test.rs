use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

use crate::{DuplicateBehavior, Enrollment, EnrollmentImpl};

fn setup() -> (Env, Address) {
    let env = Env::default();
    let caller = Address::generate(&env);
    (env, caller)
}

#[test]
fn test_enroll_creates_record() {
    let (env, caller) = setup();
    let queue_id = Symbol::new(&env, "sneaker-drop");
    let proof = EnrollmentImpl::enroll(env.clone(), caller.clone(), queue_id.clone());
    assert_eq!(proof.identity, caller);
    assert_eq!(proof.queue_id, queue_id);
    let record = EnrollmentImpl::enrollment_record(env.clone(), caller.clone(), queue_id.clone()).unwrap();
    assert_eq!(record.identity, caller);
    assert!(!record.finalized);
    assert_eq!(record.duplicate_count, 0);
}

#[test]
#[should_panic(expected = "duplicate enrollment")]
fn test_enroll_rejects_duplicate_by_default() {
    let (env, caller) = setup();
    let queue_id = Symbol::new(&env, "concert");
    EnrollmentImpl::enroll(env.clone(), caller.clone(), queue_id.clone());
    EnrollmentImpl::enroll(env, caller, queue_id);
}

#[test]
fn test_is_enrolled_returns_correct_state() {
    let (env, caller) = setup();
    let queue_id = Symbol::new(&env, "visa");
    assert!(!EnrollmentImpl::is_enrolled(env.clone(), caller.clone(), queue_id.clone()));
    EnrollmentImpl::enroll(env.clone(), caller.clone(), queue_id.clone());
    assert!(EnrollmentImpl::is_enrolled(env, caller, queue_id));
}

#[test]
fn test_cancel_removes_enrollment() {
    let (env, caller) = setup();
    let queue_id = Symbol::new(&env, "health");
    EnrollmentImpl::enroll(env.clone(), caller.clone(), queue_id.clone());
    EnrollmentImpl::cancel(env.clone(), caller.clone(), queue_id.clone());
    assert!(!EnrollmentImpl::is_enrolled(env, caller, queue_id));
}

#[test]
#[should_panic(expected = "not enrolled")]
fn test_cancel_panics_when_not_enrolled() {
    let (env, caller) = setup();
    EnrollmentImpl::cancel(env.clone(), caller, Symbol::new(&env, "absent"));
}

#[test]
fn test_multiple_users_same_queue() {
    let (env, _) = setup();
    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    let queue_id = Symbol::new(&env, "shared");
    EnrollmentImpl::enroll(env.clone(), u1.clone(), queue_id.clone());
    EnrollmentImpl::enroll(env.clone(), u2.clone(), queue_id.clone());
    assert!(EnrollmentImpl::is_enrolled(env.clone(), u1, queue_id.clone()));
    assert!(EnrollmentImpl::is_enrolled(env, u2, queue_id));
}

#[test]
fn test_set_duplicate_behavior() {
    let (env, admin) = setup();
    // Should not panic
    EnrollmentImpl::set_duplicate_behavior(env, admin, DuplicateBehavior::GrantWaitingList);
}

#[test]
fn test_finalize_enrollment() {
    let (env, admin) = setup();
    let user = Address::generate(&env);
    let queue_id = Symbol::new(&env, "fin-q");
    EnrollmentImpl::enroll(env.clone(), user.clone(), queue_id.clone());
    EnrollmentImpl::finalize_enrollment(env.clone(), admin.clone(), user.clone(), queue_id.clone());
    let record = EnrollmentImpl::enrollment_record(env.clone(), user, queue_id).unwrap();
    assert!(record.finalized);
}

#[test]
#[should_panic(expected = "already finalized")]
fn test_finalize_twice_panics() {
    let (env, admin) = setup();
    let user = Address::generate(&env);
    let queue_id = Symbol::new(&env, "fin2");
    EnrollmentImpl::enroll(env.clone(), user.clone(), queue_id.clone());
    EnrollmentImpl::finalize_enrollment(env.clone(), admin.clone(), user.clone(), queue_id.clone());
    EnrollmentImpl::finalize_enrollment(env, admin, user, queue_id);
}

#[test]
fn test_enrollment_record_returns_none_when_missing() {
    let (env, caller) = setup();
    let result = EnrollmentImpl::enrollment_record(env.clone(), caller, Symbol::new(&env, "missing"));
    assert!(result.is_none());
}
