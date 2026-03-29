# Fidux Figma Plugin

Plugin to create Fidux issues from selected Figma nodes.

## Files

- `manifest.json`
- `code.js`
- `ui.html`
- `scripts/build-production-manifest.mjs`

## Local development import

1. Open any Figma file.
2. Top-left Figma menu -> `Plugins` -> `Development` -> `Import plugin from manifest...`.
3. Select:
   - `/Users/shrutigitte/Desktop/SOS/figma-plugin-fidux/manifest.json`
4. Run plugin:
   - Figma menu -> `Plugins` -> `Development` -> `Fidux`.

## Connect

Use these values in plugin UI:

- `API Base`: `http://localhost:3002/api/plugin`
- `PAT`: from `/Users/shrutigitte/Desktop/SOS/backend/.env` (`FIDUX_PLUGIN_PAT`)

Then click `Connect`.

## Create issue

1. Select one node in canvas.
2. Pick project.
3. Fill title and optional description/priority.
4. Click `Create Issue from Selection`.

## Requirements

- Backend running at `http://localhost:3002`.
- Plugin endpoints healthy.
- Figma file has a `fileKey` (saved cloud file).

## Production manifest

The checked-in `manifest.json` is for local development. Figma plugin network access must explicitly allow your production API origin, so generate a production manifest before distribution.

Example:

```bash
cd /Users/shrutigitte/Desktop/SOS/figma-plugin-fidux
FIDUX_PLUGIN_API_ORIGIN=https://api.example.com \
FIDUX_PLUGIN_ALLOWED_DOMAINS=https://cdn.example.com \
node ./scripts/build-production-manifest.mjs
```

This writes:

- `/Users/shrutigitte/Desktop/SOS/figma-plugin-fidux/manifest.production.json`

Then import that production manifest into Figma.

Notes:

- `FIDUX_PLUGIN_API_ORIGIN` can be an origin or full API URL; the script normalizes it to the origin allowed by Figma.
- `FIDUX_PLUGIN_ALLOWED_DOMAINS` is optional and comma-separated.
- R2 wildcard domains are included by default for the thumbnail upload flow.
