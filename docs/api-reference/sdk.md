# SDK Reference

## QueueFactory

### `deployQueue(slug, name, version, wasmHash) -> contractId`
Deploys a new queue instance from the factory.

### `registerQueue(slug, contractId, version)`
Registers an externally-deployed queue.

### `verifyQueue(slug) -> bool`
Returns whether a queue exists and is active.
