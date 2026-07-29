use soroban_sdk::{testutils::Address as _, Address, Env, Symbol, Vec};

use crate::{AdvancementRule, Position, PositionStatus, QueueConfig, QueueImpl, QueueImplClient, QueueStatus};

fn setup() -> (Env, Address, Address) {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(QueueImpl, ());
    env.mock_all_auths();
    (env, admin, contract_id)
}

fn make_config(env: &Env, admin: &Address) -> QueueConfig {
    QueueConfig {
        slug: Symbol::new(env, "sneaker_drop"),
        name: Symbol::new(env, "SneakerDrop"),
        admin: admin.clone(),
        max_positions: 5,
        enrollment_open: 1_000,
        enrollment_close: 2_000,
        status: QueueStatus::Draft,
        version: 1,
        advancement_rule: AdvancementRule::Fifo,
    }
}

#[test]
fn test_initialize_persists_config() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(QueueImpl, ());
    env.mock_all_auths();
    let client = QueueImplClient::new(&env, &contract_id);
    let config = make_config(&env, &admin);
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    let loaded = client.get_config();
    assert_eq!(loaded.max_positions, 5);
    assert_eq!(loaded.version, 1);
}

#[test]
fn test_open_enrollment() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(QueueImpl, ());
    env.mock_all_auths();
    let client = QueueImplClient::new(&env, &contract_id);
    let config = make_config(&env, &admin);
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);
    let loaded = client.get_config();
    assert!(matches!(loaded.status, QueueStatus::EnrollmentOpen));
}

#[test]
fn test_close_enrollment() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(QueueImpl, ());
    env.mock_all_auths();
    let client = QueueImplClient::new(&env, &contract_id);
    let config = make_config(&env, &admin);
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);
    client.close_enrollment(&admin);
    let loaded = client.get_config();
    assert!(matches!(loaded.status, QueueStatus::EnrollmentClosed));
}

#[test]
fn test_advance_updates_positions() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(QueueImpl, ());
    env.mock_all_auths();
    let client = QueueImplClient::new(&env, &contract_id);
    let config = make_config(&env, &admin);
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    client.enroll_position(&user1);
    client.enroll_position(&user2);

    client.close_enrollment(&admin);

    let advanced = client.advance(&admin, &2);
    assert_eq!(advanced.len(), 2);

    let loaded1 = client.get_position(&1).unwrap();
    assert!(matches!(loaded1.status, PositionStatus::Advanced));
    assert!(loaded1.advanced_at.is_some());

    let loaded2 = client.get_position(&2).unwrap();

    let pos1 = Position {
        position_id: 1,
        enrolled_at: 100,
        identity: user1.clone(),
        status: PositionStatus::Pending,
        advanced_at: None,
        priority_weight: None,
    };
    let pos2 = Position {
        position_id: 2,
        enrolled_at: 101,
        identity: user2,
        status: PositionStatus::Pending,
        advanced_at: None,
        priority_weight: None,
    };

    env.as_contract(&contract_id, || {
        env.storage().persistent().set(&(Symbol::new(&env, "pos"), 1u32), &pos1);
        env.storage().persistent().set(&(Symbol::new(&env, "pos"), 2u32), &pos2);
        env.storage().persistent().set(&Symbol::new(&env, "idx"), &0u32);
    });

    client.close_enrollment(&admin);
    let advanced = client.advance(&admin, &2);
    assert_eq!(advanced.len(), 2);

    let loaded1: Position = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .get(&(Symbol::new(&env, "pos"), 1u32))
            .unwrap()
    });
    assert!(matches!(loaded1.status, PositionStatus::Advanced));
    assert!(loaded1.advanced_at.is_some());

    let loaded2: Position = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .get(&(Symbol::new(&env, "pos"), 2u32))
            .unwrap()
    });
    assert!(matches!(loaded2.status, PositionStatus::Advanced));
}

#[test]
#[should_panic(expected = "queue not initialized")]
fn test_get_config_panics_when_missing() {
    let env = Env::default();
    let _admin = Address::generate(&env);
    let contract_id = env.register(QueueImpl, ());
    env.mock_all_auths();
    let (env, _admin, contract_id) = setup();
    let client = QueueImplClient::new(&env, &contract_id);
    let _ = client.get_config();
}

