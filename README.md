# Fidux

Fidux is a design-to-development collaboration platform that keeps Figma context attached to implementation work. Designers can create issues directly from selected Figma nodes, teams can manage those issues on a Kanban board, and everyone can stay aligned through issue details, activity history, notifications, chat, and role-based project management.

This repository contains the full product:
- a React web app
- a NestJS backend API
- a Figma plugin for issue creation from design selections

## What Fidux Does

- Create issues from selected Figma nodes
- Keep issue cards linked to Figma previews and deep links
- Organize work across a Kanban board
- Assign issues to project members with role-based permissions
- Track issue activity, status changes, and assignee changes
- Send branded emails for verification, assignments, access changes, and password updates
- Support PAT-based Figma plugin access for workspace integrations

## Tech Stack

### Frontend
- React 18
- TypeScript
- Vite
- Plain CSS

### Backend
- NestJS
- TypeScript
- PostgreSQL
- Prisma schema tooling
- `pg` for direct query access in Fidux modules
- JWT auth with Passport
- Socket.IO via Nest WebSockets
- Nodemailer / SMTP
- AWS SDK v3 for S3-compatible storage

### Integrations
- Figma Plugin API
- Google Sign-In
- S3-compatible object storage such as Cloudflare R2

## Repository Structure

```text
SOS/
├── backend/              # NestJS API, auth, admin, kanban, plugin endpoints
├── frontend/             # React + Vite web app
├── figma-plugin-fidux/   # Figma plugin for creating issues from design selections
└── DEPLOYMENT.md         # deployment notes and hosting setup
```

More detailed module and product docs live under:

- `/Users/shrutigitte/Desktop/SOS/backend/docs/designflow/`

## Core Product Areas

### Web App
- Email/password authentication
- Theme support: light, dark, system
- Kanban board with issue lanes
- Full issue view with related Figma context
- Notifications, profile, admin, and security flows
- Issue chat and activity timeline

### Backend API
- Authentication and account management
- Organization and project administration
- Project membership and role updates
- Kanban issue CRUD, assignment, movement, archiving, and deletion
- Notification and activity history endpoints
- Plugin endpoints for PAT verification and issue creation

### Figma Plugin
- Connect using API base + PAT
- Read current Figma selection
- Create issues from the selected node
- Upload thumbnails when storage is configured

## Local Development

### Prerequisites

- Node.js 18+
- npm
- PostgreSQL
- A local or remote database connection string

### 1. Backend setup

```bash
cd /Users/shrutigitte/Desktop/SOS/backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:push
npm run start:dev
```

Backend runs at:

- `http://localhost:3002`

Health check:

- `http://localhost:3002/api/health`

### 2. Frontend setup

```bash
cd /Users/shrutigitte/Desktop/SOS/frontend
cp .env.example .env
npm install
npm run dev
```

Frontend runs at:

- `http://localhost:5173`

By default, the Vite dev server proxies `/api` to the backend using:

- `VITE_DEV_BACKEND_PROXY_TARGET=http://localhost:3002`

### 3. Figma plugin setup

```bash
cd /Users/shrutigitte/Desktop/SOS/figma-plugin-fidux
```

In Figma:

1. Open a Figma file
2. Go to `Plugins` -> `Development` -> `Import plugin from manifest...`
3. Select:
   - `/Users/shrutigitte/Desktop/SOS/figma-plugin-fidux/manifest.json`

Plugin connection values for local development:

- API Base: `http://localhost:3002/api/plugin`
- PAT: a valid personal access token from the backend workspace

## Environment Files

Do not commit real secrets. Use the provided examples:

- `/Users/shrutigitte/Desktop/SOS/backend/.env.example`
- `/Users/shrutigitte/Desktop/SOS/frontend/.env.example`

### Backend environment highlights

Important variables:

- `DATABASE_URL`
- `AUTH_JWT_SECRET`
- `AUTH_REQUIRE_EMAIL_VERIFIED`
- `FIDUX_WEB_APP_URL`
- `FIDUX_API_PUBLIC_URL`
- `CORS_ALLOWED_ORIGINS`

For email delivery:

- `EMAIL_FROM`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`

For plugin thumbnails / object storage:

- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `CDN_BASE_URL`

### Frontend environment highlights

- `VITE_API_BASE`
- `VITE_DEV_BACKEND_PROXY_TARGET`

## Useful Commands

### Backend

```bash
cd /Users/shrutigitte/Desktop/SOS/backend
npm run start:dev
npm run build
npm run start:prod
npm run prisma:generate
npm run prisma:push
npm run fidux:seed
npm run fidux:smoke
```

### Frontend

```bash
cd /Users/shrutigitte/Desktop/SOS/frontend
npm run dev
npm run build
npm run preview
```

### Plugin

Production manifest generation:

```bash
cd /Users/shrutigitte/Desktop/SOS/figma-plugin-fidux
FIDUX_PLUGIN_API_ORIGIN=https://your-api-domain.com \
node ./scripts/build-production-manifest.mjs
```

This writes:

- `/Users/shrutigitte/Desktop/SOS/figma-plugin-fidux/manifest.production.json`

## Deployment

The deployment notes are documented in:

- `/Users/shrutigitte/Desktop/SOS/DEPLOYMENT.md`

Typical hosting split:

- Frontend: Vercel or Cloudflare Pages
- Backend: Railway
- Database: Neon Postgres
- Storage: Cloudflare R2 or another S3-compatible provider

At minimum, production should have:

- a public frontend URL
- a public backend API URL
- working CORS configuration
- a provisioned PostgreSQL schema
- valid SMTP config if verification emails are enabled

## Verification Email Flow

Verification emails are designed to send users to the frontend app, not directly to a raw backend screen. The frontend receives the token, calls the backend verification endpoint, and then shows the result in-app.

That means in production you should keep:

- `FIDUX_WEB_APP_URL` pointed at the public web app
- `FIDUX_API_PUBLIC_URL` pointed at the public backend API

## Database Schema

The Prisma schema is located at:

- `/Users/shrutigitte/Desktop/SOS/backend/prisma/schema.prisma`

It includes:

- users
- organizations
- projects
- org memberships
- project memberships
- issues
- messages
- activity logs
- personal access tokens

## Repo Notes

- The root `.gitignore` is set up to ignore real `.env` files while keeping `.env.example`
- The frontend is built as a SPA and includes redirect/header helpers in:
  - `/Users/shrutigitte/Desktop/SOS/frontend/public/_redirects`
  - `/Users/shrutigitte/Desktop/SOS/frontend/public/_headers`
- The backend includes a health endpoint at:
  - `/api/health`

## Where to Start

If you are new to the repo, the fastest path is:

1. Start the backend
2. Start the frontend
3. Open the web app locally
4. Import the Figma plugin
5. Create an issue from a Figma selection

If you are deploying, start with:

1. Database
2. Backend
3. Frontend
4. Plugin

## License

This repository is currently marked as:

- `UNLICENSED`
