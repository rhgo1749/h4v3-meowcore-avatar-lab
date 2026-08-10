'use strict';

/**
 * Public-surface XSS guard (PR-001 rework round 1).
 *
 * The / status line will later include exported model metadata (model id,
 * version). Those strings must never be composed into the DOM through
 * innerHTML — only textContent/DOM nodes. This test fails loudly if a
 * future edit reintroduces innerHTML into any public page.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDir = path.join(__dirname, '..', 'public');

test('public pages never build DOM from innerHTML', () => {
  const pages = fs
    .readdirSync(publicDir)
    .filter((f) => f.endsWith('.html'))
    .sort();
  assert.ok(pages.length >= 2, 'expected at least index.html and debug.html');
  for (const file of pages) {
    const html = fs.readFileSync(path.join(publicDir, file), 'utf8');
    assert.doesNotMatch(
      html,
      /innerHTML/,
      `${file} must render dynamic state via textContent/DOM nodes only`
    );
  }
});
