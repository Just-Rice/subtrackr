/* views/subs.js — the Subscriptions tab: what you track, the catalogue, the
 * side-by-side comparison, and the add / edit form.
 */

(function (ST) {
'use strict';

const U = ST.util, M = ST.money, D = ST.dates, P = ST.pricing, L = ST.ledger, UI = ST.ui;
const $ = UI.$, $$ = UI.$$, esc = U.esc;

function st() { return ST.app.state; }
function reg() { return st().settings.region; }
function cur() { return st().settings.currency; }

let subFilter = 'active';
let catFilter = 'all';
let searchTerm = '';

function marketTag(svc) {
  if (!svc.markets) return '';
  return ' <span class="est-tag">' + svc.markets.map(function (m) {
    return (REGION_BY_CODE[m] || {}).flag || m;
  }).join(' ') + '</span>';
}

function cardName(id) {
  const c = st().cards.filter(function (x) { return x.id === id; })[0];
  return c ? c.name : '';
}

/* ─────────────────────────────  tracked  ───────────────────────────── */

function renderStats() {
  const subs = L.activeSubs(st());
  const perMonth = L.subsMonthlyUsd(st());
  const paused = st().subs.length - subs.length;
  const nexts = subs.map(function (s) { return { sub: s, date: L.nextCharge(s) }; })
    .filter(function (x) { return x.date; })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  const soonest = nexts[0];
  const biggest = subs.slice().sort(function (a, b) { return L.monthlyUsd(b) - L.monthlyUsd(a); })[0];

  $('#subStats').innerHTML = [
    UI.stat('Per month', UI.usd(perMonth), subs.length + ' active' + (paused ? ' · ' + paused + ' paused' : '')),
    UI.stat('Per year', UI.usd(perMonth * 12), 'Every active subscription, annualised'),
    UI.stat('Next charge', soonest ? UI.usd(L.chargeUsd(soonest.sub)) : '—',
      soonest ? esc(soonest.sub.name) + ' · ' + D.relDay(D.daysUntil(soonest.date)) : 'No renewal dates set'),
    UI.stat('Largest', biggest ? UI.usd(L.monthlyUsd(biggest)) : '—', biggest ? esc(biggest.name) + ' a month' : 'Nothing tracked')
  ].join('');

  $('#subsEyebrow').textContent = subs.length
    ? U.plural(subs.length, 'active subscription') + ' · priced for ' + UI.region().name + ', shown in ' + cur()
    : 'Nothing tracked yet — add one from the catalogue, or create a custom entry.';
}

function flagsFor(s) {
  const out = [];
  if (s.trialEnds && D.daysUntil(s.trialEnds) >= 0) out.push('<span class="tag tag-warn">Trial ends ' + esc(D.fmtDate(s.trialEnds, { day: 'numeric', month: 'short' })) + '</span>');
  if (s.shareCount > 1) out.push('<span class="tag">Split ' + s.shareCount + ' ways</span>');
  if (s.paidWith && cardName(s.paidWith)) out.push('<span class="tag">' + esc(cardName(s.paidWith)) + '</span>');
  if (ST.cardvalue) {
    const cov = ST.cardvalue.coverFor(st(), s);
    if (cov) out.push('<span class="tag tag-good">Covered by ' + esc(cov.card.name) + '</span>');
  }
  if (ST.priceWatch) {
    const ch = ST.priceWatch.changeFor(st(), s);
    if (ch) out.push('<span class="tag ' + (ch.diff > 0 ? 'tag-bad' : 'tag-good') + '">List price ' + (ch.diff > 0 ? 'up' : 'down') + '</span>');
  }
  if (s.uses && ST.advisor) {
    const cpu = ST.advisor.costPerUse(s);
    if (cpu) out.push('<span class="tag">' + UI.usd(cpu.usd) + ' a use</span>');
  }
  return out.length ? '<div class="sub-flags">' + out.join('') + '</div>' : '';
}

function renderSubList() {
  const host = $('#subList');
  let list = st().subs.slice();
  if (subFilter === 'active') list = list.filter(function (s) { return s.active; });
  if (subFilter === 'paused') list = list.filter(function (s) { return !s.active; });
  list.sort(function (a, b) { return L.monthlyUsd(b) - L.monthlyUsd(a); });

  if (!list.length) {
    host.innerHTML = UI.empty(subFilter === 'paused' ? 'Nothing paused.' : 'Nothing tracked yet.',
      '<a class="btn btn-primary" href="#/subs/browse">Browse the catalogue</a>');
    return;
  }

  host.innerHTML = list.map(function (s) {
    const cyc = M.cycle(s.cycle);
    const perMonth = L.monthlyUsd(s);
    const next = L.nextCharge(s);
    const grp = GROUP_BY_ID[s.group];
    return '<article class="sub-card' + (s.active ? '' : ' paused') + '" data-id="' + esc(s.id) + '">' +
      '<div class="sub-top">' + UI.logo(s.name, s.color) +
        '<div><div class="sub-name">' + esc(s.name) + '</div>' +
        '<div class="sub-tier">' + esc(s.tierName || 'Custom') + (grp ? ' · ' + esc(grp.name) : '') + '</div></div>' +
      '</div>' +
      '<div class="sub-price">' + UI.amt(s.amount, s.cur) +
        '<span class="tier-cycle"> ' + esc(cyc.label.toLowerCase()) + '</span></div>' +
      '<div class="sub-meta">' + (s.shareCount > 1 ? 'Your share ' : '') + UI.usd(perMonth) + ' a month · ' +
        UI.usd(perMonth * 12) + ' a year' + (next ? ' · renews ' + esc(D.fmtDate(next)) : '') + '</div>' +
      (s.notes ? '<div class="sub-meta">' + esc(s.notes) + '</div>' : '') +
      flagsFor(s) +
      '<div class="sub-actions">' +
        '<button class="btn btn-sm" type="button" data-act="edit">Edit</button>' +
        (SERVICE_BY_ID[s.serviceId] ? '<button class="btn btn-sm" type="button" data-act="similar">Compare similar</button>' : '') +
        (ST.priceWatch && ST.priceWatch.changeFor(st(), s) ? '<button class="btn btn-sm" type="button" data-act="price">Review price</button>' : '') +
        (ST.advisor ? '<button class="btn btn-sm" type="button" data-act="use" title="Count one use this month, for cost per use">+1 use</button>' : '') +
        '<button class="btn btn-sm" type="button" data-act="toggle">' + (s.active ? 'Pause' : 'Resume') + '</button>' +
        '<button class="btn btn-sm btn-danger" type="button" data-act="del">Remove</button>' +
      '</div></article>';
  }).join('');
}

/* Monthly cost by catalogue category — one measure, one hue, sorted, labelled. */
function renderChart() {
  const subs = L.activeSubs(st());
  const host = $('#chart');
  const tableHost = $('#chartTable');
  if (!subs.length) {
    host.innerHTML = UI.empty('Add a subscription to see where the money goes.');
    tableHost.innerHTML = '';
    return;
  }
  const byCat = {};
  subs.forEach(function (s) {
    const cat = s.group && CATEGORY_BY_GROUP[s.group] ? CATEGORY_BY_GROUP[s.group].name : 'Other';
    byCat[cat] = (byCat[cat] || 0) + L.monthlyUsd(s);
  });
  const rows = Object.keys(byCat).map(function (k) { return { name: k, usd: byCat[k] }; })
    .sort(function (a, b) { return b.usd - a.usd; });
  const max = rows[0].usd || 1;
  const rawTotal = U.sum(rows, function (r) { return r.usd; });
  /* everything tracked could legitimately be free — never divide by that */
  const total = rawTotal || 1;

  host.innerHTML = rows.map(function (r) {
    return '<div class="bar-item"><div class="bar-top"><span>' + esc(r.name) + '</span>' +
      '<span class="num">' + UI.usd(r.usd) + (rawTotal ? ' <span class="muted">' + Math.round(r.usd / total * 100) + '%</span>' : '') + '</span></div>' +
      UI.bar(r.usd / max) + '</div>';
  }).join('');

  tableHost.innerHTML = '<table><thead><tr><th>Category</th><th class="num">Per month</th>' +
    '<th class="num">Per year</th><th class="num">Share</th></tr></thead><tbody>' +
    rows.map(function (r) {
      return '<tr><td>' + esc(r.name) + '</td><td class="num">' + UI.usd(r.usd) + '</td>' +
        '<td class="num">' + UI.usd(r.usd * 12) + '</td>' +
        '<td class="num">' + (rawTotal ? Math.round(r.usd / total * 100) + '%' : '—') + '</td></tr>';
    }).join('') +
    '<tr><td><strong>Total</strong></td><td class="num"><strong>' + UI.usd(rawTotal) + '</strong></td>' +
    '<td class="num"><strong>' + UI.usd(rawTotal * 12) + '</strong></td><td class="num">' + (rawTotal ? '100%' : '—') + '</td></tr></tbody></table>';
}

function renderAdvice() {
  const host = $('#subAdvice');
  if (!ST.advisor) { host.innerHTML = ''; return; }
  const tips = ST.advisor.tips(st());
  if (!tips.length) { host.innerHTML = ''; return; }
  host.innerHTML = '<section class="card card-flush" style="margin-bottom:16px"><div class="card-head"><h2>Ways to save</h2>' +
    '<span class="muted">' + U.plural(tips.length, 'idea') + '</span></div><ul class="rows">' +
    tips.map(function (t) {
      return '<li class="row"><div class="row-main"><span class="row-title">' + esc(t.title) + '</span>' +
        '<span class="row-sub">' + esc(t.body) + '</span></div>' +
        (t.saveUsd ? '<span class="row-amt" style="color:var(--accent)">' + UI.usd(t.saveUsd) + '/yr</span>' : '') + '</li>';
    }).join('') + '</ul></section>';
}

/* ─────────────────────────────  catalogue  ───────────────────────────── */

function matchesSearch(svc) {
  if (!searchTerm) return true;
  const q = searchTerm.toLowerCase();
  const cat = CATEGORY_BY_GROUP[svc.group];
  const grp = GROUP_BY_ID[svc.group];
  const hay = [svc.name, svc.company, svc.blurb, cat ? cat.name : '', grp ? grp.name : '',
               svc.tiers.map(function (t) { return t.name; }).join(' ')].join(' ').toLowerCase();
  return hay.indexOf(q) !== -1;
}

function renderChips() {
  $('#catChips').innerHTML =
    '<button class="chip" type="button" data-cat="all" aria-pressed="' + (catFilter === 'all') + '">All categories</button>' +
    CATEGORIES.map(function (c) {
      return '<button class="chip" type="button" data-cat="' + c.id + '" aria-pressed="' + (catFilter === c.id) + '">' + esc(c.name) + '</button>';
    }).join('');
}

function renderCatalog() {
  const host = $('#catalogList');
  const region = UI.region();
  $('#browseRegionName').textContent = region.flag + ' ' + region.name;
  $('#catalogCount').textContent = CATALOG.length;

  const blocks = [];
  let shownCount = 0;

  CATEGORIES.forEach(function (cat) {
    if (catFilter !== 'all' && catFilter !== cat.id) return;
    const groupHtml = [];
    let catCount = 0;

    cat.groups.forEach(function (grp) {
      const all = CATALOG.filter(function (s) { return s.group === grp.id && matchesSearch(s); });
      const svcs = all.filter(function (s) { return P.availableHere(s, reg()); });
      const hidden = all.length - svcs.length;
      if (!svcs.length && !hidden) return;
      catCount += svcs.length;

      /* sorted by company, then by service name inside each company */
      const byCompany = {};
      svcs.forEach(function (s) { (byCompany[s.company] = byCompany[s.company] || []).push(s); });
      const companies = Object.keys(byCompany).sort(function (a, b) { return a.localeCompare(b); });

      const hiddenNote = hidden
        ? '<p class="muted" style="margin:-2px 0 10px">' + U.plural(hidden, 'provider') +
          ' hidden — not sold in ' + esc(region.name) + '. Carriers and broadband providers are national; switch market to see others.</p>'
        : '';

      groupHtml.push(
        '<div class="group-block"><div class="group-head">' + esc(grp.name) + '</div>' + hiddenNote +
        '<div class="company-cols">' +
        companies.map(function (co) {
          const cards = byCompany[co].sort(function (a, b) { return a.name.localeCompare(b.name); }).map(serviceCard).join('');
          return '<div class="company-block"><div class="company-head">' + esc(co) + '</div><div class="svc-grid">' + cards + '</div></div>';
        }).join('') + '</div></div>');
    });

    if (!groupHtml.length) return;
    shownCount += catCount;
    blocks.push('<section class="cat-block"><div class="cat-head"><h2>' + esc(cat.name) + '</h2>' +
      '<span class="cat-count">' + U.plural(catCount, 'service') + '</span></div>' + groupHtml.join('') + '</section>');
  });

  host.innerHTML = shownCount ? blocks.join('')
    : UI.empty('Nothing matches “' + esc(searchTerm) + '”. Try a company name, or create a custom subscription.');
}

function serviceCard(svc) {
  const cheap = P.cheapestPaidTier(svc, reg());
  const free = svc.tiers.some(function (t) { const p = P.tierPrice(t, reg()); return p && p.usd === 0; });
  let from = '<span class="na">not sold in this market</span>';
  if (cheap) {
    from = 'From <strong>' + UI.usd(cheap.usd) + '</strong><span class="tier-cycle">/mo</span>' +
      (cheap.price.exact ? '' : ' <span class="est-tag">est.</span>') +
      '<span class="tier-cycle"> · ' + esc(cheap.tier.name) + '</span>' +
      (free ? '<span class="tier-cycle"> · free tier too</span>' : '');
  } else if (free) {
    from = '<strong>Free</strong> tier only';
  }
  const tracked = st().subs.some(function (s) { return s.serviceId === svc.id; });
  return '<article class="svc-card" data-svc="' + esc(svc.id) + '">' +
    '<div class="svc-top">' + UI.logo(svc.name, svc.color, 32) +
      '<div><div class="svc-name">' + esc(svc.name) + (tracked ? ' <span class="tag tag-good">Tracked</span>' : '') + '</div>' +
      '<div class="svc-company">' + esc(svc.company) + ' · ' + U.plural(svc.tiers.length, 'tier') + '</div></div>' +
    '</div>' +
    '<p class="svc-blurb">' + esc(svc.blurb) + '</p>' +
    '<div class="svc-from">' + from + '</div>' +
    '<div class="svc-actions">' +
      '<button class="btn btn-sm btn-primary" type="button" data-act="add">Add</button>' +
      '<button class="btn btn-sm" type="button" data-act="tiers">All tiers</button>' +
      '<button class="btn btn-sm" type="button" data-act="similar">Compare to similar</button>' +
    '</div></article>';
}

/* ─────────────────────────────  tiers  ───────────────────────────── */

/* when this market's list price was last checked — anything without a date
   comes from the original snapshot */
const SNAPSHOT = '2025-09';
function asOfNote(svc) {
  const checked = svc.asOf && svc.asOf[reg()];
  const asOf = checked || SNAPSHOT;
  const months = (Number(D.todayStr().slice(0, 4)) - Number(asOf.slice(0, 4))) * 12 +
                 Number(D.todayStr().slice(5, 7)) - Number(asOf.slice(5, 7));
  return '<div class="tier-native">' + (checked ? 'List price checked ' : 'From the ') + esc(D.fmtMonth(asOf)) +
    (checked ? '' : ' snapshot') + (months > 12 ? ' <span class="est-tag">may be outdated</span>' : '') + '</div>';
}

function tierCards(svc, opts) {
  const o = opts || {};
  const cheap = P.cheapestPaidTier(svc, reg());
  const region = UI.region();
  return '<div class="tier-grid">' + svc.tiers.map(function (t) {
    const p = P.tierPrice(t, reg());
    const isCheapest = cheap && cheap.tier === t && o.markCheapest !== false;
    let priceHtml;
    if (!p) {
      priceHtml = '<div class="tier-price"><span class="na">not sold here</span></div>';
    } else if (p.usd === 0) {
      priceHtml = '<div class="tier-price">Free</div>';
    } else {
      const periodic = p.cycle.id !== 'monthly' && !t.billedYearly;
      priceHtml = '<div class="tier-price">' + UI.usd(p.usd) +
        '<span class="tier-cycle">' + (periodic ? ' per ' + (p.cycle.id === 'fourweekly' ? '28 days' : p.cycle.label.toLowerCase()) : '/mo') +
        (t.billedYearly ? ', billed yearly' : '') + '</span></div>';
      const native = p.local.cur !== cur()
        ? '<div class="tier-native">' + M.fmtMoney(p.local.amount, p.local.cur) + ' in ' + esc(p.local.cur) + '</div>' : '';
      const equiv = periodic
        ? '<div class="tier-native">' + UI.usd(p.monthlyUsd) + ' a month equivalent — ' + Math.round(p.cycle.perMonth * 12) + ' payments a year</div>' : '';
      const yearly = t.y && t.y[reg()] != null
        ? '<div class="tier-native">' + UI.amt(t.y[reg()], region.cur) + ' charged once a year</div>'
        : '<div class="tier-native">' + UI.usd(p.monthlyUsd * 12) + ' a year</div>';
      priceHtml += native + equiv + yearly + (p.exact ? asOfNote(svc) : '');
      if (!p.exact) priceHtml += '<div class="tier-native"><span class="est-tag">est.</span> not a published local price</div>';
    }
    return '<div class="tier-card' + (isCheapest ? ' is-cheapest' : '') + '">' +
      '<div class="tier-name">' + esc(t.name) +
        (isCheapest ? ' <span class="tag tag-good">cheapest paid</span>' : '') +
        (t.addon ? ' <span class="est-tag">add-on</span>' : '') +
        (t.only && !t.inheritedOnly ? ' <span class="est-tag">' + esc(t.only.join('/')) + ' only</span>' : '') + '</div>' +
      priceHtml +
      '<ul class="benefits">' + t.benefits.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' +
      (o.addable ? '<button class="btn btn-sm" type="button" data-add-tier="' + esc(t.name) + '" data-svc="' + esc(svc.id) + '">Track this tier</button>' : '') +
      '</div>';
  }).join('') + '</div>';
}

function openTiers(svcId) {
  const svc = SERVICE_BY_ID[svcId];
  if (!svc) return;
  UI.openModal(svc.name + ' — every tier',
    '<p class="sub" style="margin-bottom:14px">' + esc(svc.company) + ' · priced for ' + esc(UI.region().name) +
      ', shown in ' + esc(cur()) +
      (svc.site ? ' · <a href="https://' + esc(svc.site) + '" target="_blank" rel="noopener">' + esc(svc.site) + '</a>' : '') + '</p>' +
    tierCards(svc, { addable: true }) +
    '<div class="modal-foot"><button class="btn" type="button" data-close>Close</button>' +
    '<button class="btn btn-primary" type="button" data-similar="' + esc(svc.id) + '">Compare to similar services</button></div>', { wide: true });
}

/* ─────────────────────────────  compare  ───────────────────────────── */

function renderCompare() {
  const host = $('#compareOut');
  $('#comparePills').innerHTML = st().compare.map(function (id) {
    const s = SERVICE_BY_ID[id];
    if (!s) return '';
    return '<span class="pill">' + UI.dot(s.color) + esc(s.name) +
      '<button type="button" data-drop="' + esc(id) + '" aria-label="Remove ' + esc(s.name) + '">✕</button></span>';
  }).join('');

  if (!st().compare.length) {
    host.innerHTML = UI.empty('Nothing selected. Search above, or press “Compare to similar” on any service in the catalogue.');
    return;
  }

  const svcs = st().compare.map(function (id) { return SERVICE_BY_ID[id]; }).filter(Boolean);
  const summary = svcs.map(function (s) {
    const c = P.cheapestPaidTier(s, reg());
    return { svc: s, usd: c ? c.usd : null, tier: c ? c.tier : null, exact: c ? c.price.exact : true };
  }).sort(function (a, b) {
    if (a.usd == null) return 1;
    if (b.usd == null) return -1;
    return a.usd - b.usd;
  });

  const summaryTable =
    '<section class="card card-flush"><div class="card-head"><h2>Cheapest way in, ' + esc(UI.region().name) + '</h2></div>' +
    '<div class="table-wrap"><table><thead><tr><th>Service</th><th>Company</th><th>Entry tier</th>' +
    '<th class="num">Per month</th><th class="num">Per year</th><th class="num">Tiers</th></tr></thead><tbody>' +
    summary.map(function (r) {
      if (r.usd == null) {
        return '<tr><td>' + esc(r.svc.name) + '</td><td>' + esc(r.svc.company) + '</td><td colspan="4" class="na">not sold in this market</td></tr>';
      }
      return '<tr><td>' + UI.dot(r.svc.color) + ' ' + esc(r.svc.name) + '</td><td>' + esc(r.svc.company) + '</td><td>' + esc(r.tier.name) + '</td>' +
        '<td class="num">' + UI.usd(r.usd) + (r.exact ? '' : ' <span class="est-tag">est.</span>') + '</td>' +
        '<td class="num">' + UI.usd(r.usd * 12) + '</td><td class="num">' + r.svc.tiers.length + '</td></tr>';
    }).join('') + '</tbody></table></div></section>';

  const detail = svcs.map(function (s) {
    const grp = GROUP_BY_ID[s.group];
    return '<section class="cmp-svc"><div class="cmp-svc-head">' + UI.logo(s.name, s.color, 32) +
      '<div><h2>' + esc(s.name) + marketTag(s) + '</h2><div class="svc-company">' + esc(s.company) +
      (grp ? ' · ' + esc(grp.name) : '') +
      (s.site ? ' · <a href="https://' + esc(s.site) + '" target="_blank" rel="noopener">' + esc(s.site) + '</a>' : '') + '</div></div>' +
      '<button class="btn btn-sm" type="button" style="margin-left:auto" data-cmp-add="' + esc(s.id) + '">Track a tier</button></div>' +
      '<p class="svc-blurb" style="margin-bottom:10px">' + esc(s.blurb) + '</p>' + tierCards(s) + '</section>';
  }).join('');

  host.innerHTML = summaryTable + detail;
}

function compareSimilar(svcId) {
  const svc = SERVICE_BY_ID[svcId];
  if (!svc) return;
  const peers = CATALOG.filter(function (s) { return s.group === svc.group && P.availableHere(s, reg()); })
    .sort(function (a, b) {
      if (a.id === svc.id) return -1;
      if (b.id === svc.id) return 1;
      return a.company.localeCompare(b.company);
    })
    .slice(0, 8)
    .map(function (s) { return s.id; });
  st().compare = peers;
  ST.app.save();
  const grp = GROUP_BY_ID[svc.group];
  UI.toast('Comparing ' + peers.length + ' services' + (grp ? ' in ' + grp.name : '') + '.');
  ST.app.go('#/subs/compare');
}

/* ─────────────────────────────  add / edit  ───────────────────────────── */

function openForm(sub, presetSvcId, presetTierName) {
  const editing = !!sub;
  const svc = presetSvcId ? SERVICE_BY_ID[presetSvcId] : (sub && sub.serviceId ? SERVICE_BY_ID[sub.serviceId] : null);
  const region = UI.region();

  let draft;
  if (editing) {
    draft = JSON.parse(JSON.stringify(sub));
  } else if (svc) {
    const tier = (presetTierName && P.findTier(svc, presetTierName)) ||
      (P.cheapestPaidTier(svc, reg()) || {}).tier || svc.tiers[0];
    const ch = P.tierCharge(tier, reg());
    draft = ST.store.cleanSub({
      serviceId: svc.id, tierName: tier.name, name: svc.name, company: svc.company,
      group: svc.group, color: svc.color,
      amount: ch ? ch.amount : 0, cur: region.cur, cycle: ch ? ch.cycle : 'monthly',
      benefits: tier.benefits.slice(),
      quoted: ch ? { amount: ch.amount, cur: ch.cur, at: D.todayStr(), region: reg() } : null
    });
  } else {
    draft = ST.store.cleanSub({ name: '', color: '#2a78d6', cur: region.cur });
    draft.name = '';
  }

  const tierPickerHtml = svc ? (
    '<div class="field"><span class="label">Tier</span><div class="tier-picker" id="tierPicker">' +
    svc.tiers.map(function (t) {
      const p = P.tierPrice(t, reg());
      const unit = t.billedYearly ? '/mo, billed yearly'
        : (p && p.cycle.id === 'fourweekly') ? ' per 28 days'
        : (p && p.cycle.id !== 'monthly') ? ' ' + p.cycle.label.toLowerCase()
        : '/mo';
      const label = !p ? '<span class="na">not sold here</span>'
        : p.usd === 0 ? 'Free'
        : esc(M.fmtMoney(p.local.amount, p.local.cur)) + unit + (p.exact ? '' : ' <span class="est-tag">est.</span>');
      return '<button type="button" class="tier-pick' + (t.name === draft.tierName ? ' is-sel' : '') + '" data-tier="' + esc(t.name) + '">' +
        '<div class="tier-pick-top"><strong>' + esc(t.name) + '</strong><span>' + label + '</span></div>' +
        '<div class="field-hint">' + esc(t.benefits.slice(0, 2).join(' · ')) + '</div></button>';
    }).join('') + '</div></div>'
  ) : '';

  const groupOptions = '<option value="">— none —</option>' + CATEGORIES.map(function (c) {
    return '<optgroup label="' + esc(c.name) + '">' + c.groups.map(function (g) {
      return '<option value="' + g.id + '"' + (g.id === draft.group ? ' selected' : '') + '>' + esc(g.name) + '</option>';
    }).join('') + '</optgroup>';
  }).join('');

  const cards = st().cards.filter(function (c) { return c.active || c.id === draft.paidWith; });
  const cardField = cards.length
    ? '<div class="field"><label for="fPaid">Paid with</label><select id="fPaid"><option value="">— not set —</option>' +
      UI.optionList(cards.map(function (c) { return { value: c.id, label: c.name }; }), draft.paidWith) + '</select>' +
      '<span class="field-hint" id="fPaidHint"></span></div>'
    : '';

  const body =
    '<form id="subForm" novalidate>' +
    (svc ? '<p class="sub" style="margin-bottom:14px">' + UI.dot(svc.color) + ' ' + esc(svc.company) +
      ' · prices for ' + esc(region.flag + ' ' + region.name) + '</p>' : '') +
    tierPickerHtml +
    '<div class="field-row">' +
      '<div class="field"><label for="fName">Name</label><input id="fName" type="text" required value="' + esc(draft.name) + '"></div>' +
      '<div class="field"><label for="fCompany">Company</label><input id="fCompany" type="text" value="' + esc(draft.company) + '"></div>' +
    '</div>' +
    '<div class="field-row">' +
      '<div class="field"><label for="fAmount">Amount you actually pay</label>' +
        '<input id="fAmount" type="number" min="0" step="0.01" inputmode="decimal" required value="' + esc(draft.amount) + '">' +
        '<span class="field-hint">The full charge — promos, bundles and tax included.</span></div>' +
      '<div class="field"><label for="fCur">Currency</label><select id="fCur">' + UI.currencyOptions(draft.cur) + '</select></div>' +
    '</div>' +
    '<div class="field-row">' +
      '<div class="field"><label for="fCycle">Billing cycle</label><select id="fCycle">' +
        UI.optionList(M.CYCLES.map(function (c) { return { value: c.id, label: c.label }; }), draft.cycle) + '</select></div>' +
      '<div class="field"><label for="fNext">Next payment</label><input id="fNext" type="date" value="' + esc(draft.nextDate) + '">' +
        '<span class="field-hint">Puts it on the calendar.</span></div>' +
    '</div>' +
    '<div class="field-row">' +
      '<div class="field"><label for="fTrial">Free trial ends</label><input id="fTrial" type="date" value="' + esc(draft.trialEnds) + '">' +
        '<span class="field-hint">You get a reminder the day before.</span></div>' +
      '<div class="field"><label for="fShare">Split between</label><input id="fShare" type="number" min="1" max="20" step="1" value="' + draft.shareCount + '">' +
        '<span class="field-hint">People sharing it. Totals count your share.</span></div>' +
    '</div>' +
    '<div class="field-row">' +
      '<div class="field"><label for="fGroup">Category</label><select id="fGroup">' + groupOptions + '</select></div>' +
      '<div class="field"><label for="fColor">Colour</label><input id="fColor" type="color" value="' +
        esc(U.safeColor(draft.color, '#2a78d6')) + '" style="height:40px;padding:2px;width:100%"></div>' +
    '</div>' +
    cardField +
    '<div class="field"><label for="fNotes">Note</label><input id="fNotes" type="text" value="' + esc(draft.notes) +
      '" placeholder="Shared with family, cancel before renewal, …"></div>' +
    '<div class="modal-foot">' +
      '<button type="button" class="btn" data-close>Cancel</button>' +
      '<button type="submit" class="btn btn-primary">' + (editing ? 'Save changes' : 'Add subscription') + '</button>' +
    '</div></form>';

  UI.openModal(editing ? 'Edit ' + draft.name : svc ? 'Track ' + svc.name : 'Custom subscription', body, { focus: svc ? '#fAmount' : '#fName' });

  const form = $('#subForm');
  form.addEventListener('input', UI.markDirty);

  function updatePaidHint() {
    const hint = $('#fPaidHint');
    if (!hint || !ST.cardvalue) return;
    const best = ST.cardvalue.bestCardFor(st(), ST.ledger.subSpendCat({ group: $('#fGroup').value }));
    hint.textContent = best ? 'Best card for this: ' + best.card.name + ' (' + best.x + '× ' + best.label + ').' : '';
  }
  updatePaidHint();
  $('#fGroup').addEventListener('change', updatePaidHint);

  if (svc) {
    $$('#tierPicker .tier-pick').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const tier = P.findTier(svc, btn.dataset.tier);
        if (!tier) return;
        $$('#tierPicker .tier-pick').forEach(function (b) { b.classList.remove('is-sel'); });
        btn.classList.add('is-sel');
        UI.markDirty();
        draft.tierName = tier.name;
        draft.benefits = tier.benefits.slice();
        const ch = P.tierCharge(tier, reg());
        if (ch) {
          $('#fCycle').value = ch.cycle;
          $('#fAmount').value = ch.amount;
          $('#fCur').value = ch.cur;
          draft.quoted = { amount: ch.amount, cur: ch.cur, at: D.todayStr(), region: reg() };
        } else {
          /* keeping the previous tier's price would quietly save the wrong number */
          $('#fAmount').value = '';
          $('#fAmount').focus();
          draft.quoted = null;
          UI.toast(tier.name + ' has no list price in ' + UI.region().name + ' — enter what you pay.');
        }
      });
    });
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    const name = $('#fName').value.trim();
    if (!name) { $('#fName').focus(); UI.toast('Give it a name.'); return; }
    const rec = ST.store.cleanSub(Object.assign({}, draft, {
      name: name,
      company: $('#fCompany').value.trim(),
      group: $('#fGroup').value,
      color: $('#fColor').value,
      amount: Math.max(0, parseFloat($('#fAmount').value) || 0),
      cur: $('#fCur').value,
      cycle: $('#fCycle').value,
      nextDate: $('#fNext').value,
      trialEnds: $('#fTrial').value,
      shareCount: $('#fShare').value,
      paidWith: $('#fPaid') ? $('#fPaid').value : draft.paidWith,
      notes: $('#fNotes').value.trim()
    }));
    const list = st().subs;
    const i = list.findIndex(function (s) { return s.id === rec.id; });
    if (i >= 0) list[i] = rec; else list.push(rec);
    ST.app.save();
    UI.closeModal(true);
    UI.toast(i >= 0 ? 'Saved.' : rec.name + ' added.');
    if (i < 0) ST.app.go('#/subs'); else ST.app.render();
  });
}

