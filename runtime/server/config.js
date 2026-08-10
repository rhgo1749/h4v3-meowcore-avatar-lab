'use strict';

/**
 * Configuration loader for the Avatar Runtime.
 *
 * Bind/port are configurable through environment variables so the same
 * image can be reused across host environments without rebuilding:
 *   AVATAR_BIND  process listen bind, default 127.0.0.1 (loopback-only)
 *   AVATAR_PORT  port, default 8930
 *
 * NOTE: in the compose path (compose.yaml) the container-internal listen
 * is intentionally fixed to 0.0.0.0 so the published port mapping can
 * reach it. Host exposure is controlled separately by AVATAR_HOST_BIND
 * (default 127.0.0.1; 0.0.0.0 is the explicit opt-in for external
 * exposure). These variables apply to bare `node` runs and tests.
 *
 * Matching repository contract: .env.example documents the same names.
 */

const DEFAULT_BIND = '127.0.0.1';
const DEFAULT_PORT = 8930;

function parsePort(value) {
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) {
    throw new RangeError(
      `invalid AVATAR_PORT ${JSON.stringify(String(value))}: expected integer in 1..65535`
    );
  }
  const n = Number(raw);
  if (n < 1 || n > 65535) {
    throw new RangeError(
      `invalid AVATAR_PORT ${JSON.stringify(String(value))}: expected integer in 1..65535`
    );
  }
  return n;
}

function loadConfig(env = process.env) {
  const bind = env.AVATAR_BIND || DEFAULT_BIND;
  const port =
    env.AVATAR_PORT === undefined || env.AVATAR_PORT === null
      ? DEFAULT_PORT
      : parsePort(env.AVATAR_PORT);
  return {
    bind,
    port,
    serviceName: 'avatar-runtime',
    version: '0.1.0',
  };
}

module.exports = { loadConfig, DEFAULT_BIND, DEFAULT_PORT };
