'use strict';

/**
 * HTTP request handler for the Avatar Runtime.
 *
 * M2 surface (actual semantics only, no fake endpoints):
 *   GET /healthz   machine-readable service readiness
 *   GET /api/state real runtime state (model + semantic controls + mapped)
 *   POST /api/control bounded semantic control update
 *   POST /api/reset reset semantic controls to defaults
 *   POST /api/beat trigger a bounded beat event
 *   GET /          clean avatar output surface
 *   GET /debug     validation/test surface
 *
 * M3 surface (read-only model contract, no mutation):
 *   GET /api/model           model descriptor + manifest + mapping + SDK status
 *   GET /models/<id>/<file>  bounded static serving inside the model directory
 *   GET /js/mapping.js       shared semantic->Cubism mapping module (client)
 *
 * Future endpoints (reload/expression/motion/parameter/ws) are deliberately
 * NOT implemented until their semantics exist.
 */

const fs = require('node:fs');
const path = require('node:path');

const { applyMapping } = require('../shared/mapping');
const { createModelRegistry, resolveModelAsset } = require('./model');
const {
  resetControls,
  semanticState,
  triggerBeat,
  updateControl,
} = require('./state');

const MAX_JSON_BODY_BYTES = 16 * 1024;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.moc3': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendText(res, status, body, contentType) {
  res.writeHead(status, { 'content-type': contentType });
  res.end(body);
}

function healthBody(config, state) {
  return {
    status: 'ok',
    service: config.serviceName,
    version: config.version,
    ready: true,
    uptimeSeconds: Math.round(process.uptime() * 100) / 100,
    model: {
      id: state.model.id,
      loaded: state.model.loaded,
      kind: state.model.kind,
    },
  };
}

function stateBody(config, state, registry) {
  const mapped =
    registry && registry.mapping
      ? applyMapping(registry.mapping, state.controls)
      : {};
  return {
    service: config.serviceName,
    version: config.version,
    uptimeSeconds: Math.round(process.uptime() * 100) / 100,
    model: {
      id: state.model.id,
      loaded: state.model.loaded,
      kind: state.model.kind,
      ready: state.model.ready,
      error: state.model.error,
    },
    parameters: state.parameters,
    mapped,
    semantic: semanticState(state),
    counters: state.counters,
  };
}

function requestError(code, message) {
  const error = /** @type {Error & { code: string }} */ (new Error(message));
  error.code = code;
  return error;
}

function assertJsonHasNoDuplicateKeys(raw) {
  let index = 0;

  function skipWhitespace() {
    while (index < raw.length && /\s/.test(raw[index])) {
      index += 1;
    }
  }

  function parseString() {
    if (raw[index] !== '"') {
      throw new Error('expected JSON string');
    }
    const start = index;
    index += 1;
    while (index < raw.length) {
      const character = raw[index];
      index += 1;
      if (character === '\\') {
        if (index >= raw.length) {
          throw new Error('unterminated escape');
        }
        index += 1;
      } else if (character === '"') {
        try {
          return JSON.parse(raw.slice(start, index));
        } catch {
          throw new Error('invalid JSON string');
        }
      } else if (character.charCodeAt(0) < 0x20) {
        throw new Error('unescaped control character');
      }
    }
    throw new Error('unterminated JSON string');
  }

  function parseValue() {
    skipWhitespace();
    const character = raw[index];
    if (character === '"') {
      parseString();
      return;
    }
    if (character === '{') {
      parseObject();
      return;
    }
    if (character === '[') {
      parseArray();
      return;
    }
    for (const literal of ['true', 'false', 'null']) {
      if (raw.startsWith(literal, index)) {
        index += literal.length;
        return;
      }
    }
    const number = raw.slice(index).match(
      /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/
    );
    if (number) {
      index += number[0].length;
      return;
    }
    throw new Error('invalid JSON value');
  }

  function parseObject() {
    index += 1;
    skipWhitespace();
    const keys = new Set();
    if (raw[index] === '}') {
      index += 1;
      return;
    }
    while (index < raw.length) {
      skipWhitespace();
      const key = parseString();
      if (keys.has(key)) {
        throw requestError('duplicate_key', 'duplicate JSON object key');
      }
      keys.add(key);
      skipWhitespace();
      if (raw[index] !== ':') {
        throw new Error('expected JSON object colon');
      }
      index += 1;
      parseValue();
      skipWhitespace();
      if (raw[index] === '}') {
        index += 1;
        return;
      }
      if (raw[index] !== ',') {
        throw new Error('expected JSON object separator');
      }
      index += 1;
    }
    throw new Error('unterminated JSON object');
  }

  function parseArray() {
    index += 1;
    skipWhitespace();
    if (raw[index] === ']') {
      index += 1;
      return;
    }
    while (index < raw.length) {
      parseValue();
      skipWhitespace();
      if (raw[index] === ']') {
        index += 1;
        return;
      }
      if (raw[index] !== ',') {
        throw new Error('expected JSON array separator');
      }
      index += 1;
    }
    throw new Error('unterminated JSON array');
  }

  skipWhitespace();
  parseValue();
  skipWhitespace();
  if (index !== raw.length) {
    throw new Error('trailing JSON data');
  }
}

