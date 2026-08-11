'use strict';

/**
 * HTTP request handler for the Avatar Runtime.
 *
 * PR-001 surface (actual semantics only, no fake endpoints):
 *   GET /healthz   machine-readable service readiness
 *   GET /api/state real runtime state (placeholder model)
 *   GET /          clean avatar output surface
 *   GET /debug     validation/test surface
 *
 * Future endpoints (reload/expression/motion/parameter/ws) are deliberately
 * NOT implemented until their semantics exist.
 */

const fs = require('node:fs');
const path = require('node:path');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
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

function stateBody(config, state) {
  return {
    service: config.serviceName,
    version: config.version,
    uptimeSeconds: Math.round(process.uptime() * 100) / 100,
    model: {
      id: state.model.id,
      loaded: state.model.loaded,
      kind: state.model.kind,
    },
    parameters: state.parameters,
    counters: state.counters,
  };
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

function serveStatic(res, publicDir, routePath) {
  const name = PAGES[routePath];
  if (!name) {
    return false;
  }
  const resolved = path.resolve(publicDir, name);
  if (resolved !== publicDir && !resolved.startsWith(publicDir + path.sep)) {
    return false;
  }
  let content;
  try {
    content = fs.readFileSync(resolved);
  } catch {
    return false;
  }
  const ext = path.extname(resolved).toLowerCase();
  sendText(res, 200, content, CONTENT_TYPES[ext] || 'application/octet-stream');
  return true;
}

function createHandler({ config, state, publicDir }) {
  return function handler(req, res) {
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
      sendJson(res, 200, stateBody(config, state));
      return;
    }
    if (req.method === 'GET' && (pathname === '/' || pathname === '/debug')) {
      if (serveStatic(res, publicDir, pathname)) {
        return;
      }
    }
    sendJson(res, 404, { error: 'not found', path: pathname });
  };
}

module.exports = { createHandler, healthBody, stateBody };
