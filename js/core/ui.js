/* ui.js — DOM helpers shared by every view: query shortcuts, display-currency
 * formatting, the modal, toasts and a few markup builders.
 */

(function (ST) {
'use strict';

const U = ST.util, M = ST.money;

const $  = function (sel, root) { return (root || document).querySelector(sel); };
const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

function settings() { return ST.app.state.settings; }
function region() { return REGION_BY_CODE[settings().region] || REGION_BY_CODE.US; }

/* a USD figure in the display currency */
function usd(v, opts) { return M.fmtMoney(M.fromUsd(v, settings().currency), settings().currency, opts); }
/* an amount in its own currency, re-expressed in the display currency */
function amt(amount, cur, opts) { return usd(M.toUsd(amount, cur), opts); }

/* ── toast ── */
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.hidden = true; }, 2800);
}

/* ── modal ── */
let returnFocus = null;
let dirty = false;
let onClose = null;

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';

function openModal(title, bodyHtml, opts) {
  const o = opts || {};
  /* a modal opened from inside another keeps the original trigger to return to */
  if ($('#modal').hidden) returnFocus = document.activeElement;
  dirty = false;
  onClose = o.onClose || null;
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  $('#modal').firstElementChild.classList.toggle('wide', !!o.wide);
  $('#modal').hidden = false;
  document.body.classList.add('modal-open');
  const first = $('#modalBody').querySelector(o.focus || FOCUSABLE);
  (first || $('#modalClose')).focus();
  return $('#modalBody');
}

/* force skips the "discard changes?" prompt — for saves, not for Escape */
function closeModal(force) {
  if ($('#modal').hidden) return;
  if (force !== true && dirty && !confirm('Discard your changes?')) return;
  dirty = false;
  const cb = onClose;
  onClose = null;
  $('#modal').hidden = true;
  $('#modalBody').innerHTML = '';
  document.body.classList.remove('modal-open');
  if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
  returnFocus = null;
  if (cb) cb();
}

function markDirty() { dirty = true; }

