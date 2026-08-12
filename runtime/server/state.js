'use strict';

/**
 * Semantic control contract for the placeholder runtime.
 *
 * These ids and ranges are the public runtime contract. A future Cubism
 * adapter consumes this semantic layer; Cubism parameter ids must not leak
 * into the HTTP API.
 */
const CONTROL_SCHEMA = Object.freeze({
  angleX: Object.freeze({
    label: 'Angle X',
    default: 0,
    min: -30,
    max: 30,
    step: 1,
    unit: 'degrees',
  }),
  angleY: Object.freeze({
    label: 'Angle Y',
    default: 0,
    min: -20,
    max: 20,
    step: 1,
    unit: 'degrees',
  }),
  bodyX: Object.freeze({
    label: 'Body X',
    default: 0,
    min: -1,
    max: 1,
    step: 0.05,
    unit: 'normalized',
  }),
  blink: Object.freeze({
    label: 'Blink',
    default: 0,
    min: 0,
    max: 1,
    step: 0.01,
    unit: 'normalized',
  }),
  mouth: Object.freeze({
    label: 'Mouth',
    default: 0,
    min: 0,
    max: 1,
    step: 0.01,
    unit: 'normalized',
  }),
  smile: Object.freeze({
    label: 'Smile',
    default: 0,
    min: -1,
    max: 1,
    step: 0.01,
    unit: 'normalized',
  }),
  squash: Object.freeze({
    label: 'Squash',
    default: 0,
    min: -1,
    max: 1,
    step: 0.01,
    unit: 'normalized',
  }),
  bounce: Object.freeze({
    label: 'Bounce',
    default: 0,
    min: 0,
    max: 1,
    step: 0.01,
    unit: 'normalized',
  }),
});

function getControlSchema() {
  return Object.fromEntries(
    Object.entries(CONTROL_SCHEMA).map(([id, spec]) => [id, { ...spec }])
  );
}

function getControlDefaults() {
  return Object.fromEntries(
    Object.entries(CONTROL_SCHEMA).map(([id, spec]) => [id, spec.default])
  );
}

function semanticState(state) {
  return {
    controls: { ...state.controls },
    events: { ...state.events },
    schema: getControlSchema(),
  };
}

function updateControl(state, id, value) {
  if (!Object.prototype.hasOwnProperty.call(CONTROL_SCHEMA, id)) {
    return { ok: false, code: 'unknown_control' };
  }
  const spec = CONTROL_SCHEMA[id];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { ok: false, code: 'invalid_value' };
  }
  const clamped = Math.min(spec.max, Math.max(spec.min, value));
  state.controls[id] = clamped;
  state.counters.controlUpdates += 1;
  return {
    ok: true,
    id,
    requested: value,
    value: clamped,
    clamped: clamped !== value,
  };
}

function resetControls(state) {
  state.controls = getControlDefaults();
  state.counters.controlResets += 1;
  return semanticState(state);
}

function triggerBeat(state, now = Date.now()) {
  state.events.beatCount += 1;
  state.events.lastBeatAt = now;
  state.counters.beatEvents += 1;
  return { ...state.events };
}

/**
 * Runtime state singleton.
 *
 * The model remains a deterministic placeholder, while semantic controls and
 * beat events are real server-owned state. No persistence is needed for this
 * debug/test surface.
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
    controls: getControlDefaults(),
    events: {
      beatCount: 0,
      lastBeatAt: null,
    },
    counters: {
      requests: 0,
      healthChecks: 0,
      controlUpdates: 0,
      controlResets: 0,
      beatEvents: 0,
    },
  };
}

module.exports = {
  CONTROL_SCHEMA,
  createState,
  getControlDefaults,
  getControlSchema,
  resetControls,
  semanticState,
  triggerBeat,
  updateControl,
};
