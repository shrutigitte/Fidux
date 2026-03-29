import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, '..');
const localManifestPath = path.join(pluginRoot, 'manifest.json');
const outputPath = path.join(
  pluginRoot,
  (process.env.FIDUX_PLUGIN_MANIFEST_OUTPUT || 'manifest.production.json').trim(),
);

function normalizeOrigin(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) {
    return '';
  }

  try {
    const url = new URL(value);
    if (!/^https?:$/i.test(url.protocol)) {
      throw new Error(`Unsupported protocol in ${value}`);
    }
    return url.origin;
  } catch (_error) {
    throw new Error(
      `Invalid FIDUX_PLUGIN_API_ORIGIN: ${value}. Use an absolute origin or API URL such as https://api.example.com/api/plugin.`,
    );
  }
}

function splitDomains(rawValue) {
  return String(rawValue || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values)];
}

const apiOrigin = normalizeOrigin(process.env.FIDUX_PLUGIN_API_ORIGIN);
if (!apiOrigin) {
  console.error('FIDUX_PLUGIN_API_ORIGIN is required to build a production plugin manifest.');
  process.exit(1);
}

const uploadDomains = splitDomains(process.env.FIDUX_PLUGIN_ALLOWED_DOMAINS);
const localManifest = JSON.parse(fs.readFileSync(localManifestPath, 'utf8'));

const manifest = {
  ...localManifest,
  id: (process.env.FIDUX_PLUGIN_ID || 'fidux-production-plugin').trim(),
  networkAccess: {
    allowedDomains: unique([
      apiOrigin,
      ...uploadDomains,
      'https://*.r2.cloudflarestorage.com',
      'https://*.r2.dev',
    ]),
  },
};

fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
