# Fidux Deployment

## Recommended stack

- Frontend: Cloudflare Pages
- Backend: Railway
- Database: Neon Postgres
- Object storage: Cloudflare R2

## Recommended topology

You have two clean deployment patterns:

1. Split deploy
   - Web app: `https://fidux.pages.dev` or your custom frontend domain
   - API: `https://api.fidux.example.com/api`
2. Same-origin deploy behind a reverse proxy
   - Web app: `https://fidux.example.com`
   - API: `https://fidux.example.com/api`

Same-origin is cleaner long term. Split deploy is faster to get live on Cloudflare Pages + Railway.

## Backend (Railway)

1. Copy `/Users/shrutigitte/Desktop/SOS/backend/.env.example` to `.env`
2. Set at minimum:
   - `DATABASE_URL`
   - `AUTH_JWT_SECRET`
   - `FIDUX_WEB_APP_URL`
   - `FIDUX_API_PUBLIC_URL`
   - `CORS_ALLOWED_ORIGINS`
3. If using email verification or assignment mail, also set:
   - `EMAIL_FROM`
   - `SMTP_HOST`
   - `SMTP_PORT`
   - `SMTP_SECURE`
   - `SMTP_USER`
   - `SMTP_PASS`
4. If using plugin thumbnail uploads, also set:
   - `S3_ENDPOINT`
   - `S3_BUCKET`
   - `S3_ACCESS_KEY_ID`
   - `S3_SECRET_ACCESS_KEY`
   - `CDN_BASE_URL`

### Database bootstrap

This app does not auto-create production schema on boot.

Before first production start, run:

```bash
cd /Users/shrutigitte/Desktop/SOS/backend
npm run prisma:generate
npm run prisma:push
```

After that:

```bash
npm run build
npm run start:prod
```

### Railway service setup

1. Create a service from this repo
2. Set the service root directory to `backend`
3. Add the environment variables from `/Users/shrutigitte/Desktop/SOS/backend/.env.example`
4. Use `/Users/shrutigitte/Desktop/SOS/backend/railway.toml` as the deploy config
5. Confirm the health check passes at `/api/health`

## Frontend (Cloudflare Pages)

1. Copy `/Users/shrutigitte/Desktop/SOS/frontend/.env.example` to `.env`
2. For same-origin deployment, keep:

```bash
VITE_API_BASE=/api
```

For split deploy with Railway, set:

```bash
VITE_API_BASE=https://api.fidux.example.com/api
```

3. Build:

```bash
cd /Users/shrutigitte/Desktop/SOS/frontend
npm run build
```

Serve the generated `dist` directory from your frontend host.

### Cloudflare Pages setup

1. Connect the repo
2. Set the project root to `frontend`
3. Build command: `npm run build`
4. Output directory: `dist`
5. Add `VITE_API_BASE` in Pages environment variables

The frontend now includes:

- `/Users/shrutigitte/Desktop/SOS/frontend/public/_redirects` for SPA fallback
- `/Users/shrutigitte/Desktop/SOS/frontend/public/_headers` for baseline response headers

## Local development

The frontend dev server proxies `/api` to the backend using:

```bash
VITE_DEV_BACKEND_PROXY_TARGET=http://localhost:3002
```

So local development can run with the frontend API base left at `/api`.

## Plugin

The checked-in plugin manifest is development-oriented.

To generate a production-safe manifest:

```bash
cd /Users/shrutigitte/Desktop/SOS/figma-plugin-fidux
FIDUX_PLUGIN_API_ORIGIN=https://fidux.example.com \
node ./scripts/build-production-manifest.mjs
```

If your thumbnail uploads or CDN require extra plugin network domains:

```bash
FIDUX_PLUGIN_ALLOWED_DOMAINS=https://cdn.example.com,https://uploads.example.com
```

Then import:

- `/Users/shrutigitte/Desktop/SOS/figma-plugin-fidux/manifest.production.json`

## Reverse proxy expectations

If you are serving frontend and backend from one origin, your reverse proxy should:

- serve frontend assets normally
- forward `/api/*` to the Nest backend

Example public behavior:

- `GET /` -> frontend
- `GET /api/health` -> backend
- `GET /api/auth/me` -> backend

## Production checks

Before calling the deployment complete, verify:

1. Frontend loads without manually changing API Base
2. `GET /api/health` returns `200`
3. Login works against the public API
4. Email verification links open the public site, not localhost
5. Figma issue links in emails open the public site
6. Plugin PAT verification works with `manifest.production.json`
7. Thumbnail upload succeeds from the plugin
