use soroban_sdk::{contract, contractimpl, contracttype, xdr::ToXdr, Address, BytesN, Env, Symbol, Vec};

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
    pub expires_at: Option<u64>,
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
    pub expires_at: Option<u64>,
}

pub trait Enrollment {
    fn enroll(env: Env, caller: Address, queue_id: Symbol, expires_at: Option<u64>) -> EnrollmentProof;
    fn cancel(env: Env, caller: Address, queue_id: Symbol);
    fn is_enrolled(env: Env, identity: Address, queue_id: Symbol) -> bool;
    fn enrollment_record(env: Env, identity: Address, queue_id: Symbol) -> Option<EnrollmentRecord>;
    fn set_duplicate_behavior(env: Env, admin: Address, behavior: DuplicateBehavior);
    fn finalize_enrollment(env: Env, admin: Address, identity: Address, queue_id: Symbol);
    fn enrollment_count(env: Env, queue_id: Symbol) -> u32;
    fn is_behavior_supported(env: Env, behavior: DuplicateBehavior) -> bool;
    fn get_waitlist(env: Env, queue_id: Symbol) -> Vec<Address>;
    fn waitlist_position(env: Env, identity: Address, queue_id: Symbol) -> Option<u32>;
    fn promote_from_waitlist(env: Env, admin: Address, queue_id: Symbol, count: u32);
}

#[contract]
pub struct EnrollmentImpl;

