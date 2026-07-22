# API Reference — Public Endpoints

Base path: `/public`

Unauthenticated, read-only public endpoints for querying queue summaries and statistics.

---

## GET /public/queues

Returns a public summary list of registered queues without sensitive internal fields.

**Response 200**

```json
[
  {
    "id": "sneaker-drop-001",
    "name": "Sneaker Drop #001",
    "slug": "sneaker-drop-001",
    "status": "EnrollmentOpen",
    "enrolled": 187,
    "maxPositions": 250,
    "advancementRule": "FIFO",
    "advancementRuleImplemented": true
  },
  {
    "id": "lottery-drop-002",
    "name": "Lottery Drop #002",
    "slug": "lottery-drop-002",
    "status": "Draft",
    "enrolled": 0,
    "maxPositions": 100,
    "advancementRule": "VerifiableRandomness",
    "advancementRuleImplemented": false
  }
]
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique queue identifier |
| `name` | string | Display name |
| `slug` | string | URL slug |
| `status` | string | Current lifecycle status (`Draft`, `EnrollmentOpen`, `EnrollmentClosed`, `AdvancementActive`, `Closed`) |
| `enrolled` | integer | Total positions enrolled |
| `maxPositions` | integer | Maximum allowed capacity |
| `advancementRule` | string | Configured advancement strategy (`FIFO`, `Priority`, `VerifiableRandomness`) |
| `advancementRuleImplemented` | boolean | `true` if the strategy is actively enforced in the engine (currently `true` for `FIFO` only); `false` for dead/unimplemented variants |

---

## GET /public/queues/:id/stats

Returns aggregate statistics for a specific queue by ID or slug.

**Response 200**

```json
{
  "queueId": "sneaker-drop-001",
  "total": 187,
  "advanced": 0,
  "remaining": 187,
  "percentAdvanced": 0
}
```

**Response 404**

```json
{
  "message": "Queue not found"
}
```

---

## GET /public/health

Legacy health check route. Permanently redirected to canonical `GET /health`.

**Response 301**

- `Location: /health`
