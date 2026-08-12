'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

const { createHandler, healthBody, stateBody } = require('../server/app');
const { createState } = require('../server/state');
const { loadConfig } = require('../server/config');

const publicDir = path.join(__dirname, '..', 'public');
const config = loadConfig({});

// Every request gets a fresh runtime state so counters never leak
// between tests.
function handlerFor() {
  return createHandler({ config, state: createState(), publicDir });
}

function request(handler, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr === null || typeof addr === 'string') {
        server.close();
        reject(new Error(`unexpected server address: ${addr}`));
        return;
      }
      const { port } = addr;
      const payload = body === undefined ? null : JSON.stringify(body);
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          method,
          path: urlPath,
          headers:
            payload === null
              ? undefined
              : {
                  'content-type': 'application/json',
                  'content-length': Buffer.byteLength(payload),
                },
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            server.close();
            resolve({
              status: res.statusCode,
              contentType: res.headers['content-type'],
              body: Buffer.concat(chunks).toString('utf8'),
            });
          });
        }
      );
      req.on('error', (err) => {
        server.close();
        reject(err);
      });
      if (payload !== null) {
        req.write(payload);
      }
      req.end();
    });
  });
}

function requestRaw(handler, method, urlPath, payload) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr === null || typeof addr === 'string') {
        server.close();
        reject(new Error(`unexpected server address: ${addr}`));
        return;
      }
      const req = http.request(
        {
          host: '127.0.0.1',
          port: addr.port,
          method,
          path: urlPath,
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            server.close();
            resolve({
              status: res.statusCode,
              contentType: res.headers['content-type'],
              body: Buffer.concat(chunks).toString('utf8'),
            });
          });
        }
      );
      req.on('error', (err) => {
        server.close();
        reject(err);
      });
      req.end(payload);
    });
  });
}

test('GET /healthz returns machine-readable ok JSON', async () => {
  const res = await request(handlerFor(), 'GET', '/healthz');
  assert.equal(res.status, 200);
  assert.match(res.contentType, /application\/json/);
  const body = JSON.parse(res.body);
  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'avatar-runtime');
  assert.equal(body.ready, true);
  assert.equal(body.model.loaded, false);
  assert.equal(body.model.kind, 'placeholder');
  assert.equal(typeof body.version, 'string');
});

test('GET / returns the clean output page', async () => {
  const res = await request(handlerFor(), 'GET', '/');
  assert.equal(res.status, 200);
  assert.match(res.contentType, /text\/html/);
  assert.match(res.body, /Meowcore Avatar/);
  assert.match(res.body, /No Live2D model loaded/);
});

test('GET /debug returns the validation surface', async () => {
  const res = await request(handlerFor(), 'GET', '/debug');
  assert.equal(res.status, 200);
  assert.match(res.contentType, /text\/html/);
  assert.match(res.body, /debug \/ validation surface/);
});

test('GET /api/state reports placeholder runtime state', async () => {
  const res = await request(handlerFor(), 'GET', '/api/state');
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.model.id, 'placeholder-none');
  assert.equal(body.model.loaded, false);
  assert.deepEqual(body.parameters, {});
  assert.deepEqual(body.semantic.controls, {
    angleX: 0,
    angleY: 0,
    bodyX: 0,
    blink: 0,
    mouth: 0,
    smile: 0,
    squash: 0,
    bounce: 0,
  });
  assert.equal(body.semantic.events.beatCount, 0);
  assert.equal(body.semantic.schema.angleX.min, -30);
  assert.deepEqual(body.semantic.schema.blink.meaning, {
    min: 'eyes open',
    default: 'eyes open',
    max: 'eyes fully closed',
  });
});

test('POST /api/control clamps a known semantic control and exposes server state', async () => {
  const handler = handlerFor();
  const res = await request(handler, 'POST', '/api/control', {
    id: 'angleX',
    value: 999,
  });
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body);
  assert.deepEqual(body.control, {
    ok: true,
    id: 'angleX',
    requested: 999,
    value: 30,
    clamped: true,
  });

  const state = JSON.parse((await request(handler, 'GET', '/api/state')).body);
  assert.equal(state.semantic.controls.angleX, 30);
  assert.equal(state.counters.controlUpdates, 1);
});

