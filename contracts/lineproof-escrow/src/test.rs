use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, Env, Symbol};

use crate::{EscrowConfig, EscrowImpl, EscrowImplClient, EscrowStatus};

fn setup() -> (Env, Address, EscrowImplClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(EscrowImpl, ());
    let client = EscrowImplClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    (env, admin, client)
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
    let (env, admin, client) = setup();
    let config = make_config(&env, &admin);
    client.set_config(&admin, &config);
    let loaded = client.get_config(&Symbol::new(&env, "sneaker_drop"));
    assert_eq!(loaded.min_deposit, 100i128);
    assert_eq!(loaded.max_deposit, 1000i128);
    assert_eq!(loaded.hold_period_days, 30);
}

#[test]
fn test_deposit_creates_record() {
    let (env, admin, client) = setup();
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &Symbol::new(&env, "sneaker_drop"), &500i128, &asset);
    let record = client.get_record(&user, &Symbol::new(&env, "sneaker_drop")).unwrap();
    assert_eq!(record.amount, 500i128);
    assert!(matches!(record.status, EscrowStatus::Active));
}

#[test]
fn test_get_total_held_accumulates() {
    let (env, admin, client) = setup();
    client.set_config(&admin, &make_config(&env, &admin));
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user1, &Symbol::new(&env, "sneaker_drop"), &500i128, &asset);
    client.deposit(&user2, &Symbol::new(&env, "sneaker_drop"), &300i128, &asset);
    let total = client.get_total_held(&Symbol::new(&env, "sneaker_drop"));
    assert_eq!(total, 800i128);
}

#[test]
fn test_release_changes_status() {
    let (env, admin, client) = setup();
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &Symbol::new(&env, "sneaker_drop"), &500i128, &asset);
    client.release(&admin, &user, &Symbol::new(&env, "sneaker_drop"));
    let record = client.get_record(&user, &Symbol::new(&env, "sneaker_drop")).unwrap();
    assert!(matches!(record.status, EscrowStatus::Released));
}

#[test]
fn test_refund_changes_status() {
    let (env, admin, client) = setup();
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &Symbol::new(&env, "sneaker_drop"), &500i128, &asset);
    client.refund(&admin, &user, &Symbol::new(&env, "sneaker_drop"));
    let record = client.get_record(&user, &Symbol::new(&env, "sneaker_drop")).unwrap();
    assert!(matches!(record.status, EscrowStatus::Refunded));
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_deposit_rejects_non_positive_amount() {
    let (env, admin, client) = setup();
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &Symbol::new(&env, "sneaker_drop"), &0i128, &asset);
}

#[test]
#[should_panic(expected = "amount outside configured bounds")]
fn test_deposit_rejects_above_max() {
    let (env, admin, client) = setup();
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &Symbol::new(&env, "sneaker_drop"), &5000i128, &asset);
}

#[test]
#[should_panic(expected = "existing escrow record")]
fn test_deposit_rejects_duplicate_for_same_user_and_queue() {
    let (env, admin, client) = setup();
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &Symbol::new(&env, "sneaker_drop"), &250i128, &asset);
    client.deposit(&user, &Symbol::new(&env, "sneaker_drop"), &300i128, &asset);
}

#[test]
fn test_expire_updates_status() {
    let (env, admin, client) = setup();
    let mut config = make_config(&env, &admin);
    config.hold_period_days = 1;
    client.set_config(&admin, &config);
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &Symbol::new(&env, "sneaker_drop"), &200i128, &asset);
    env.ledger().set_timestamp(86_401);
    client.expire(&user, &Symbol::new(&env, "sneaker_drop"));
    let record = client.get_record(&user, &Symbol::new(&env, "sneaker_drop")).unwrap();
    assert!(matches!(record.status, EscrowStatus::Expired));
}

#[test]
#[should_panic(expected = "escrow_not_configured")]
fn test_deposit_unconfigured_escrow_panics() {
    let (env, _admin, client) = setup();
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &Symbol::new(&env, "sneaker_drop"), &500i128, &asset);
}

#[test]
#[should_panic(expected = "min_deposit_exceeds_max")]
fn test_set_config_min_exceeds_max_panics() {
    let (env, admin, client) = setup();
    let mut config = make_config(&env, &admin);
    config.min_deposit = 500;
    config.max_deposit = 100;
    client.set_config(&admin, &config);
}

#[test]
#[should_panic(expected = "hold_period_must_be_positive")]
fn test_set_config_zero_hold_period_panics() {
    let (env, admin, client) = setup();
    let mut config = make_config(&env, &admin);
    config.hold_period_days = 0;
    client.set_config(&admin, &config);
}

#[test]
#[should_panic(expected = "escrow not active")]
fn test_release_already_released_panics() {
    let (env, admin, client) = setup();
    client.set_config(&admin, &make_config(&env, &admin));
    let user = Address::generate(&env);
    let asset = Address::generate(&env);
    client.deposit(&user, &Symbol::new(&env, "sneaker_drop"), &500i128, &asset);
    client.release(&admin, &user, &Symbol::new(&env, "sneaker_drop"));
    client.release(&admin, &user, &Symbol::new(&env, "sneaker_drop"));
}
