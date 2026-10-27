/* store.js — the saved state: its shape, cleaning, migration, persistence,
 * import and export.
 *
 * v1 (subtrackr.v1) held subscriptions and settings side by side. v2 adds
 * cards, expenses and budgets, and nests the settings. The first load after an
 * upgrade copies v1 across and leaves the v1 key in place as a backup.
 *
 * Saved data can be hand-edited, imported from an old export, or written by a
 * future version, so every record goes through a whitelist that pins each field
 * to a known-good value before anything else reads it.
 */

(function (ST) {
'use strict';

const U = ST.util, D = ST.dates;

const KEY = 'subtrackr.v2';
const KEY_V1 = 'subtrackr.v1';
const VERSION = 2;

/* how often a card credit refills */
const CADENCES = ['monthly', 'quarterly', 'semiannual', 'yearly', 'cardyear', 'once'];

function freshState() {
  return {
    version: VERSION,
    settings: { region: 'US', currency: 'USD', theme: 'auto' },
    subs: [], cards: [], expenses: [], budgets: [],
    compare: [], csvMappings: {}, dismissed: {},
    fx: null            /* { rates: {...}, at: epochMs } */
  };
}

function arr(v) { return Array.isArray(v) ? v.filter(U.isObj) : []; }
function date(v) { return D.parseYmd(v) ? String(v) : ''; }
function cur(v, fallback) { return CURRENCIES[v] ? v : (fallback || 'USD'); }
function flag(v) { return v !== false && v !== 'false'; }

function cleanSettings(s) {
  const o = U.isObj(s) ? s : {};
  const region = REGION_BY_CODE[o.region] ? o.region : 'US';
  return {
    region: region,
    currency: cur(o.currency, REGION_BY_CODE[region].cur),
    theme: ['auto', 'light', 'dark'].indexOf(o.theme) === -1 ? 'auto' : o.theme
  };
}

/* { 'YYYY-MM': count } — used for cost per use */
function cleanUses(v) {
  const out = {};
  if (!U.isObj(v)) return out;
  Object.keys(v).forEach(function (k) {
    if (/^\d{4}-\d{2}$/.test(k)) out[k] = Math.round(U.num(v[k], 0));
  });
  return out;
}

function cleanSub(s) {
  const q = U.isObj(s.quoted) && isFinite(Number(s.quoted.amount)) && CURRENCIES[s.quoted.cur] ? s.quoted : null;
  return {
    id: s.id ? String(s.id) : U.uid(),
    serviceId: U.str(s.serviceId),
    tierName: U.str(s.tierName),
    name: U.str(s.name).trim() || 'Untitled',
    company: U.str(s.company),
    group: GROUP_BY_ID[s.group] ? s.group : '',
    color: U.safeColor(s.color),
    amount: U.num(s.amount, 0),
    cur: cur(s.cur),
    cycle: ST.money.CYCLE_BY_ID[s.cycle] ? s.cycle : 'monthly',
    nextDate: date(s.nextDate),
    notes: U.str(s.notes),
    /* an export edited by hand can carry "false" — a truthy string */
    active: flag(s.active),
    benefits: Array.isArray(s.benefits) ? s.benefits.map(String) : [],
    paidWith: U.str(s.paidWith),
    trialEnds: date(s.trialEnds),
    shareCount: Math.min(20, Math.max(1, Math.round(U.num(s.shareCount, 1, 1)))),
    uses: cleanUses(s.uses),
    /* the catalogue price when this was added, so a later catalogue change shows up */
    quoted: q ? { amount: Number(q.amount), cur: q.cur, at: date(q.at), region: U.str(q.region) } : null
  };
}

const PERIOD_KEY = /^(\d{4}(-\d{2}|-Q[1-4]|-H[12])?|cy-\d{4}-\d{2}-\d{2}|once)$/;

function cleanCreditLog(v) {
  const out = {};
  if (!U.isObj(v)) return out;
  Object.keys(v).forEach(function (creditId) {
    if (!U.isObj(v[creditId])) return;
    const periods = {};
    Object.keys(v[creditId]).forEach(function (k) {
      if (PERIOD_KEY.test(k)) periods[k] = U.num(v[creditId][k], 0);
    });
    out[creditId] = periods;
  });
  return out;
}

function numMap(v, keyOk) {
  const out = {};
  if (!U.isObj(v)) return out;
  Object.keys(v).forEach(function (k) { if (!keyOk || keyOk(k)) out[k] = U.num(v[k], 0); });
  return out;
}

function cleanCard(c) {
  const b = U.isObj(c.bonus) ? c.bonus : null;
  return {
    id: c.id ? String(c.id) : U.uid(),
    cardId: U.str(c.cardId),
    name: U.str(c.name).trim() || 'Card',
    issuer: U.str(c.issuer),
    color: U.safeColor(c.color, '#4a5060'),
    fee: U.num(c.fee, 0),
    cur: cur(c.cur),
    feeDate: date(c.feeDate),
    openedAt: date(c.openedAt),
    /* what one reward point is worth, in hundredths of the card's currency */
    cpp: Math.min(100, U.num(c.cpp, 1)),
    customCredits: arr(c.customCredits).map(function (cr) {
      return { id: cr.id ? String(cr.id) : U.uid(), name: U.str(cr.name).trim() || 'Credit',
               amount: U.num(cr.amount, 0),
               cadence: CADENCES.indexOf(cr.cadence) === -1 ? 'yearly' : cr.cadence,
               covers: Array.isArray(cr.covers) ? cr.covers.map(String) : [] };
    }),
    customEarn: arr(c.customEarn).map(function (e) {
      return { cat: SPEND_CAT_BY_ID[e.cat] ? e.cat : 'other', x: U.num(e.x, 1) };
    }),
    creditLog: cleanCreditLog(c.creditLog),
    spend: numMap(c.spend, function (k) { return !!SPEND_CAT_BY_ID[k]; }),
    perks: numMap(c.perks),
    bonus: b ? { spent: U.num(b.spent, 0), deadline: date(b.deadline), done: b.done === true } : null,
    active: flag(c.active),
    notes: U.str(c.notes)
  };
}

function cleanExpense(e) {
  const amount = Number(e.amount);
  const tags = Array.isArray(e.tags) ? e.tags.map(function (t) { return String(t).trim(); }).filter(Boolean) : [];
  return {
    id: e.id ? String(e.id) : U.uid(),
    date: date(e.date) || D.todayStr(),
    /* negative is a refund */
    amount: isFinite(amount) ? amount : 0,
    cur: cur(e.cur),
    cat: SPEND_CAT_BY_ID[e.cat] ? e.cat : 'other',
    merchant: U.str(e.merchant).trim(),
    note: U.str(e.note),
    cardId: U.str(e.cardId),
    subId: U.str(e.subId),
    tags: Array.from(new Set(tags)),
    source: e.source === 'csv' ? 'csv' : 'manual'
  };
}

function cleanBudget(b) {
  return { id: b.id ? String(b.id) : U.uid(),
           cat: SPEND_CAT_BY_ID[b.cat] ? b.cat : 'other',
           amount: U.num(b.amount, 0), cur: cur(b.cur) };
}

/* two records sharing an id would make every edit hit both */
function uniqueIds(list) {
  const seen = {};
  return list.map(function (x) {
    if (seen[x.id]) x.id = U.uid();
    seen[x.id] = true;
    return x;
  });
}

function sanitise(raw) {
  const st = freshState();
  if (!U.isObj(raw)) return st;
  st.settings = cleanSettings(raw.settings);
  st.subs = uniqueIds(arr(raw.subs).map(cleanSub));
  st.cards = uniqueIds(arr(raw.cards).map(cleanCard));
  st.expenses = uniqueIds(arr(raw.expenses).map(cleanExpense));
  /* one budget per category; the last one written wins */
  const byCat = {};
  arr(raw.budgets).map(cleanBudget).forEach(function (b) { byCat[b.cat] = b; });
  st.budgets = Object.keys(byCat).map(function (k) { return byCat[k]; });
  st.compare = (Array.isArray(raw.compare) ? raw.compare : []).filter(function (id) { return SERVICE_BY_ID[id]; });
  if (U.isObj(raw.csvMappings)) {
    Object.keys(raw.csvMappings).forEach(function (k) {
      if (U.isObj(raw.csvMappings[k])) st.csvMappings[k] = raw.csvMappings[k];
    });
  }
  if (U.isObj(raw.dismissed)) {
    Object.keys(raw.dismissed).forEach(function (k) { if (raw.dismissed[k]) st.dismissed[k] = true; });
  }
  if (U.isObj(raw.fx) && U.isObj(raw.fx.rates) && isFinite(Number(raw.fx.at))) {
    const rates = {};
    Object.keys(raw.fx.rates).forEach(function (c) {
      const r = Number(raw.fx.rates[c]);
      if (CURRENCIES[c] && isFinite(r) && r > 0) rates[c] = r;
    });
    st.fx = { rates: rates, at: Number(raw.fx.at) };
  }
  return st;
}

/* any saved or exported shape → a clean v2 state */
function migrate(raw) {
  if (!U.isObj(raw)) return freshState();
  if (Number(raw.version) >= 2) return sanitise(raw);
  const st = sanitise({
    settings: { region: raw.region, currency: raw.currency, theme: raw.theme },
    subs: raw.subs, compare: raw.compare, fx: raw.fx
  });
  /* v1 never recorded the list price a subscription was added at. Assume the
     amount is it when the subscription came from the catalogue in the market's
     own currency, so a publisher's price rise since then can be spotted. */
  const local = REGION_BY_CODE[st.settings.region].cur;
  st.subs.forEach(function (s) {
    if (!s.quoted && SERVICE_BY_ID[s.serviceId] && s.tierName && s.cur === local && s.amount > 0) {
      s.quoted = { amount: s.amount, cur: s.cur, at: '', region: st.settings.region };
    }
  });
  return st;
}

function readJson(ls, key) {
  const raw = ls.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { console.warn('Unreadable ' + key + ', ignoring it.', e); return null; }
}

/* → { state, from: 'v2' | 'v1' | 'new' | 'blocked' } */
function load(storage) {
  let ls;
  try { ls = storage || window.localStorage; ls.getItem(KEY); } catch (e) { return { state: freshState(), from: 'blocked' }; }
  const v2 = readJson(ls, KEY);
  if (v2) return { state: migrate(v2), from: 'v2' };
  const v1 = readJson(ls, KEY_V1);
  if (v1) return { state: migrate(v1), from: 'v1' };
  return { state: freshState(), from: 'new' };
}

let saveTimer = null;
function saveNow(state, storage) {
  clearTimeout(saveTimer);
  try { (storage || window.localStorage).setItem(KEY, JSON.stringify(state)); return true; }
  catch (e) { return false; }
}
function save(state, onError) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () { if (!saveNow(state) && onError) onError(); }, 120);
}
/* a save still queued would write old data straight back after a wipe */
function cancelSave() { clearTimeout(saveTimer); }

