use soroban_sdk::{
    testutils::{Address as AddressTrait, Events as EventsTrait, Ledger as LedgerTrait},
    Address, Env, Symbol, TryFromVal, BytesN,
};

use crate::{DuplicateBehavior, Enrollment, EnrollmentImpl};

fn setup() -> (Env, Address) {
    let env = Env::default();
use crate::{DuplicateBehavior, EnrollmentImpl, EnrollmentImplClient};

fn setup() -> (Env, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let caller = Address::generate(&env);
    (env, caller)
}

#[test]
fn test_enroll_creates_record() {
    let (env, caller) = setup();
    let contract_id = env.register(EnrollmentImpl, ());
    let client = EnrollmentImplClient::new(&env, &contract_id);
    let queue_id = Symbol::new(&env, "sneaker_drop");
    let proof = client.enroll(&caller, &queue_id, &None);
    assert_eq!(proof.identity, caller);
    assert_eq!(proof.queue_id, queue_id);
    let record = client.enrollment_record(&caller, &queue_id).unwrap();
    assert_eq!(record.identity, caller);
    assert!(!record.finalized);
    assert_eq!(record.duplicate_count, 0);
}

#[test]
#[should_panic(expected = "duplicate enrollment")]
fn test_enroll_rejects_duplicate_by_default() {
    let (env, caller) = setup();
    let contract_id = env.register(EnrollmentImpl, ());
    let client = EnrollmentImplClient::new(&env, &contract_id);
    let queue_id = Symbol::new(&env, "concert");
    client.enroll(&caller, &queue_id, &None);
    client.enroll(&caller, &queue_id, &None);
}

#[test]
fn test_is_enrolled_returns_correct_state() {
    let (env, caller) = setup();
    let contract_id = env.register(EnrollmentImpl, ());
    let client = EnrollmentImplClient::new(&env, &contract_id);
    let queue_id = Symbol::new(&env, "visa");
    assert!(!client.is_enrolled(&caller, &queue_id));
    client.enroll(&caller, &queue_id, &None);
    assert!(client.is_enrolled(&caller, &queue_id));
}

#[test]
fn test_cancel_removes_enrollment() {
    let (env, caller) = setup();
    let contract_id = env.register(EnrollmentImpl, ());
    let client = EnrollmentImplClient::new(&env, &contract_id);
    let queue_id = Symbol::new(&env, "health");
    client.enroll(&caller, &queue_id, &None);
    client.cancel(&caller, &queue_id);
    assert!(!client.is_enrolled(&caller, &queue_id));
}

#[test]
#[should_panic(expected = "not enrolled")]
fn test_cancel_panics_when_not_enrolled() {
    let (env, caller) = setup();
    let contract_id = env.register(EnrollmentImpl, ());
    let client = EnrollmentImplClient::new(&env, &contract_id);
    let queue_id = Symbol::new(&env, "absent");
    client.cancel(&caller, &queue_id);
}

#[test]
fn test_multiple_users_same_queue() {
    let (env, _) = setup();
    let contract_id = env.register(EnrollmentImpl, ());
    let client = EnrollmentImplClient::new(&env, &contract_id);
    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    let queue_id = Symbol::new(&env, "shared");
    client.enroll(&u1, &queue_id, &None);
    client.enroll(&u2, &queue_id, &None);
    assert!(client.is_enrolled(&u1, &queue_id));
    assert!(client.is_enrolled(&u2, &queue_id));
}

#[test]
fn test_set_duplicate_behavior() {
    let (env, admin) = setup();
    let contract_id = env.register(EnrollmentImpl, ());
    let client = EnrollmentImplClient::new(&env, &contract_id);
    client.set_duplicate_behavior(&admin, &DuplicateBehavior::GrantWaitingList);
}

#[test]
fn test_finalize_enrollment() {
    let (env, admin) = setup();
    let user = Address::generate(&env);
    let queue_id = Symbol::new(&env, "fin-q");
    EnrollmentImpl::enroll(env.clone(), user.clone(), queue_id.clone());
    EnrollmentImpl::finalize_enrollment(env.clone(), admin.clone(), user.clone(), queue_id.clone());
    let record = EnrollmentImpl::enrollment_record(env, user, queue_id).unwrap();
    let contract_id = env.register(EnrollmentImpl, ());
    let client = EnrollmentImplClient::new(&env, &contract_id);
    let user = Address::generate(&env);
    let queue_id = Symbol::new(&env, "fin_q");
    client.enroll(&user, &queue_id, &None);
    client.finalize_enrollment(&admin, &user, &queue_id);
    let record = client.enrollment_record(&user, &queue_id).unwrap();
    assert!(record.finalized);
}

#[test]
#[should_panic(expected = "already finalized")]
fn test_finalize_twice_panics() {
    let (env, admin) = setup();
    let contract_id = env.register(EnrollmentImpl, ());
    let client = EnrollmentImplClient::new(&env, &contract_id);
    let user = Address::generate(&env);
    let queue_id = Symbol::new(&env, "fin2");
    client.enroll(&user, &queue_id, &None);
    client.finalize_enrollment(&admin, &user, &queue_id);
    client.finalize_enrollment(&admin, &user, &queue_id);
}

#[test]
fn test_enrollment_record_returns_none_when_missing() {
    let (env, caller) = setup();
    let contract_id = env.register(EnrollmentImpl, ());
    let client = EnrollmentImplClient::new(&env, &contract_id);
    let queue_id = Symbol::new(&env, "missing");
    let result = client.enrollment_record(&caller, &queue_id);
    assert!(result.is_none());
}

#[test]
fn test_proof_hash_is_distinct_for_different_inputs() {
    let (env, _) = setup();
    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    let queue_id = Symbol::new(&env, "q-hash");
    let proof1 = EnrollmentImpl::enroll(env.clone(), u1.clone(), queue_id.clone());
    let proof2 = EnrollmentImpl::enroll(env.clone(), u2.clone(), queue_id.clone());
    let contract_id = env.register(EnrollmentImpl, ());
    let client = EnrollmentImplClient::new(&env, &contract_id);
    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    let queue_id = Symbol::new(&env, "q_hash");
    let proof1 = client.enroll(&u1, &queue_id, &None);
    let proof2 = client.enroll(&u2, &queue_id, &None);
    assert_ne!(proof1.proof_hash, proof2.proof_hash);
}

#[test]
fn test_cancel_emits_original_hash() {
    let (env, caller) = setup();
    let contract_id = env.register(EnrollmentImpl, ());
    let client = EnrollmentImplClient::new(&env, &contract_id);
    let queue_id = Symbol::new(&env, "health");
    let proof = client.enroll(&caller, &queue_id, &None);
    
    client.cancel(&caller, &queue_id);
    
    let events = env.events().all();
    let cancel_event = events.last().unwrap();
    
    let topics = cancel_event.1;
    // topic[0] is lineproof_enrollment, topic[1] is Cancelled, topic[2] is queue_id
    assert_eq!(topics.get(1).unwrap(), soroban_sdk::IntoVal::into_val(&Symbol::new(&env, "Cancelled"), &env));
    assert_eq!(
        Symbol::try_from_val(&env, &topics.get(1).unwrap()).unwrap(),
        Symbol::new(&env, "Cancelled")
    );
    
    let data = cancel_event.2;
    let (identity, _timestamp, hash): (Address, u64, BytesN<32>) = soroban_sdk::FromVal::from_val(&env, &data);
    assert_eq!(identity, caller);
    assert_eq!(hash, proof.proof_hash);
}

#[test]
fn test_set_duplicate_behavior_emits_event() {
    let (env, admin) = setup();
    let contract_id = env.register(EnrollmentImpl, ());
    let client = EnrollmentImplClient::new(&env, &contract_id);
    client.set_duplicate_behavior(&admin, &DuplicateBehavior::GrantWaitingList);
    
    let events = env.events().all();
    let change_event = events.last().unwrap();
    let topics = change_event.1;
    assert_eq!(
        Symbol::try_from_val(&env, &topics.get(1).unwrap()).unwrap(),
        Symbol::new(&env, "DuplicateBehaviorChanged")
    );
    let data = change_event.2;
    let behavior: DuplicateBehavior = soroban_sdk::FromVal::from_val(&env, &data);
    assert_eq!(behavior, DuplicateBehavior::GrantWaitingList);
}

#[test]
fn test_waitlist_addition_and_queries() {
    let (env, caller) = setup();
    let contract_id = env.register(EnrollmentImpl, ());
    let client = EnrollmentImplClient::new(&env, &contract_id);
    let queue_id = Symbol::new(&env, "wait_queue");
    
    // First enrollment (active)
    client.enroll(&caller, &queue_id, &None);
    assert!(client.is_enrolled(&caller, &queue_id));
    
    // Set behavior to waiting list
    let admin = Address::generate(&env);
    client.set_duplicate_behavior(&admin, &DuplicateBehavior::GrantWaitingList);
    
    // Second enrollment (adds to waitlist)
    let proof = client.enroll(&caller, &queue_id, &None);
    
    // WaitlistAdded event verification (query immediately before read-only functions clear it)
    let events = env.events().all();
    let waitlist_event = events.last().unwrap();
    let topics = waitlist_event.1;
    assert_eq!(
        Symbol::try_from_val(&env, &topics.get(1).unwrap()).unwrap(),
        Symbol::new(&env, "WaitlistAdded")
    );
    
    // The proof should contain a zero hash
    let zero_hash = BytesN::from_array(&env, &[0u8; 32]);
    assert_eq!(proof.proof_hash, zero_hash);
    
    // Should still only have 1 active enrollment (caller)
    assert!(client.is_enrolled(&caller, &queue_id));
    
    // Waitlist queries
    let waitlist = client.get_waitlist(&queue_id);
    assert_eq!(waitlist.len(), 1);
    assert_eq!(waitlist.get(0).unwrap(), caller);
    
    assert_eq!(
        client.waitlist_position(&caller, &queue_id),
        Some(0)
    );
}

#[test]
#[should_panic(expected = "already waitlisted")]
fn test_waitlist_prevent_duplicate_waitlist_entry() {
    let (env, caller) = setup();
    let contract_id = env.register(EnrollmentImpl, ());
    let client = EnrollmentImplClient::new(&env, &contract_id);
    let queue_id = Symbol::new(&env, "wait_dup");
    
    client.enroll(&caller, &queue_id, &None);
    
    let admin = Address::generate(&env);
    client.set_duplicate_behavior(&admin, &DuplicateBehavior::GrantWaitingList);
    
    client.enroll(&caller, &queue_id, &None);
    client.enroll(&caller, &queue_id, &None);
}

#[test]
fn test_waitlist_promotion() {
    let (env, u1) = setup();
    let contract_id = env.register(EnrollmentImpl, ());
    let client = EnrollmentImplClient::new(&env, &contract_id);
    let u2 = Address::generate(&env);
    let queue_id = Symbol::new(&env, "promo_queue");
    
    // Enroll u1 actively
    client.enroll(&u1, &queue_id, &None);
    
    // Set to waitlist
    let admin = Address::generate(&env);
    client.set_duplicate_behavior(&admin, &DuplicateBehavior::GrantWaitingList);
    
    // Waitlist u1 and u2 (note: u2 must be enrolled actively first so they can try to duplicate-enroll)
    client.enroll(&u2, &queue_id, &None); // u2 enrolled
    
    client.enroll(&u1, &queue_id, &None); // u1 waitlisted
    client.enroll(&u2, &queue_id, &None); // u2 waitlisted
    
    let waitlist_before = client.get_waitlist(&queue_id);
    assert_eq!(waitlist_before.len(), 2);
    assert_eq!(waitlist_before.get(0).unwrap(), u1);
    assert_eq!(waitlist_before.get(1).unwrap(), u2);
    
    // Promote 1 user (u1)
    client.promote_from_waitlist(&admin, &queue_id, &1);
    
    let waitlist_after_1 = client.get_waitlist(&queue_id);
    assert_eq!(waitlist_after_1.len(), 1);
    assert_eq!(waitlist_after_1.get(0).unwrap(), u2);
    
    // Promote remaining (u2)
    client.promote_from_waitlist(&admin, &queue_id, &1);
    
    let waitlist_after_2 = client.get_waitlist(&queue_id);
    assert_eq!(waitlist_after_2.len(), 0);
}

#[test]
fn test_override_expired_success() {
    let (env, caller) = setup();
    let contract_id = env.register(EnrollmentImpl, ());
    let client = EnrollmentImplClient::new(&env, &contract_id);
    let queue_id = Symbol::new(&env, "expiry_q");
    
    // Initial enrollment with expiry at 100
    let expiry = Some(100u64);
    client.enroll(&caller, &queue_id, &expiry);
    
    // Set duplicate behavior to OverrideExpired
    let admin = Address::generate(&env);
    client.set_duplicate_behavior(&admin, &DuplicateBehavior::OverrideExpired);
    
    // Advance ledger time to 105 (expired)
    env.ledger().set_timestamp(105);
    
    // Enroll again (should succeed and override)
    let proof = client.enroll(&caller, &queue_id, &Some(200));
    
    assert_eq!(proof.enrolled_at, 105);
    assert_eq!(proof.expires_at, Some(200));
    
    let record = client.enrollment_record(&caller, &queue_id).unwrap();
    assert_eq!(record.enrolled_at, 105);
    assert_eq!(record.expires_at, Some(200));
    assert_eq!(record.duplicate_count, 1);
}

#[test]
#[should_panic(expected = "duplicate enrollment")]
fn test_override_expired_rejection() {
    let (env, caller) = setup();
    let contract_id = env.register(EnrollmentImpl, ());
    let client = EnrollmentImplClient::new(&env, &contract_id);
    let queue_id = Symbol::new(&env, "expiry_fail_q");
    
    // Initial enrollment with expiry at 100
    let expiry = Some(100u64);
    client.enroll(&caller, &queue_id, &expiry);
    
    // Set duplicate behavior to OverrideExpired
    let admin = Address::generate(&env);
    client.set_duplicate_behavior(&admin, &DuplicateBehavior::OverrideExpired);
    
    // Keep ledger time at 50 (not expired)
    env.ledger().set_timestamp(50);
    
    // Enroll again (should fail because not expired)
    client.enroll(&caller, &queue_id, &Some(200));
}
