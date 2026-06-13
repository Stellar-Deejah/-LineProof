# State Machine

| State            | Transition Trigger          | Next State            |
|------------------|-----------------------------|-----------------------|
| Draft            | `open_enrollment` by admin  | EnrollmentOpen        |
| EnrollmentOpen   | `close_enrollment` by admin | EnrollmentClosed      |
| EnrollmentClosed | `advance` by admin          | AdvancementActive     |
| AdvancementActive| `close` by admin            | Closed                |
| Closed           | No transitions              | None                  |

## Anti-state-corruption
- Enrollment cannot be open if the queue is closed.
- Advancement cannot be batched if fewer than one position is pending.
- Closed queues cannot accept enrollments (revert guaranteed).
