/* Loads the app's classic scripts into one vm context, in page order, the way
   the browser does — top-level consts are shared between them and everything
   else hangs off window.ST. No DOM: only the pure logic files are loaded. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

const PURE = [
  'js/data/regions.js',
  'js/data/catalog.js',
  'js/data/spending.js',
  'js/data/cards.js',
  'js/data/gemini-models.js',
  'js/core/util.js',
  'js/core/money.js',
  'js/core/dates.js',
  'js/core/pricing.js',
  'js/core/store.js',
  'js/core/ledger.js',
  'js/core/pricewatch.js',
  'js/core/cardvalue.js',
  'js/core/csv.js',
  'js/core/budgets.js',
  'js/core/advisor.js',
  'js/core/insights.js',
  'js/core/ics.js',
  'js/core/sync.js',
  'js/core/gemini.js',
  'js/core/vault.js',
  'js/core/lock.js',
  'js/cloud/account.js'
];

function memoryStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    dump: () => Object.fromEntries(m)
  };
}

function load(opts) {
  const o = opts || {};
  const storage = memoryStorage();
  const ctx = { console, localStorage: storage, setTimeout, clearTimeout, Date, Intl, TextEncoder, TextDecoder, crypto: globalThis.crypto, btoa, atob, fetch: globalThis.fetch };
  ctx.window = ctx;
  vm.createContext(ctx);
  PURE.forEach(f => {
    const file = path.join(ROOT, f);
    if (!fs.existsSync(file)) return;          /* later phases add files */
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: f });
  });
  if (o.today) ctx.ST.dates.setToday(o.today);
  /* expose the data-file consts the way a later <script> sees them */
  ctx.get = name => vm.runInContext(name, ctx);
  ctx.storage = storage;
  return ctx;
}

module.exports = { load, memoryStorage };

/* values built inside the vm carry its own Object/Array prototypes, which
   deepStrictEqual treats as different — compare through JSON instead */
module.exports.plain = x => JSON.parse(JSON.stringify(x));
