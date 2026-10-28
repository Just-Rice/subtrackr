/* views/data.js — export, import, erase, exchange rates and how pricing works. */

(function (ST) {
'use strict';

const U = ST.util, D = ST.dates, S = ST.store, UI = ST.ui;
const $ = UI.$, esc = U.esc;

function st() { return ST.app.state; }

let pendingImport = null;

function render() {
  const s = st();
  const bytes = S.bytesUsed();
  const fx = s.fx && s.fx.at
    ? (function () {
        const h = (Date.now() - s.fx.at) / 3600000;
        const when = h < 1 ? 'less than an hour ago' : h < 48 ? Math.round(h) + ' hours ago' : Math.round(h / 24) + ' days ago';
        return 'Live rates fetched ' + esc(when) + ' from open.er-api.com. ' + Object.keys(s.fx.rates).length + ' currencies cached in this browser.';
      })()
    : 'Using the built-in rate table. Rates are approximate and only affect the display currency, never a market\'s list price.';

  $('#dataRoot').innerHTML = '<div class="cols"><div class="col">' +
    (ST.account ? ST.account.cardHtml() : '') +
    (ST.lock ? ST.lock.cardHtml() : '') +
    '<section class="card"><div class="card-head"><h2>Storage</h2></div>' +
      '<dl class="kv">' +
        '<dt>Subscriptions</dt><dd>' + s.subs.length + '</dd>' +
        '<dt>Cards</dt><dd>' + s.cards.length + '</dd>' +
        '<dt>Expenses</dt><dd>' + s.expenses.length + '</dd>' +
        '<dt>Budgets</dt><dd>' + s.budgets.length + '</dd>' +
        '<dt>Size</dt><dd>' + (bytes ? (bytes / 1024).toFixed(1) + ' KB' : 'not yet written') + '</dd>' +
      '</dl>' +
      '<p class="muted" style="margin-top:12px">Clearing site data or using a private window will lose it — export a copy if it matters.</p>' +
      '<div class="row-btns">' +
        '<button class="btn" type="button" id="exportBtn">Export JSON</button>' +
        '<button class="btn" type="button" id="importBtn">Import JSON</button>' +
        '<input type="file" id="importFile" accept="application/json,.json" hidden>' +
        '<button class="btn btn-danger" type="button" id="wipeBtn">Erase everything</button>' +
      '</div></section>' +
    remindersHtml() +
    '</div><div class="col">' +
    (ST.ai ? ST.ai.cardHtml() : '') +
    (ST.sync ? ST.sync.cardHtml() : '') +
    '<section class="card"><div class="card-head"><h2>Exchange rates</h2></div>' +
      '<p class="muted" style="margin:0">' + fx + '</p>' +
      '<div class="row-btns"><button class="btn" type="button" id="fxRefresh">Refresh rates</button></div></section>' +
    '<section class="card"><div class="card-head"><h2>How pricing works</h2></div><div class="prose">' +
      '<p>Every catalogue price is the publisher\'s list price in the local currency of a market. Change <strong>Market</strong> and the same tier is re-quoted — Spotify Individual is priced in rupees in India and in dollars in the United States, and that is a real difference in what the publisher charges, not a currency conversion.</p>' +
      '<p>Where a publisher\'s exact local price isn\'t in the catalogue, the price is estimated from the US price and that market\'s typical price level for digital subscriptions, then converted. Estimates are marked <span class="est-tag">est.</span></p>' +
      '<p><strong>Show prices in</strong> only changes the currency the numbers are displayed in.</p>' +
      '<p>Card fees, credits and earn rates are a dated snapshot of each issuer\'s published terms. Check the issuer\'s site before you apply — they change often.</p>' +
    '</div></section></div></div>';
}

function remindersHtml() {
  const state = ST.app.reminderState();
  const status = {
    granted: 'On — you get a notification for trials ending, credits lapsing, bonus deadlines, fees and budgets when Subtrackr opens.',
    denied: 'Blocked in this browser\'s site settings.',
    unsupported: 'This browser cannot show notifications.',
    default: 'Off.'
  }[state];
  return '<section class="card"><div class="card-head"><h2>Reminders and app</h2></div>' +
    '<p class="muted" style="margin:0">' + status + ' Browsers only let a page remind you while it is open, so for reminders that always fire, ' +
      '<a href="#/calendar">export the calendar</a> into your phone\'s calendar app.</p>' +
    '<div class="row-btns">' +
      (state === 'default' ? '<button class="btn" type="button" id="remindOn">Turn on reminders</button>' : '') +
      (ST.app.canInstall() ? '<button class="btn" type="button" id="installBtn">Install as an app</button>' : '') +
      '<button class="btn" type="button" id="icsData">Export calendar (.ics)</button>' +
    '</div></section>';
}

function confirmImport(incoming) {
  pendingImport = incoming;
  const n = incoming.subs.length + incoming.cards.length + incoming.expenses.length;
  UI.openModal('Import ' + U.plural(n, 'record') + '?',
    '<p class="sub" style="margin-bottom:6px">The file holds ' + U.plural(incoming.subs.length, 'subscription') + ', ' +
      U.plural(incoming.cards.length, 'card') + ' and ' + U.plural(incoming.expenses.length, 'expense') + '.</p>' +
    '<p class="sub">You have ' + U.plural(st().subs.length + st().cards.length + st().expenses.length, 'record') + ' now. ' +
      '<strong>Merge</strong> adds the file\'s records and updates any with the same id. ' +
      '<strong>Replace</strong> discards what is here and takes the file\'s settings too.</p>' +
    '<div class="modal-foot">' +
      '<button class="btn" type="button" data-close>Cancel</button>' +
      '<button class="btn" type="button" data-import="merge">Merge</button>' +
      '<button class="btn btn-danger" type="button" data-import="replace">Replace</button>' +
    '</div>', { onClose: function () { pendingImport = null; } });
}

function applyImport(mode) {
  const incoming = pendingImport;
  if (!incoming) return;
  pendingImport = null;
  let msg;
  if (mode === 'replace') {
    ST.app.replaceState(incoming);
    msg = 'Replaced — ' + U.plural(incoming.subs.length, 'subscription') + ' now tracked.';
  } else {
    const c = S.merge(st(), incoming);
    msg = 'Merged — ' + c.added + ' new, ' + c.updated + ' updated.';
  }
  UI.closeModal(true);
  ST.app.save();
  ST.app.refreshChrome();
  ST.app.render();
  UI.toast(msg);
}

function wire() {
  $('#dataRoot').addEventListener('click', function (e) {
    const id = e.target.closest('button') && e.target.closest('button').id;
    if (id === 'exportBtn') {
      UI.download('subtrackr-' + D.todayStr() + '.json', JSON.stringify(S.exportPayload(st()), null, 2), 'application/json');
    } else if (id === 'importBtn') {
      $('#importFile').click();
    } else if (id === 'wipeBtn') {
      if (!confirm('Erase every subscription, card, expense and setting from this browser? This cannot be undone.')) return;
      S.wipe();
      if (ST.lock) { ST.lock.clear(); S.setLockKey(null); }
      ST.app.replaceState(S.freshState());
      ST.app.refreshChrome();
      ST.app.render();
      UI.toast('Everything erased.');
    } else if (id === 'fxRefresh') {
      ST.app.refreshFx(true);
    } else if (id === 'remindOn') {
      ST.app.enableReminders().then(function (p) {
        UI.toast(p === 'granted' ? 'Reminders on.' : 'Reminders were not allowed.');
        render();
      });
    } else if (id === 'installBtn') {
      ST.app.install();
    } else if (id === 'icsData') {
      ST.ics.exportFile(st());
    }
  });

  $('#dataRoot').addEventListener('change', function (e) {
    if (e.target.id !== 'importFile') return;
    const input = e.target;
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      input.value = '';
      const text = reader.result;
      if (ST.sync && ST.sync.isEncrypted(text)) {
        ST.sync.askPassphrase('Open the encrypted backup').then(function (p) { return ST.sync.decrypt(text, p); })
          .then(function (payload) { confirmImport(S.parseImport(JSON.stringify(payload))); })
          .catch(function (err) { if (err.message !== 'cancelled') UI.toast(err.message); });
        return;
      }
      let incoming;
      try { incoming = S.parseImport(text); }
      catch (err) { UI.toast('That file could not be read as a Subtrackr export.'); return; }
      confirmImport(incoming);
    };
    reader.onerror = function () { input.value = ''; UI.toast('That file could not be opened.'); };
    reader.readAsText(file);
  });

  $('#modalBody').addEventListener('click', function (e) {
    const b = e.target.closest('[data-import]');
    if (b) applyImport(b.dataset.import);
  });
  if (ST.sync) ST.sync.wire();
  if (ST.account) ST.account.wire();
  if (ST.lock) ST.lock.wire();
  if (ST.ai) ST.ai.wire();
}

ST.views = ST.views || {};
ST.views.data = { wire: wire, render: render, confirmImport: confirmImport };

})(window.ST = window.ST || {});
