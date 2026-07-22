use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol, Vec};

/// TTL threshold: renew if remaining TTL is below this many ledgers (~13.8 hours at 5s/ledger)
const TTL_THRESHOLD: u32 = 10_000;
/// TTL extension target: extend to this many ledgers (~1 year at 5s/ledger)
const TTL_EXTEND_TO: u32 = 6_307_200;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[contracttype]
pub enum BindingStatus {
    Unbound,
    Bound,
    Revoked,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdentityRecord {
    pub identity: Address,
    pub bound_at: u64,
    pub queues: Vec<Symbol>,
    pub status: BindingStatus,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransferAttempt {
    pub from: Address,
    pub to: Address,
    pub timestamp: u64,
    pub reverted: bool,
}

pub trait Identity {
    fn bind(env: Env, identity: Address, queue_id: Symbol);
    fn unbind(env: Env, identity: Address, queue_id: Symbol);
    fn revoke(env: Env, admin: Address, identity: Address);
    fn is_bound(env: Env, identity: Address, queue_id: Symbol) -> bool;
    fn can_transfer(env: Env, from: Address, to: Address, queue_id: Symbol) -> bool;
    fn record_transfer_attempt(env: Env, from: Address, to: Address, queue_id: Symbol);
    fn get_record(env: Env, identity: Address) -> Option<IdentityRecord>;
    fn get_admin(env: Env) -> Option<Address>;
    fn initialize(env: Env, admin: Address);
    fn set_transfer_allowed(env: Env, admin: Address, allowed: bool);
}

#[contract]
pub struct IdentityImpl;

#[contractimpl]
impl Identity for IdentityImpl {
    fn bind(env: Env, identity: Address, queue_id: Symbol) {
        identity.require_auth();
        let mut record = Self::get_record_internal(&env, &identity);
        if matches!(record.status, BindingStatus::Revoked) {
            panic!("identity revoked");
        }
        record.queues.push_back(queue_id.clone());
        if record.bound_at == 0 {
            record.bound_at = env.ledger().timestamp();
        }
        record.status = BindingStatus::Bound;
        let key = Self::record_key(&env, &identity);
        env.storage().persistent().set(&key, &record);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        emit(&env, Symbol::new(&env, "Bound"), queue_id, &identity, env.ledger().timestamp());
    }

    fn unbind(env: Env, identity: Address, queue_id: Symbol) {
        identity.require_auth();
        let mut record = Self::get_record_internal(&env, &identity);
        let mut updated: Vec<Symbol> = Vec::new(&env);
        for q in record.queues.iter() {
            if q != &queue_id {
                updated.push_back(q.clone());
            }
        }
        record.queues = updated;
        let key = Self::record_key(&env, &identity);
        env.storage().persistent().set(&key, &record);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        emit(&env, Symbol::new(&env, "Unbound"), queue_id, &identity, env.ledger().timestamp());
    }

    fn is_bound(env: Env, identity: Address, queue_id: Symbol) -> bool {
        let record = Self::get_record_internal(&env, &identity);
        record.queues.iter().any(|q| q == &queue_id)
    }

    fn can_transfer(env: Env, from: Address, to: Address, queue_id: Symbol) -> bool {
        if from == to {
            return true;
        }

        let record = Self::get_record_internal(&env, &from);
        if matches!(record.status, BindingStatus::Revoked) {
            return false;
        }

        let is_bound = record.queues.iter().any(|q| q == &queue_id);
        if !is_bound {
            return false;
        }

        let allowed_key = Symbol::new(&env, "transfer_allow");
        env.storage().persistent().get(&allowed_key).unwrap_or(false)
    }

    fn set_transfer_allowed(env: Env, admin: Address, allowed: bool) {
        admin.require_auth();
        let stored_admin = Self::get_admin(env.clone()).unwrap_or_else(|| panic!("not initialized"));
        if admin != stored_admin {
            panic!("unauthorized");
        }
        let allowed_key = Symbol::new(&env, "transfer_allow");
        env.storage().persistent().set(&allowed_key, &allowed);
        env.storage().persistent().extend_ttl(&allowed_key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    fn record_transfer_attempt(env: Env, from: Address, to: Address, queue_id: Symbol) {
        let attempt = TransferAttempt {
            from: from.clone(),
            to: to.clone(),
            timestamp: env.ledger().timestamp(),
            reverted: true,
        };
        let key = Self::attempt_key(&env, &from, &to, &queue_id);
        env.storage().persistent().set(&key, &attempt);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        emit(&env, Symbol::new(&env, "TransferReverted"), queue_id, &from, env.ledger().timestamp());
    }

    fn get_record(env: Env, identity: Address) -> Option<IdentityRecord> {
        let key = Self::record_key(&env, &identity);
        if env.storage().persistent().has(&key) {
            Some(Self::get_record_internal(&env, &identity))
        } else {
            None
        }
    }

    fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        let key = Symbol::new(&env, "admin");
        if env.storage().persistent().has(&key) {
            panic!("already initialized");
        }
        env.storage().persistent().set(&key, &admin);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage().persistent().extend_ttl(&env.current_contract_address(), TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    fn get_admin(env: Env) -> Option<Address> {
        let key = Symbol::new(&env, "admin");
        env.storage().persistent().get(&key)
    }

    fn revoke(env: Env, admin: Address, identity: Address) {
        admin.require_auth();
        let admin_key = Symbol::new(&env, "admin");
        let stored_admin: Address = env.storage().persistent()
            .get(&admin_key)
            .unwrap_or_else(|| panic!("not initialized"));
        if admin != stored_admin {
            panic!("unauthorized");
        }
        let mut record = Self::get_record_internal(&env, &identity);
        record.status = BindingStatus::Revoked;
        let key = Self::record_key(&env, &identity);
        env.storage().persistent().set(&key, &record);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        emit(&env, Symbol::new(&env, "Revoked"), Symbol::new(&env, ""), &identity, env.ledger().timestamp());
    }
}

impl IdentityImpl {
    fn get_record_internal(env: &Env, identity: &Address) -> IdentityRecord {
        let key = Self::record_key(env, identity);
        let record = env.storage()
            .persistent()
            .get(&key)
            .unwrap_or(IdentityRecord {
                identity: identity.clone(),
                bound_at: 0,
                queues: Vec::new(env),
                status: BindingStatus::Unbound,
            });
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        record
    }

    pub fn record_key(env: &Env, identity: &Address) -> (Symbol, Address) {
        (Symbol::new(env, "identity"), identity.clone())
    }

    pub fn attempt_key(
        env: &Env,
        from: &Address,
        to: &Address,
        queue_id: &Symbol,
    ) -> (Symbol, Address, Address, Symbol) {
        (Symbol::new(env, "attempt"), from.clone(), to.clone(), queue_id.clone())
    }
}

fn emit(env: &Env, kind: Symbol, queue_id: Symbol, _identity: &Address, _timestamp: u64) {
    env.events().publish((
        Symbol::new(env, "lineproof_identity"),
        kind,
        queue_id,
    ), ());
}

#[cfg(test)]
mod test;
