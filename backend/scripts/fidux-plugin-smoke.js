#!/usr/bin/env node

require('dotenv').config({ path: '.env' });

const { randomUUID } = require('crypto');

const tinyPngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZfUQAAAAASUVORK5CYII=';

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === '' || value.trim() === 'REPLACE_ME') {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

async function callJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return {
    status: response.status,
    body,
  };
}

async function main() {
  const apiBase = process.env.FIDUX_API_BASE?.trim() || 'http://localhost:3002/api/plugin';
  const token = requireEnv('FIDUX_PLUGIN_PAT');
  const orgId = requireEnv('FIDUX_ORG_ID');
  const projectId = requireEnv('FIDUX_PROJECT_ID');
  const pngBuffer = Buffer.from(tinyPngBase64, 'base64');

  const authHeader = { Authorization: `Bearer ${token}` };

  const verify = await callJson(`${apiBase}/pats/verify`, {
    method: 'POST',
    headers: authHeader,
  });
  if (verify.status !== 200) {
    throw new Error(`verify failed: ${verify.status} ${JSON.stringify(verify.body)}`);
  }

  const projects = await callJson(`${apiBase}/projects?orgId=${encodeURIComponent(orgId)}`, {
    headers: authHeader,
  });
  if (projects.status !== 200) {
    throw new Error(`projects failed: ${projects.status} ${JSON.stringify(projects.body)}`);
  }

  const create = await callJson(`${apiBase}/issues`, {
    method: 'POST',
    headers: {
      ...authHeader,
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
    },
    body: JSON.stringify({
      projectId,
      title: `Fidux smoke ${new Date().toISOString()}`,
      description: 'Automated plugin smoke test',
      priority: 'HIGH',
      figmaFileKey: 'AbCdEf',
      nodeId: '45:89',
      nodeName: 'Smoke Node',
      thumbnail: {
        contentType: 'image/png',
        sizeBytes: pngBuffer.length,
      },
    }),
  });
  if (create.status !== 201) {
    throw new Error(`create failed: ${create.status} ${JSON.stringify(create.body)}`);
  }

  const issueId = create.body?.issue?.id;
  const uploadUrl = create.body?.upload?.url;
  const objectKey = create.body?.upload?.objectKey;

  if (!issueId || !uploadUrl || !objectKey) {
    throw new Error(`create response missing issue/upload fields: ${JSON.stringify(create.body)}`);
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'image/png',
    },
    body: pngBuffer,
  });

  if (!uploadResponse.ok) {
    const uploadText = await uploadResponse.text();
    throw new Error(`upload failed: ${uploadResponse.status} ${uploadText}`);
  }

  const complete = await callJson(`${apiBase}/issues/${issueId}/thumbnail/complete`, {
    method: 'POST',
    headers: {
      ...authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ objectKey }),
  });

  if (complete.status !== 200) {
    throw new Error(`complete failed: ${complete.status} ${JSON.stringify(complete.body)}`);
  }

  console.log(JSON.stringify({
    verifyStatus: verify.status,
    projectsStatus: projects.status,
    createStatus: create.status,
    uploadStatus: uploadResponse.status,
    completeStatus: complete.status,
    issueId,
    thumbnailUrl: complete.body?.thumbnailUrl,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
