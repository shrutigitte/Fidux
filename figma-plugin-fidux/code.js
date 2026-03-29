const DEFAULT_API_BASE = '';
const STORAGE_KEY = 'fidux.plugin.config.v2';

figma.showUI(__html__, {
  width: 500,
  height: 840,
  themeColors: true,
});

let currentConfig = {
  apiBase: DEFAULT_API_BASE,
  pat: '',
  lastOrgId: '',
  lastProjectId: '',
};

async function init() {
  const saved = await figma.clientStorage.getAsync(STORAGE_KEY);
  if (saved && typeof saved === 'object') {
    currentConfig = {
      apiBase: String(saved.apiBase || DEFAULT_API_BASE),
      pat: String(saved.pat || ''),
      lastOrgId: String(saved.lastOrgId || ''),
      lastProjectId: String(saved.lastProjectId || ''),
    };
  }

  figma.ui.postMessage({
    type: 'init',
    payload: {
      config: publicConfig(currentConfig),
      selection: getSelectionSummary(),
      fileKey: resolveFileKey(''),
    },
  });
}

figma.on('selectionchange', () => {
  figma.ui.postMessage({
    type: 'selection',
    payload: {
      selection: getSelectionSummary(),
      fileKey: resolveFileKey(''),
    },
  });
});

figma.ui.onmessage = async (message) => {
  const type = message && message.type;

  try {
    if (type === 'close') {
      figma.closePlugin();
      return;
    }

    if (type === 'connect') {
      await handleConnect(message.payload || {});
      return;
    }

    if (type === 'createIssue') {
      await handleCreateIssue(message.payload || {});
      return;
    }

    if (type === 'openExternal') {
      handleOpenExternal(message.payload || {});
      return;
    }

    figma.ui.postMessage({ type: 'error', payload: { message: 'Unknown action' } });
  } catch (error) {
    const messageText = normalizeErrorMessage(error);
    console.error('[Fidux plugin action error]', error);
    figma.notify(`Fidux error: ${messageText}`, { error: true, timeout: 5000 });
    figma.ui.postMessage({ type: 'error', payload: { message: messageText } });
  }
};

async function handleConnect(payload) {
  const apiBase = normalizeApiBase(payload.apiBase || currentConfig.apiBase);
  const pat = String(payload.pat || currentConfig.pat || '').trim();

  if (!apiBase) {
    throw new Error('API Base is required');
  }

  if (!pat) {
    throw new Error('PAT is required');
  }

  const verify = await requestJson(`${apiBase}/pats/verify`, {
    method: 'POST',
    headers: authHeaders(pat),
  });

  const orgId = verify.orgId;
  if (!orgId) {
    throw new Error('PAT verify response missing orgId');
  }

  const projectsResponse = await requestJson(
    `${apiBase}/projects?orgId=${encodeURIComponent(orgId)}`,
    {
      method: 'GET',
      headers: authHeaders(pat),
    },
  );

  const projects = Array.isArray(projectsResponse.projects)
    ? projectsResponse.projects
    : [];

  const preferredProject = projects.find((project) => project.id === currentConfig.lastProjectId);
  const firstProject = projects.length > 0 ? projects[0] : null;
  const preferredProjectId = (preferredProject && preferredProject.id) || (firstProject && firstProject.id) || '';

  currentConfig = {
    apiBase,
    pat,
    lastOrgId: orgId,
    lastProjectId: preferredProjectId,
  };

  await figma.clientStorage.setAsync(STORAGE_KEY, currentConfig);

  figma.ui.postMessage({
    type: 'connected',
    payload: {
      config: publicConfig(currentConfig),
      verify,
      projects,
    },
  });
}

async function handleCreateIssue(payload) {
  ensureConnected();

  const selection = figma.currentPage.selection;
  if (!selection || selection.length === 0) {
    throw new Error('Select one node before creating an issue');
  }

  const node = selection[0];
  if (!node || typeof node.id !== 'string') {
    throw new Error('Selected node is invalid');
  }

  if (typeof node.exportAsync !== 'function') {
    throw new Error('Selected node cannot be exported. Select a frame/layer.');
  }

  const fileKey = resolveFileKey(payload.fileKey);
  if (!fileKey) {
    throw new Error(
      'No Figma file key available. Paste file key (or full Figma URL) into File Key override.',
    );
  }

  const projectId = String(payload.projectId || '').trim();
  const title = String(payload.title || '').trim();
  const description = String(payload.description || '').trim();
  const priority = String(payload.priority || 'MEDIUM').trim().toUpperCase();

  if (!projectId) {
    throw new Error('Project is required');
  }

  if (!title) {
    throw new Error('Title is required');
  }

  if (!['LOW', 'MEDIUM', 'HIGH'].includes(priority)) {
    throw new Error('Priority must be LOW, MEDIUM, or HIGH');
  }

  const thumbnailBytes = await node.exportAsync({ format: 'PNG' });
  const thumbnailSize = thumbnailBytes.byteLength;
  if (thumbnailSize < 1) {
    throw new Error('Generated thumbnail is empty');
  }

  const createBody = {
    projectId,
    title,
    description: description || undefined,
    priority,
    figmaFileKey: fileKey,
    nodeId: node.id,
    nodeName: node.name || 'Untitled node',
    thumbnail: {
      contentType: 'image/png',
      sizeBytes: thumbnailSize,
    },
  };

  const createResponse = await requestJson(`${currentConfig.apiBase}/issues`, {
    method: 'POST',
    headers: mergeHeaders(authHeaders(currentConfig.pat), {
      'Content-Type': 'application/json',
      'Idempotency-Key': generateIdempotencyKey(),
    }),
    body: JSON.stringify(createBody),
  });

  const issue = createResponse.issue;
  const upload = createResponse.upload;

  if (!issue || !upload || !upload.url || !upload.objectKey) {
    throw new Error('Create issue response missing upload details');
  }

  await uploadThumbnail(upload, thumbnailBytes);

  const completeResponse = await requestJson(
    `${currentConfig.apiBase}/issues/${encodeURIComponent(issue.id)}/thumbnail/complete`,
    {
      method: 'POST',
      headers: mergeHeaders(authHeaders(currentConfig.pat), {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ objectKey: upload.objectKey }),
    },
  );

  currentConfig.lastProjectId = projectId;
  await figma.clientStorage.setAsync(STORAGE_KEY, currentConfig);

  figma.ui.postMessage({
    type: 'issueCreated',
    payload: {
      issue,
      thumbnailUrl: completeResponse.thumbnailUrl,
      figmaDeepLink: buildFigmaDeepLink(fileKey, node.id),
    },
  });
}

