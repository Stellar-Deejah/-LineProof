# API Reference — Enrollments

Base path: `/api/enrollments`

---

## POST /api/enrollments/enroll

Enrolls an identity into a queue. Returns a conflict flag if the identity is already enrolled.

**Request body**

```json
{
  "queueId": "sneaker-drop-001",
  "identity": "GABC...XYZ"
}
```

| Field | Type | Required |
|-------|------|----------|
| `queueId` | string | ✓ |
| `identity` | string | ✓ |

**Response 201** — enrollment created

```json
{
  "queueId": "sneaker-drop-001",
  "identity": "GABC...XYZ",
  "enrolledAt": "2025-07-01T10:00:00.000Z",
  "conflict": false,
  "cancelled": false
}
```

**Response 400** — validation error

**Response 409** — duplicate enrollment

---

## POST /api/enrollments/cancel

Cancels an active enrollment.

**Request body**

```json
{
  "queueId": "sneaker-drop-001",
  "identity": "GABC...XYZ"
}
```

**Response 200** — `{ "message": "Enrollment cancelled" }`

**Response 404** — enrollment not found

---

## GET /api/enrollments/:identity

Returns enrollments for a given identity address, paginated.

**Query parameters**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `limit` | integer | 50 | Items per page. Min 1, max 200. Returns 400 if out of range. |
| `cursor` | string | — | Opaque cursor from a previous response's `nextCursor`. |

**Response 200**

```json
{
  "items": [
    {
      "queueId": "sneaker-drop-001",
      "identity": "GABC...XYZ",
      "enrolledAt": "2025-07-01T10:00:00.000Z",
      "conflict": false,
      "cancelled": false
    }
  ],
  "nextCursor": "MDox",
  "total": 42
}
```

`nextCursor` is `null` when there are no more pages. Pass it as `?cursor=` on the next request to continue.

**Response 400** — invalid `limit` or `cursor`

**Response 404** — no enrollments found for the given identity

---

## GET /api/enrollments/queue/:queueId

Returns active (non-cancelled) enrollments for a queue, paginated.

**Query parameters**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `limit` | integer | 50 | Items per page. Min 1, max 200. Returns 400 if out of range. |
| `cursor` | string | — | Opaque cursor from a previous response's `nextCursor`. |

**Response 200** — paginated envelope (same shape as `GET /api/enrollments/:identity`)

**Response 400** — invalid `limit` or `cursor`