#[test]
fn test_current_position_index() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(QueueImpl, ());
    env.mock_all_auths();
    let client = QueueImplClient::new(&env, &contract_id);
    let config = make_config(&env, &admin);
    client.initialize(&admin, &config);
    assert_eq!(client.current_position_index(), 0);
    assert_eq!(client.current_position_index(), 0);
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    assert_eq!(client.current_position_index(), 0);
    env.as_contract(&contract_id, || {
        env.storage().persistent().set(&Symbol::new(&env, "idx"), &3u32);
    });
    assert_eq!(client.current_position_index(), 3);
}

#[test]
fn test_enroll_position_creates_pending() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(QueueImpl, ());
    env.mock_all_auths();
    let client = QueueImplClient::new(&env, &contract_id);
    let config = make_config(&env, &admin);
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);

    let user = Address::generate(&env);
    let pos_id = client.enroll_position(&user);
    assert_eq!(pos_id, 1);

    let loaded = client.get_position(&pos_id).unwrap();
    assert_eq!(loaded.identity, user);
    assert!(matches!(loaded.status, PositionStatus::Pending));
}

#[test]
#[should_panic(expected = "enrollment is not open")]
fn test_enroll_position_rejects_when_not_open() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(QueueImpl, ());
    env.mock_all_auths();
    let client = QueueImplClient::new(&env, &contract_id);
    let config = make_config(&env, &admin);
    client.initialize(&admin, &config);
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    // enrollment not opened
    let user = Address::generate(&env);
    client.enroll_position(&user);
}

#[test]
fn test_cancel_position() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(QueueImpl, ());
    env.mock_all_auths();
    let client = QueueImplClient::new(&env, &contract_id);
    let config = make_config(&env, &admin);
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);

    let user = Address::generate(&env);
    let pos_id = client.enroll_position(&user);
    client.cancel_position(&user, &pos_id);

    let loaded = client.get_position(&pos_id).unwrap();
    assert!(matches!(loaded.status, PositionStatus::Cancelled));
}

#[test]
#[should_panic(expected = "not your position")]
fn test_cancel_position_wrong_identity() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(QueueImpl, ());
    env.mock_all_auths();
    let client = QueueImplClient::new(&env, &contract_id);
    let config = make_config(&env, &admin);
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);

    let user = Address::generate(&env);
    let other = Address::generate(&env);
    let pos_id = client.enroll_position(&user);
    client.cancel_position(&other, &pos_id);
}

#[test]
fn test_total_enrolled() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(QueueImpl, ());
    env.mock_all_auths();
    let client = QueueImplClient::new(&env, &contract_id);
    let config = make_config(&env, &admin);
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);

    assert_eq!(client.total_enrolled(), 0);
    let u1 = Address::generate(&env);
    let u2 = Address::generate(&env);
    client.enroll_position(&u1);
    client.enroll_position(&u2);
    assert_eq!(client.total_enrolled(), 2);
}

#[test]
fn test_close() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(QueueImpl, ());
    env.mock_all_auths();
    let client = QueueImplClient::new(&env, &contract_id);
    let config = make_config(&env, &admin);
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.close(&admin);
    let loaded = client.get_config();
    assert!(matches!(loaded.status, QueueStatus::Closed));
}

#[test]
#[should_panic(expected = "enrollment must be closed before advancing")]
fn test_advance_requires_enrollment_closed() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(QueueImpl, ());
    env.mock_all_auths();
    let client = QueueImplClient::new(&env, &contract_id);
    let config = make_config(&env, &admin);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);
    // Attempt to advance while enrollment is still open — should panic
    client.advance(&admin, &1);
}

#[test]
fn test_advance_stays_in_advancement_active() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(QueueImpl, ());
    env.mock_all_auths();
    let client = QueueImplClient::new(&env, &contract_id);
    let config = make_config(&env, &admin);
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);

    let user = Address::generate(&env);
    client.enroll_position(&user);
    let pos = Position {
        position_id: 1,
        enrolled_at: 100,
        identity: user,
        status: PositionStatus::Pending,
        advanced_at: None,
        priority_weight: None,
    };
    env.as_contract(&contract_id, || {
        env.storage().persistent().set(&(Symbol::new(&env, "pos"), 1u32), &pos);
        env.storage().persistent().set(&Symbol::new(&env, "idx"), &0u32);
    });

    client.close_enrollment(&admin);
    client.advance(&admin, &1);
    let cfg = client.get_config();
    assert!(matches!(cfg.status, QueueStatus::AdvancementActive));
}

