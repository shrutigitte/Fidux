# DesignFlow MVP RBAC Policy

## Role hierarchy

- Organization: `ORG_OWNER` > `ORG_ADMIN` > `ORG_MEMBER`
- Project: `PROJECT_ADMIN` > `PROJECT_MEMBER` > `PROJECT_VIEWER`

## Middleware contract

- `requireAuth()` for web session protected routes.
- `requirePAT()` for plugin routes.
- `requireOrgRole(minRole)` for organization-level authorization.
- `requireProjectRole(minRole)` for project-level authorization.
- `requireIssueAccess()` resolves issue to project and checks project membership.

## Permissions

### Organization routes

| Route | Method | Minimum role |
| --- | --- | --- |
| `/api/orgs` | POST | Authenticated user |
| `/api/orgs/:orgId` | GET | `ORG_MEMBER` |
| `/api/orgs/:orgId/members` | GET | `ORG_ADMIN` |
| `/api/orgs/:orgId/members/invite` | POST | `ORG_ADMIN` |
| `/api/orgs/:orgId/members/:userId/role` | PATCH | `ORG_OWNER` |
| `/api/orgs/:orgId/pats` | POST | `ORG_MEMBER` (self only) |
| `/api/orgs/:orgId/pats/:patId/revoke` | POST | PAT owner, `ORG_ADMIN`, or `ORG_OWNER` |

### Project routes

| Route | Method | Minimum role |
| --- | --- | --- |
| `/api/orgs/:orgId/projects` | POST | `ORG_ADMIN` |
| `/api/projects/:projectId` | GET | `PROJECT_VIEWER` |
| `/api/projects/:projectId/members` | GET | `PROJECT_ADMIN` |
| `/api/projects/:projectId/members` | POST | `PROJECT_ADMIN` |
| `/api/projects/:projectId/members/:userId/role` | PATCH | `PROJECT_ADMIN` |

### Issue and board routes

| Route | Method | Minimum role |
| --- | --- | --- |
| `/api/projects/:projectId/issues` | GET | `PROJECT_VIEWER` |
| `/api/projects/:projectId/issues` | POST | `PROJECT_MEMBER` |
| `/api/issues/:issueId` | GET | `PROJECT_VIEWER` |
| `/api/issues/:issueId` | PATCH | `PROJECT_MEMBER` |
| `/api/issues/:issueId/move` | POST | `PROJECT_MEMBER` |

### Chat routes

| Route | Method | Minimum role |
| --- | --- | --- |
| `/api/projects/:projectId/messages` | GET | `PROJECT_VIEWER` |
| `/api/issues/:issueId/messages` | GET | `PROJECT_VIEWER` |
| `/api/projects/:projectId/messages` | POST | `PROJECT_MEMBER` |
| `/api/issues/:issueId/messages` | POST | `PROJECT_MEMBER` |

### Plugin routes

| Route | Method | Auth + role requirements |
| --- | --- | --- |
| `/api/plugin/pats/verify` | POST | Valid PAT |
| `/api/plugin/projects` | GET | PAT scope `plugin:read_projects` |
| `/api/plugin/issues` | POST | PAT scope `plugin:write_issues` and project role `PROJECT_MEMBER`+ |
| `/api/plugin/issues/:id/thumbnail/complete` | POST | Same as issue creation |

## Additional policy rules

- PATs are organization-bound and cannot cross organization boundaries.
- `PROJECT_VIEWER` is read-only for both project chat and issue chat.
- PAT revocation is immediate.
- Activity logs are append-only and immutable.
