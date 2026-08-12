'use strict';

/**
 * Headless browser smoke test for the Avatar Runtime (M2 + M3).
 *
 * Reproducible from the repository:
 *   cd runtime
 *   npm install
 *   npx playwright install chromium        # one-time browser download
 *   npm start &                            # server on 127.0.0.1:8930
 *   npm run smoke:browser
 *
 * Scenario 1 (external server, default placeholder):
 *   - / and /debug load, no fatal console errors
 *   - M3 dashboard: viewport canvas present, renderer active, presets
 *     round-trip through server state, inspector shows semantic state,
 *     reset/beat unchanged, mapped-params panel reports placeholder mode
 *
 * Scenario 2 (self-contained fixture cubism model + stub SDK):
 *   - spawns its own server with AVATAR_MODEL_ID pointing at a temporary
 *     fixture manifest and writes stub official-SDK files into
 *     public/vendor/live2d/ (gitignored; removed afterwards)
 *   - verifies the dashboard activates the cubism renderer, the shared
 *     mapping module drives setParameterValueById on the (stub) model, and
 *     the read-only mapped-parameters table reflects semantic controls
 *
 * The fixture SDK is a stand-in for the licensed official Cubism SDK for
 * Web; real-SDK E2E remains HOST_VALIDATION_REQUIRED.
 */

const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const BASE = process.env.AVATAR_SMOKE_BASE || 'http://127.0.0.1:8930';
const RUNTIME_DIR = path.join(__dirname, '..');

const CONTROL_IDS = [
  'angleX', 'angleY', 'bodyX', 'blink', 'mouth', 'smile', 'squash', 'bounce'
];

const STUB_SDK_CORE = `// stub live2dcubismcore.min.js (smoke fixture)
window.Live2DCubismCore = {};
`;
const STUB_SDK_FRAMEWORK = `// stub live2d.min.js (smoke fixture)
window.__stubModelCalls = [];
window.Live2DCubismFramework = {
  CubismFramework: { initialize: function () {} },
  CubismModelSettingsJson: function (url) { this.url = url; },
  CubismModel: function (settings) {
    this.settings = settings;
    this.params = {};
  }
};
window.Live2DCubismFramework.CubismModel.prototype.loadModel = async function () {};
window.Live2DCubismFramework.CubismModel.prototype.createRenderer = function () {
  return { setMvpMatrix: function () {} };
};
window.Live2DCubismFramework.CubismModel.prototype.setParameterValueById = function (id, value) {
  this.params[id] = value;
  window.__stubModelCalls.push({ id: id, value: value });
};
window.Live2DCubismFramework.CubismModel.prototype.update = function () {};
window.Live2DCubismFramework.CubismModel.prototype.draw = function () {};
window.Live2DCubismFramework.CubismMatrix44 = function () { this.scale = function () {}; };
`;

const FIXTURE_MAPPING = {
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

async function createBrowser() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  /** @type {any} */ (global).__smokePage = page;
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  return { browser, page, consoleErrors };
}

function assertDashboardBasics(page, expectedKind) {
  // Viewport canvas + renderer status are the M3 core surface.
  return Promise.all([
    page.waitForSelector('#viewport'),
    page.waitForSelector('#viewport-note'),
    page.waitForSelector('#presets'),
    page.waitForSelector('#mapped-params'),
    page.waitForSelector('#event-log'),
    page.waitForFunction((kind) => {
      const check = document.getElementById('check-viewport')?.textContent ?? '';
      return check.includes(kind);
    }, expectedKind, { timeout: 5000 }),
  ]);
}