#[test]
fn test_get_position_by_id() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(QueueImpl, ());
    env.mock_all_auths();
    let client = QueueImplClient::new(&env, &contract_id);
    let config = make_config(&env, &admin);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);

    let user = Address::generate(&env);
    client.enroll_position(&user);

    let loaded = client.get_position(&1).unwrap();
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);

    let user = Address::generate(&env);
    let pos = Position {
        position_id: 1,
        enrolled_at: 50,
        identity: user.clone(),
        status: PositionStatus::Pending,
        advanced_at: None,
        priority_weight: None,
    };
    env.as_contract(&contract_id, || {
        env.storage().persistent().set(&(Symbol::new(&env, "pos"), 1u32), &pos);
    });

    let loaded = client.get_position(&1).unwrap();
    assert_eq!(loaded.enrolled_at, 50);
    assert_eq!(loaded.identity, user);
}

#[test]
#[should_panic(expected = "queue is closed")]
fn test_advance_closed_queue_panics() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(QueueImpl, ());
    env.mock_all_auths();
    let client = QueueImplClient::new(&env, &contract_id);
    let config = make_config(&env, &admin);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);
    client.close_enrollment(&admin);
    client.close(&admin);
    client.advance(&admin, &1);
}

#[test]
#[should_panic(expected = "queue is closed")]
fn test_open_enrollment_after_close_panics() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(QueueImpl, ());
    env.mock_all_auths();
    let client = QueueImplClient::new(&env, &contract_id);
    let config = make_config(&env, &admin);
    client.initialize(&admin, &config);
    client.close(&admin);
    client.open_enrollment(&admin);
}

#[test]
fn test_advance_empty_queue_returns_empty_vec() {
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);
    client.close_enrollment(&admin);

    let result = client.advance(&admin, &5);
    assert_eq!(result.len(), 0);
    assert_eq!(client.current_position_index(), 0);
}

#[test]
fn test_expire_position() {
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);

    let user = Address::generate(&env);
    let pos_id = client.enroll_position(&user);
    client.close_enrollment(&admin);
    client.close(&admin);

    client.expire_position(&admin, &pos_id);
    let loaded = client.get_position(&pos_id).unwrap();
    assert!(matches!(loaded.status, PositionStatus::Expired));
}

#[test]
#[should_panic(expected = "only pending positions can be expired")]
fn test_expire_position_not_pending() {
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);

    let user = Address::generate(&env);
    let pos_id = client.enroll_position(&user);
    client.close_enrollment(&admin);
    let advanced = client.advance(&admin, &1);
    assert_eq!(advanced.len(), 1);

    // Attempt to expire an already-advanced position — should panic
    client.expire_position(&admin, &pos_id);
}

#[test]
#[should_panic(expected = "queue must be in advancement or closed state")]
fn test_expire_position_wrong_state() {
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);

    let user = Address::generate(&env);
    let pos_id = client.enroll_position(&user);
    // Queue is still in EnrollmentOpen — expire should panic
    client.expire_position(&admin, &pos_id);
}

#[test]
fn test_expire_positions_batch() {
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);
    let id1 = client.enroll_position(&user1);
    let id2 = client.enroll_position(&user2);
    let id3 = client.enroll_position(&user3);
    client.close_enrollment(&admin);
    client.close(&admin);

    let ids = Vec::from_array(&env, [id1, id2, id3]);
    client.expire_positions_batch(&admin, &ids);

    let p1 = client.get_position(&id1).unwrap();
    let p2 = client.get_position(&id2).unwrap();
    let p3 = client.get_position(&id3).unwrap();
    assert!(matches!(p1.status, PositionStatus::Expired));
    assert!(matches!(p2.status, PositionStatus::Expired));
    assert!(matches!(p3.status, PositionStatus::Expired));
}

#[test]
fn test_advance_with_cancelled_positions_emits_skipped() {
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);
    
    let pos1 = client.enroll_position(&user1); // id=1
    let pos2 = client.enroll_position(&user2); // id=2
    let pos3 = client.enroll_position(&user3); // id=3

    // Cancel position 2
    client.cancel_position(&user2, &pos2);

    client.close_enrollment(&admin);

    // Advance batch_size=3: should advance pos1 and pos3, skip pos2
    let advanced = client.advance(&admin, &3);
    
    // Only 2 positions should be advanced (pos1 and pos3)
    assert_eq!(advanced.len(), 2);
    assert!(advanced.iter().any(|id| id == 1));
    assert!(advanced.iter().any(|id| id == 3));

    // Verify pos1 and pos3 are Advanced
    let loaded1 = client.get_position(&1).unwrap();
    assert!(matches!(loaded1.status, PositionStatus::Advanced));
    
    let loaded3 = client.get_position(&3).unwrap();
    assert!(matches!(loaded3.status, PositionStatus::Advanced));

    // Verify pos2 is still Cancelled (not advanced)
    let loaded2 = client.get_position(&2).unwrap();
    assert!(matches!(loaded2.status, PositionStatus::Cancelled));
}