function findSub(id) { return st().subs.filter(function (s) { return s.id === id; })[0]; }

/* the publisher changed the list price since this was added */
function openPriceChange(sub) {
  const ch = ST.priceWatch && ST.priceWatch.changeFor(st(), sub);
  if (!ch) { openForm(sub); return; }
  const up = ch.diffUsd > 0;
  const same = Math.abs(sub.amount - ch.was.amount) < 0.005 && sub.cur === ch.was.cur;
  UI.openModal(sub.name + ' ' + sub.tierName + ' price ' + (up ? 'rise' : 'cut'),
    '<p>' + esc(ch.svc.company) + ' now lists ' + esc(sub.tierName) + ' at <strong>' + M.fmtMoney(ch.now.amount, ch.now.cur) +
      '</strong> in ' + esc((REGION_BY_CODE[sub.quoted.region] || UI.region()).name) +
      ', ' + (up ? 'up' : 'down') + ' from ' + M.fmtMoney(ch.was.amount, ch.was.cur) + ' when you added it.</p>' +
    '<p class="sub">' + (same
      ? 'Your tracked amount still says ' + M.fmtMoney(sub.amount, sub.cur) + '. That is about ' + UI.usd(Math.abs(ch.yearUsd)) + ' a year ' + (up ? 'more' : 'less') + ' than you are tracking.'
      : 'You track ' + M.fmtMoney(sub.amount, sub.cur) + ', which already differs from the list price — a promo or bundle, perhaps.') + '</p>' +
    '<div class="modal-foot">' +
      '<button class="btn" type="button" data-price="keep">Keep ' + M.fmtMoney(sub.amount, sub.cur) + '</button>' +
      '<button class="btn btn-primary" type="button" data-price="update">Update to ' + M.fmtMoney(ch.now.amount, ch.now.cur) + '</button>' +
    '</div>');
  $$('#modalBody [data-price]').forEach(function (b) {
    b.addEventListener('click', function () {
      ST.priceWatch.accept(sub, ch, b.dataset.price === 'update');
      ST.app.save();
      UI.closeModal(true);
      ST.app.render();
      UI.toast(b.dataset.price === 'update' ? sub.name + ' updated.' : 'Kept your amount.');
    });
  });
}

