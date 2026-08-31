# API Versioning Policy

This document describes the versioning policy, URL namespace conventions, deprecation mechanism, and breaking change migration path for the LineProof REST API.

---

## Versioning Strategy

LineProof uses **URL Path Prefix Versioning** (e.g. `/api/v1/queues`).

### Strategy Evaluation & Rationale

When designing the versioning scheme, two primary strategies were evaluated:

| Strategy | Advantages | Disadvantages | Selection |
|---|---|---|---|
| **URL Path Prefix** (`/api/v1/...`) | Explicit in logs, easy to debug, supports simple caching policies, works out-of-the-box in OpenAPI specs, zero header manipulation required in simple clients. | Requires updating base URL when changing major versions. | **SELECTED** |
| **Header Versioning** (`Accept: application/vnd.lineproof.v1+json`) | Keeps URLs clean, allows fine-grained resource-level versioning. | Opaque in standard server logs, breaks standard browser navigation, complicates CDN cache key configurations. | Rejected |

**Why URL Path Prefix Was Selected**:
1. **Explicit Routing & Caching**: CDNs, reverse proxies, and API gateways can cache and route requests by URL path without needing custom header inspection rules.
2. **Developer Transparency**: Developers can inspect endpoints in web browsers, cURL, or Postman without manually injecting vendor MIME headers.
3. **OpenAPI & Tooling Integration**: SDK generators and API documentation tools (e.g., Swagger UI, Redoc) handle versioned path prefixes seamlessly.

---

## Namespace Structure

All active REST API endpoints are published under versioned namespaces:

- **Canonical Version 1 Base Path**: `/api/v1/`
  - `/api/v1/queues`
  - `/api/v1/enrollments`
  - `/api/v1/escrow`
  - `/api/v1/webhooks`

- **Unauthenticated Public Base Path**: `/public`
  - `/public/queues`
  - `/public/queues/:id/stats`

---

## Backward Compatibility & Deprecation Policy

To prevent breaking existing integrations when API versioning was introduced, unversioned endpoints under `/api/` remain operational but are marked as **deprecated**.

### Deprecation Headers

Any request served by a legacy `/api/` endpoint returns the following HTTP response headers:

```http
HTTP/1.1 200 OK
Deprecation: true
Link: </api/v1/queues>; rel="successor-version"
Content-Type: application/json
```

- **`Deprecation: true`**: Standard IETF draft header indicating that the requested URL path is deprecated.
- **`Link: </api/v1/...>; rel="successor-version"`**: Points clients directly to the replacement v1 endpoint.

### Sunset & Migration Timeline

1. **Phase 1 (Current - Deprecate & Forward)**: Unversioned `/api/` endpoints set `Deprecation: true` headers and forward internally to `/api/v1/` route handlers.
2. **Phase 2 (6 Months)**: Warning alerts added to SDK logs for unversioned `/api/` usage.
3. **Phase 3 (12 Months)**: Unversioned `/api/` endpoints will return `410 Gone`.

Integrators must update their client base URL to `/api/v1/`.

---

## Major & Minor Version Policy

- **Minor / Non-Breaking Changes**: Added fields, new endpoints, or optional query params do NOT bump the major version.
- **Major / Breaking Changes**: Renaming/removing fields, changing response status codes, or modifying authentication models will trigger a new major namespace (e.g. `/api/v2/`).