function handleOpenExternal(payload) {
  const rawUrl = String(payload.url || '').trim();
  if (!rawUrl) {
    throw new Error('URL is required');
  }

  if (!/^https?:\/\//i.test(rawUrl)) {
    throw new Error('Only http/https links are allowed');
  }

  figma.openExternal(rawUrl);
}

function ensureConnected() {
  if (!currentConfig.pat || !currentConfig.apiBase) {
    throw new Error('Connect PAT first');
  }
}

function getSelectionSummary() {
  const selection = figma.currentPage.selection || [];
  if (!selection.length) {
    return {
      count: 0,
      nodeId: '',
      nodeName: '',
    };
  }

  const node = selection[0];
  return {
    count: selection.length,
    nodeId: node.id || '',
    nodeName: node.name || '',
  };
}

function normalizeApiBase(apiBase) {
  return String(apiBase || '').trim().replace(/\/$/, '');
}

function publicConfig(config) {
  return {
    apiBase: config.apiBase,
    hasPat: Boolean(config.pat),
    lastOrgId: config.lastOrgId,
    lastProjectId: config.lastProjectId,
  };
}

function authHeaders(pat) {
  return {
    Authorization: `Bearer ${pat}`,
  };
}

function mergeHeaders(baseHeaders, extraHeaders) {
  return Object.assign({}, baseHeaders || {}, extraHeaders || {});
}

async function uploadThumbnail(upload, bytes) {
  const headers = Object.assign({}, upload.headers || {});
  if (!headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'image/png';
  }

  let response;
  try {
    response = await fetch(upload.url, {
      method: upload.method || 'PUT',
      headers,
      body: bytes,
    });
  } catch (_error) {
    const uploadHost = safeHost(upload.url);
    const uploadPreview = safeUrlPreview(upload.url);
    throw new Error(
      `Upload fetch failed for ${uploadHost}. URL: ${uploadPreview}. Check manifest allowed domains and R2 CORS.`,
    );
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed (${response.status}): ${text.slice(0, 200)}`);
  }
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch (_error) {
      body = { raw: text };
    }
  }

  if (!response.ok) {
    const envelope = body && body.error ? body.error : null;
    const code = envelope && envelope.code ? envelope.code : `HTTP_${response.status}`;
    const message = envelope && envelope.message ? envelope.message : 'Request failed';
    throw new Error(`${code}: ${message} [${init && init.method ? init.method : 'GET'} ${url}]`);
  }

  return body || {};
}

function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // RFC4122 v4 fallback for environments without crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function buildFigmaDeepLink(fileKey, nodeId) {
  return `https://www.figma.com/file/${encodeURIComponent(fileKey)}?node-id=${encodeURIComponent(nodeId)}`;
}

function resolveFileKey(rawOverride) {
  const override = extractFileKey(rawOverride);
  if (override) {
    return override;
  }

  return extractFileKey(figma.fileKey) || '';
}

function extractFileKey(value) {
  if (!value) {
    return '';
  }

  const text = String(value).trim();
  if (!text) {
    return '';
  }

  const urlMatch = text.match(/\/(?:file|design)\/([A-Za-z0-9_-]{10,})/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  if (/^[A-Za-z0-9_-]{10,}$/.test(text)) {
    return text;
  }

  return '';
}

function normalizeErrorMessage(error) {
  if (!error) {
    return 'Unknown error';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error.message === 'string') {
    return error.message;
  }

  return JSON.stringify(error);
}

function safeHost(urlText) {
  try {
    const parsed = new URL(String(urlText || '').trim());
    return parsed.host || 'upload host';
  } catch (_error) {
    return 'upload host';
  }
}

function safeUrlPreview(urlText) {
  try {
    const raw = String(urlText || '').trim();
    if (!raw) {
      return 'empty';
    }
    return raw.length > 120 ? `${raw.slice(0, 120)}...` : raw;
  } catch (_error) {
    return 'unavailable';
  }
}

init().catch((error) => {
  const message = normalizeErrorMessage(error);
  figma.notify(`Fidux init error: ${message}`, { error: true, timeout: 4000 });
  try {
    figma.ui.postMessage({ type: 'error', payload: { message: `Init failed: ${message}` } });
  } catch (_innerError) {
    // no-op
  }
});
