'use strict';

/**
 * Regression tests for the shared semantic -> Cubism mapping engine (M3).
 *
 * The module under test (runtime/shared/mapping.js) is the same code the
 * browser renderer consumes via /js/mapping.js, so these tests pin the
 * clamp/direction behavior the dashboard actually applies.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyMapping,
  clamp,
  isFiniteNumber,
  parameterEntries,
  validateMapping,
} = require('../shared/mapping');

const { CONTROL_SCHEMA } = require('../server/state');
const { VALID_MAPPING } = require('./fixtures');

test('validateMapping accepts a complete valid mapping', () => {
  const result = validateMapping(VALID_MAPPING, CONTROL_SCHEMA);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('validateMapping rejects unknown semantic ids (never silently accepted)', () => {
  const mapping = {
    angleX: [{ parameter: 'ParamAngleX', min: -30, max: 30, scale: 1, bias: 0 }],
    ParameterAngleX: [{ parameter: 'ParamAngleX', min: -30, max: 30, scale: 1, bias: 0 }],
  };
  const result = validateMapping(mapping, CONTROL_SCHEMA);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /unknown semantic control id: ParameterAngleX/);
});

test('validateMapping rejects structural, numeric, and range errors fail-closed', () => {
  const cases = [
    { mapping: null, expect: /mapping must be an object/ },
    { mapping: [], expect: /mapping must be an object/ },
    {
      mapping: { angleX: [] },
      expect: /non-empty array/,
    },
    {
      mapping: { angleX: 'not-an-array' },
      expect: /non-empty array/,
    },
    {
      mapping: { angleX: [{ parameter: '', min: -30, max: 30, scale: 1, bias: 0 }] },
      expect: /parameter must be a non-empty string/,
    },
    {
      mapping: { angleX: [{ parameter: 'P', min: 30, max: -30, scale: 1, bias: 0 }] },
      expect: /min must be strictly less than max/,
    },
    {
      mapping: { angleX: [{ parameter: 'P', min: -30, max: 30, scale: NaN, bias: 0 }] },
      expect: /scale must be a finite number/,
    },
    {
      mapping: { angleX: [{ parameter: 'P', min: -30, max: 30, scale: 1, bias: Infinity }] },
      expect: /bias must be a finite number/,
    },
    {
      mapping: { angleX: [{ parameter: 'P', min: -30, max: 30 }] },
      expect: /scale must be a finite number/,
    },
  ];
  for (const c of cases) {
    const result = validateMapping(c.mapping, CONTROL_SCHEMA);
    assert.equal(result.ok, false, JSON.stringify(c.mapping));
    assert.ok(
      result.errors.some((e) => c.expect.test(e)),
      `expected ${c.expect} in ${JSON.stringify(result.errors)}`
    );
  }
});

test('applyMapping clamps every target to its declared [min, max]', () => {
  const mapping = VALID_MAPPING;
  const controls = {
    angleX: 9999,
    angleY: -9999,
    bodyX: 0,
    blink: 0,
    mouth: 0,
    smile: 0,
    squash: 0,
    bounce: 2,
  };
  const applied = applyMapping(mapping, controls);
  assert.equal(applied.ParamAngleX, 30);
  assert.equal(applied.ParamAngleY, -20);
  assert.equal(applied.ParamY, 1);
});

test('direction contract: blink open->closed maps eyes 1->0 (inverted scale)', () => {
  const open = applyMapping(VALID_MAPPING, {
    angleX: 0, angleY: 0, bodyX: 0, blink: 0, mouth: 0, smile: 0, squash: 0, bounce: 0,
  });
  assert.equal(open.ParamEyeLOpen, 1);
  assert.equal(open.ParamEyeROpen, 1);

  const closed = applyMapping(VALID_MAPPING, {
    angleX: 0, angleY: 0, bodyX: 0, blink: 1, mouth: 0, smile: 0, squash: 0, bounce: 0,
  });
  assert.equal(closed.ParamEyeLOpen, 0);
  assert.equal(closed.ParamEyeROpen, 0);
});

test('direction contract: angleX/angleY/bodyX/smile/squash keep M2 meaning', () => {
  const left = applyMapping(VALID_MAPPING, {
    angleX: -30, angleY: 0, bodyX: 0, blink: 0, mouth: 0, smile: 0, squash: 0, bounce: 0,
  });
  assert.equal(left.ParamAngleX, -30, 'angleX min = avatar left');
  const right = applyMapping(VALID_MAPPING, {
    angleX: 30, angleY: 0, bodyX: 0, blink: 0, mouth: 0, smile: 0, squash: 0, bounce: 0,
  });
  assert.equal(right.ParamAngleX, 30, 'angleX max = avatar right');

  const down = applyMapping(VALID_MAPPING, {
    angleX: 0, angleY: -20, bodyX: 0, blink: 0, mouth: 0, smile: 0, squash: 0, bounce: 0,
  });
  assert.equal(down.ParamAngleY, -20, 'angleY min = looks down');
  const up = applyMapping(VALID_MAPPING, {
    angleX: 0, angleY: 20, bodyX: 0, blink: 0, mouth: 0, smile: 0, squash: 0, bounce: 0,
  });
  assert.equal(up.ParamAngleY, 20, 'angleY max = looks up');

  const frown = applyMapping(VALID_MAPPING, {
    angleX: 0, angleY: 0, bodyX: 0, blink: 0, mouth: 0, smile: -1, squash: 0, bounce: 0,
  });
  assert.equal(frown.ParamMouthForm, -1, 'smile min = frown');
  const smile = applyMapping(VALID_MAPPING, {
    angleX: 0, angleY: 0, bodyX: 0, blink: 0, mouth: 0, smile: 1, squash: 0, bounce: 0,
  });
  assert.equal(smile.ParamMouthForm, 1, 'smile max = smile');

  const stretch = applyMapping(VALID_MAPPING, {
    angleX: 0, angleY: 0, bodyX: 0, blink: 0, mouth: 0, smile: 0, squash: -1, bounce: 0,
  });
  assert.equal(stretch.ParamBodyScaleY, -1, 'squash min = vertical stretch');
  const squashed = applyMapping(VALID_MAPPING, {
    angleX: 0, angleY: 0, bodyX: 0, blink: 0, mouth: 0, smile: 0, squash: 1, bounce: 0,
  });
  assert.equal(squashed.ParamBodyScaleY, 1, 'squash max = vertical squash');

  const bounceNeutral = applyMapping(VALID_MAPPING, {
    angleX: 0, angleY: 0, bodyX: 0, blink: 0, mouth: 0, smile: 0, squash: 0, bounce: 0,
  });
  assert.equal(bounceNeutral.ParamY, 0, 'bounce min = neutral');
  const bounceMax = applyMapping(VALID_MAPPING, {
    angleX: 0, angleY: 0, bodyX: 0, blink: 0, mouth: 0, smile: 0, squash: 0, bounce: 1,
  });
  assert.equal(bounceMax.ParamY, 1, 'bounce max = maximum debug amplitude');
});

test('applyMapping skips missing or non-finite controls without inventing values', () => {
  const applied = applyMapping(VALID_MAPPING, {
    angleX: NaN,
    angleY: undefined,
    bodyX: 0,
    blink: 0,
    mouth: 0,
    smile: 0,
    squash: 0,
    bounce: 0,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(applied, 'ParamAngleX'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(applied, 'ParamAngleY'), false);
  assert.equal(applied.ParamEyeLOpen, 1);
});

test('applyMapping: same parameter in later targets wins (documented)', () => {
  const mapping = {
    blink: [
      { parameter: 'ParamEyes', min: 0, max: 1, scale: -1, bias: 1 },
      { parameter: 'ParamEyes', min: 0, max: 1, scale: 1, bias: 0 },
    ],
  };
  const applied = applyMapping(mapping, { blink: 1 });
  assert.equal(applied.ParamEyes, 1);
});

test('parameterEntries returns deterministic flat listing', () => {
  const entries = parameterEntries(VALID_MAPPING);
  assert.deepEqual(
    entries.map((e) => e.semantic + ':' + e.parameter),
    [
      'angleX:ParamAngleX',
      'angleY:ParamAngleY',
      'bodyX:ParamBodyAngleX',
      'blink:ParamEyeLOpen',
      'blink:ParamEyeROpen',
      'mouth:ParamMouthOpenY',
      'smile:ParamMouthForm',
      'squash:ParamBodyScaleY',
      'bounce:ParamY',
    ]
  );
  for (const entry of entries) {
    assert.equal(isFiniteNumber(entry.min), true);
    assert.equal(isFiniteNumber(entry.max), true);
    assert.equal(isFiniteNumber(entry.scale), true);
    assert.equal(isFiniteNumber(entry.bias), true);
  }
});

test('clamp helper bounds values', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(clamp(0.5, 0, 1), 0.5);
});
