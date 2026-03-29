# DesignFlow MVP WebSocket Contract

## Transport and auth

- WebSocket is only for authenticated web clients.
- Plugin clients do not use WebSocket in MVP.
- Handshake requires `Authorization: Bearer <sessionAccessToken>`.
- Invalid handshake token results in `UNAUTHORIZED` disconnect.

## Room model

- `project:{projectId}`
- `issue:{issueId}`

## Join flow

Client event:

```json
{
  "event": "room:join",
  "payload": { "type": "project", "id": "proj_1" }
}
```

or

```json
{
  "event": "room:join",
  "payload": { "type": "issue", "id": "iss_1" }
}
```

Server checks:

- Project room: user must have membership in that project.
- Issue room: user must have access to issue's project.

If denied, server emits:

```json
{
  "event": "room:join_denied",
  "payload": { "code": "FORBIDDEN", "room": "issue:iss_1" }
}
```

## Broadcast events

### `issue:created` to `project:{projectId}`

```json
{
  "issue": {
    "id": "iss_123",
    "projectId": "proj_1",
    "title": "Implement Login Button",
    "status": "TODO",
    "priority": "HIGH",
    "version": 1
  }
}
```

### `issue:updated` to `project:{projectId}` and `issue:{issueId}`

```json
{
  "issue": {
    "id": "iss_1",
    "status": "REVIEW",
    "version": 5,
    "updatedAt": "2026-02-12T17:00:00.000Z"
  },
  "change": {
    "field": "status",
    "from": "IN_PROGRESS",
    "to": "REVIEW"
  }
}
```

### `chat:issue_message` to `issue:{issueId}`

```json
{
  "message": {
    "id": "msg_1",
    "issueId": "iss_1",
    "projectId": "proj_1",
    "sender": { "id": "usr_1", "name": "Shruti" },
    "content": "Do we need hover state?",
    "createdAt": "2026-02-12T17:01:00.000Z"
  }
}
```

### `chat:project_message` to `project:{projectId}`

```json
{
  "message": {
    "id": "msg_2",
    "issueId": null,
    "projectId": "proj_1",
    "sender": { "id": "usr_2", "name": "Alex" },
    "content": "Standup notes: ...",
    "createdAt": "2026-02-12T17:02:00.000Z"
  }
}
```

## Incoming chat send authorization (if using WS send)

- `PROJECT_VIEWER` send attempts are rejected with `FORBIDDEN`.
- `PROJECT_MEMBER` and `PROJECT_ADMIN` are allowed.

## Reconnect behavior

- Client uses exponential backoff reconnect.
- Client re-sends all active room joins after reconnect.
- Server re-validates authorization on every join.