function trapFocus(e) {
  if (e.key !== 'Tab' || $('#modal').hidden) return;
  const items = $$(FOCUSABLE, $('#modal').firstElementChild);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function wireModal() {
  $('#modal').addEventListener('click', function (e) {
    if (e.target === this) return closeModal();
    if (e.target.closest('[data-close]')) return closeModal();
  });
  $('#modalClose').addEventListener('click', function () { closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
    trapFocus(e);
  });
}

/* ── markup builders ── */

/* the bundled logo for a catalogue service id or a card issuer (js/data/logos.js) */
function logoSrc(key) {
  if (!key) return '';
  if (typeof LOGOS !== 'undefined' && Object.prototype.hasOwnProperty.call(LOGOS, key)) return LOGOS[key];
  if (typeof ISSUER_LOGOS !== 'undefined' && Object.prototype.hasOwnProperty.call(ISSUER_LOGOS, key)) return ISSUER_LOGOS[key];
  return '';
}

/* a tracked subscription's logo key: its catalogue service, or for a custom
   one, the service it is named after ("Verizon" → Verizon myPlan, "Xfinity" →
   Xfinity Internet), preferring one in the same category */
function subLogoKey(sub) {
  if (sub.serviceId && SERVICE_BY_ID[sub.serviceId]) return sub.serviceId;
  const name = String(sub.name || '').trim().toLowerCase();
  if (!name) return '';
  function score(s) {
    const n = s.name.toLowerCase(), co = s.company.toLowerCase();
    const m = n === name ? 3 : (n.indexOf(name + ' ') === 0 || co === name) ? 2 : 0;
    return m ? m + (s.group === sub.group ? 1 : 0) : 0;
  }
  let best = null, top = 0;
  CATALOG.forEach(function (s) { const v = score(s); if (v > top) { top = v; best = s; } });
  return best ? best.id : '';
}

function initialsTile(name, color, size) {
  const s = size ? ' style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.36) + 'px;background:' + U.safeColor(color) + '"'
                 : ' style="background:' + U.safeColor(color) + '"';
  return '<span class="logo" aria-hidden="true"' + s + '>' + U.esc(U.initials(name)) + '</span>';
}

/* the real logo on a white tile when one is bundled, the coloured initials otherwise */
function logo(name, color, size, key) {
  const src = logoSrc(key);
  if (!src) return initialsTile(name, color, size);
  return '<span class="logo logo-img" aria-hidden="true" data-name="' + U.esc(name) + '" data-color="' + U.esc(U.safeColor(color)) + '"' +
    (size ? ' style="width:' + size + 'px;height:' + size + 'px"' : '') + '>' +
    '<img src="' + U.esc(src) + '" alt="" loading="lazy" decoding="async"></span>';
}

/* a logo file that fails to load (cleared cache while offline, say) falls back to initials */
document.addEventListener('error', function (e) {
  const img = e.target;
  const parent = img && img.tagName === 'IMG' && img.parentNode && img.parentNode.classList ? img.parentNode : null;
  if (parent && parent.classList.contains('cc-badge')) { parent.remove(); return; }
  const tile = parent && parent.classList.contains('logo-img') ? parent : null;
  if (!tile) return;
  const size = parseInt(tile.style.width, 10) || 0;
  tile.outerHTML = initialsTile(tile.getAttribute('data-name') || '', tile.getAttribute('data-color'), size);
}, true);

function dot(color) {
  return '<span class="dot" aria-hidden="true" style="background:' + U.safeColor(color) + '"></span>';
}

/* the small logo for a calendar or list entry: the subscription's own, the card
   issuer's, or the coloured dot when there is none */
function eventLogo(state, ref, color, size) {
  let key = '', name = '';
  if (ref && ref.type === 'sub') {
    const s = state.subs.filter(function (x) { return x.id === ref.id; })[0];
    if (s) { key = subLogoKey(s); name = s.name; }
  } else if (ref && ref.type === 'card') {
    const c = state.cards.filter(function (x) { return x.id === ref.id; })[0];
    const d = c && c.cardId && typeof CARD_BY_ID !== 'undefined' ? CARD_BY_ID[c.cardId] : null;
    if (d) { key = d.issuer; name = d.issuer; }
  }
  return logoSrc(key) ? logo(name, color, size || 24, key) : dot(color);
}

function stat(label, valueHtml, note, cls) {
  return '<div class="stat"><div class="stat-label">' + U.esc(label) + '</div>' +
    '<div class="stat-value' + (cls ? ' ' + cls : '') + '">' + valueHtml + '</div>' +
    '<div class="stat-note">' + (note || '') + '</div></div>';
}

function empty(msg, actionHtml) {
  return '<div class="empty"><p>' + msg + '</p>' + (actionHtml || '') + '</div>';
}

/* a horizontal bar, width as a fraction 0..1 */
function bar(frac, cls) {
  const w = Math.max(0, Math.min(1, frac || 0)) * 100;
  return '<span class="bar ' + (cls || '') + '" aria-hidden="true"><span style="width:' + w.toFixed(1) + '%"></span></span>';
}

function optionList(items, selected) {
  return items.map(function (it) {
    return '<option value="' + U.esc(it.value) + '"' + (String(it.value) === String(selected) ? ' selected' : '') + '>' +
      U.esc(it.label) + '</option>';
  }).join('');
}

function currencyOptions(selected) {
  return optionList(Object.keys(CURRENCIES).sort().map(function (c) {
    return { value: c, label: c + ' — ' + CURRENCIES[c].name };
  }), selected);
}

function spendCatOptions(selected, opts) {
  const o = opts || {};
  const roots = SPEND_CATS.filter(function (c) { return !c.parent; });
  return roots.map(function (r) {
    const kids = o.rootsOnly ? [] : SPEND_CATS.filter(function (c) { return c.parent === r.id; });
    return '<option value="' + r.id + '"' + (r.id === selected ? ' selected' : '') + '>' + U.esc(r.name) + '</option>' +
      kids.map(function (k) {
        return '<option value="' + k.id + '"' + (k.id === selected ? ' selected' : '') + '>   ' + U.esc(k.name) + '</option>';
      }).join('');
  }).join('');
}

/* download a text file the browser builds — no server involved */
function download(filename, text, type) {
  const blob = new Blob([text], { type: type || 'text/plain' });
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

ST.ui = { $: $, $$: $$, settings: settings, region: region, usd: usd, amt: amt, toast: toast,
          openModal: openModal, closeModal: closeModal, markDirty: markDirty, wireModal: wireModal,
          logo: logo, logoSrc: logoSrc, subLogoKey: subLogoKey, eventLogo: eventLogo,
          dot: dot, stat: stat, empty: empty, bar: bar, optionList: optionList,
          currencyOptions: currencyOptions, spendCatOptions: spendCatOptions, download: download };

})(window.ST = window.ST || {});