function wipe(storage) {
  cancelSave();
  try { (storage || window.localStorage).removeItem(KEY); } catch (e) { /* storage blocked */ }
}

function bytesUsed(storage) {
  try { return ((storage || window.localStorage).getItem(KEY) || '').length; } catch (e) { return 0; }
}

function exportPayload(state) {
  return { app: 'Subtrackr', version: VERSION, exportedAt: new Date().toISOString(), state: state };
}

/* Accepts a v2 export, a v1 export, or a bare state of either. Throws when the
   file holds nothing the app can use. */
function parseImport(text) {
  const data = JSON.parse(text);
  const inner = U.isObj(data) && U.isObj(data.state) ? data.state : data;
  if (!U.isObj(inner) || !(Array.isArray(inner.subs) || Array.isArray(inner.cards) || Array.isArray(inner.expenses))) {
    throw new Error('Nothing to import in that file');
  }
  return migrate(inner);
}

/* Merge another state into this one: records with a matching id are replaced,
   new ones appended. Settings stay as they are. → counts */
function merge(target, incoming) {
  const counts = { added: 0, updated: 0 };
  ['subs', 'cards', 'expenses'].forEach(function (k) {
    incoming[k].forEach(function (rec) {
      const i = target[k].findIndex(function (x) { return x.id === rec.id; });
      if (i >= 0) { target[k][i] = rec; counts.updated++; } else { target[k].push(rec); counts.added++; }
    });
  });
  incoming.budgets.forEach(function (b) {
    const i = target.budgets.findIndex(function (x) { return x.cat === b.cat; });
    if (i >= 0) target.budgets[i] = b; else target.budgets.push(b);
  });
  Object.assign(target.csvMappings, incoming.csvMappings);
  return counts;
}

ST.store = { KEY: KEY, KEY_V1: KEY_V1, VERSION: VERSION, CADENCES: CADENCES,
             freshState: freshState, sanitise: sanitise, migrate: migrate, load: load,
             save: save, saveNow: saveNow, cancelSave: cancelSave, wipe: wipe, bytesUsed: bytesUsed,
             exportPayload: exportPayload, parseImport: parseImport, merge: merge,
             cleanSub: cleanSub, cleanCard: cleanCard, cleanExpense: cleanExpense };

})(window.ST = window.ST || {});
