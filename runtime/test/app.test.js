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

function request(handler, method, urlPath) {
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
      const req = http.request(
        { host: '127.0.0.1', port, method, path: urlPath },
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
      req.end();
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