test('semantic control API rejects unknown, malformed, and non-finite values', async () => {
  const handler = handlerFor();
  const unknown = await request(handler, 'POST', '/api/control', {
    id: 'ParameterAngleX',
    value: 1,
  });
  assert.equal(unknown.status, 400);
  assert.equal(JSON.parse(unknown.body).code, 'unknown_control');

  const malformed = await request(handler, 'POST', '/api/control', {
    id: 'angleX',
  });
  assert.equal(malformed.status, 400);
  assert.equal(JSON.parse(malformed.body).code, 'invalid_control_request');

  const nonFinite = await request(handler, 'POST', '/api/control', {
    id: 'angleX',
    value: null,
  });
  assert.equal(nonFinite.status, 400);
  assert.equal(JSON.parse(nonFinite.body).code, 'invalid_value');

  const invalidJson = await requestRaw(handler, 'POST', '/api/control', '{');
  assert.equal(invalidJson.status, 400);
  assert.equal(JSON.parse(invalidJson.body).code, 'invalid_json');

  const duplicateKey = await requestRaw(
    handler,
    'POST',
    '/api/control',
    '{"id":"angleX","id":"angleY","value":1}'
  );
  assert.equal(duplicateKey.status, 400);
  assert.equal(JSON.parse(duplicateKey.body).code, 'duplicate_key');

  const oversized = await requestRaw(
    handler,
    'POST',
    '/api/control',
    `{"id":"angleX","value":"${'x'.repeat(16 * 1024)}"}`
  );
  assert.equal(oversized.status, 400);
  assert.equal(JSON.parse(oversized.body).code, 'body_too_large');
});

test('POST /api/reset restores defaults and rejects non-empty bodies', async () => {
  const handler = handlerFor();
  await request(handler, 'POST', '/api/control', { id: 'smile', value: 0.75 });
  const reset = await request(handler, 'POST', '/api/reset');
  assert.equal(reset.status, 200);
  const body = JSON.parse(reset.body);
  assert.equal(body.semantic.controls.smile, 0);
  assert.equal(body.semantic.controls.angleX, 0);

  const invalid = await request(handler, 'POST', '/api/reset', { unexpected: true });
  assert.equal(invalid.status, 400);
  assert.equal(JSON.parse(invalid.body).code, 'invalid_body');
});

test('POST /api/beat records a discrete observable event', async () => {
  const handler = handlerFor();
  const first = await request(handler, 'POST', '/api/beat');
  assert.equal(first.status, 200);
  const firstBody = JSON.parse(first.body);
  assert.equal(firstBody.event.type, 'beat');
  assert.equal(firstBody.event.beatCount, 1);
  assert.equal(typeof firstBody.event.lastBeatAt, 'number');

  const second = await request(handler, 'POST', '/api/beat');
  const secondBody = JSON.parse(second.body);
  assert.equal(secondBody.semantic.events.beatCount, 2);
  assert.equal(secondBody.semantic.controls.angleX, 0);
});

test('unknown routes return JSON 404', async () => {
  const res = await request(handlerFor(), 'GET', '/nope');
  assert.equal(res.status, 404);
  assert.match(res.contentType, /application\/json/);
  const body = JSON.parse(res.body);
  assert.equal(body.error, 'not found');
});

test('path traversal is rejected (404, never serves outside public/)', async () => {
  for (const p of ['/..%2Fserver.js', '/..%2F..%2Fpackage.json', '/%2e%2e/server/config.js']) {
    const res = await request(handlerFor(), 'GET', p);
    assert.equal(res.status, 404, `${p} must 404`);
  }
});

test('non-GET method on /healthz is not served', async () => {
  const res = await request(handlerFor(), 'POST', '/healthz');
  assert.equal(res.status, 404);
});

test('healthBody/stateBody keep placeholder contract fields', () => {
  const state = createState();
  const h = healthBody(config, state);
  assert.equal(h.status, 'ok');
  assert.equal(h.ready, true);
  const s = stateBody(config, state);
  assert.equal(s.counters.requests, 0);
  assert.equal(s.service, 'avatar-runtime');
});
