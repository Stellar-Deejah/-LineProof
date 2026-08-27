# API Reference — Queues

Base path: `/api/queues`

---

## GET /api/queues

Returns registered queues, paginated. Accepts optional `?status=` filter.

**Query parameters**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `status` | string | — | Filter by queue status: `Draft`, `EnrollmentOpen`, `EnrollmentClosed`, `AdvancementActive`, `Closed` |
| `limit` | integer | 50 | Items per page. Min 1, max 200. Returns 400 if out of range. |
| `cursor` | string | — | Opaque cursor from a previous response's `nextCursor`. |

**Response 200**

```json
{
  "items": [
    {
      "id": "sneaker-drop-001",
      "name": "Sneaker Drop #001",
      "slug": "sneaker-drop-001",
      "description": "...",
      "maxPositions": 250,
      "enrolled": 187,
      "advanced": 0,
      "status": "EnrollmentOpen",
      "advancementRule": "FIFO",
      "escrowAsset": "USDC",
      "escrowAmount": 150,
      "createdAt": "2025-06-28T10:00:00.000Z"
    }
  ],
  "nextCursor": "MDox",
  "total": 312
}
```

`nextCursor` is `null` when there are no more pages. Pass it as `?cursor=` on the next request to continue. Omitting `limit` and `cursor` returns the first 50 items (backward-compatible default).

**Response 400** — invalid `limit`, `cursor`, or `status` value

---

## GET /api/queues/:id

Returns a single queue by ID or slug.

**Response 200** — queue object (same shape as list item)

**Response 404** — `{ "message": "Queue not found" }`

---

## GET /api/queues/:id/stats

Returns aggregate statistics for a queue.

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

---

## POST /api/queues

Creates a new queue in `Draft` status.

**Request body**

```json
{
  "name": "My Queue",
  "slug": "my-queue",
  "maxPositions": 100,
  "advancementRule": "FIFO",
  "description": "Optional description"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | ✓ | 1–120 chars |
| `slug` | string | ✓ | 1–120 chars, must be unique |
| `maxPositions` | integer | ✓ | > 0 |
| `advancementRule` | string | | `FIFO` (default), `Priority`, `VerifiableRandomness` |
| `description` | string | | max 500 chars |

**Response 201** — created queue object

**Response 400** — validation error

**Response 409** — slug already exists

---

## POST /api/queues/:id/advance

Advances a batch of positions. Sets status to `AdvancementActive`.

**Request body**

```json
{ "batchSize": 10 }
```

**Response 200** — updated queue object

**Response 404** — queue not found

**Response 409** — queue is already closed

---

## POST /api/queues/:id/close

Closes the queue. No further enrollment or advancement is possible.

**Response 200** — updated queue object with `status: "Closed"`
