'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { placeholderScale } = require('../public/live2d/renderer');

const rendererSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'live2d', 'renderer.js'),
  'utf8'
);

test('placeholder squash follows the semantic direction contract', () => {
  const stretch = placeholderScale(-1);
  const neutral = placeholderScale(0);
  const squash = placeholderScale(1);

  assert.deepEqual(neutral, { scaleX: 1, scaleY: 1 });
  assert.equal(stretch.scaleY, 1.16, '-1 is vertical stretch');
  assert.equal(squash.scaleY, 0.84, '+1 is vertical squash');
  assert.ok(stretch.scaleY > neutral.scaleY);
  assert.ok(squash.scaleY < neutral.scaleY);
});

test('placeholder scale safely treats non-finite squash as neutral', () => {
  assert.deepEqual(placeholderScale(Number.NaN), { scaleX: 1, scaleY: 1 });
  assert.deepEqual(placeholderScale(Number.POSITIVE_INFINITY), { scaleX: 1, scaleY: 1 });
});

test('cubism adapter keeps the official Web Framework ownership boundaries', () => {
  for (const name of [
    'CubismModelSettingJson',
    'CubismUserModel',
    'CubismRenderer_WebGL',
    'CubismFramework.startUp',
    'CubismFramework.initialize',
    'getIdManager',
    'setParameterValueById',
    'startUp',
    'loadShaders',
    'drawModel',
  ]) {
    assert.match(rendererSource, new RegExp(name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(rendererSource, /CubismModelSettingsJson/);
  assert.doesNotMatch(rendererSource, /new framework\.CubismModel\(/);
  assert.doesNotMatch(rendererSource, /cubismModel\.draw\(gl\)/);
});