#[contractimpl]
impl Enrollment for EnrollmentImpl {
    fn enroll(env: Env, caller: Address, queue_id: Symbol, expires_at: Option<u64>) -> EnrollmentProof {
        caller.require_auth();
        let is_enrolled = Self::is_enrolled_internal(&env, &caller, &queue_id);
        if is_enrolled {
            let behavior: DuplicateBehavior = env
                .storage()
                .persistent()
                .get(&Symbol::new(&env, "dup_behavior"))
                .unwrap_or(DuplicateBehavior::Reject);
            match behavior {
                DuplicateBehavior::Reject => panic!("duplicate enrollment"),
                DuplicateBehavior::GrantWaitingList => {
                    if Self::is_on_waitlist(&env, &caller, &queue_id) {
                        panic!("already waitlisted");
                    }
                    let key = Self::waitlist_key(&env, &queue_id);
                    let mut waitlist: Vec<Address> = env
                        .storage()
                        .persistent()
                        .get(&key)
                        .unwrap_or_else(|| Vec::new(&env));
                    waitlist.push_back(caller.clone());
                    env.storage().persistent().set(&key, &waitlist);
                    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
                    
                    let zero_hash = BytesN::from_array(&env, &[0u8; 32]);
                    emit(
                        &env,
                        Symbol::new(&env, "WaitlistAdded"),
                        queue_id.clone(),
                        &caller,
                        env.ledger().timestamp(),
                        zero_hash.clone(),
                    );
                    return EnrollmentProof {
                        queue_id,
                        identity: caller,
                        enrolled_at: env.ledger().timestamp(),
                        proof_hash: zero_hash,
                        expires_at: None,
                    };
                }
                DuplicateBehavior::OverrideExpired => {
                    let record_key = Self::record_key(&env, &caller, &queue_id);
                    let record = Self::load_record(&env, &caller, &queue_id);
                    let now = env.ledger().timestamp();
                    let is_expired = if let Some(exp) = record.expires_at {
                        now > exp
                    } else {
                        false
                    };
                    if !is_expired {
                        panic!("duplicate enrollment");
                    }
                    // Replace expired record
                    let enrolled_at = now;
                    let hash = Self::compute_proof_hash(&env, &caller, &queue_id, enrolled_at);
                    let updated_record = EnrollmentRecord {
                        identity: caller.clone(),
                        queue_id: queue_id.clone(),
                        enrolled_at,
                        proof_hash: hash.clone(),
                        duplicate_count: record.duplicate_count + 1,
                        finalized: false,
                        expires_at,
                    };
                    env.storage().persistent().set(&record_key, &updated_record);
                    env.storage().persistent().extend_ttl(&record_key, TTL_THRESHOLD, TTL_EXTEND_TO);
                    emit(
                        &env,
                        Symbol::new(&env, "Enrolled"),
                        queue_id.clone(),
                        &caller,
                        enrolled_at,
                        hash.clone(),
                    );
                    return EnrollmentProof {
                        queue_id,
                        identity: caller,
                        enrolled_at,
                        proof_hash: hash,
                        expires_at,
                    };
                }
            }
        }
        
        let enrolled_at = env.ledger().timestamp();
        let hash = Self::compute_proof_hash(&env, &caller, &queue_id, enrolled_at);
        let record = EnrollmentRecord {
            identity: caller.clone(),
            queue_id: queue_id.clone(),
            enrolled_at,
            proof_hash: hash.clone(),
            duplicate_count: 0,
            finalized: false,
            expires_at,
        };
        let key = Self::record_key(&env, &caller, &queue_id);
        env.storage().persistent().set(&key, &record);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        
        // Increment enrollment count
        let count_key = Self::count_key(&env, &queue_id);
        let count: u32 = env.storage().persistent().get(&count_key).unwrap_or(0);
        env.storage().persistent().set(&count_key, &(count + 1));
        env.storage().persistent().extend_ttl(&count_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        emit(
            &env,
            Symbol::new(&env, "Enrolled"),
            queue_id.clone(),
            &caller,
            enrolled_at,
            hash.clone(),
        );
        EnrollmentProof {
            queue_id,
            identity: caller,
            enrolled_at,
            proof_hash: hash,
            expires_at,
        }
    }

    fn cancel(env: Env, caller: Address, queue_id: Symbol) {
        caller.require_auth();
        let key = Self::record_key(&env, &caller, &queue_id);
        let record: EnrollmentRecord = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("not enrolled"));
        env.storage().persistent().remove(&key);
        
        // Decrement enrollment count
        let count_key = Self::count_key(&env, &queue_id);
        let count: u32 = env.storage().persistent().get(&count_key).unwrap_or(0);
        if count > 0 {
            env.storage().persistent().set(&count_key, &(count - 1));
            env.storage().persistent().extend_ttl(&count_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        }

        emit(
            &env,
            Symbol::new(&env, "Cancelled"),
            queue_id,
            &caller,
            env.ledger().timestamp(),
            record.proof_hash,
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
        if !Self::is_behavior_supported(env.clone(), behavior) {
            panic!("behavior_not_supported");
        }
        env.storage()
            .persistent()
            .set(&Symbol::new(&env, "dup_behavior"), &behavior);
        env.storage().persistent().extend_ttl(&Symbol::new(&env, "dup_behavior"), TTL_THRESHOLD, TTL_EXTEND_TO);
        
        env.events().publish(
            (
                Symbol::new(&env, "lineproof_enrollment"),
                Symbol::new(&env, "DuplicateBehaviorChanged"),
            ),
            behavior,
        );
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

    fn is_behavior_supported(_env: Env, behavior: DuplicateBehavior) -> bool {
        match behavior {
            DuplicateBehavior::Reject => true,
            DuplicateBehavior::GrantWaitingList => true,
            DuplicateBehavior::OverrideExpired => true,
        }
    }

    fn get_waitlist(env: Env, queue_id: Symbol) -> Vec<Address> {
        let key = Self::waitlist_key(&env, &queue_id);
        env.storage().persistent().get(&key).unwrap_or_else(|| Vec::new(&env))
    }

    fn waitlist_position(env: Env, identity: Address, queue_id: Symbol) -> Option<u32> {
        let waitlist = Self::get_waitlist(env.clone(), queue_id);
        waitlist.iter().position(|x| x == identity).map(|pos| pos as u32)
    }

    fn promote_from_waitlist(env: Env, admin: Address, queue_id: Symbol, count: u32) {
        admin.require_auth();
        let key = Self::waitlist_key(&env, &queue_id);
        let mut waitlist = Self::get_waitlist(env.clone(), queue_id.clone());
        let to_promote = count.min(waitlist.len());
        
        for _ in 0..to_promote {
            let identity = waitlist.get(0).unwrap();
            waitlist.remove(0);
            let enrolled_at = env.ledger().timestamp();
            let hash = Self::compute_proof_hash(&env, &identity, &queue_id, enrolled_at);
            let record = EnrollmentRecord {
                identity: identity.clone(),
                queue_id: queue_id.clone(),
                enrolled_at,
                proof_hash: hash.clone(),
                duplicate_count: 0,
                finalized: false,
                expires_at: None,
            };
            let record_key = Self::record_key(&env, &identity, &queue_id);
            env.storage().persistent().set(&record_key, &record);
            env.storage().persistent().extend_ttl(&record_key, TTL_THRESHOLD, TTL_EXTEND_TO);
            
            // Increment enrollment count
            let count_key = Self::count_key(&env, &queue_id);
            let count_val: u32 = env.storage().persistent().get(&count_key).unwrap_or(0);
            env.storage().persistent().set(&count_key, &(count_val + 1));
            env.storage().persistent().extend_ttl(&count_key, TTL_THRESHOLD, TTL_EXTEND_TO);

            emit(
                &env,
                Symbol::new(&env, "Enrolled"),
                queue_id.clone(),
                &identity,
                enrolled_at,
                hash,
            );
        }
        
        env.storage().persistent().set(&key, &waitlist);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
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

    fn waitlist_key(env: &Env, queue_id: &Symbol) -> (Symbol, Symbol) {
        (Symbol::new(env, "waitlist"), queue_id.clone())
    }

    fn is_on_waitlist(env: &Env, identity: &Address, queue_id: &Symbol) -> bool {
        let key = Self::waitlist_key(env, queue_id);
        if env.storage().persistent().has(&key) {
            let waitlist: Vec<Address> = env.storage().persistent().get(&key).unwrap();
            waitlist.contains(identity)
        } else {
            false
        }
    }

    /// Produces a 32-byte cryptographic proof hash using SHA256.
    /// The preimage is the deterministic XDR serialization of (identity, queue_id, enrolled_at).
    fn compute_proof_hash(env: &Env, identity: &Address, queue_id: &Symbol, enrolled_at: u64) -> BytesN<32> {
        let preimage = (identity.clone(), queue_id.clone(), enrolled_at);
        env.crypto().sha256(&preimage.to_xdr(env)).into()
    }
}

fn emit(env: &Env, kind: Symbol, queue_id: Symbol, identity: &Address, timestamp: u64, hash: BytesN<32>) {
    env.events().publish(
        (
            Symbol::new(env, "lineproof_enrollment"),
            kind,
            queue_id,
        ),
        (identity.clone(), timestamp, hash),
    );
}

#[cfg(test)]
mod test;