#[test]
fn test_advance_from_advancement_active_state() {
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);
    let user4 = Address::generate(&env);

    client.enroll_position(&user1); // id=1
    client.enroll_position(&user2); // id=2
    client.enroll_position(&user3); // id=3
    client.enroll_position(&user4); // id=4

    client.close_enrollment(&admin);

    // First advance: batch_size=2, advances pos1 and pos2
    let advanced1 = client.advance(&admin, &2);
    assert_eq!(advanced1.len(), 2);
    assert!(advanced1.iter().any(|id| id == 1));
    assert!(advanced1.iter().any(|id| id == 2));

    // Second advance should work (queue is now AdvancementActive)
    let advanced2 = client.advance(&admin, &2);
    assert_eq!(advanced2.len(), 2);
    assert!(advanced2.iter().any(|id| id == 3));
    assert!(advanced2.iter().any(|id| id == 4));

    // Verify all 4 are Advanced
    for id in 1..=4 {
        let pos = client.get_position(&id).unwrap();
        assert!(matches!(pos.status, PositionStatus::Advanced));
    }
}

#[test]
fn test_advance_all_cancelled_does_not_transition_to_advancement_active() {
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    let pos1 = client.enroll_position(&user1);
    let pos2 = client.enroll_position(&user2);

    // Cancel both positions
    client.cancel_position(&user1, &pos1);
    client.cancel_position(&user2, &pos2);

    client.close_enrollment(&admin);

    // Advance with all-cancelled batch returns empty vec
    let advanced = client.advance(&admin, &2);
    assert_eq!(advanced.len(), 0);

    // Queue should still be in EnrollmentClosed, so another advance should work
    // (or we can call advance again and it should not panic)
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.advance(&admin, &2);
    }));
    assert!(result.is_ok()); // Should not panic
}

// ─── Per-identity duplicate guard (issue #99) ─────────────────────────────────

#[test]
#[should_panic(expected = "identity_already_enrolled")]
fn test_enroll_position_rejects_duplicate_identity() {
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);

    let user = Address::generate(&env);
    client.enroll_position(&user);
    // Same identity tries again — must panic with the duplicate guard.
    client.enroll_position(&user);
}

#[test]
fn test_enroll_different_identities_succeed() {
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let id1 = client.enroll_position(&user1);
    let id2 = client.enroll_position(&user2);

    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
    assert_eq!(client.get_position_by_identity(&user1), Some(1));
    assert_eq!(client.get_position_by_identity(&user2), Some(2));
}

#[test]
fn test_get_position_by_identity_after_enroll_and_cancel() {
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);

    let user = Address::generate(&env);
    // Unknown identity has no position.
    assert_eq!(client.get_position_by_identity(&user), None);

    let pos_id = client.enroll_position(&user);
    assert_eq!(client.get_position_by_identity(&user), Some(pos_id));

    // Cancelling frees the per-identity index.
    client.cancel_position(&user, &pos_id);
    assert_eq!(client.get_position_by_identity(&user), None);
}

#[test]
fn test_cancel_allows_reenrollment_same_identity() {
    let (env, admin, contract_id) = setup();
    let config = make_config(&env, &admin);
    let client = QueueImplClient::new(&env, &contract_id);
    client.initialize(&admin, &config);
    client.open_enrollment(&admin);

    let user = Address::generate(&env);
    let first = client.enroll_position(&user);
    client.cancel_position(&user, &first);

    // After cancelling, the same identity can enroll again (new position id).
    let second = client.enroll_position(&user);
    assert_eq!(first, 1);
    assert_eq!(second, 2);
    assert_eq!(client.get_position_by_identity(&user), Some(2));

    // total_enrolled counts all positions (incl. the cancelled one): next_id - 1 = 2.
    assert_eq!(client.total_enrolled(), 2);
}
