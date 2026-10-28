/* cloud/account.js — optional Google sign-in, and encrypted sync through it.
 *
 * Signing in is never needed to use Subtrackr. It gives two things:
 *   - Gemini analysis on this site's shared allowance (js/cloud/ai.js);
 *   - if you choose, an encrypted copy of your data in your account, so another
 *     device can pick it up. The copy is sealed in this browser with a key from
 *     your sync passphrase (js/core/vault.js) before it is uploaded: Firebase
 *     and the project's owner only ever hold ciphertext. The passphrase is typed
 *     once per device; the derived key is then kept in this browser, unreadable
 *     to scripts, until you sign out.
 *
 * Cloud layout: one Firestore document, users/{uid}:
 *   { v: 1, blob: sealed export, salt, iter, updatedAt: ms, device }
 * firestore.rules lets only the signed-in owner read or write it.
 *
 * Sync is whole-state, last-writer-wins, with the one case that loses data
 * asked about: both this device and another changed since they last met.
 */

(function (ST) {
'use strict';

const META = 'subtrackr.cloud';       /* { uid, name, email, lastSyncedAt, dirty, syncOff } */
const DEVICE = 'subtrackr.device';
const PUSH_DELAY = 3000;

/* ── what to do, given this device and the cloud copy (pure; tested) ──
   local:  { dirty, lastSyncedAt, hasData }   remote: { updatedAt, device } | null */
function decide(local, remote, me) {
  if (!remote) return local.hasData || local.dirty ? 'push' : 'none';
  const last = local.lastSyncedAt || 0;
  if (remote.updatedAt === last) return local.dirty ? 'push' : 'none';
  if (remote.updatedAt > last) {
    if (remote.device === me && !last) return local.dirty ? 'push' : 'none';
    return local.dirty || (!last && local.hasData) ? 'conflict' : 'pull';
  }
  return local.dirty ? 'push' : 'none';   /* the cloud copy is older than what we last saw */
}

/* ── three-way merge (pure; tested) ──
   Each sync remembers a fingerprint of every record as it was then (base).
   A record changed on one side only keeps that side's version; changed on both,
   the account's copy wins; deleted on one side and untouched on the other, it
   stays deleted; new on either side, it is added. */
const COLLECTIONS = { subs: 'id', cards: 'id', expenses: 'id', budgets: 'cat' };
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
function fingerprint(state) {
  const out = {};
  Object.keys(COLLECTIONS).forEach(function (c) {
    out[c] = {};
    (state[c] || []).forEach(function (r) { out[c][r[COLLECTIONS[c]]] = hash(JSON.stringify(r)); });
  });
  return out;
}
function merge3(base, local, remote) {
  const out = Object.assign({}, local);
  Object.keys(COLLECTIONS).forEach(function (c) {
    const k = COLLECTIONS[c], b = (base && base[c]) || {};
    const L = new Map((local[c] || []).map(function (r) { return [r[k], r]; }));
    const R = new Map((remote[c] || []).map(function (r) { return [r[k], r]; }));
    const order = Array.from(L.keys()).concat(Array.from(R.keys()).filter(function (id) { return !L.has(id); }));
    const changed = function (r, id) { return r ? hash(JSON.stringify(r)) !== b[id] : b[id] !== undefined; };
    out[c] = [];
    order.forEach(function (id) {
      const l = L.get(id), r = R.get(id), known = b[id] !== undefined;
      if (l && r) out[c].push(changed(l, id) && !changed(r, id) ? l : r);
      else if (l) { if (!known || changed(l, id)) out[c].push(l); }
      else if (r) { if (!known || changed(r, id)) out[c].push(r); }
    });
  });
  out.csvMappings = Object.assign({}, remote.csvMappings, local.csvMappings);
  out.dismissed = Object.assign({}, remote.dismissed, local.dismissed);
  out.compare = Array.from(new Set((local.compare || []).concat(remote.compare || [])));
  return out;
}

function readMeta() { try { return JSON.parse(localStorage.getItem(META)) || {}; } catch (e) { return {}; } }
function writeMeta(m) { try { localStorage.setItem(META, JSON.stringify(m)); } catch (e) { /* storage blocked */ } }
function device() {
  try {
    let d = localStorage.getItem(DEVICE);
    if (!d) { d = ST.vault.b64(ST.vault.random(9)).replace(/[^a-z0-9]/gi, ''); localStorage.setItem(DEVICE, d); }
    return d;
  } catch (e) { return 'unknown'; }
}

let fb = null;            /* the loaded SDK */
let user = null;          /* Firebase user */
let key = null;           /* sync CryptoKey */
let salt = null;          /* its salt (base64) */
let phase = 'signed-out'; /* signed-out | loading | needs-key | sync-off | syncing | synced | conflict | error */
let message = '';
let pushTimer = null;
let running = null;
const listeners = [];

function set(p, msg) { phase = p; message = msg || ''; listeners.forEach(function (fn) { fn(); }); }
function onChange(fn) { listeners.push(fn); }
function hasData(s) { return !!(s.subs.length || s.cards.length || s.expenses.length || s.budgets.length); }
function docRef() { return fb.store.doc(fb.db, 'users', user.uid); }

/* ── sign-in ── */

function start() {
  return ST.firebase.load().then(function (f) {
    fb = f;
    return new Promise(function (resolve) {
      let first = true;
      fb.auth.onAuthStateChanged(fb.authInstance, function (u) {
        const was = user && user.uid;
        user = u;
        if (u) {
          const m = readMeta();
          if (m.uid && m.uid !== u.uid) { writeMeta({}); }      /* another account was here: start clean */
          writeMeta(Object.assign(readMeta(), { uid: u.uid, name: u.displayName || '', email: u.email || '' }));
          if (was !== u.uid) afterSignIn();
        } else {
          key = null; salt = null;
          set('signed-out');
        }
        if (first) { first = false; resolve(u); }
      });
    });
  });
}

/* boot: only reload the SDK for someone who signed in before */
function init() {
  if (!ST.firebase.available || !readMeta().uid) return;
  set('loading');
  start().catch(function () { set('error', 'Could not reach your account. Check the connection; this device keeps working as usual.'); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') syncNow();
    else if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; syncNow(); }
  });
  window.addEventListener('online', function () { syncNow(); });
}

function signIn() {
  set('loading');
  return start().then(function () {
    const provider = new fb.auth.GoogleAuthProvider();
    return fb.auth.signInWithPopup(fb.authInstance, provider).catch(function (err) {
      if (err && err.code === 'auth/popup-blocked') return fb.auth.signInWithRedirect(fb.authInstance, provider);
      throw err;
    });
  }).catch(function (err) {
    set(user ? phase : 'signed-out');
    const code = (err && err.code) || '';
    if (/popup-closed|cancelled-popup/.test(code)) return;
    throw new Error(/unauthorized-domain/.test(code)
      ? 'This web address isn’t allowed in the Firebase project (Authentication → Settings → Authorized domains).'
      : /network/.test(code) ? 'Could not reach Google. Check your connection.' : 'Sign-in did not work: ' + ((err && err.message) || code));
  });
}

function signOut() {
  clearTimeout(pushTimer);
  const uid = user && user.uid;
  return (uid ? ST.vault.forget('sync:' + uid) : Promise.resolve()).then(function () {
    writeMeta({});
    key = null; salt = null;
    return fb ? fb.auth.signOut(fb.authInstance) : null;
  }).then(function () { set('signed-out'); });
}

function afterSignIn() {
  const m = readMeta();
  if (m.syncOff) { set('sync-off'); return; }
  ST.vault.recall('sync:' + user.uid).then(function (k) {
    if (k) { key = k; salt = m.salt || null; syncNow(); return; }
    /* no key here yet: a passphrase to enter if there is a copy, or sync to turn on */
    return remoteDoc().then(function (remote) { set(remote ? 'needs-key' : 'sync-off'); });
  }).catch(function () { set('error', 'Could not reach your account. Check the connection.'); });
}

/* ── sync ── */

function remoteDoc() {
  return fb.store.getDoc(docRef()).then(function (snap) { return snap.exists() ? snap.data() : null; });
}

function push(state) {
  const updatedAt = Date.now();
  return ST.vault.seal(key, ST.store.exportPayload(state)).then(function (blob) {
    return fb.store.setDoc(docRef(), { v: 1, blob: blob, salt: salt, iter: ST.vault.ITER, updatedAt: updatedAt, device: device() });
  }).then(function () {
    writeMeta(Object.assign(readMeta(), { lastSyncedAt: updatedAt, dirty: false, salt: salt, base: fingerprint(state) }));
  });
}

function incomingFrom(remote) {
  return ST.vault.open(key, remote.blob).then(function (payload) {
    return ST.store.parseImport(JSON.stringify(payload));
  });
}

function applyRemote(remote) {
  return incomingFrom(remote).then(function (incoming) {
    ST.app.replaceState(incoming);
    ST.store.saveNow(ST.app.state);
    writeMeta(Object.assign(readMeta(), { lastSyncedAt: remote.updatedAt, dirty: false, base: fingerprint(ST.app.state) }));
    ST.app.refreshChrome();
    ST.app.render();
  });
}

/* one sync at a time; asking again while one runs runs it once more after */
function syncNow() {
  if (!user || !key || readMeta().syncOff) return Promise.resolve();
  if (running) { running.again = true; return running.p; }
  const run = { again: false };
  set('syncing');
  run.p = remoteDoc().then(function (remote) {
    const m = readMeta();
    const what = decide({ dirty: !!m.dirty, lastSyncedAt: m.lastSyncedAt || 0, hasData: hasData(ST.app.state) }, remote, device());
    if (remote && remote.salt !== salt) {
      /* the passphrase was changed on another device */
      return ST.vault.open(key, remote.blob).then(function () { salt = remote.salt; return what; }, function () {
        key = null;
        return ST.vault.forget('sync:' + user.uid).then(function () { set('needs-key', 'Your sync passphrase was changed on another device. Enter the new one.'); return 'stop'; });
      });
    }
    return what;
  }).then(function (what) {
    if (what === 'stop') return null;
    if (what === 'push') return push(ST.app.state);
    if (what === 'pull') return remoteDoc().then(applyRemote).then(function () { ST.ui.toast('Updated from your other device.'); });
    if (what === 'conflict') { set('conflict'); return remoteDoc().then(askConflict); }
    return null;
  }).then(function () {
    if (phase === 'syncing') set('synced');
  }).catch(function (err) {
    set('error', /permission|PERMISSION_DENIED/i.test(String(err && (err.code || err.message)))
      ? 'Your account refused the sync (check firestore.rules is deployed).'
      : 'Sync failed — it will try again. ' + ((err && err.message) || ''));
  }).finally(function () {
    running = null;
    if (run.again) syncNow();
  });
  running = run;
  return run.p;
}

/* every local save: upload a few seconds later */
function changed() {
  const m = readMeta();
  if (!m.uid) return;
  if (!m.dirty) writeMeta(Object.assign(m, { dirty: true }));
  if (!user || !key || m.syncOff) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(function () { pushTimer = null; syncNow(); }, PUSH_DELAY);
}

function askConflict(remote) {
  const UI = ST.ui;
  const when = new Date(remote.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  UI.openModal('This device and your account both changed',
    '<p class="sub">Since this device last synced, the copy in your account was updated (' + ST.util.esc(when) + ') and this device has changes of its own.</p>' +
    '<p class="sub"><strong>Merge</strong> keeps the changes from both; where the same item was changed in both places, your account’s version wins. ' +
    '<strong>Keep this device’s</strong> replaces your account’s copy; <strong>Use my account’s</strong> replaces what is here.</p>' +
    '<div class="modal-foot"><button class="btn" type="button" data-conflict="device">Keep this device’s</button>' +
    '<button class="btn" type="button" data-conflict="cloud">Use my account’s</button>' +
    '<button class="btn btn-primary" type="button" data-conflict="merge">Merge</button></div>',
    { onClose: function () {
        UI.$('#modalBody').removeEventListener('click', onPick);
        if (phase === 'conflict') set('synced', 'Not synced yet: this device and your account each have changes. Sync now to choose.');
      } });
  function onPick(e) {
    const b = e.target.closest('[data-conflict]');
    if (!b) return;
    const choice = b.dataset.conflict;
    UI.$('#modalBody').removeEventListener('click', onPick);
    set('syncing');
    UI.closeModal(true);
    let p;
    if (choice === 'device') p = push(ST.app.state);
    else if (choice === 'cloud') p = applyRemote(remote);
    else {
      p = incomingFrom(remote).then(function (incoming) {
        ST.app.replaceState(ST.store.sanitise(merge3(readMeta().base, ST.app.state, incoming)));
        ST.store.saveNow(ST.app.state);
        ST.app.render();
        return push(ST.app.state);
      });
    }
    p.then(function () { set('synced'); UI.toast('Synced.'); }, function (err) { set('error', err.message); });
  }
  UI.$('#modalBody').addEventListener('click', onPick);
}

/* passphrase: create one (no cloud copy yet) or enter the existing one */
function setUpKey() {
  if (!user) return Promise.resolve();
  return remoteDoc().then(function (remote) {
    const creating = !remote;
    return ST.sync.askPassphrase(creating ? 'Choose a sync passphrase' : 'Your sync passphrase', creating).then(function (pass) {
      const s = creating ? ST.vault.b64(ST.vault.random(16)) : remote.salt;
      return ST.vault.fromPassphrase(pass, ST.vault.unb64(s), creating ? ST.vault.ITER : remote.iter).then(function (k) {
        return (creating ? Promise.resolve() : ST.vault.open(k, remote.blob)).then(function () {
          key = k; salt = s;
          writeMeta(Object.assign(readMeta(), { syncOff: false, salt: s }));
          return ST.vault.remember('sync:' + user.uid, k);
        }, function () { throw new Error('That passphrase does not open the copy in your account.'); });
      });
    });
  }).then(function () { return syncNow(); });
}

function turnSyncOff() {
  clearTimeout(pushTimer);
  writeMeta(Object.assign(readMeta(), { syncOff: true }));
  key = null;
  return ST.vault.forget('sync:' + user.uid).then(function () { set('sync-off'); });
}

function deleteCloudCopy() {
  return fb.store.deleteDoc(docRef()).then(function () {
    writeMeta(Object.assign(readMeta(), { lastSyncedAt: 0, dirty: true }));
    return turnSyncOff();
  });
}

/* ── Your data card ── */

function status() {
  const m = readMeta();
  if (phase === 'needs-key') return message || 'Sync is waiting for your sync passphrase on this device.';
  if (phase === 'sync-off') return 'Sync is off. Your data stays on this device.';
  if (phase === 'syncing') return 'Syncing…';
  if (phase === 'conflict') return 'Choose how to combine this device’s changes with your account’s.';
  if (phase === 'error') return message;
  if (phase === 'loading') return 'Connecting to your account…';
  return message || (m.lastSyncedAt ? 'Encrypted copy in your account, last synced ' + new Date(m.lastSyncedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) + '.' : 'Synced.');
}

function cardHtml() {
  if (!ST.firebase.available) return '';
  const esc = ST.util.esc;
  const m = readMeta();
  const signedIn = !!user;
  return '<section class="card" id="accountCard"><div class="card-head"><h2>Account <span class="tag">Optional</span></h2></div>' +
    (!signedIn
      ? '<p class="muted" style="margin:0">Sign in with Google to keep an encrypted copy of your data in your account for your other devices, ' +
          'and to use Gemini analysis without a key of your own. Not needed for anything else.</p>' +
        '<div class="row-btns"><button class="btn btn-primary" type="button" id="signInBtn"' + (phase === 'loading' ? ' disabled' : '') + '>' +
          (phase === 'loading' ? 'Connecting…' : 'Sign in with Google') + '</button></div>'
      : '<div class="who"><span class="logo" aria-hidden="true" style="background:var(--accent)">' + esc(ST.util.initials(m.name || m.email || '?')) + '</span>' +
          '<div><div class="who-name">' + esc(m.name || 'Signed in') + '</div><div class="muted">' + esc(m.email || '') + '</div></div></div>' +
        '<p class="muted" style="margin:12px 0 0">' + esc(status()) + '</p>' +
        '<div class="row-btns">' +
          (phase === 'needs-key' || phase === 'sync-off' ? '<button class="btn btn-primary" type="button" id="syncKeyBtn">' + (phase === 'sync-off' ? 'Turn on encrypted sync' : 'Enter sync passphrase') + '</button>' : '') +
          (key ? '<button class="btn" type="button" id="syncNowBtn">Sync now</button>' : '') +
          '<button class="btn" type="button" id="signOutBtn">Sign out</button>' +
        '</div>' +
        (key ? '<details class="cardbox-more" style="margin-top:12px"><summary>More</summary>' +
          '<p class="muted">The passphrase is never stored or sent. Forget it and the copy in your account cannot be opened — this device’s data is unaffected.</p>' +
          '<div class="row-btns"><button class="btn" type="button" id="syncOffBtn">Turn sync off</button>' +
          '<button class="btn btn-danger" type="button" id="cloudDeleteBtn">Delete the copy in my account</button></div></details>' : '')) +
    '</section>';
}

function wire() {
  const UI = ST.ui;
  function fail(err) { if (err && err.message !== 'cancelled') UI.toast(err.message || 'That did not work.'); }
  function rerender() { if (ST.app.route && ST.app.route.view === 'data') ST.views.data.render(); }
  onChange(rerender);
  UI.$('#dataRoot').addEventListener('click', function (e) {
    const id = e.target.closest('button') && e.target.closest('button').id;
    if (id === 'signInBtn') {
      signIn().then(function () { if (user) UI.toast('Signed in as ' + (user.displayName || user.email) + '.'); }).catch(fail);
    } else if (id === 'signOutBtn') {
      if (!confirm('Sign out? This device keeps its data; sync stops until you sign in again.')) return;
      signOut().then(function () { UI.toast('Signed out.'); }).catch(fail);
    } else if (id === 'syncKeyBtn') {
      setUpKey().then(function () { if (key) UI.toast('Encrypted sync is on.'); }).catch(fail);
    } else if (id === 'syncNowBtn') {
      syncNow();
    } else if (id === 'syncOffBtn') {
      turnSyncOff().then(function () { UI.toast('Sync is off on this device.'); }).catch(fail);
    } else if (id === 'cloudDeleteBtn') {
      if (!confirm('Delete the encrypted copy in your account? Every device keeps its own data.')) return;
      deleteCloudCopy().then(function () { UI.toast('The copy in your account was deleted.'); }).catch(fail);
    }
  });
}

ST.account = { decide: decide, merge3: merge3, fingerprint: fingerprint, init: init, signIn: signIn, signOut: signOut, changed: changed, syncNow: syncNow,
               cardHtml: cardHtml, wire: wire, onChange: onChange,
               signedIn: function () { return !!user; }, user: function () { return user; },
               firebase: function () { return fb; } };

})(window.ST = window.ST || {});
