use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

use crate::{Position, PositionStatus, QueueConfig, QueueImpl, QueueStatus};

fn setup() -> (Env, Address) {
    let env = Env::default();
    let admin = Address::new(&env, &[1; 7]);
    (env, admin)
}

fn make_config(env: &Env, admin: &Address) -> QueueConfig {
    QueueConfig {
        slug: Symbol::new(env, "sneaker-drop"),
        name: Symbol::new(env, "Sneaker Drop"),
        admin: admin.clone(),
        max_positions: 5,
        enrollment_open: 1_000,
        enrollment_close: 2_000,
        status: QueueStatus::Draft,
        version: 1,
    }
}

#[test]
fn test_initialize_persists_config() {
    let (env, admin) = setup();
    let config = make_config(&env, &admin);
    QueueImpl::initialize(env.clone(), admin.clone(), config);
    let loaded = QueueImpl::get_config(env.clone());
    assert_eq!(loaded.max_positions, 5);
    assert_eq!(loaded.version, 1);
}

#[test]
fn test_open_enrollment() {
    let (env, admin) = setup();
    let config = make_config(&env, &admin);
    QueueImpl::initialize(env.clone(), admin.clone(), config);
    QueueImpl::open_enrollment(env.clone(), admin);
    let loaded = QueueImpl::get_config(env);
    assert!(matches!(loaded.status, QueueStatus::EnrollmentOpen));
}

#[test]
fn test_close_enrollment() {
    let (env, admin) = setup();
    let config = make_config(&env, &admin);
    QueueImpl::initialize(env.clone(), admin.clone(), config);
    QueueImpl::open_enrollment(env.clone(), admin.clone());
    QueueImpl::close_enrollment(env.clone(), admin);
    let loaded = QueueImpl::get_config(env);
    assert!(matches!(loaded.status, QueueStatus::EnrollmentClosed));
}

#[test]
fn test_advance_updates_positions() {
    let (env, admin) = setup();
    let config = make_config(&env, &admin);
    QueueImpl::initialize(env.clone(), admin.clone(), config);
    QueueImpl::open_enrollment(env.clone(), admin.clone());

    let user1 = Address::new(&env, &[10u8; 7]);
    let user2 = Address::new(&env, &[11u8; 7]);

    let pos1 = Position {
        position_id: 1,
        enrolled_at: 100,
        identity: user1.clone(),
        status: PositionStatus::Pending,
        advanced_at: None,
    };
    let pos2 = Position {
        position_id: 2,
        enrolled_at: 101,
        identity: user2,
        status: PositionStatus::Pending,
        advanced_at: None,
    };

    env.storage().persistent().set(&(Symbol::new(&env, "pos"), 1u32), &pos1);
    env.storage().persistent().set(&(Symbol::new(&env, "pos"), 2u32), &pos2);
    env.storage().persistent().set(&Symbol::new(&env, "idx"), &0u32);

    let advanced = QueueImpl::advance(env.clone(), admin.clone(), 2);
    assert_eq!(advanced.len(), 2);

    let loaded1: Position = env
        .storage()
        .persistent()
        .get(&(Symbol::new(&env, "pos"), 1u32))
        .unwrap();
    assert!(matches!(loaded1.status, PositionStatus::Advanced));
    assert!(loaded1.advanced_at.is_some());

    let loaded2: Position = env
        .storage()
        .persistent()
        .get(&(Symbol::new(&env, "pos"), 2u32))
        .unwrap();
    assert!(matches!(loaded2.status, PositionStatus::Advanced));
}

#[test]
#[should_panic(expected = "queue not initialized")]
fn test_get_config_panics_when_missing() {
    let (env, _admin) = setup();
    let _ = QueueImpl::get_config(env);
}

#[test]
fn test_current_position_index() {
    let (env, admin) = setup();
    let config = make_config(&env, &admin);
    QueueImpl::initialize(env.clone(), admin.clone(), config);
    assert_eq!(QueueImpl::current_position_index(env.clone()), 0);
    env.storage().persistent().set(&Symbol::new(&env, "idx"), &3u32);
    assert_eq!(QueueImpl::current_position_index(env), 3);
}

#[test]
fn test_enroll_position_creates_pending() {
    let (env, admin) = setup();
    let config = make_config(&env, &admin);
    QueueImpl::initialize(env.clone(), admin.clone(), config);
    QueueImpl::open_enrollment(env.clone(), admin.clone());

    let user = Address::new(&env, &[42u8; 7]);
    let pos_id = QueueImpl::enroll_position(env.clone(), user.clone());
    assert_eq!(pos_id, 1);

    let loaded = QueueImpl::get_position(env.clone(), pos_id).unwrap();
    assert_eq!(loaded.identity, user);
    assert!(matches!(loaded.status, PositionStatus::Pending));
}