function parseJsonBody(raw) {
  try {
    assertJsonHasNoDuplicateKeys(raw);
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'duplicate_key') {
      throw error;
    }
    throw requestError('invalid_json', 'request body must be valid JSON');
  }
}

function readJsonBody(req, { optional = false } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    function fail(error) {
      if (settled) {
        return;
      }
      settled = true;
      req.resume();
      reject(error);
    }

    req.on('data', (chunk) => {
      if (settled) {
        return;
      }
      size += Buffer.byteLength(chunk);
      if (size > MAX_JSON_BODY_BYTES) {
        fail(requestError('body_too_large', 'request body is too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', (error) => fail(error));
    req.on('end', () => {
      if (settled) {
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        if (optional) {
          settled = true;
          resolve({});
        } else {
          fail(requestError('missing_body', 'JSON request body is required'));
        }
        return;
      }
      let value;
      try {
        value = parseJsonBody(raw);
      } catch (error) {
        fail(error);
        return;
      }
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        fail(requestError('invalid_body', 'request body must be a JSON object'));
        return;
      }
      settled = true;
      resolve(value);
    });
  });
}

function sendRequestError(res, error) {
  const messages = {
    body_too_large: 'request body is too large',
    invalid_json: 'request body must be valid JSON',
    duplicate_key: 'request body must not contain duplicate object keys',
    invalid_body: 'request body must be a JSON object or empty',
    missing_body: 'JSON request body is required',
    unknown_control: 'unknown semantic control id',
    invalid_value: 'control value must be a finite number',
    invalid_control_request:
      'control request must contain only string id and numeric value',
  };
  const code = Object.prototype.hasOwnProperty.call(messages, error.code)
    ? error.code
    : 'invalid_request';
  const message = messages[code] || 'request could not be accepted';
  sendJson(res, 400, { error: 'bad request', code, message });
}

function requireEmptyBody(body) {
  if (Object.keys(body).length !== 0) {
    throw requestError('invalid_body', 'request body must be empty');
  }
}

/**
 * Serve a page file from publicDir for a known route.
 * Returns true when the file was served, false when not found.
 * Path traversal is rejected by resolving inside publicDir.
 */
const PAGES = {
  '/': 'index.html',
  '/debug': 'debug.html',
};

function sendFile(res, filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath);
  } catch {
    return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  sendText(res, 200, content, CONTENT_TYPES[ext] || 'application/octet-stream');
  return true;
}

function servePage(res, publicDir, routePath) {
  const name = PAGES[routePath];
  if (!name) {
    return false;
  }
  const resolved = path.resolve(publicDir, name);
  if (resolved !== publicDir && !resolved.startsWith(publicDir + path.sep)) {
    return false;
  }
  return sendFile(res, resolved);
}

/**
 * Serve any GET path under publicDir (bounded static assets: renderer.js,
 * future vendored SDK files). Traversal is rejected by resolution guard.
 */
