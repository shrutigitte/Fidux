# DesignFlow MVP Decisions

## PAT model

- PAT is scoped to exactly one organization.
- Expiry options: 7, 30, 60 (default), or 90 days.
- PAT is shown exactly once at creation time.
- Storage: `sha256(token)` with per-token salt.
- Revocation is immediate.
- Rotation supports optional 24h grace where both old and new tokens are accepted.

## Plugin idempotency

- `Idempotency-Key` header is required for `POST /api/plugin/issues`.
- Server stores idempotency key hash, request hash, and response for 24h.
- Reuse behavior:
  - Same key + same payload: return original response.
  - Same key + different payload: `409 IDEMPOTENCY_KEY_REUSED`.

## WebSocket auth and joins

- WebSocket is for web clients only in MVP.
- Handshake uses web session bearer token.
- Room join checks RBAC every time.
- Reconnect requires explicit room rejoin and re-validation.

## Kanban concurrency

- Issues use integer `version` optimistic lock.
- Move API requires `expectedVersion`.
- On mismatch: `409 VERSION_CONFLICT` with latest issue snapshot.

## Chat permissions

- `PROJECT_VIEWER` is read-only for project chat and issue chat.
- `PROJECT_MEMBER` and `PROJECT_ADMIN` can send messages.

## Thumbnail trust boundary

- Plugin never sets `thumbnailUrl` directly.
- Server issues signed upload URL and expected `objectKey`.
- Complete endpoint verifies storage object key, content type, and max size (5MB).
- Server writes final CDN URL to issue only after verification.

## Activity log policy

- Logs are append-only and immutable.
- Mandatory actions:
  - `ISSUE_CREATED`
  - `ISSUE_STATUS_CHANGED`
  - `ISSUE_ASSIGNEE_CHANGED`
  - `ISSUE_PRIORITY_CHANGED`
- Optional in MVP:
  - `ISSUE_TITLE_CHANGED`
  - `MESSAGE_SENT` (can be skipped to reduce noise)

## Rate limits

### Plugin routes (per PAT + IP)

- `GET /api/plugin/projects`: 60/min
- `POST /api/plugin/issues`: 20/min
- `POST /api/plugin/issues/:id/thumbnail/complete`: 30/min
- `POST /api/plugin/pats/verify`: 30/min
- Burst allowance: 2x sustained limit for 10 seconds

### Web routes

- `POST /api/messages`: 120/min
- `PATCH /api/issues/:id`: 60/min
