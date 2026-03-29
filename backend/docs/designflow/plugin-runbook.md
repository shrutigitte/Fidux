# Fidux Plugin Runbook

## Prerequisites

- `.env` is configured with `DATABASE_URL`, `S3_*`, `CDN_BASE_URL`.
- Prisma schema pushed.

## 1) Sync database schema

```bash
cd /Users/shrutigitte/Desktop/SOS/backend
npm run prisma:push
```

## 2) Start backend

```bash
cd /Users/shrutigitte/Desktop/SOS/backend
PORT=3001 npm run start:dev
```

## 3) Seed dev plugin identity

```bash
cd /Users/shrutigitte/Desktop/SOS/backend
npm run fidux:seed
```

Copy output values into `.env`:

- `FIDUX_PLUGIN_PAT`
- `FIDUX_ORG_ID`
- `FIDUX_PROJECT_ID`

Alternative onboarding flow (without seed script):

Register user and get access token:

```bash
curl -X POST http://localhost:3001/api/auth/register \\
  -H 'Content-Type: application/json' \\
  -d '{"email":"owner@fidux.dev","name":"Fidux Owner","password":"ChangeMe123!"}'
```

Save token for later commands:

```bash
export AUTH_TOKEN="<accessToken from /api/auth/register>"
```

Create org:

```bash
curl -X POST http://localhost:3001/api/orgs \\
  -H "Authorization: Bearer $AUTH_TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"Fidux Org"}'
```

Create project:

```bash
curl -X POST http://localhost:3001/api/orgs/<ORG_ID>/projects \\
  -H "Authorization: Bearer $AUTH_TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"Fidux Project"}'
```

Create PAT:

```bash
curl -X POST http://localhost:3001/api/orgs/<ORG_ID>/pats \\
  -H "Authorization: Bearer $AUTH_TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"plugin token","scopes":["plugin:read_projects","plugin:write_issues"],"expiryDays":60}'
```

## 4) Run full plugin smoke test

```bash
cd /Users/shrutigitte/Desktop/SOS/backend
npm run fidux:smoke
```

Expected result:

- `verifyStatus: 200`
- `projectsStatus: 200`
- `createStatus: 201`
- `uploadStatus: 200`
- `completeStatus: 200`

## 5) Idempotency behavior checks

- Same `Idempotency-Key` + same body -> same issue response replayed.
- Same `Idempotency-Key` + different body -> `409 IDEMPOTENCY_KEY_REUSED`.

## 6) PAT lifecycle routes

- List PATs: `GET /api/orgs/:orgId/pats` (requires web JWT bearer token)
- Revoke PAT: `POST /api/orgs/:orgId/pats/:patId/revoke`
- Rotate PAT: `PATCH /api/orgs/:orgId/pats/:patId/rotate`

## Common failure fixes

- `CONFIGURATION_ERROR S3_ENDPOINT`: Ensure `S3_ENDPOINT` is `https://<account_id>.r2.cloudflarestorage.com`.
- Upload `401 Unauthorized`: `S3_ENDPOINT` and `CDN_BASE_URL` are swapped.
- DB `ECONNREFUSED`: Ensure app is reading `DATABASE_URL` and not local `DB_HOST` fallback.
- Port in use: run with another port (`PORT=3001`).
