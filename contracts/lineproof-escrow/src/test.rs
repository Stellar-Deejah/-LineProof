use std::panic;

use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

use crate::{EscrowConfig, EscrowImpl, EscrowRecord, EscrowStatus};

fn setup() -> (Env, Address) {
    let env = Env::default();
    let admin = Address::new(&env, &[1; 7]);
    (env, admin)
}

fn make_config(env: &Env, admin: &Address) -> EscrowConfig {
    EscrowConfig {
        queue_id: Symbol::new(env, "sneaker-drop"),
        min_deposit: 100i128,
        max_deposit: 1000i128,
        hold_period_days: 30,
        admin: admin.clone(),
    }
}

#[test]
fn test_set_and_get_config() {
    let (env, admin) = setup();
    let config = make_config(&env, &admin);
    EscrowImpl::set_config(env.clone(), admin.clone(), config);
    let loaded = EscrowImpl::get_config(env.clone(), Symbol::new(&env, "sneaker-drop"));
    assert_eq!(loaded.min_deposit, 100i128);
    assert_eq!(loaded.max_deposit, 1000i128);
    assert_eq!(loaded.hold_period_days, 30);
}

#[test]
fn test_deposit_creates_record() {
    let (env, admin) = setup();
    EscrowImpl::set_config(env.clone(), admin.clone(), make_config(&env, &admin));
    let user = Address::new(&env, &[9u8; 7]);
    let asset = Address::new(&env, &[8u8; 7]);
    EscrowImpl::deposit(env.clone(), user.clone(), Symbol::new(&env, "sneaker-drop"), 500i128, asset.clone());
    let record = EscrowImpl::get_record(env.clone(), user.clone(), Symbol::new(&env, "sneaker-drop")).unwrap();
    assert_eq!(record.amount, 500i128);
    assert!(matches!(record.status, EscrowStatus::Active));
}

#[test]
fn test_release_changes_status() {
    let (env, admin) = setup();
    EscrowImpl::set_config(env.clone(), admin.clone(), make_config(&env, &admin));
    let user = Address::new(&env, &[3u8; 7]);
    let asset = Address::new(&env, &[8u8; 7]);
    EscrowImpl::deposit(env.clone(), user.clone(), Symbol::new(&env, "sneaker-drop"), 500i128, asset);
    EscrowImpl::release(env.clone(), admin.clone(), user.clone(), Symbol::new(&env, "sneaker-drop"));
    let record = EscrowImpl::get_record(env, user, Symbol::new(&env, "sneaker-drop")).unwrap();
    assert!(matches!(record.status, EscrowStatus::Released));
}

#[test]
fn test_refund_changes_status() {
    let (env, admin) = setup();
    EscrowImpl::set_config(env.clone(), admin.clone(), make_config(&env, &admin));
    let user = Address::new(&env, &[4u8; 7]);
    let asset = Address::new(&env, &[8u8; 7]);
    EscrowImpl::deposit(env.clone(), user.clone(), Symbol::new(&env, "sneaker-drop"), 500i128, asset);
    EscrowImpl::refund(env.clone(), admin.clone(), user.clone(), Symbol::new(&env, "sneaker-drop"));
    let record = EscrowImpl::get_record(env, user, Symbol::new(&env, "sneaker-drop")).unwrap();
    assert!(matches!(record.status, EscrowStatus::Refunded));
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_deposit_rejects_non_positive_amount() {
    let (env, admin) = setup();
    EscrowImpl::set_config(env.clone(), admin.clone(), make_config(&env, &admin));
    let user = Address::new(&env, &[5u8; 7]);
    let asset = Address::new(&env, &[8u8; 7]);
    EscrowImpl::deposit(env, user, Symbol::new(&env, "sneaker-drop"), 0i128, asset);
}

#[test]
#[should_panic(expected = "amount outside configured bounds")]
fn test_deposit_rejects_above_max() {
    let (env, admin) = setup();
    EscrowImpl::set_config(env.clone(), admin.clone(), make_config(&env, &admin));
    let user = Address::new(&env, &[6u8; 7]);
    let asset = Address::new(&env, &[8u8; 7]);
    EscrowImpl::deposit(env.clone(), user, Symbol::new(&env, "sneaker-drop"), 5000i128, asset);
}

#[test]
#[should_panic(expected = "existing escrow record")]
fn test_deposit_rejects_duplicate_for_same_user_and_queue() {
    let (env, admin) = setup();
    EscrowImpl::set_config(env.clone(), admin.clone(), make_config(&env, &admin));
    let user = Address::new(&env, &[7u8; 7]);
    let asset = Address::new(&env, &[8u8; 7]);
    EscrowImpl::deposit(env.clone(), user.clone(), Symbol::new(&env, "sneaker-drop"), 250i128, asset.clone());
    EscrowImpl::deposit(env, user, Symbol::new(&env, "sneaker-drop"), 300i128, asset);
}
