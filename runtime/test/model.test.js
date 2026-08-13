'use strict';

/**
 * Model registry tests (M3): manifest discovery, fail-closed validation,
 * SDK availability detection, and bounded model asset resolution.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createModelRegistry,
  resolveModelAsset,
  sdkStatus,
  validateManifest,
} = require('../server/model');
const { CONTROL_SCHEMA } = require('../server/state');
const {
  VALID_MAPPING,
  createModelFixture,
  createSdkStub,
  removeFixture,
} = require('./fixtures');

function emptyPublicDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-public-'));
}

function expectError(result, code) {
  assert.equal(result.ok, false);
  const error = result.error;
  assert.ok(error, 'expected an error result');
  assert.equal(error.code, code);
  return error;
}

test('registry defaults to the deterministic placeholder when no model id is set', () => {
  const registry = createModelRegistry({
    modelsDir: '/nonexistent',
    publicDir: emptyPublicDir(),
    modelId: '',
  });
  assert.deepEqual(registry.model, {
    id: 'placeholder-none',
    kind: 'placeholder',
    loaded: false,
    ready: true,
    error: null,
  });
  assert.equal(registry.manifest, null);
  assert.equal(registry.mapping, null);
});

test('invalid AVATAR_MODEL_ID characters fail closed', () => {
  for (const bad of ['../evil', 'a/b', 'a b', 'x=y', '-lead']) {
    const registry = createModelRegistry({
      modelsDir: '/nonexistent',
      publicDir: emptyPublicDir(),
      modelId: bad,
    });
    assert.equal(registry.model.kind, 'cubism');
    assert.equal(registry.model.ready, false);
    const error = registry.model.error;
    assert.ok(error, 'expected model error');
    assert.equal(error.code, 'model_invalid_id');
  }
});

test('missing manifest fails closed with manifest_not_found', () => {
  const fixture = createModelFixture();
  fs.rmSync(path.join(fixture.modelsDir, fixture.modelId, 'manifest.json'));
  const registry = createModelRegistry({
    modelsDir: fixture.modelsDir,
    publicDir: emptyPublicDir(),
    modelId: fixture.modelId,
  });
  assert.equal(registry.model.kind, 'cubism');
  assert.equal(registry.model.loaded, false);
  assert.equal(registry.model.ready, false);
  const error = registry.model.error;
  assert.ok(error, 'expected model error');
  assert.equal(error.code, 'manifest_not_found');
  assert.match(error.message, /manifest\.json/);
  removeFixture(fixture.root);
});

test('invalid manifest JSON fails closed with manifest_invalid_json', () => {
  const fixture = createModelFixture();
  fs.writeFileSync(
    path.join(fixture.modelsDir, fixture.modelId, 'manifest.json'),
    '{not json'
  );
  const registry = createModelRegistry({
    modelsDir: fixture.modelsDir,
    publicDir: emptyPublicDir(),
    modelId: fixture.modelId,
  });
  const error = registry.model.error;
  assert.ok(error, 'expected model error');
  assert.equal(error.code, 'manifest_invalid_json');
  removeFixture(fixture.root);
});

test('schema violations fail closed: modelId mismatch, wrong kind, unsafe model3', () => {
  const cases = [
    { modelId: 'other', expect: /must match directory/ },
    { kind: 'native', expect: /manifest\.kind must be "cubism"/ },
    { model3: '../evil.model3.json', expect: /plain file name/ },
    { model3: 'a/b.model3.json', expect: /plain file name/ },
  ];
  for (const c of cases) {
    const fixture = createModelFixture({
      manifest: { modelId: 'fixture-model', kind: 'cubism', model3: 'fixture.model3.json' },
    });
    const manifest = JSON.parse(
      fs.readFileSync(path.join(fixture.modelsDir, fixture.modelId, 'manifest.json'), 'utf8')
    );
    for (const [key, value] of Object.entries(c)) {
      if (key === 'expect') continue;
      manifest[key] = value;
    }
    fs.writeFileSync(
      path.join(fixture.modelsDir, fixture.modelId, 'manifest.json'),
      JSON.stringify(manifest)
    );
    const registry = createModelRegistry({
      modelsDir: fixture.modelsDir,
      publicDir: emptyPublicDir(),
      modelId: 'fixture-model',
    });
    const error = registry.model.error;
    assert.ok(error, 'expected model error: ' + JSON.stringify(c));
    assert.equal(error.code, 'manifest_invalid', JSON.stringify(c));
    assert.match(error.message, c.expect);
    removeFixture(fixture.root);
  }
});

test('invalid mapping (unknown semantic id) fails closed with mapping_invalid', () => {
  const fixture = createModelFixture({
    manifest: {
      modelId: 'fixture-model',
      kind: 'cubism',
      model3: 'fixture.model3.json',
      mapping: {
        angleX: [{ parameter: 'ParamAngleX', min: -30, max: 30, scale: 1, bias: 0 }],
        ParamBogus: [{ parameter: 'ParamBogus', min: 0, max: 1, scale: 1, bias: 0 }],
      },
    },
  });
  const registry = createModelRegistry({
    modelsDir: fixture.modelsDir,
    publicDir: emptyPublicDir(),
    modelId: 'fixture-model',
  });
  const error = registry.model.error;
  assert.ok(error, 'expected model error');
  assert.equal(error.code, 'mapping_invalid');
  assert.match(error.message, /unknown semantic control id: ParamBogus/);
  removeFixture(fixture.root);
});

test('missing model3 file fails closed with model3_not_found', () => {
  const fixture = createModelFixture({ withModel3: false });
  const registry = createModelRegistry({
    modelsDir: fixture.modelsDir,
    publicDir: emptyPublicDir(),
    modelId: fixture.modelId,
  });
  const error = registry.model.error;
  assert.ok(error, 'expected model error');
  assert.equal(error.code, 'model3_not_found');
  assert.match(error.message, /fixture\.model3\.json/);
  removeFixture(fixture.root);
});

test('valid manifest produces a ready cubism model with manifest and mapping', () => {
  const fixture = createModelFixture();
  const registry = createModelRegistry({
    modelsDir: fixture.modelsDir,
    publicDir: emptyPublicDir(),
    modelId: fixture.modelId,
  });
  assert.deepEqual(registry.model, {
    id: 'fixture-model',
    kind: 'cubism',
    loaded: true,
    ready: true,
    error: null,
  });
  assert.ok(registry.manifest, 'expected manifest');
  assert.equal(registry.manifest.modelId, 'fixture-model');
  assert.deepEqual(registry.mapping, VALID_MAPPING);
  removeFixture(fixture.root);
});

test('sdkStatus detects official SDK files under public/vendor/live2d/', () => {
  const publicDir = emptyPublicDir();
  const missing = sdkStatus(publicDir);
  assert.equal(missing.available, false);
  assert.equal(missing.basePath, '/vendor/live2d/');
  assert.equal(missing.shaderPath, '/vendor/live2d/shaders/WebGL/');

  createSdkStub(publicDir);
  const present = sdkStatus(publicDir);
  assert.equal(present.available, true);
  assert.deepEqual(present.files, {
    core: 'live2dcubismcore.min.js',
    framework: 'live2d.min.js',
  });
  assert.equal(present.shaderPath, '/vendor/live2d/shaders/WebGL/');
});

test('registry reports sdk availability alongside model readiness', () => {
  const fixture = createModelFixture();
  const publicDir = emptyPublicDir();
  const withoutSdk = createModelRegistry({
    modelsDir: fixture.modelsDir,
    publicDir,
    modelId: fixture.modelId,
  });
  assert.equal(withoutSdk.model.ready, true);
  assert.equal(withoutSdk.sdk.available, false);

  createSdkStub(publicDir);
  const withSdk = createModelRegistry({
    modelsDir: fixture.modelsDir,
    publicDir,
    modelId: fixture.modelId,
  });
  assert.equal(withSdk.sdk.available, true);
  removeFixture(fixture.root);
});

test('validateManifest direct unit checks', () => {
  const fixture = createModelFixture();
  const manifest = JSON.parse(
    fs.readFileSync(path.join(fixture.modelsDir, fixture.modelId, 'manifest.json'), 'utf8')
  );
  const ok = validateManifest(manifest, fixture.modelsDir, fixture.modelId);
  assert.equal(ok.ok, true);

  const badKind = validateManifest({ ...manifest, kind: 'placeholder' }, fixture.modelsDir, fixture.modelId);
  expectError(badKind, 'manifest_invalid');

  const badMapping = validateManifest(
    { ...manifest, mapping: { bogus: [] } },
    fixture.modelsDir,
    fixture.modelId
  );
  expectError(badMapping, 'mapping_invalid');
  assert.equal(CONTROL_SCHEMA.angleX.min, -30);
  removeFixture(fixture.root);
});

test('resolveModelAsset serves only files inside the configured model directory', () => {
  const fixture = createModelFixture();
  const modelDir = path.join(fixture.modelsDir, fixture.modelId);

  const manifest = resolveModelAsset(fixture.modelsDir, fixture.modelId, 'manifest.json');
  assert.equal(manifest, path.join(modelDir, 'manifest.json'));

  const nested = path.join(modelDir, 'textures');
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(nested, 'a.png'), 'png');
  assert.equal(
    resolveModelAsset(fixture.modelsDir, fixture.modelId, 'textures/a.png'),
    path.join(nested, 'a.png')
  );

  for (const evil of [
    '../server.js',
    '..%2Fserver.js',
    'a/../../package.json',
    '..',
    '.',
    '',
    '/etc/passwd',
    'a/./b.png',
    'a//b.png',
  ]) {
    assert.equal(resolveModelAsset(fixture.modelsDir, fixture.modelId, evil), null, evil);
  }
  assert.equal(resolveModelAsset(fixture.modelsDir, '..', 'manifest.json'), null);
  assert.equal(resolveModelAsset(fixture.modelsDir, fixture.modelId, 'missing.moc3'), null);
  removeFixture(fixture.root);
});