/* ─────────────────────────────  wiring  ───────────────────────────── */

function wire() {
  $('#addCustomBtn').addEventListener('click', function () { openForm(null, null, null); });

  $('#subList').addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const sub = findSub(btn.closest('.sub-card').dataset.id);
    if (!sub) return;
    const act = btn.dataset.act;
    if (act === 'edit') openForm(sub);
    else if (act === 'similar') compareSimilar(sub.serviceId);
    else if (act === 'toggle') { sub.active = !sub.active; ST.app.save(); ST.app.render(); }
    else if (act === 'price') openPriceChange(sub);
    else if (act === 'use') {
      const k = D.monthKey(D.todayStr());
      sub.uses[k] = (sub.uses[k] || 0) + 1;
      ST.app.save(); ST.app.render();
      UI.toast(sub.uses[k] + ' use' + (sub.uses[k] === 1 ? '' : 's') + ' of ' + sub.name + ' this month.');
    }
    else if (act === 'del') {
      if (confirm('Remove ' + sub.name + ' from your tracked subscriptions?')) {
        st().subs = st().subs.filter(function (s) { return s.id !== sub.id; });
        ST.app.save(); ST.app.render(); UI.toast('Removed.');
      }
    }
  });

  $('#subFilter').addEventListener('click', function (e) {
    const b = e.target.closest('button[data-filter]');
    if (!b) return;
    subFilter = b.dataset.filter;
    $$('#subFilter button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    renderSubList();
  });

  $('#tableToggle').addEventListener('click', function () {
    const t = $('#chartTable');
    t.hidden = !t.hidden;
    this.textContent = t.hidden ? 'Show as table' : 'Hide table';
    this.setAttribute('aria-expanded', String(!t.hidden));
  });

  $('#search').addEventListener('input', function (e) { searchTerm = e.target.value.trim(); renderCatalog(); });
  $('#catChips').addEventListener('click', function (e) {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    catFilter = chip.dataset.cat;
    renderChips(); renderCatalog();
  });
  $('#catalogList').addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.svc-card').dataset.svc;
    if (btn.dataset.act === 'add') openForm(null, id, null);
    else if (btn.dataset.act === 'tiers') openTiers(id);
    else if (btn.dataset.act === 'similar') compareSimilar(id);
  });

  $('#modalBody').addEventListener('click', function (e) {
    const sim = e.target.closest('[data-similar]');
    if (sim) { UI.closeModal(true); compareSimilar(sim.dataset.similar); return; }
    const addTier = e.target.closest('[data-add-tier]');
    if (addTier) openForm(null, addTier.dataset.svc, addTier.dataset.addTier);
  });

  $('#comparePills').addEventListener('click', function (e) {
    const b = e.target.closest('[data-drop]');
    if (!b) return;
    st().compare = st().compare.filter(function (x) { return x !== b.dataset.drop; });
    ST.app.save(); renderCompare();
  });
  $('#compareOut').addEventListener('click', function (e) {
    const b = e.target.closest('[data-cmp-add]');
    if (b) openForm(null, b.dataset.cmpAdd, null);
  });
  $('#clearCompare').addEventListener('click', function () { st().compare = []; ST.app.save(); renderCompare(); });

  const cs = $('#compareSearch');
  cs.addEventListener('input', function () {
    const q = cs.value.trim().toLowerCase();
    const box = $('#compareSuggest');
    if (!q) { box.hidden = true; return; }
    /* services sold in this market first; the rest stay pickable but say so */
    const hits = CATALOG.filter(function (s) {
      return st().compare.indexOf(s.id) === -1 &&
        (s.name.toLowerCase().indexOf(q) !== -1 || s.company.toLowerCase().indexOf(q) !== -1);
    }).sort(function (a, b) { return (P.soldHere(b, reg()) ? 1 : 0) - (P.soldHere(a, reg()) ? 1 : 0); }).slice(0, 12);
    if (!hits.length) { box.hidden = true; return; }
    box.innerHTML = hits.map(function (s) {
      const here = P.soldHere(s, reg());
      return '<button type="button" data-pick="' + esc(s.id) + '">' + UI.logo(s.name, s.color, 24) +
        '<span>' + esc(s.name) + marketTag(s) +
        (here ? '' : ' <span class="est-tag">not in ' + esc(UI.region().name) + '</span>') + '</span>' +
        '<span class="muted" style="margin-left:auto">' + esc(s.company) + '</span></button>';
    }).join('');
    box.hidden = false;
  });
  $('#compareSuggest').addEventListener('click', function (e) {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    if (st().compare.indexOf(b.dataset.pick) === -1) st().compare.push(b.dataset.pick);
    cs.value = ''; this.hidden = true;
    ST.app.save(); renderCompare();
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#compareSearch') && !e.target.closest('#compareSuggest')) $('#compareSuggest').hidden = true;
  });
}

function render(route) {
  const pane = ['browse', 'compare'].indexOf(route.sub) >= 0 ? route.sub : 'tracked';
  $$('#view-subs [data-pane]').forEach(function (p) { p.hidden = p.dataset.pane !== pane; });
  $$('#view-subs .subtabs a').forEach(function (a) {
    if (a.dataset.sub === pane) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  renderStats();
  if (pane === 'tracked') { renderAdvice(); renderSubList(); renderChart(); }
  else if (pane === 'browse') { renderChips(); renderCatalog(); }
  else renderCompare();
}

ST.views = ST.views || {};
ST.views.subs = { wire: wire, render: render, openForm: openForm, findSub: findSub, openPriceChange: openPriceChange };

})(window.ST = window.ST || {});
