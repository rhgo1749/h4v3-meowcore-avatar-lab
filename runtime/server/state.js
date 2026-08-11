'use strict';

/**
 * Runtime state singleton for PR-001.
 *
 * PR-001 intentionally ships a deterministic placeholder: no real Live2D
 * model is loaded. The `model` object is the contract slot where a future
 * model loader (post-Cubism export) will report the loaded model id and
 * parameter set. Do not fake semantics for endpoints that do not exist yet.
 */

function createState() {
  return {
    startedAt: Date.now(),
    model: {
      id: 'placeholder-none',
      loaded: false,
      kind: 'placeholder',
    },
    parameters: {},
    counters: {
      requests: 0,
      healthChecks: 0,
    },
  };
}

module.exports = { createState };
