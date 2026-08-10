'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadConfig, DEFAULT_BIND, DEFAULT_PORT } = require('../server/config');

test('default config binds loopback 127.0.0.1:8930', () => {
  const config = loadConfig({});
  assert.equal(config.bind, DEFAULT_BIND);
  assert.equal(config.port, DEFAULT_PORT);
  assert.equal(config.serviceName, 'avatar-runtime');
});

test('AVATAR_BIND and AVATAR_PORT override defaults', () => {
  const config = loadConfig({ AVATAR_BIND: '0.0.0.0', AVATAR_PORT: '9123' });
  assert.equal(config.bind, '0.0.0.0');
  assert.equal(config.port, 9123);
});

test('invalid AVATAR_PORT is rejected', () => {
  for (const bad of ['0', '65536', 'abc', '-1', '8930.5', '']) {
    assert.throws(
      () => loadConfig({ AVATAR_PORT: bad }),
      RangeError,
      `AVATAR_PORT=${JSON.stringify(bad)} must throw`
    );
  }
});
