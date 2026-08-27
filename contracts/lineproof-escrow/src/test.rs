use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

use crate::{EscrowConfig, EscrowImpl, EscrowImplClient, EscrowStatus};

fn setup() -> (Env, Address, Symbol, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(EscrowImpl, ());
    let queue_id = Symbol::new(&env, "sneaker_drop");
    (env, admin, queue_id, contract_id)
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

#[test]
fn test_set_and_get_config() {
    let (env, admin, queue_id, contract_id) = setup();
    let client = EscrowImplClient::new(&env, &contract_id);
    let config = make_config(&env, &admin);
    client.set_config(&admin, &config);
    let loaded = client.get_config(&queue_id);
    assert_eq!(loaded.min_deposit, 100i128);
    assert_eq!(loaded.max_deposit, 1000i128);
    assert_eq!(loaded.hold_period_days, 30);
}

#[test]
fn test_deposit_creates_record() {
    let (env, admin, queue_id, contract_id) = setup();
    let client = EscrowImplClient::new(&env, &contract_id);
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &queue_id, &500i128, &asset);
    let record = client.get_record(&user, &queue_id).unwrap();
    assert_eq!(record.amount, 500i128);
    assert!(matches!(record.status, EscrowStatus::Active));
}

#[test]
fn test_get_total_held_accumulates() {
    let (env, admin, queue_id, contract_id) = setup();
    let client = EscrowImplClient::new(&env, &contract_id);
    client.set_config(&admin, &make_config(&env, &admin));
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user1, &queue_id, &500i128, &asset);
    client.deposit(&user2, &queue_id, &300i128, &asset);
    let total = client.get_total_held(&queue_id);
    assert_eq!(total, 800i128);
}

#[test]
fn test_release_changes_status() {
    let (env, admin, queue_id, contract_id) = setup();
    let client = EscrowImplClient::new(&env, &contract_id);
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &queue_id, &500i128, &asset);
    client.release(&admin, &user, &queue_id);
    let record = client.get_record(&user, &queue_id).unwrap();
    assert!(matches!(record.status, EscrowStatus::Released));
}

#[test]
fn test_refund_changes_status() {
    let (env, admin, queue_id, contract_id) = setup();
    let client = EscrowImplClient::new(&env, &contract_id);
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &queue_id, &500i128, &asset);
    client.refund(&admin, &user, &queue_id);
    let record = client.get_record(&user, &queue_id).unwrap();
    assert!(matches!(record.status, EscrowStatus::Refunded));
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_deposit_rejects_non_positive_amount() {
    let (env, admin, queue_id, contract_id) = setup();
    let client = EscrowImplClient::new(&env, &contract_id);
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &queue_id, &0i128, &asset);
}

#[test]
#[should_panic(expected = "amount outside configured bounds")]
fn test_deposit_rejects_above_max() {
    let (env, admin, queue_id, contract_id) = setup();
    let client = EscrowImplClient::new(&env, &contract_id);
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &queue_id, &5000i128, &asset);
}

#[test]
#[should_panic(expected = "existing escrow record")]
fn test_deposit_rejects_duplicate_for_same_user_and_queue() {
    let (env, admin, queue_id, contract_id) = setup();
    let client = EscrowImplClient::new(&env, &contract_id);
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &queue_id, &250i128, &asset);
    client.deposit(&user, &queue_id, &300i128, &asset);
}

#[test]
fn test_expire_updates_status() {
    let (env, admin, queue_id, contract_id) = setup();
    let client = EscrowImplClient::new(&env, &contract_id);
    let mut config = make_config(&env, &admin);
    config.hold_period_days = 0; // expires immediately
    client.set_config(&admin, &config);
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &queue_id, &200i128, &asset);
    client.expire(&user, &queue_id);
    let record = client.get_record(&user, &queue_id).unwrap();
    assert!(matches!(record.status, EscrowStatus::Expired));
}

#[test]
#[should_panic(expected = "escrow not active")]
fn test_release_already_released_panics() {
    let (env, admin, queue_id, contract_id) = setup();
    let client = EscrowImplClient::new(&env, &contract_id);
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &queue_id, &500i128, &asset);
    client.release(&admin, &user, &queue_id);
    client.release(&admin, &user, &queue_id);
}
