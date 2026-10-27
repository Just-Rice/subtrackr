/* app.js — state, routing, settings and boot. Views live in js/views/, pure
 * logic in js/core/. Routes are hash paths (#/subs/browse) so the back button
 * and bookmarks work, and the page still runs from the filesystem.
 */

(function (ST) {
'use strict';

const S = ST.store, M = ST.money, U = ST.util, UI = ST.ui;
const $ = UI.$, $$ = UI.$$;

const VIEWS = ['overview', 'subs', 'cards', 'spending', 'calendar', 'data'];

const app = ST.app = { state: null, route: null };

app.save = function () {
  S.save(app.state, function () { UI.toast('Could not save — browser storage is unavailable.'); });
};

app.replaceState = function (next) {
  app.state = next;
  M.setRates(next.fx && next.fx.rates);
};

function parseHash() {
  const h = (location.hash || '').replace(/^#\/?/, '');
  const parts = h.split('?')[0].split('/').filter(Boolean);
  return { view: VIEWS.indexOf(parts[0]) >= 0 ? parts[0] : 'overview', sub: parts[1] || '',
           params: new URLSearchParams(h.split('?')[1] || '') };
}

app.go = function (hash) {
  if (location.hash === hash) onRoute(true); else location.hash = hash;
};

app.render = function () {
  const r = app.route;
  VIEWS.forEach(function (v) { $('#view-' + v).hidden = v !== r.view; });
  $$('[data-route]').forEach(function (a) {
    if (a.dataset.route === r.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const view = ST.views[r.view];
  if (view) view.render(r);
  const s = app.state;
  $('#countSubs').textContent = s.subs.filter(function (x) { return x.active; }).length || '';
  $('#countCards').textContent = s.cards.filter(function (x) { return x.active; }).length || '';
};

function onRoute(focus) {
  app.route = parseHash();
  closeDrawer();
  app.render();
  if (focus && $('#modal').hidden) {
    window.scrollTo(0, 0);
    $('#main').focus({ preventScroll: true });
  }
}

/* follow an alert or calendar item into whatever it is about */
app.act = function (ref) {
  if (!ref) return;
  if (ref.type === 'sub') {
    const sub = ST.views.subs.findSub(ref.id);
    app.go('#/subs');
    if (sub) ST.views.subs.openForm(sub);
  } else if (ref.type === 'card') {
    app.go('#/cards');
    if (ST.views.cards.focus) ST.views.cards.focus(ref.id);
  } else if (ref.type === 'budget') {
    app.go('#/spending/budgets');
  } else if (ref.route) {
    app.go(ref.route);
  }
};

/* ── settings ── */

function buildSelects() {
  const s = app.state.settings;
  $('#regionSelect').innerHTML = REGIONS.slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
    .map(function (r) {
      return '<option value="' + r.code + '"' + (r.code === s.region ? ' selected' : '') + '>' +
        r.flag + '  ' + U.esc(r.name) + '</option>';
    }).join('');
  $('#currencySelect').innerHTML = UI.currencyOptions(s.currency);
}

function applyTheme() {
  const t = app.state.settings.theme;
  document.documentElement.setAttribute('data-theme', t);
  $('#themeBtn').textContent = 'Theme: ' + t;
}

app.refreshChrome = function () { buildSelects(); applyTheme(); };

/* ── exchange rates ── */

function fxAgeHours() {
  const fx = app.state.fx;
  return fx && fx.at ? (Date.now() - fx.at) / 3600000 : Infinity;
}

app.refreshFx = function (manual) {
  if (!navigator.onLine) {
    if (manual) UI.toast('Offline — using the built-in rate table.');
    return Promise.resolve(false);
  }
  return fetch('https://open.er-api.com/v6/latest/USD')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      /* the service answers errors with a 200 and result: "error" */
      if (!data || data.result === 'error' || !data.rates) throw new Error('bad payload');
      const keep = {};
      Object.keys(CURRENCIES).forEach(function (c) {
        if (typeof data.rates[c] === 'number' && data.rates[c] > 0) keep[c] = data.rates[c];
      });
      app.state.fx = { rates: keep, at: Date.now() };
      M.setRates(keep);
      app.save();
      app.render();
      if (manual) UI.toast('Exchange rates updated.');
      return true;
    })
    .catch(function () {
      if (manual) UI.toast('Rate service unreachable — using the built-in table.');
      return false;
    });
};

/* ── phone drawer ── */

function openDrawer() {
  $('#side').classList.add('open');
  $('#drawerBackdrop').hidden = false;
  $('#moreBtn').setAttribute('aria-expanded', 'true');
  const first = $('#side .nav-link');
  if (first) first.focus();
}
function closeDrawer() {
  $('#side').classList.remove('open');
  $('#drawerBackdrop').hidden = true;
  $('#moreBtn').setAttribute('aria-expanded', 'false');
}

/* ── the "+ Add" chooser ── */

const ICON_PLUS = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

function openAddChooser() {
  const choices = [
    { id: 'catalogue', title: 'Subscription from the catalogue', body: 'Prices filled in for ' + UI.region().name + '.' },
    { id: 'custom', title: 'Custom subscription', body: 'Anything that isn\'t listed.' }
  ];
  if (ST.views.cards.openAdd) choices.push({ id: 'card', title: 'Credit card', body: 'Track its fee, credits and rewards.' });
  if (ST.views.spending.openExpense) choices.push({ id: 'expense', title: 'Expense', body: 'One-off spending, or import a statement.' });
  UI.openModal('Add', '<div class="choice-list">' + choices.map(function (c) {
    return '<button class="choice" type="button" data-choice="' + c.id + '">' + ICON_PLUS +
      '<span class="choice-text"><strong>' + U.esc(c.title) + '</strong><span>' + U.esc(c.body) + '</span></span></button>';
  }).join('') + '</div>');
}

function pickChoice(id) {
  UI.closeModal(true);
  if (id === 'catalogue') { app.go('#/subs/browse'); setTimeout(function () { $('#search').focus(); }, 0); }
  else if (id === 'custom') ST.views.subs.openForm(null);
  else if (id === 'card') { app.go('#/cards'); ST.views.cards.openAdd(); }
  else if (id === 'expense') { app.go('#/spending'); ST.views.spending.openExpense(); }
}

function wire() {
  window.addEventListener('hashchange', function () { onRoute(true); });

  $('#regionSelect').addEventListener('change', function (e) {
    const r = REGION_BY_CODE[e.target.value];
    if (!r) return;
    app.state.settings.region = r.code;
    app.state.settings.currency = r.cur;
    $('#currencySelect').value = r.cur;
    app.save(); app.render();
    UI.toast('Prices now quoted for ' + r.name + '.');
  });
  $('#currencySelect').addEventListener('change', function (e) {
    app.state.settings.currency = e.target.value; app.save(); app.render();
  });
  $('#themeBtn').addEventListener('click', function () {
    const t = app.state.settings.theme;
    app.state.settings.theme = t === 'auto' ? 'light' : t === 'light' ? 'dark' : 'auto';
    applyTheme(); app.save();
  });

  $('#moreBtn').addEventListener('click', function () {
    if ($('#side').classList.contains('open')) closeDrawer(); else openDrawer();
  });
  $('#drawerBackdrop').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('#side').classList.contains('open') && $('#modal').hidden) { closeDrawer(); $('#moreBtn').focus(); }
  });

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-add]')) openAddChooser();
  });
  $('#modalBody').addEventListener('click', function (e) {
    const c = e.target.closest('[data-choice]');
    if (c) pickChoice(c.dataset.choice);
  });
}

/* ── boot ── */

const loaded = S.load();
app.state = loaded.state;
M.setRates(app.state.fx && app.state.fx.rates);

app.refreshChrome();
UI.wireModal();
wire();
VIEWS.forEach(function (v) { if (ST.views[v] && ST.views[v].wire) ST.views[v].wire(); });
onRoute(false);

if (loaded.from === 'v1') {
  /* write v2 straight away; the v1 key stays behind as a backup */
  S.saveNow(app.state);
  UI.toast('Your subscriptions were carried over to the new version.');
} else if (loaded.from === 'blocked') {
  UI.toast('Browser storage is blocked here — nothing you add will be saved.');
}

if (fxAgeHours() > 12) app.refreshFx(false);
/* a tab left open for days would otherwise keep the rates it booted with */
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible' && fxAgeHours() > 12) app.refreshFx(false);
});

})(window.ST = window.ST || {});
