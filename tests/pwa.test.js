const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

test('the service worker caches every script, stylesheet and icon the page uses', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const shell = JSON.parse('[' + /const SHELL = \[([\s\S]*?)\];/.exec(sw)[1].replace(/'/g, '"') + ']');
  const used = [...html.matchAll(/(?:src|href)="((?:js|css|icons)\/[^"]+|manifest\.webmanifest)"/g)].map(m => m[1]);
  assert.ok(used.length > 20);
  used.forEach(f => assert.ok(shell.includes(f), f + ' is missing from sw.js SHELL'));
  shell.filter(f => f !== './').forEach(f => assert.ok(fs.existsSync(path.join(ROOT, f)), f + ' does not exist'));
});

test('the manifest points at icons that exist', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  assert.ok(m.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'));
  m.icons.forEach(i => assert.ok(fs.existsSync(path.join(ROOT, i.src)), i.src));
});
