const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { load } = require('./load');

const ROOT = path.join(__dirname, '..');

function logos() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/logos.js'), 'utf8') + ';this.L = LOGOS; this.I = ISSUER_LOGOS;', ctx);
  return { services: ctx.L, issuers: ctx.I };
}

test('every bundled logo is a small PNG that exists', () => {
  const { services, issuers } = logos();
  const all = Object.assign({}, services, issuers);
  assert.ok(Object.keys(services).length >= 100, 'most services have a logo');
  for (const [key, file] of Object.entries(all)) {
    assert.match(file, /^logos\/[a-z0-9-]+\.png$/, key + ' path');
    const buf = fs.readFileSync(path.join(ROOT, file));
    assert.equal(buf.slice(1, 4).toString(), 'PNG', key + ' is a PNG');
    assert.ok(buf.length < 24 * 1024, key + ' is under 24 KB (' + buf.length + ')');
  }
});

test('logo keys are catalogue services and card issuers', () => {
  const { services, issuers } = logos();
  const ctx = load();
  const catalog = ctx.get('SERVICE_BY_ID');
  const cardIssuers = new Set(ctx.get('CARDS').map(c => c.issuer));
  Object.keys(services).forEach(id => assert.ok(catalog[id], id + ' is a catalogue service'));
  Object.keys(issuers).forEach(name => assert.ok(cardIssuers.has(name), name + ' issues a card'));
  cardIssuers.forEach(name => assert.ok(issuers[name], name + ' has a logo'));
});

test('no stray files in logos/', () => {
  const { services, issuers } = logos();
  const listed = new Set(Object.values(services).concat(Object.values(issuers)).map(f => path.basename(f)));
  fs.readdirSync(path.join(ROOT, 'logos')).forEach(f => assert.ok(listed.has(f), f + ' is listed in js/data/logos.js'));
});
