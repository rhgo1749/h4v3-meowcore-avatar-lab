'use strict';

/**
 * Compose bind-contract tests (PR-001 rework round 1).
 *
 * Encodes the split bind contract that compose.yaml must keep:
 *   - host publish bind defaults to loopback via AVATAR_HOST_BIND and is
 *     never hardcoded open (external exposure is explicit opt-in);
 *   - container-internal listen stays 0.0.0.0 so the published port
 *     mapping can reach it (this is NOT the exposure control);
 *   - AVATAR_PORT applies to both the host publish and the container
 *     listen side, defaulting to 8930.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const composePath = path.join(__dirname, '..', '..', 'compose.yaml');
const compose = fs.readFileSync(composePath, 'utf8');

function envLine(name) {
  const m = compose.match(
    new RegExp(`^\\s*${name}:\\s*["']?([^"'\\n]+)["']?\\s*$`, 'm')
  );
  return m ? m[1] : null;
}

// The ports mapping is the only quoted list item in compose.yaml
// (`- "${AVATAR_HOST_BIND:-...}:..."`).
const portsMatch = compose.match(/^\s*-\s*"([^"]+)"/m);
const ports = portsMatch ? portsMatch[1] : '';

test('compose host publish bind defaults to loopback via AVATAR_HOST_BIND', () => {
  assert.match(
    ports,
    /^\$\{AVATAR_HOST_BIND:-127\.0\.0\.1\}:/
  );
  assert.doesNotMatch(
    ports,
    /^0\.0\.0\.0:/,
    'host bind must never be hardcoded open; use AVATAR_HOST_BIND=0.0.0.0 explicitly'
  );
});

test('compose container-internal listen is 0.0.0.0 (publish reachability only)', () => {
  assert.equal(
    envLine('AVATAR_BIND'),
    '0.0.0.0',
    'container listen must stay 0.0.0.0 so the host publish mapping reaches it'
  );
});

test('AVATAR_PORT applies to host publish and container listen, default 8930', () => {
  assert.equal(envLine('AVATAR_PORT'), '${AVATAR_PORT:-8930}');
  assert.match(
    ports,
    /:(\$\{AVATAR_PORT:-8930\}):\$\{AVATAR_PORT:-8930\}$/
  );
});

test('compose keeps container hardening flags', () => {
  assert.match(compose, /read_only:\s*true/);
  assert.match(compose, /no-new-privileges:\s*true/);
});
