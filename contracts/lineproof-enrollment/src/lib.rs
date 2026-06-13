use soroban_sdk::{contractimpl, contracttype, Address, Env, Symbol};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EnrollmentProof {
    pub queue_id: Symbol,
    pub identity: Address,
    pub enrolled_at: u64,
    pub proof_hash: [u8; 32],
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[contracttype]
pub enum DuplicateBehavior {
    Reject,
    GrantWaitingList,
    OverrideExpired,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EnrollmentRecord {
    pub identity: Address,
    pub queue_id: Symbol,
    pub enrolled_at: u64,
    pub proof_hash: [u8; 32],
    pub duplicate_count: u32,
    pub finalized: bool,
}

#[contract]
pub trait Enrollment {
    fn enroll(env: Env, caller: Address, queue_id: Symbol) -> EnrollmentProof;
    fn cancel(env: Env, caller: Address, queue_id: Symbol);
    fn is_enrolled(env: Env, identity: Address, queue_id: Symbol) -> bool;
    fn enrollment_record(env: Env, identity: Address, queue_id: Symbol) -> Option<EnrollmentRecord>;
    fn set_duplicate_behavior(env: Env, admin: Address, behavior: DuplicateBehavior);
}

pub struct EnrollmentImpl;

#[contractimpl]
impl Enrollment for EnrollmentImpl {
    fn enroll(env: Env, caller: Address, queue_id: Symbol) -> EnrollmentProof {
        caller.require_auth();
        if Self::is_enrolled_internal(&env, &caller, &queue_id) {
            panic!("duplicate enrollment");
        }
        let enrolled_at = env.ledger().timestamp();
        let calendar_slice: Vec<u8> = vec![
            queue_id.to_string().as_bytes().len() as u8
        ];
        let mut proof_bytes = Vec::new(&env);
        proof_bytes.extend_from_slice(queue_id.to_string().as_bytes());
        proof_bytes.extend_from_slice(env.ledger().timestamp().to_be_bytes().as_slice());
        proof_bytes.extend_from_slice(calendar_slice.to_vec().as_slice());
        let mut hash = [0u8; 32];
        for (i, byte) in proof_bytes.iter().enumerate() {
            if i < 32 {
                hash[i] = *byte;
            }
        }
        let record = EnrollmentRecord {
            identity: caller.clone(),
            queue_id: queue_id.clone(),
            enrolled_at,
            proof_hash: hash,
            duplicate_count: 0,
            finalized: false,
        };
        let key = Self::record_key(&env, &caller, &queue_id);
        env.storage().persistent().set(&key, &record);
        emit(&env, Symbol::new(&env, "Enrolled"), queue_id.clone(), &caller, enrolled_at, hash);
        EnrollmentProof {
            queue_id,
            identity: caller,
            enrolled_at,
            proof_hash: hash,
        }
    }

    fn cancel(env: Env, caller: Address, queue_id: Symbol) {
        caller.require_auth();
        let key = Self::record_key(&env, &caller, &queue_id);
        if !env.storage().persistent().has(&key) {
            panic!("not enrolled");
        }
        env.storage().persistent().remove(&key);
        emit(&env, Symbol::new(&env, "Cancelled"), queue_id, &caller, env.ledger().timestamp(), [0u8; 32]);
    }

    fn is_enrolled(env: Env, identity: Address, queue_id: Symbol) -> bool {
        Self::is_enrolled_internal(&env, &identity, &queue_id)
    }

    fn enrollment_record(env: Env, identity: Address, queue_id: Symbol) -> Option<EnrollmentRecord> {
        let key = Self::record_key(&env, &identity, &queue_id);
        if env.storage().persistent().has(&key) {
            Some(Self::load_record(&env, &identity, &queue_id))
        } else {
            None
        }
    }

    fn set_duplicate_behavior(env: Env, admin: Address, behavior: DuplicateBehavior) {
        admin.require_auth();
        env.storage().persistent().set(&Symbol::new(&env, "dup_behavior"), &behavior);
    }
}

impl EnrollmentImpl {
    fn is_enrolled_internal(env: &Env, identity: &Address, queue_id: &Symbol) -> bool {
        let key = Self::record_key(env, identity, queue_id);
        env.storage().persistent().has(&key)
    }

    fn load_record(env: &Env, identity: &Address, queue_id: &Symbol) -> EnrollmentRecord {
        let key = Self::record_key(env, identity, queue_id);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("record missing"))
    }

    fn record_key(env: &Env, identity: &Address, queue_id: &Symbol) -> (Symbol, Symbol, Address) {
        (Symbol::new(env, "enrollment"), queue_id.clone(), identity.clone())
    }
}

fn emit(env: &Env, kind: Symbol, queue_id: Symbol, identity: &Address, timestamp: u64, hash: [u8; 32]) {
    env.events().publish((
        Symbol::new(env, "lineproof.enrollment"),
        kind,
        queue_id,
    ));
}

mod test;
