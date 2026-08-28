use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, Env, Symbol};

use crate::{EscrowConfig, EscrowImpl, EscrowImplClient, EscrowStatus};

fn setup<'a>() -> (Env, EscrowImplClient<'a>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(EscrowImpl, ());
    let client = EscrowImplClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    (env, client, admin)
}

fn make_config(env: &Env, admin: &Address) -> EscrowConfig {
    EscrowConfig {
        queue_id: Symbol::new(env, "sneaker_drop"),
        min_deposit: 100i128,
        max_deposit: 1000i128,
        hold_period_days: 30,
        admin: admin.clone(),
    }
}

fn queue(env: &Env) -> Symbol {
    Symbol::new(env, "sneaker_drop")
}

#[test]
fn test_set_and_get_config() {
    let (env, client, admin) = setup();
    client.set_config(&admin, &make_config(&env, &admin));
    let loaded = client.get_config(&queue(&env));
    assert_eq!(loaded.min_deposit, 100i128);
    assert_eq!(loaded.max_deposit, 1000i128);
    assert_eq!(loaded.hold_period_days, 30);
}

#[test]
fn test_deposit_creates_record() {
    let (env, client, admin) = setup();
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &queue(&env), &500i128, &asset);
    let record = client.get_record(&user, &queue(&env)).unwrap();
    assert_eq!(record.amount, 500i128);
    assert!(matches!(record.status, EscrowStatus::Active));
}

#[test]
fn test_get_total_held_accumulates() {
    let (env, client, admin) = setup();
    client.set_config(&admin, &make_config(&env, &admin));
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user1, &queue(&env), &500i128, &asset);
    client.deposit(&user2, &queue(&env), &300i128, &asset);
    assert_eq!(client.get_total_held(&queue(&env)), 800i128);
}

#[test]
fn test_release_changes_status() {
    let (env, client, admin) = setup();
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &queue(&env), &500i128, &asset);
    client.release(&admin, &user, &queue(&env));
    let record = client.get_record(&user, &queue(&env)).unwrap();
    assert!(matches!(record.status, EscrowStatus::Released));
}

#[test]
fn test_refund_changes_status() {
    let (env, client, admin) = setup();
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &queue(&env), &500i128, &asset);
    client.refund(&admin, &user, &queue(&env));
    let record = client.get_record(&user, &queue(&env)).unwrap();
    assert!(matches!(record.status, EscrowStatus::Refunded));
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_deposit_rejects_non_positive_amount() {
    let (env, client, admin) = setup();
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &queue(&env), &0i128, &asset);
}

#[test]
#[should_panic(expected = "amount outside configured bounds")]
fn test_deposit_rejects_above_max() {
    let (env, client, admin) = setup();
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &queue(&env), &5000i128, &asset);
}

#[test]
#[should_panic(expected = "existing escrow record")]
fn test_deposit_rejects_duplicate_for_same_user_and_queue() {
    let (env, client, admin) = setup();
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &queue(&env), &250i128, &asset);
    client.deposit(&user, &queue(&env), &300i128, &asset);
}

#[test]
fn test_expire_updates_status() {
    let (env, client, admin) = setup();
    let mut config = make_config(&env, &admin);
    config.hold_period_days = 0; // expires immediately
    client.set_config(&admin, &config);
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &queue(&env), &200i128, &asset);
    client.expire(&user, &queue(&env));
    let record = client.get_record(&user, &queue(&env)).unwrap();
    assert!(matches!(record.status, EscrowStatus::Expired));
}

#[test]
#[should_panic(expected = "escrow not active")]
fn test_release_already_released_panics() {
    let (env, client, admin) = setup();
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &queue(&env), &500i128, &asset);
    client.release(&admin, &user, &queue(&env));
    client.release(&admin, &user, &queue(&env));
}

// --- get_total_held accounting (issue #10) ---

#[test]
fn test_total_held_decreases_on_release() {
    let (env, client, admin) = setup();
    client.set_config(&admin, &make_config(&env, &admin));
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user1, &queue(&env), &500i128, &asset);
    client.deposit(&user2, &queue(&env), &300i128, &asset);
    assert_eq!(client.get_total_held(&queue(&env)), 800i128);

    // Partial release: only user1's deposit leaves the held total
    client.release(&admin, &user1, &queue(&env));
    assert_eq!(client.get_total_held(&queue(&env)), 300i128);
}

#[test]
fn test_total_held_decreases_on_refund() {
    let (env, client, admin) = setup();
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &queue(&env), &400i128, &asset);
    assert_eq!(client.get_total_held(&queue(&env)), 400i128);

    client.refund(&admin, &user, &queue(&env));
    assert_eq!(client.get_total_held(&queue(&env)), 0i128);
}

#[test]
fn test_total_held_decreases_on_expire() {
    let (env, client, admin) = setup();
    let mut config = make_config(&env, &admin);
    config.hold_period_days = 0; // expires immediately
    client.set_config(&admin, &config);
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &queue(&env), &200i128, &asset);
    assert_eq!(client.get_total_held(&queue(&env)), 200i128);

    env.ledger().with_mut(|l| l.timestamp = 1);
    client.expire(&user, &queue(&env));
    assert_eq!(client.get_total_held(&queue(&env)), 0i128);
}

#[test]
fn test_total_held_zero_after_all_transitions() {
    let (env, client, admin) = setup();
    let mut config = make_config(&env, &admin);
    config.hold_period_days = 0;
    client.set_config(&admin, &config);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user1, &queue(&env), &500i128, &asset);
    client.deposit(&user2, &queue(&env), &300i128, &asset);
    client.deposit(&user3, &queue(&env), &200i128, &asset);
    assert_eq!(client.get_total_held(&queue(&env)), 1000i128);

    client.release(&admin, &user1, &queue(&env));
    client.refund(&admin, &user2, &queue(&env));
    env.ledger().with_mut(|l| l.timestamp = 1);
    client.expire(&user3, &queue(&env));

    assert_eq!(client.get_total_held(&queue(&env)), 0i128);
}

#[test]
fn test_total_held_is_isolated_per_queue() {
    let (env, client, admin) = setup();
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &queue(&env), &500i128, &asset);
    // A different queue never touched still reads zero
    assert_eq!(client.get_total_held(&Symbol::new(&env, "other_queue")), 0i128);
    // Releasing in one queue leaves other queues untouched
    client.release(&admin, &user, &queue(&env));
    assert_eq!(client.get_total_held(&queue(&env)), 0i128);
    assert_eq!(client.get_total_held(&Symbol::new(&env, "other_queue")), 0i128);
}

#[test]
fn test_total_held_never_goes_negative() {
    let (env, client, admin) = setup();
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &queue(&env), &500i128, &asset);

    // Simulate drifted state: force the stored total below the record amount,
    // then resolve the record. The subtraction must clamp at zero.
    env.as_contract(&client.address, || {
        let total_key = EscrowImpl::total_key(&env, &queue(&env));
        env.storage().persistent().set(&total_key, &100i128);
    });
    client.release(&admin, &user, &queue(&env));
    assert_eq!(client.get_total_held(&queue(&env)), 0i128);
}
