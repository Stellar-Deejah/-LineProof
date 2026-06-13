# Event Model

- `lineproof.factory` — factory lifecycle events
- `lineproof.queue` — queue transitions including enrollment, advance, and close
- `lineproof.enrollment` — enroll and cancel
- `lineproof.escrow` — deposit, release, refund, and expire
- `lineproof.identity` — bind, unbind, and transfer revert

Events include the queue slug, position id when applicable, and a ledger timestamp.
