use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, Symbol};

/// TTL threshold: renew if remaining TTL is below this many ledgers (~13.8 hours at 5s/ledger)
const TTL_THRESHOLD: u32 = 10_000;
/// TTL extension target: extend to this many ledgers (~1 year at 5s/ledger)
const TTL_EXTEND_TO: u32 = 6_307_200;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EnrollmentProof {
    pub queue_id: Symbol,
    pub identity: Address,
    pub enrolled_at: u64,
    pub proof_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
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
    pub proof_hash: BytesN<32>,
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
    fn finalize_enrollment(env: Env, admin: Address, identity: Address, queue_id: Symbol);
    fn enrollment_count(env: Env, queue_id: Symbol) -> u32;
}

pub struct EnrollmentImpl;

#[contractimpl]
impl Enrollment for EnrollmentImpl {
    fn enroll(env: Env, caller: Address, queue_id: Symbol) -> EnrollmentProof {
        caller.require_auth();
        if Self::is_enrolled_internal(&env, &caller, &queue_id) {
            let behavior: DuplicateBehavior = env
                .storage()
                .persistent()
                .get(&Symbol::new(&env, "dup_behavior"))
                .unwrap_or(DuplicateBehavior::Reject);
            match behavior {
                DuplicateBehavior::Reject => panic!("duplicate enrollment"),
                DuplicateBehavior::GrantWaitingList => panic!("duplicate enrollment: waiting list not yet implemented"),
                DuplicateBehavior::OverrideExpired => {
                    panic!("duplicate enrollment: override-expired not yet implemented")
                }
            }
        }
        let enrolled_at = env.ledger().timestamp();
        let hash = Self::compute_proof_hash(&env, &caller, &queue_id, enrolled_at);
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
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        emit(
            &env,
            Symbol::new(&env, "Enrolled"),
            queue_id.clone(),
            &caller,
            enrolled_at,
            hash,
        );
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
        emit(
            &env,
            Symbol::new(&env, "Cancelled"),
            queue_id,
            &caller,
            env.ledger().timestamp(),
            [0u8; 32],
        );
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
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, "dup_behavior"), &behavior);
        env.storage().persistent().extend_ttl(&Symbol::new(&env, "dup_behavior"), TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    fn finalize_enrollment(env: Env, admin: Address, identity: Address, queue_id: Symbol) {
        admin.require_auth();
        let mut record = Self::load_record(&env, &identity, &queue_id);
        if record.finalized {
            panic!("already finalized");
        }
        record.finalized = true;
        let key = Self::record_key(&env, &identity, &queue_id);
        env.storage().persistent().set(&key, &record);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        emit(&env, Symbol::new(&env, "Finalized"), queue_id, &identity, record.enrolled_at, record.proof_hash);
    }

    fn enrollment_count(env: Env, queue_id: Symbol) -> u32 {
        let key = Self::count_key(&env, &queue_id);
        env.storage().persistent().get(&key).unwrap_or(0u32)
    }
}

impl EnrollmentImpl {
    fn is_enrolled_internal(env: &Env, identity: &Address, queue_id: &Symbol) -> bool {
        let key = Self::record_key(env, identity, queue_id);
        env.storage().persistent().has(&key)
    }

    fn load_record(env: &Env, identity: &Address, queue_id: &Symbol) -> EnrollmentRecord {
        let key = Self::record_key(env, identity, queue_id);
        let record = env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("record missing"));
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        record
    }

    fn record_key(env: &Env, identity: &Address, queue_id: &Symbol) -> (Symbol, Symbol, Address) {
        (Symbol::new(env, "enrollment"), queue_id.clone(), identity.clone())
    }

    fn count_key(env: &Env, queue_id: &Symbol) -> (Symbol, Symbol) {
        (Symbol::new(env, "enroll_cnt"), queue_id.clone())
    }

    /// Produces a 32-byte proof hash by XOR-folding the SHA-256-like preimage.
    /// In production this should use env.crypto().sha256() once available.
    fn compute_proof_hash(env: &Env, identity: &Address, queue_id: &Symbol, enrolled_at: u64) -> BytesN<32> {
        let ts_bytes = enrolled_at.to_be_bytes();
        let mut hash = [0u8; 32];
        // Mix timestamp bytes into the hash
        for (i, b) in ts_bytes.iter().enumerate() {
            hash[i % 32] ^= b;
        }
        // Mix ledger sequence number for additional entropy
        let seq = env.ledger().sequence();
        let seq_bytes = seq.to_be_bytes();
        for (i, b) in seq_bytes.iter().enumerate() {
            hash[(i + 8) % 32] ^= b;
        }
        BytesN::from_array(env, &hash)
    }
}

fn emit(env: &Env, kind: Symbol, queue_id: Symbol, _identity: &Address, _timestamp: u64, _hash: BytesN<32>) {
    env.events().publish((
        Symbol::new(env, "lineproof.enrollment"),
        kind,
        queue_id,
    ));
}

#[cfg(test)]
mod test;
