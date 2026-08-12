'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CONTROL_SCHEMA,
  createState,
  getControlDefaults,
  resetControls,
  triggerBeat,
  updateControl,
} = require('../server/state');

test('semantic schema has eight stable controls with defaults inside ranges', () => {
  assert.deepEqual(Object.keys(CONTROL_SCHEMA), [
    'angleX',
    'angleY',
    'bodyX',
    'blink',
    'mouth',
    'smile',
    'squash',
    'bounce',
  ]);
  for (const [id, spec] of Object.entries(CONTROL_SCHEMA)) {
    assert.equal(typeof spec.label, 'string', `${id} label`);
    assert.equal(typeof spec.step, 'number', `${id} step`);
    assert.equal(spec.default >= spec.min, true, `${id} default lower bound`);
    assert.equal(spec.default <= spec.max, true, `${id} default upper bound`);
  }
});

test('updateControl clamps every continuous control and counts accepted updates', () => {
  const state = createState();
  for (const [id, spec] of Object.entries(CONTROL_SCHEMA)) {
    const low = updateControl(state, id, spec.min - 1);
    assert.equal(low.ok, true);
    assert.equal(low.value, spec.min);
    assert.equal(low.clamped, true);

    const high = updateControl(state, id, spec.max + 1);
    assert.equal(high.ok, true);
    assert.equal(high.value, spec.max);
    assert.equal(high.clamped, true);
  }
  assert.equal(state.counters.controlUpdates, Object.keys(CONTROL_SCHEMA).length * 2);
});

test('updateControl rejects unknown and non-finite values without mutation', () => {
  const state = createState();
  const before = { ...state.controls };
  for (const id of ['unknown', 'toString', 'constructor', '__proto__']) {
    assert.deepEqual(updateControl(state, id, 1), {
      ok: false,
      code: 'unknown_control',
    });
  }
  assert.deepEqual(updateControl(state, 'angleX', NaN), {
    ok: false,
    code: 'invalid_value',
  });
  assert.deepEqual(updateControl(state, 'angleX', Infinity), {
    ok: false,
    code: 'invalid_value',
  });
  assert.deepEqual(state.controls, before);
  assert.equal(state.counters.controlUpdates, 0);
});

test('resetControls restores all defaults and beat remains a discrete event', () => {
  const state = createState();
  updateControl(state, 'smile', 1);
  updateControl(state, 'angleY', -10);
  const reset = resetControls(state);
  assert.deepEqual(reset.controls, getControlDefaults());
  assert.equal(reset.events.beatCount, 0);
  assert.equal(state.counters.controlResets, 1);

  const event = triggerBeat(state, 1234567890);
  assert.deepEqual(event, { beatCount: 1, lastBeatAt: 1234567890 });
  assert.equal(state.controls.smile, 0);
  assert.equal(state.counters.beatEvents, 1);
});