async function scenarioPlaceholder(browser, page, consoleErrors) {
  // Server-side contract first: machine-readable health.
  const healthRes = await page.request.get(`${BASE}/healthz`);
  assert.equal(healthRes.status(), 200, 'healthz HTTP 200');
  const health = await healthRes.json();
  assert.equal(health.status, 'ok');
  assert.equal(health.ready, true);
  assert.equal(health.model.kind, 'placeholder');

  // Clean output surface.
  const indexRes = await page.goto(`${BASE}/`);
  assert.ok(indexRes, 'index navigation failed');
  assert.equal(indexRes.status(), 200, 'index HTTP 200');
  await page.waitForSelector('#avatar-stage');
  await page.waitForFunction(() =>
    document.getElementById('runtime-status')?.textContent?.includes('runtime ok') === true,
    { timeout: 5000 }
  );
  const statusText = (await page.textContent('#runtime-status')) ?? '';
  assert.match(statusText, /runtime ok/);
  assert.match(statusText, /placeholder/);

  // Debug / validation surface -> M3 visual dashboard.
  const debugRes = await page.goto(`${BASE}/debug`);
  assert.ok(debugRes, 'debug navigation failed');
  assert.equal(debugRes.status(), 200, 'debug HTTP 200');
  await page.waitForFunction(() => {
    const healthEl = document.getElementById('healthz')?.textContent ?? '';
    const state = document.getElementById('state')?.textContent ?? '';
    const controls = document.querySelectorAll('.control');
    return healthEl.includes('"status": "ok"') &&
      state.includes('placeholder-none') &&
      controls.length === 8;
  }, { timeout: 5000 });
  const healthText = (await page.textContent('#healthz')) ?? '';
  const stateText = (await page.textContent('#state')) ?? '';
  const initialState = JSON.parse(stateText);
  const expectedBeatCount = initialState.semantic.events.beatCount + 1;
  assert.match(healthText, /"status": "ok"/, 'debug shows ok health');
  assert.match(stateText, /placeholder-none/, 'debug shows placeholder model');
  const checkHealth = (await page.textContent('#check-health')) ?? '';
  const checkState = (await page.textContent('#check-state')) ?? '';
  const checkControls = (await page.textContent('#check-controls')) ?? '';
  assert.match(checkHealth, /GET \/healthz -> ok/);
  assert.match(checkState, /state reported/);
  assert.match(checkControls, /semantic controls -> 8 available/);

  for (const id of CONTROL_IDS) {
    await page.waitForSelector(`#range-${id}`);
    await page.waitForSelector(`#value-${id}`);
  }

  // M3 dashboard surface: viewport renderer = placeholder, model check ok,
  // mapped-params panel explains placeholder mode.
  await assertDashboardBasics(page, 'renderer: placeholder');
  const checkModel = (await page.textContent('#check-model')) ?? '';
  const checkViewport = (await page.textContent('#check-viewport')) ?? '';
  assert.match(checkModel, /placeholder model/);
  assert.match(checkViewport, /placeholder/);
  const mappedNote = (await page.textContent('#mapped-note')) ?? '';
  assert.match(mappedNote, /placeholder mode/);
  const viewportNote = (await page.textContent('#viewport-note')) ?? '';
  assert.match(viewportNote, /placeholder renderer/);

  // The placeholder canvas actually draws (non-blank pixels).
  const drawn = await page.evaluate(() => {
    const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('viewport'));
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonBlank = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) nonBlank += 1;
    }
    return nonBlank;
  });
  assert.ok(drawn > 1000, 'placeholder viewport must draw visible content');

  // Presets round-trip through server state.
  await page.click('button[data-preset="Smile"]');
  await page.waitForFunction(() => {
    const text = document.getElementById('state')?.textContent ?? '';
    return text.includes('"smile": 1');
  });
  await page.click('button[data-preset="Left"]');
  await page.waitForFunction(() => {
    const text = document.getElementById('state')?.textContent ?? '';
    return text.includes('"angleX": -30');
  });
  await page.click('button[data-preset="Neutral"]');
  await page.waitForFunction(() => {
    const text = document.getElementById('state')?.textContent ?? '';
    return text.includes('"smile": 0') && text.includes('"angleX": 0');
  });

  // M2 round-trip kept: direct slider update, reset, beat.
  await page.locator('#range-angleX').evaluate((element) => {
    const input = /** @type {HTMLInputElement} */ (element);
    input.value = '30';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => {
    const text = document.getElementById('state')?.textContent ?? '';
    return text.includes('"angleX": 30');
  });
  assert.equal(await page.inputValue('#value-angleX'), '30');

  await page.click('#reset');
  await page.waitForFunction(() => {
    const text = document.getElementById('state')?.textContent ?? '';
    return text.includes('"angleX": 0');
  });
  assert.equal(await page.inputValue('#value-angleX'), '0');

  await page.click('#beat');
  await page.waitForFunction((expected) => {
    const text = document.getElementById('state')?.textContent ?? '';
    const message = document.getElementById('message')?.textContent ?? '';
    return text.includes(`"beatCount": ${expected}`) &&
      message.includes(`beat event #${expected} recorded`);
  }, expectedBeatCount);
  assert.match(
    (await page.textContent('#message')) ?? '',
    new RegExp(`beat event #${expectedBeatCount} recorded`)
  );

  assert.deepEqual(consoleErrors, [], 'no fatal console errors');

  console.log('SCENARIO 1 (placeholder dashboard) PASS');
  console.log('  /            -> ' + statusText.trim());
  console.log('  /debug       -> ' + checkHealth.trim() + ' | ' + checkState.trim());
  console.log('  viewport     -> ' + checkViewport.trim());
  console.log('  presets      -> smile/left/neutral round-trip; controls/reset/beat kept');
  console.log('  console errors: 0');
}

