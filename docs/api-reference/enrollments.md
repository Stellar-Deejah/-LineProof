# API Reference — Enrollments

Base path: `/api/v1/enrollments` *(Note: Legacy `/api/enrollments` is deprecated and forwards to `/api/v1/enrollments` with `Deprecation: true` header)*

---

## POST /api/v1/enrollments/enroll

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

Returns all enrollments for a given identity address.

**Response 200**

```json
[
  {
    "queueId": "sneaker-drop-001",
    "identity": "GABC...XYZ",
    "enrolledAt": "2025-07-01T10:00:00.000Z",
    "conflict": false,
    "cancelled": false
  }
]
```

**Response 404** — no enrollments found

---

## GET /api/enrollments/queue/:queueId

Returns all active (non-cancelled) enrollments for a queue.

**Response 200** — array of enrollment records (same shape as above)
