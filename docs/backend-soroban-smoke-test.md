# Backend Soroban integration smoke test

Run on 2026-07-18 against the public Stellar testnet RPC from a local backend process.
Placeholder contract IDs were used because deployed project IDs and signing secrets are not stored in the repository.

## Startup modes

```text
[contracts] mock mode (no contract IDs configured)
LineProof backend listening on :4011 [development]

[contracts] configured mode (read-only; OPERATOR_SECRET_KEY absent)
LineProof backend listening on :4012 [development]
```

## Network-unavailable and read-only behavior

The configured-mode smoke process pointed at `https://soroban-testnet.stellar.org` with placeholder contract IDs and no operator secret.

```text
GET /api/queues/sneaker-drop-001
HTTP/1.1 200 OK
X-Data-Source: mock

POST /api/queues/sneaker-drop-001/advance
HTTP/1.1 503 Service Unavailable
```

The GET result demonstrates the intended network/contract-read error strategy: an unavailable on-chain read falls back to local state and explicitly labels the response. The POST result demonstrates that configured mode never silently performs a mock write when `OPERATOR_SECRET_KEY` is absent.

A successful signed transaction smoke test must be run by a maintainer with real testnet contract IDs and a funded operator key; those secrets were intentionally unavailable during this test.