// ---------------------------------------------------------------------
// Scenario 2: fixture cubism model + stub SDK end-to-end in the browser.
// ---------------------------------------------------------------------

function makeFixtureModel() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-smoke-model-'));
  const modelId = 'smoke-fixture';
  const modelDir = path.join(root, 'models', modelId);
  fs.mkdirSync(modelDir, { recursive: true });
  fs.writeFileSync(
    path.join(modelDir, 'manifest.json'),
    JSON.stringify({
      modelId,
      displayName: 'Smoke Fixture',
      kind: 'cubism',
      model3: 'smoke.model3.json',
      mapping: FIXTURE_MAPPING,
    }, null, 2)
  );
  fs.writeFileSync(
    path.join(modelDir, 'smoke.model3.json'),
    JSON.stringify({ Version: 3, FileReferences: { Moc: 'smoke.moc3' } })
  );
  return { root, modelsDir: path.join(root, 'models'), modelId };
}

function installStubSdk(publicDir) {
  const sdkDir = path.join(publicDir, 'vendor', 'live2d');
  fs.mkdirSync(sdkDir, { recursive: true });
  fs.writeFileSync(path.join(sdkDir, 'live2dcubismcore.min.js'), STUB_SDK_CORE);
  fs.writeFileSync(path.join(sdkDir, 'live2d.min.js'), STUB_SDK_FRAMEWORK);
  return sdkDir;
}

