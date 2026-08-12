'use strict';

/**
 * Model registry (M3).
 *
 * Resolves the configured model (AVATAR_MODEL_ID) against
 * <modelsDir>/<modelId>/manifest.json and validates it fail-closed.
 * No Cubism SDK/Core/model binaries are committed to the repository; the
 * manifest describes where a licensed model lives and how its parameters
 * map from the public semantic contract.
 *
 * State machine (model descriptor):
 *   no modelId configured        -> placeholder-none, kind placeholder
 *   invalid modelId characters   -> kind cubism, error model_invalid_id
 *   manifest.json missing        -> kind cubism, error manifest_not_found
 *   manifest not valid JSON      -> kind cubism, error manifest_invalid_json
 *   manifest schema invalid      -> kind cubism, error manifest_invalid
 *   mapping violates contract    -> kind cubism, error mapping_invalid
 *   model3 file missing          -> kind cubism, error model3_not_found
 *   valid                        -> kind cubism, loaded/ready true
 *
 * `ready` means the server-side descriptor is complete and a browser can
 * request the model assets. Actual render readiness additionally requires
 * the licensed Cubism SDK files under public/vendor/live2d/ (sdk.available).
 */

const fs = require('node:fs');
const path = require('node:path');

const { validateMapping } = require('../shared/mapping');
const { CONTROL_SCHEMA } = require('./state');

const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const DEFAULT_SDK_FILES = Object.freeze({
  core: 'live2dcubismcore.min.js',
  framework: 'live2d.min.js',
});
const SDK_BASE_PATH = '/vendor/live2d/';

function modelError(code, message) {
  return { code, message };
}

function placeholderModel() {
  return {
    id: 'placeholder-none',
    kind: 'placeholder',
    loaded: false,
    ready: true,
    error: null,
  };
}

function failedModel(id, code, message) {
  return {
    id,
    kind: 'cubism',
    loaded: false,
    ready: false,
    error: modelError(code, message),
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {string} modelsDir
 * @param {string} modelId
 * @returns {{ ok: true; manifest: any } | { ok: false; error: { code: string; message: string } }}
 */
function readManifest(modelsDir, modelId) {
  const manifestPath = path.join(modelsDir, modelId, 'manifest.json');
  let raw;
  try {
    raw = fs.readFileSync(manifestPath, 'utf8');
  } catch {
    return {
      ok: false,
      error: modelError(
        'manifest_not_found',
        'model manifest not found: ' + modelId + '/manifest.json'
      ),
    };
  }
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      error: modelError(
        'manifest_invalid_json',
        'model manifest is not valid JSON: ' + modelId
      ),
    };
  }
  return { ok: true, manifest };
}

/**
 * Fail-closed manifest schema validation.
 * @param {any} manifest
 * @param {string} modelsDir
 * @param {string} modelId
 * @returns {{ ok: true } | { ok: false; error: { code: string; message: string } }}
 */
function validateManifest(manifest, modelsDir, modelId) {
  if (!isPlainObject(manifest)) {
    return { ok: false, error: modelError('manifest_invalid', 'manifest must be a JSON object') };
  }
  if (manifest.modelId !== modelId) {
    return {
      ok: false,
      error: modelError(
        'manifest_invalid',
        'manifest.modelId (' + JSON.stringify(manifest.modelId) + ') must match directory ' + modelId
      ),
    };
  }
  if (manifest.kind !== 'cubism') {
    return {
      ok: false,
      error: modelError(
        'manifest_invalid',
        'manifest.kind must be "cubism" (got ' + JSON.stringify(manifest.kind) + ')'
      ),
    };
  }
  if (
    typeof manifest.model3 !== 'string' ||
    manifest.model3.length === 0 ||
    manifest.model3.includes('/') ||
    manifest.model3.includes('\\') ||
    manifest.model3 === '..' ||
    manifest.model3.startsWith('.')
  ) {
    return {
      ok: false,
      error: modelError(
        'manifest_invalid',
        'manifest.model3 must be a plain file name inside the model directory'
      ),
    };
  }
  const mapping = manifest.mapping;
  const validation = validateMapping(mapping, CONTROL_SCHEMA);
  if (!validation.ok) {
    return {
      ok: false,
      error: modelError('mapping_invalid', validation.errors.join('; ')),
    };
  }
  const model3Path = path.join(modelsDir, modelId, manifest.model3);
  /** @type {fs.Stats | null} */
  let model3Stat = null;
  try {
    model3Stat = fs.statSync(model3Path);
  } catch {
    // fall through to fail-closed error
  }
  if (model3Stat === null || !model3Stat.isFile()) {
    return {
      ok: false,
      error: modelError(
        'model3_not_found',
        'model3 file not found: ' + modelId + '/' + manifest.model3
      ),
    };
  }
  return { ok: true };
}

