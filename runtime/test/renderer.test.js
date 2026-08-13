'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  placeholderScale,
  verifyShaderAssets,
  waitForShaderReady,
} = require('../public/live2d/renderer');

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
    'CubismShaderManager_WebGL',
    'CubismFramework.startUp',
    'CubismFramework.initialize',
    'getIdManager',
    'setIsPremultipliedAlpha',
    'setParameterValueById',
    'startUp',
    'loadShaders',
    'waitForShaderReady',
    'drawModel',
  ]) {
    assert.match(rendererSource, new RegExp(name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(rendererSource, /CubismModelSettingsJson/);
  assert.doesNotMatch(rendererSource, /new framework\.CubismModel\(/);
  assert.doesNotMatch(rendererSource, /cubismModel\.draw\(gl\)/);
});

test('cubism readiness is gated on the complete official shader asset set', () => {
  assert.match(rendererSource, /verifyShaderAssets/);
  assert.match(rendererSource, /shaderFiles/);
  assert.match(rendererSource, /_isShaderLoaded/);
  assert.match(rendererSource, /_isShaderLoading/);
  assert.match(rendererSource, /setIsPremultipliedAlpha\(true\)/);
  assert.match(rendererSource, /shader-assets/);
});

test('waitForShaderReady waits for the official asynchronous load transition', async () => {
  const shader = { _isShaderLoading: true, _isShaderLoaded: false };
  const framework = {
    CubismShaderManager_WebGL: {
      getInstance: () => ({ getShader: () => shader }),
    },
  };
  setTimeout(() => {
    shader._isShaderLoading = false;
    shader._isShaderLoaded = true;
  }, 0);

  await waitForShaderReady(framework, {}, 100);
  assert.equal(shader._isShaderLoaded, true);
});

test('waitForShaderReady fails closed when asynchronous shader loading fails', async () => {
  const shader = { _isShaderLoading: true, _isShaderLoaded: false };
  const framework = {
    CubismShaderManager_WebGL: {
      getInstance: () => ({ getShader: () => shader }),
    },
  };
  setTimeout(() => {
    shader._isShaderLoading = false;
  }, 0);

  await assert.rejects(
    waitForShaderReady(framework, {}, 100),
    /official Cubism shader loading failed/
  );
});

test('verifyShaderAssets fails closed when any official shader fetch is unavailable', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => /** @type {Response} */ ({
    ok: !String(url).endsWith('fragshadersrcblend.frag'),
    text: async () => 'void main() {}',
  });
  try {
    await assert.rejects(
      verifyShaderAssets('/vendor/live2d/shaders/WebGL/', [
        'vertshadersrc.vert',
        'fragshadersrcblend.frag',
      ]),
      /failed to load Cubism shader/
    );
  } finally {
    global.fetch = originalFetch;
  }
});