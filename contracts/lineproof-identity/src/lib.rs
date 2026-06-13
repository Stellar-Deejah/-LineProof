use soroban_sdk::{contractimpl, contracttype, Address, Env, Symbol, Vec};

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

#[contract]
pub trait Identity {
    fn bind(env: Env, identity: Address, queue_id: Symbol);
    fn unbind(env: Env, identity: Address, queue_id: Symbol);
    fn is_bound(env: Env, identity: Address, queue_id: Symbol) -> bool;
    fn can_transfer(env: Env, from: Address, to: Address, queue_id: Symbol) -> bool;
    fn record_transfer_attempt(env: Env, from: Address, to: Address, queue_id: Symbol);
    fn get_record(env: Env, identity: Address) -> Option<IdentityRecord>;
}

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
        let key = Self::record_key(&env, &identity);
        env.storage().persistent().set(&key, &record);
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
        false
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
}

impl IdentityImpl {
    fn get_record_internal(env: &Env, identity: &Address) -> IdentityRecord {
        let key = Self::record_key(env, identity);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or(IdentityRecord {
                identity: identity.clone(),
                bound_at: 0,
                queues: Vec::new(env),
                status: BindingStatus::Unbound,
            })
    }

    fn record_key(env: &Env, identity: &Address) -> (Symbol, Address) {
        (Symbol::new(env, "identity"), identity.clone())
    }

    fn attempt_key(env: &Env, from: &Address, to: &Address, queue_id: &Symbol) -> (Symbol, Address, Address, Symbol) {
        (Symbol::new(env, "attempt"), from.clone(), to.clone(), queue_id.clone())
    }
}

fn emit(env: &Env, kind: Symbol, queue_id: Symbol, identity: &Address, timestamp: u64) {
    env.events().publish((
        Symbol::new(env, "lineproof.identity"),
        kind,
        queue_id,
    ));
}

mod test;