#[test]
#[should_panic(expected = "enrollment is not open")]
fn test_enroll_position_rejects_when_not_open() {
    let (env, admin) = setup();
    let config = make_config(&env, &admin);
    QueueImpl::initialize(env.clone(), admin.clone(), config);
    // enrollment not opened
    let user = Address::new(&env, &[43u8; 7]);
    QueueImpl::enroll_position(env, user);
}

#[test]
fn test_cancel_position() {
    let (env, admin) = setup();
    let config = make_config(&env, &admin);
    QueueImpl::initialize(env.clone(), admin.clone(), config);
    QueueImpl::open_enrollment(env.clone(), admin.clone());

    let user = Address::new(&env, &[44u8; 7]);
    let pos_id = QueueImpl::enroll_position(env.clone(), user.clone());
    QueueImpl::cancel_position(env.clone(), user.clone(), pos_id);

    let loaded = QueueImpl::get_position(env.clone(), pos_id).unwrap();
    assert!(matches!(loaded.status, PositionStatus::Cancelled));
}

#[test]
#[should_panic(expected = "not your position")]
fn test_cancel_position_wrong_identity() {
    let (env, admin) = setup();
    let config = make_config(&env, &admin);
    QueueImpl::initialize(env.clone(), admin.clone(), config);
    QueueImpl::open_enrollment(env.clone(), admin.clone());

    let user = Address::new(&env, &[45u8; 7]);
    let other = Address::new(&env, &[46u8; 7]);
    let pos_id = QueueImpl::enroll_position(env.clone(), user.clone());
    QueueImpl::cancel_position(env, other, pos_id);
}

#[test]
fn test_total_enrolled() {
    let (env, admin) = setup();
    let config = make_config(&env, &admin);
    QueueImpl::initialize(env.clone(), admin.clone(), config);
    QueueImpl::open_enrollment(env.clone(), admin.clone());

    assert_eq!(QueueImpl::total_enrolled(env.clone()), 0);
    let u1 = Address::new(&env, &[50u8; 7]);
    let u2 = Address::new(&env, &[51u8; 7]);
    QueueImpl::enroll_position(env.clone(), u1);
    QueueImpl::enroll_position(env.clone(), u2);
    assert_eq!(QueueImpl::total_enrolled(env), 2);
}

#[test]
fn test_close() {
    let (env, admin) = setup();
    let config = make_config(&env, &admin);
    QueueImpl::initialize(env.clone(), admin.clone(), config);
    QueueImpl::close(env.clone(), admin);
    let loaded = QueueImpl::get_config(env);
    assert!(matches!(loaded.status, QueueStatus::Closed));
}

#[test]
#[should_panic(expected = "enrollment must be closed before advancing")]
fn test_advance_requires_enrollment_closed() {
    let (env, admin) = setup();
    let config = make_config(&env, &admin);
    QueueImpl::initialize(env.clone(), admin.clone(), config);
    QueueImpl::open_enrollment(env.clone(), admin.clone());
    // Attempt to advance while enrollment is still open — should panic
    QueueImpl::advance(env, admin, 1);
}

#[test]
fn test_advance_stays_in_advancement_active() {
    let (env, admin) = setup();
    let config = make_config(&env, &admin);
    QueueImpl::initialize(env.clone(), admin.clone(), config);
    QueueImpl::open_enrollment(env.clone(), admin.clone());

    let user = Address::new(&env, &[30u8; 7]);
    let pos = Position {
        position_id: 1,
        enrolled_at: 100,
        identity: user,
        status: PositionStatus::Pending,
        advanced_at: None,
    };
    env.storage().persistent().set(&(Symbol::new(&env, "pos"), 1u32), &pos);
    env.storage().persistent().set(&Symbol::new(&env, "idx"), &0u32);

    QueueImpl::close_enrollment(env.clone(), admin.clone());
    QueueImpl::advance(env.clone(), admin, 1);
    let cfg = QueueImpl::get_config(env);
    assert!(matches!(cfg.status, QueueStatus::AdvancementActive));
}

#[test]
fn test_get_position_by_id() {
    let (env, admin) = setup();
    let config = make_config(&env, &admin);
    QueueImpl::initialize(env.clone(), admin.clone(), config);

    let user = Address::new(&env, &[20u8; 7]);
    let pos = Position {
        position_id: 1,
        enrolled_at: 50,
        identity: user,
        status: PositionStatus::Pending,
        advanced_at: None,
    };
    env.storage().persistent().set(&(Symbol::new(&env, "pos"), 1u32), &pos);

    let loaded = QueueImpl::get_position(env, 1).unwrap();
    assert_eq!(loaded.enrolled_at, 50);
    assert_eq!(loaded.identity, user);
}