async function waitForHealth(base, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/healthz`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('fixture server did not become healthy within ' + timeoutMs + 'ms');
}

async function scenarioCubism() {
  const fixture = makeFixtureModel();
  const publicDir = path.join(RUNTIME_DIR, 'public');
  const sdkDir = installStubSdk(publicDir);
  const port = 9000 + Math.floor(Math.random() * 500);
  const base = `http://127.0.0.1:${port}`;

  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: RUNTIME_DIR,
    env: {
      ...process.env,
      AVATAR_BIND: '127.0.0.1',
      AVATAR_PORT: String(port),
      AVATAR_MODEL_ID: fixture.modelId,
      AVATAR_MODELS_DIR: fixture.modelsDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  child.stdout.on('data', (d) => { serverLog += String(d); });
  child.stderr.on('data', (d) => { serverLog += String(d); });

  const { browser, page, consoleErrors } = await createBrowser();
  try {
    await waitForHealth(base, 10000);

    // Read-only model contract served by the registry.
    const modelRes = await page.request.get(`${base}/api/model`);
    assert.equal(modelRes.status(), 200);
    const modelInfo = await modelRes.json();
    assert.equal(modelInfo.model.kind, 'cubism');
    assert.equal(modelInfo.model.ready, true);
    assert.equal(modelInfo.sdk.available, true);
    assert.equal(modelInfo.manifest.model3, 'smoke.model3.json');

    const stateRes = await page.request.get(`${base}/api/state`);
    const state = await stateRes.json();
    assert.equal(state.model.kind, 'cubism');
    assert.equal(state.mapped.ParamEyeLOpen, 1, 'defaults: eyes open');

    // Dashboard activates the cubism renderer against the stub SDK.
    const debugRes = await page.goto(`${base}/debug`);
    assert.ok(debugRes, 'debug navigation failed');
    assert.equal(debugRes.status(), 200);
    await page.waitForFunction(() => {
      const note = document.getElementById('viewport-note')?.textContent ?? '';
      return note.includes('cubism renderer');
    }, { timeout: 5000 });
    await assertDashboardBasics(page, 'cubism');

    // Renderer reaches the ready state and applies the shared mapping.
    await page.waitForFunction(() => {
      const r = /** @type {any} */ (window).__avatarRenderer;
      return r && r.status().state === 'ready';
    }, { timeout: 5000 });
    await page.waitForFunction(() => {
      const r = /** @type {any} */ (window).__avatarRenderer;
      return r && Object.keys(r.status().appliedParameters).length >= 8;
    }, { timeout: 5000 });

    // Stub model received parameter sets from the mapping engine.
    await page.waitForFunction(() => {
      const calls = /** @type {any} */ (window).__stubModelCalls || [];
      return calls.some((c) => c.id === 'ParamEyeLOpen' && c.value === 1);
    });

    // Control round-trip: blink closed -> eye open parameter becomes 0.
    await page.locator('#range-blink').evaluate((element) => {
      const input = /** @type {HTMLInputElement} */ (element);
      input.value = '1';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => {
      const calls = /** @type {any} */ (window).__stubModelCalls || [];
      return calls.some((c) => c.id === 'ParamEyeLOpen' && c.value === 0);
    });

    // Read-only mapped parameters table reflects the same values.
    await page.waitForFunction(() => {
      const rows = document.querySelectorAll('#mapped-params tbody tr');
      const text = document.querySelector('#mapped-params tbody')?.textContent ?? '';
      return rows.length >= 8 && text.includes('ParamEyeLOpen');
    });

    assert.deepEqual(consoleErrors, [], 'no fatal console errors in cubism scenario');
    console.log('SCENARIO 2 (fixture cubism renderer) PASS');
    console.log('  model        -> cubism ready (fixture manifest + stub SDK)');
    console.log('  mapping      -> shared module -> setParameterValueById round-trip');
    console.log('  mapped table -> read-only rows for 8+ parameters');
    console.log('  console errors: 0');
  } finally {
    await browser.close();
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    fs.rmSync(sdkDir, { recursive: true, force: true });
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

async function main() {
  const { browser, page, consoleErrors } = await createBrowser();
  try {
    await scenarioPlaceholder(browser, page, consoleErrors);
  } finally {
    await browser.close();
  }
  await scenarioCubism();
  console.log('BROWSER SMOKE PASS');
}

main().catch(async (err) => {
  console.error('BROWSER SMOKE FAIL:', err.message);
  console.error(err.stack ? err.stack.split('\n').slice(0, 6).join('\n') : '');
  const page = /** @type {any} */ (global).__smokePage;
  if (page) {
    try {
      const dump = await page.evaluate(() => ({
        url: location.href,
        healthz: document.getElementById('healthz')?.textContent ?? '(missing)',
        state: (document.getElementById('state')?.textContent ?? '(missing)').slice(0, 400),
        checks: Array.from(document.querySelectorAll('#checks li')).map((li) => li.textContent),
        message: document.getElementById('message')?.textContent ?? '(missing)',
        modelStatus: document.getElementById('model-status')?.textContent ?? '(missing)',
        viewportNote: document.getElementById('viewport-note')?.textContent ?? '(missing)',
        mappedNote: document.getElementById('mapped-note')?.textContent ?? '(missing)',
        renderer: /** @type {any} */ (window).__avatarRenderer
          ? JSON.stringify(/** @type {any} */ (window).__avatarRenderer.status())
          : '(none)',
        viewport: (() => {
          const vp = /** @type {HTMLCanvasElement | null} */ (document.getElementById('viewport'));
          return vp ? { w: vp.width, h: vp.height } : '(missing)';
        })(),
      }));
      console.error('PAGE DUMP:', JSON.stringify(dump, null, 2));
    } catch (dumpError) {
      console.error('PAGE DUMP unavailable:', dumpError instanceof Error ? dumpError.message : String(dumpError));
    }
  }
  process.exit(1);
});
