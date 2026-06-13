# Architecture Diagrams

## Stack
```
Organization
    |
    v
LineProof Soroban Contracts
    |
    v
Stellar Network
    |
    v
TypeScript SDK / dApp
    |
    v
End User
```

## Contracts
```
QueueFactory --- deploys ---> Queue
Queue     --- uses ---> Enrollment
Queue     --- uses ---> Escrow
Enrollment / Queue --- uses ---> Identity
```
