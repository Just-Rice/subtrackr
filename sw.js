/* sw.js — keeps the app working offline once it has been opened.
 *
 * The app shell is cached on install and served cache-first, refreshing in
 * the background, so a new version shows up on the next launch. Requests to
 * other origins (the exchange-rate feed, GitHub sync) are never cached.
 * Bump VERSION when the list changes; tests/pwa.test.js checks it against
 * index.html so a new script cannot be left out.
 */

const VERSION = 'subtrackr-v2-3';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'js/data/regions.js',
  'js/data/catalog.js',
  'js/data/spending.js',
  'js/data/cards.js',
  'js/data/logos.js',
  'js/data/gemini-models.js',
  'js/firebase-config.js',
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
  'js/core/vault.js',
  'js/core/lock.js',
  'js/core/gemini.js',
  'js/core/ui.js',
  'js/cloud/firebase.js',
  'js/cloud/account.js',
  'js/views/subs.js',
  'js/views/overview.js',
  'js/views/calendar.js',
  'js/views/cards.js',
  'js/views/spending.js',
  'js/views/data.js',
  'js/app.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (hit) {
      const fresh = fetch(req).then(function (res) {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || fresh;
    });
  }));
});

/* a tap on a reminder opens the app at whatever it is about */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(function (list) {
    for (const c of list) { if ('focus' in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
