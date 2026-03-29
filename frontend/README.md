# Fidux Frontend (Kanban)

React + Vite frontend for Fidux Kanban board.

## Features

- White/black background theme with user-selectable `Light`, `Dark`, `System`
- Teal/Purple/Magenta accent styling
- Login with email/password or paste existing JWT access token
- Project picker (from `GET /api/projects`)
- Kanban board with drag-drop status changes
- Optimistic concurrency handling for move conflicts (`VERSION_CONFLICT`)
- Issue details drawer with edit + save
- Related Figma preview + "Open in Figma"

## Run

```bash
cd /Users/shrutigitte/Desktop/SOS/frontend
npm install
npm run dev
```

Open: `http://localhost:5173`

## API configuration

- Default frontend API base: `/api`
- Local development proxy target: `http://localhost:3002`

The dev server proxies `/api` to the backend automatically through `VITE_DEV_BACKEND_PROXY_TARGET`.

## Production recommendation

Deploy the frontend and backend behind the same public origin and route API traffic through `/api`.

Example:

- Frontend: `https://app.example.com`
- Backend API: `https://app.example.com/api`

If you must deploy the backend on a different origin, set:

```bash
VITE_API_BASE=https://api.example.com/api
```

The login panel still exposes an advanced API Base override, but production users should not need it in a correctly deployed setup.