function sdkStatus(publicDir) {
  const sdkDir = path.join(publicDir, 'vendor', 'live2d');
  const files = { ...DEFAULT_SDK_FILES };
  const corePath = path.join(sdkDir, files.core);
  const frameworkPath = path.join(sdkDir, files.framework);
  const available =
    fs.existsSync(corePath) && fs.existsSync(frameworkPath);
  return { available, files, basePath: SDK_BASE_PATH };
}

/**
 * Build the runtime model registry. Deterministic snapshot at startup.
 *
 * @param {{ modelsDir: string; publicDir: string; modelId: string }} options
 * @returns {{
 *   modelsDir: string;
 *   model: {
 *     id: string;
 *     kind: string;
 *     loaded: boolean;
 *     ready: boolean;
 *     error: { code: string; message: string } | null;
 *   };
 *   manifest: any;
 *   mapping: any;
 *   sdk: { available: boolean; files: { core: string; framework: string }; basePath: string };
 * }}
 */
function createModelRegistry({ modelsDir, publicDir, modelId }) {
  const registry = {
    modelsDir,
    /** @type {{ id: string; kind: string; loaded: boolean; ready: boolean; error: { code: string; message: string } | null }} */
    model: placeholderModel(),
    manifest: null,
    mapping: null,
    sdk: sdkStatus(publicDir),
  };
  if (!modelId) {
    return registry;
  }
  const id = String(modelId);
  if (!MODEL_ID_PATTERN.test(id)) {
    registry.model = failedModel(
      id,
      'model_invalid_id',
      'AVATAR_MODEL_ID must match [A-Za-z0-9][A-Za-z0-9_-]*'
    );
    return registry;
  }
  const read = readManifest(modelsDir, id);
  if (!read.ok) {
    registry.model = failedModel(id, read.error.code, read.error.message);
    return registry;
  }
  const validated = validateManifest(read.manifest, modelsDir, id);
  if (!validated.ok) {
    registry.model = failedModel(id, validated.error.code, validated.error.message);
    return registry;
  }
  registry.model = {
    id,
    kind: 'cubism',
    loaded: true,
    ready: true,
    error: null,
  };
  registry.manifest = read.manifest;
  registry.mapping = read.manifest.mapping;
  return registry;
}

/**
 * Bounded model asset resolution: only files inside modelsDir/<modelId> are
 * reachable. Returns the absolute path when the file exists, else null.
 * modelId must be the configured model id (validated by the caller through
 * the registry state).
 */
function resolveModelAsset(modelsDir, modelId, relativePath) {
  if (typeof modelId !== 'string' || !MODEL_ID_PATTERN.test(modelId)) {
    return null;
  }
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    return null;
  }
  if (path.isAbsolute(relativePath)) {
    return null;
  }
  const segments = relativePath.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.' || segment === '')) {
    return null;
  }
  const modelRoot = path.resolve(modelsDir, modelId);
  const resolved = path.resolve(modelRoot, relativePath);
  if (resolved !== modelRoot && !resolved.startsWith(modelRoot + path.sep)) {
    return null;
  }
  /** @type {fs.Stats | null} */
  let stat = null;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return null;
  }
  if (stat === null || !stat.isFile()) {
    return null;
  }
  return resolved;
}

module.exports = {
  DEFAULT_SDK_FILES,
  MODEL_ID_PATTERN,
  SDK_BASE_PATH,
  createModelRegistry,
  placeholderModel,
  readManifest,
  resolveModelAsset,
  sdkStatus,
  validateManifest,
};
