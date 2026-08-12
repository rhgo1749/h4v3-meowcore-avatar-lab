'use strict';

/**
 * Headless browser smoke test for the Avatar Runtime (M2).
 *
 * Reproducible from the repository:
 *   cd runtime
 *   npm install
 *   npx playwright install chromium        # one-time browser download
 *   npm start &                            # server on 127.0.0.1:8930
 *   npm run smoke:browser
 *
 * Verifies: / and /debug load, no fatal console errors, semantic controls are
 * present, a control round-trip reaches server state, reset restores the
 * default, and beat is observable as a discrete event.
 */

const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const BASE = process.env.AVATAR_SMOKE_BASE || 'http://127.0.0.1:8930';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

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

  // Debug / validation surface.
  const debugRes = await page.goto(`${BASE}/debug`);
  assert.ok(debugRes, 'debug navigation failed');
  assert.equal(debugRes.status(), 200, 'debug HTTP 200');
  await page.waitForFunction(() => {
    const health = document.getElementById('healthz')?.textContent ?? '';
    const state = document.getElementById('state')?.textContent ?? '';
    const controls = document.querySelectorAll('.control');
    return health.includes('"status": "ok"') &&
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
  assert.match(checkState, /semantic state reported/);
  assert.match(checkControls, /semantic controls -> 8 available/);

  const controlIds = [
    'angleX', 'angleY', 'bodyX', 'blink', 'mouth', 'smile', 'squash', 'bounce'
  ];
  for (const id of controlIds) {
    await page.waitForSelector(`#range-${id}`);
    await page.waitForSelector(`#value-${id}`);
  }

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

  console.log('BROWSER SMOKE PASS');
  console.log('  /            -> ' + statusText.trim());
  console.log('  /debug       -> ' + checkHealth.trim() + ' | ' + checkState.trim());
  console.log('  controls     -> 8 controls, update/reset/beat round-trip');
  console.log('  console errors: 0');
  await browser.close();
}

main().catch((err) => {
  console.error('BROWSER SMOKE FAIL:', err.message);
  process.exit(1);
});
