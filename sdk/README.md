# @lineproof/sdk

TypeScript SDK for the LineProof waiting-list protocol on Stellar/Soroban.

```ts
import { LineProofClient, EnrollmentClient } from '@lineproof/sdk';
```

The package ships ESM and CJS builds with type declarations, and declares
`"sideEffects": false` so bundlers can tree-shake unused exports.

## Migration note: `Keypair` / `Networks` re-exports removed

Older versions re-exported `Keypair` and `Networks` from
`@stellar/stellar-sdk` as a convenience:

```ts
// No longer available:
import { Keypair, Networks } from '@lineproof/sdk';
```

These re-exports prevented bundlers from tree-shaking the Stellar SDK and
risked version collisions when an application depends on
`@stellar/stellar-sdk` directly at a different version. Import them from
`@stellar/stellar-sdk` instead:

```ts
import { Keypair, Networks } from '@stellar/stellar-sdk';
```

No other exports changed. If you only used `@lineproof/sdk`'s own clients and
types, no action is needed.
