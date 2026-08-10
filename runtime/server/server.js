'use strict';

/**
 * Avatar Runtime entry point (PR-001 bootstrap).
 *
 * Bounded lifecycle: listens on AVATAR_BIND/AVATAR_PORT (default loopback
 * 127.0.0.1:8930) and shuts down cleanly on SIGTERM/SIGINT so Docker
 * orchestration can stop the container without stale listeners.
 */

const http = require('node:http');
const path = require('node:path');

const { loadConfig } = require('./config');
const { createHandler } = require('./app');
const { createState } = require('./state');

const config = loadConfig();
const state = createState();
const publicDir = path.join(__dirname, '..', 'public');

const server = http.createServer(createHandler({ config, state, publicDir }));

server.listen(config.port, config.bind, () => {
  console.log(
    `[avatar-runtime] ${config.serviceName} v${config.version} listening on ${config.bind}:${config.port}`
  );
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`[avatar-runtime] received ${signal}, shutting down`);
  server.close(() => {
    console.log('[avatar-runtime] stopped');
    process.exit(0);
  });
  // Do not hang forever on in-flight connections.
  setTimeout(() => {
    console.error('[avatar-runtime] forced exit after shutdown timeout');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
