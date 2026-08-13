'use strict';

/**
 * Test fixtures for the M3 model registry (manifest + model3 stub).
 *
 * Creates a disposable model directory under os.tmpdir() so repository
 * tests never touch the real models/runtime or public/vendor directories.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { SDK_SHADER_FILES } = require('../server/model');

const VALID_MAPPING = {
  angleX: [{ parameter: 'ParamAngleX', min: -30, max: 30, scale: 1, bias: 0 }],
  angleY: [{ parameter: 'ParamAngleY', min: -20, max: 20, scale: 1, bias: 0 }],
  bodyX: [{ parameter: 'ParamBodyAngleX', min: -10, max: 10, scale: 1, bias: 0 }],
  blink: [
    { parameter: 'ParamEyeLOpen', min: 0, max: 1, scale: -1, bias: 1 },
    { parameter: 'ParamEyeROpen', min: 0, max: 1, scale: -1, bias: 1 },
  ],
  mouth: [{ parameter: 'ParamMouthOpenY', min: 0, max: 1, scale: 1, bias: 0 }],
  smile: [{ parameter: 'ParamMouthForm', min: -1, max: 1, scale: 1, bias: 0 }],
  squash: [{ parameter: 'ParamBodyScaleY', min: -1, max: 1, scale: 1, bias: 0 }],
  bounce: [{ parameter: 'ParamY', min: 0, max: 1, scale: 1, bias: 0 }],
};

/**
 * @param {object} [options]
 * @param {string} [options.modelId] default 'fixture-model'
 * @param {object} [options.manifest] full manifest override
 * @param {boolean} [options.withModel3] default true
 * @returns {{ root: string, modelsDir: string, modelId: string, manifestPath: string }}
 */
function createModelFixture(options = {}) {
  const modelId = options.modelId || 'fixture-model';
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-model-fixture-'));
  const modelsDir = path.join(root, 'models');
  const modelDir = path.join(modelsDir, modelId);
  fs.mkdirSync(modelDir, { recursive: true });

  const manifest =
    options.manifest ||
    Object.assign(
      {
        modelId,
        displayName: 'Fixture Test Model',
        kind: 'cubism',
        model3: 'fixture.model3.json',
        mapping: VALID_MAPPING,
      },
      options.manifest || {}
    );

  const manifestPath = path.join(modelDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  if (options.withModel3 !== false) {
    fs.writeFileSync(
      path.join(modelDir, 'fixture.model3.json'),
      JSON.stringify({
        Version: 3,
        FileReferences: {
          Moc: 'fixture.moc3',
          Textures: ['fixture.texture.png'],
        },
      })
    );
  }
  return { root, modelsDir, modelId, manifestPath };
}

/**
 * Create the official-SDK file layout under a publicDir (stub files for
 * renderer availability checks; contents are placeholders only).
 */
function createSdkStub(publicDir) {
  const sdkDir = path.join(publicDir, 'vendor', 'live2d');
  fs.mkdirSync(sdkDir, { recursive: true });
  fs.writeFileSync(path.join(sdkDir, 'live2dcubismcore.min.js'), '// stub core\n');
  fs.writeFileSync(path.join(sdkDir, 'live2d.min.js'), '// stub framework\n');
  const shaderDir = path.join(sdkDir, 'shaders', 'WebGL');
  fs.mkdirSync(shaderDir, { recursive: true });
  for (const shaderFile of SDK_SHADER_FILES) {
    fs.writeFileSync(path.join(shaderDir, shaderFile), '// stub shader ' + shaderFile + '\n');
  }
  return sdkDir;
}

function removeFixture(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

module.exports = { VALID_MAPPING, createModelFixture, createSdkStub, removeFixture };
