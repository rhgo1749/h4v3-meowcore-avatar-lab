'use strict';

/**
 * Headless browser smoke test for the Avatar Runtime (PR-001).
 *
 * Reproducible from the repository:
 *   cd runtime
 *   npm install
 *   npx playwright install chromium        # one-time browser download
 *   npm start &                            # server on 127.0.0.1:8930
 *   npm run smoke:browser
 *
 * Verifies: / and /debug load, no fatal console errors, and the UI-reported
 * runtime state agrees with /healthz + /api/state (placeholder model).
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
    const t = document.getElementById('healthz')?.textContent ?? '';
    return t !== '(not fetched)' && !t.startsWith('(fetching');
  }, { timeout: 5000 });
  const healthText = (await page.textContent('#healthz')) ?? '';
  const stateText = (await page.textContent('#state')) ?? '';
  assert.match(healthText, /"status": "ok"/, 'debug shows ok health');
  assert.match(stateText, /placeholder-none/, 'debug shows placeholder model');
  const checkHealth = (await page.textContent('#check-health')) ?? '';
  const checkState = (await page.textContent('#check-state')) ?? '';
  assert.match(checkHealth, /GET \/healthz -> ok/);
  assert.match(checkState, /placeholder model reported/);

  assert.deepEqual(consoleErrors, [], 'no fatal console errors');

  console.log('BROWSER SMOKE PASS');
  console.log('  /            -> ' + statusText.trim());
  console.log('  /debug       -> ' + checkHealth.trim() + ' | ' + checkState.trim());
  console.log('  console errors: 0');
  await browser.close();
}

main().catch((err) => {
  console.error('BROWSER SMOKE FAIL:', err.message);
  process.exit(1);
});