function servePublicAsset(res, publicDir, pathname) {
  const relative = pathname.replace(/^\/+/, '');
  if (!relative || relative.length === 0) {
    return false;
  }
  const resolved = path.resolve(publicDir, relative);
  if (resolved !== publicDir && !resolved.startsWith(publicDir + path.sep)) {
    return false;
  }
  return sendFile(res, resolved);
}

/**
 * @param {{ config: any; state: any; publicDir: string; modelRegistry?: any }} options
 */
function createHandler({ config, state, publicDir, modelRegistry }) {
  const registry =
    modelRegistry === undefined
      ? createModelRegistry({
          modelsDir: config.modelsDir,
          publicDir,
          modelId: config.modelId || '',
        })
      : modelRegistry;

  return async function handler(req, res) {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      sendJson(res, 400, { error: 'bad request' });
      return;
    }
    const { pathname } = url;
    state.counters.requests += 1;

    if (req.method === 'GET' && pathname === '/healthz') {
      state.counters.healthChecks += 1;
      sendJson(res, 200, healthBody(config, state));
      return;
    }
    if (req.method === 'GET' && pathname === '/api/state') {
      sendJson(res, 200, stateBody(config, state, registry));
      return;
    }
    if (req.method === 'GET' && pathname === '/api/model') {
      sendJson(res, 200, {
        model: registry.model,
        manifest: registry.manifest,
        mapping: registry.mapping,
        sdk: registry.sdk,
      });
      return;
    }
    if (req.method === 'GET' && pathname === '/js/mapping.js') {
      const mappingPath = path.join(__dirname, '..', 'shared', 'mapping.js');
      if (sendFile(res, mappingPath)) {
        return;
      }
    }
    if (req.method === 'GET' && pathname.startsWith('/models/')) {
      const segments = pathname.split('/');
      // ['', 'models', modelId, ...relative]
      const modelId = segments[2];
      const relative = segments.slice(3).join('/');
      const configured =
        registry.model.kind === 'cubism' && modelId === registry.model.id;
      if (configured && relative) {
        const resolved = resolveModelAsset(registry.modelsDir, modelId, relative);
        if (resolved !== null && sendFile(res, resolved)) {
          return;
        }
      }
      sendJson(res, 404, { error: 'not found', path: pathname });
      return;
    }
    if (req.method === 'POST' && pathname === '/api/control') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        sendRequestError(res, error);
        return;
      }
      const keys = Object.keys(body);
      if (
        keys.length !== 2 ||
        !Object.prototype.hasOwnProperty.call(body, 'id') ||
        !Object.prototype.hasOwnProperty.call(body, 'value') ||
        typeof body.id !== 'string'
      ) {
        sendRequestError(
          res,
          requestError(
            'invalid_control_request',
            'control request must contain only string id and numeric value'
          )
        );
        return;
      }
      const result = updateControl(state, body.id, body.value);
      if (!result.ok) {
        sendRequestError(res, requestError(result.code, result.code));
        return;
      }
      sendJson(res, 200, { ok: true, control: result, semantic: semanticState(state) });
      return;
    }
    if (req.method === 'POST' && pathname === '/api/reset') {
      try {
        const body = await readJsonBody(req, { optional: true });
        requireEmptyBody(body);
      } catch (error) {
        sendRequestError(res, error);
        return;
      }
      sendJson(res, 200, { ok: true, semantic: resetControls(state) });
      return;
    }
    if (req.method === 'POST' && pathname === '/api/beat') {
      try {
        const body = await readJsonBody(req, { optional: true });
        requireEmptyBody(body);
      } catch (error) {
        sendRequestError(res, error);
        return;
      }
      const event = triggerBeat(state);
      sendJson(res, 200, {
        ok: true,
        event: { type: 'beat', ...event },
        semantic: semanticState(state),
      });
      return;
    }
    if (req.method === 'GET' && (pathname === '/' || pathname === '/debug')) {
      if (servePage(res, publicDir, pathname)) {
        return;
      }
    }
    if (req.method === 'GET') {
      if (servePublicAsset(res, publicDir, pathname)) {
        return;
      }
    }
    sendJson(res, 404, { error: 'not found', path: pathname });
  };
}

module.exports = { createHandler, healthBody, stateBody };
