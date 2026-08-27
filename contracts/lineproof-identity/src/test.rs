use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

use crate::{BindingStatus, Identity, IdentityImpl, IdentityImplClient, TransferAttempt};

struct Harness {
    env: Env,
    contract_id: Address,
    admin: Address,
}

impl Harness {
    fn new() -> Self {
        let env = Env::default();
        let contract_id = env.register(IdentityImpl, ());
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let client = IdentityImplClient::new(&env, &contract_id);
        client.initialize(&admin);
        Harness {
            env,
            contract_id,
            admin,
        }
    }

    fn client(&self) -> IdentityImplClient<'_> {
        IdentityImplClient::new(&self.env, &self.contract_id)
    }
}

#[test]
fn test_bind_creates_record_with_timestamp() {
    let h = Harness::new();
    let client = h.client();
    let user = Address::generate(&h.env);
    let queue_id = Symbol::new(&h.env, "sneaker_drop");
    client.bind(&user, &queue_id);
    let record = client.get_record(&user).unwrap();
    assert!(record.queues.iter().any(|q| &q == &queue_id));
    assert!(matches!(record.status, BindingStatus::Bound));
    assert_eq!(record.bound_at, 0);
}

#[test]
fn test_unbind_removes_queue() {
    let h = Harness::new();
    let client = h.client();
    let user = Address::generate(&h.env);
    let queue_id = Symbol::new(&h.env, "concert");
    client.bind(&user, &queue_id);
    client.unbind(&user, &queue_id);
    assert!(!client.is_bound(&user, &queue_id));
}

#[test]
fn test_is_bound_returns_false_before_bind() {
    let h = Harness::new();
    let user = Address::generate(&h.env);
    let queue_id = Symbol::new(&h.env, "new_queue");
    assert!(!h.client().is_bound(&user, &queue_id));
}

#[test]
fn test_can_transfer_returns_false_for_revoked_identity() {
    let h = Harness::new();
    let client = h.client();
    let user = Address::generate(&h.env);
    let other = Address::generate(&h.env);
    let queue_id = Symbol::new(&h.env, "q_transfer");
    client.bind(&user, &queue_id);
    client.set_transfer_allowed(&h.admin, &true);
    client.revoke(&h.admin, &user);
    assert!(!client.can_transfer(&user, &other, &queue_id));
}

#[test]
fn test_can_transfer_returns_false_when_unbound() {
    let h = Harness::new();
    let client = h.client();
    let user = Address::generate(&h.env);
    let other = Address::generate(&h.env);
    let queue_id = Symbol::new(&h.env, "q_unbound");
    client.set_transfer_allowed(&h.admin, &true);
    assert!(!client.can_transfer(&user, &other, &queue_id));
}

#[test]
fn test_can_transfer_returns_true_when_allowed_and_bound() {
    let h = Harness::new();
    let client = h.client();
    let user = Address::generate(&h.env);
    let other = Address::generate(&h.env);
    let queue_id = Symbol::new(&h.env, "q_allowed");
    client.bind(&user, &queue_id);
    client.set_transfer_allowed(&h.admin, &true);
    assert!(client.can_transfer(&user, &other, &queue_id));
}

#[test]
fn test_can_transfer_returns_false_when_not_allowed_but_bound() {
    let h = Harness::new();
    let client = h.client();
    let user = Address::generate(&h.env);
    let other = Address::generate(&h.env);
    let queue_id = Symbol::new(&h.env, "q_not_allowed");
    client.bind(&user, &queue_id);
    assert!(!client.can_transfer(&user, &other, &queue_id));
}

#[test]
fn test_can_transfer_returns_true_same_identity() {
    let h = Harness::new();
    let client = h.client();
    let user = Address::generate(&h.env);
    let queue_id = Symbol::new(&h.env, "self");
    assert!(client.can_transfer(&user, &user, &queue_id));
}

#[test]
fn test_record_transfer_attempt_persists() {
    let h = Harness::new();
    let client = h.client();
    let user = Address::generate(&h.env);
    let other = Address::generate(&h.env);
    let queue_id = Symbol::new(&h.env, "drop");
    client.record_transfer_attempt(&user, &other, &queue_id);
    let key = IdentityImpl::attempt_key(&h.env, &user, &other, &queue_id);
    let attempt = h.env.as_contract(&h.contract_id, || {
        h.env.storage().persistent().get::<_, TransferAttempt>(&key)
    });
    assert!(attempt.is_some());
    assert!(attempt.unwrap().reverted);
}

#[test]
fn test_initialize_sets_admin() {
    let h = Harness::new();
    let client = h.client();
    let stored = client.get_admin();
    assert_eq!(stored, Some(h.admin));
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_initialize_twice_panics() {
    let h = Harness::new();
    let client = h.client();
    client.initialize(&h.admin);
}

#[test]
fn test_revoke_sets_revoked_status() {
    let h = Harness::new();
    let client = h.client();
    let user = Address::generate(&h.env);
    let queue_id = Symbol::new(&h.env, "q");
    client.bind(&user, &queue_id);
    client.revoke(&h.admin, &user);
    let record = client.get_record(&user).unwrap();
    assert!(matches!(record.status, BindingStatus::Revoked));
}

#[test]
#[should_panic(expected = "identity revoked")]
fn test_bind_after_revoke_panics() {
    let h = Harness::new();
    let client = h.client();
    let user = Address::generate(&h.env);
    let q1 = Symbol::new(&h.env, "q1");
    let q2 = Symbol::new(&h.env, "q2");
    client.bind(&user, &q1);
    client.revoke(&h.admin, &user);
    client.bind(&user, &q2);
}
