/* lock.js — lock Subtrackr on this device with a passkey.
 *
 * Turning the lock on makes a passkey (Face ID, Touch ID, Windows Hello, a
 * phone or a security key) and asks it for its PRF output: a secret only that
 * passkey can produce, the same every time. That secret wraps a random data key,
 * and the data key encrypts everything Subtrackr saves here (js/core/vault.js).
 * Without the passkey the saved data is ciphertext. A recovery code, shown once,
 * wraps the same data key, so a lost passkey does not mean lost data.
 *
 * Browsers or passkeys that cannot give a PRF secret get a passphrase lock
 * instead, which works the same way with a key from the passphrase.
 *
 *   subtrackr.lock   { v, method: 'passkey'|'passphrase', credId, prfSalt,
 *                      wrapped: { prf | passphrase, recovery } }   (no secrets)
 *   subtrackr.prefs  { theme, textsize } so the lock screen looks right
 *
 * Once unlocked, the app locks again after five minutes in the background.
 */

(function (ST) {
'use strict';

const LOCK = 'subtrackr.lock';
const PREFS = 'subtrackr.prefs';
const IDLE_MS = 5 * 60 * 1000;
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';   /* no 0/O, 1/I */

function record() { try { return JSON.parse(localStorage.getItem(LOCK)); } catch (e) { return null; } }
function saveRecord(r) { localStorage.setItem(LOCK, JSON.stringify(r)); }
function enabled() { const r = record(); return !!(r && r.wrapped); }
function method() { const r = record(); return r ? r.method : null; }

/* ── pure pieces (tested) ── */

/* 25 characters from a 32-letter alphabet, in fives: about 125 bits */
function recoveryCode() {
  const bytes = ST.vault.random(25);
  let s = '';
  for (let i = 0; i < 25; i++) s += ALPHABET[bytes[i] % 32];
  return s.match(/.{5}/g).join('-');
}
function normaliseCode(code) {
  return String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/* a data key wrapped under a passphrase-like secret (recovery code or passphrase) */
function wrapWithPassphrase(raw, pass) {
  const salt = ST.vault.random(16);
  return ST.vault.fromPassphrase(pass, salt).then(function (k) { return ST.vault.sealBytes(k, raw); })
    .then(function (env) { return { salt: ST.vault.b64(salt), iter: ST.vault.ITER, env: env }; });
}
function unwrapWithPassphrase(w, pass) {
  return ST.vault.fromPassphrase(pass, ST.vault.unb64(w.salt), w.iter)
    .then(function (k) { return ST.vault.openBytes(k, w.env); });
}

/* ── WebAuthn ── */

function b64url(buf) { return ST.vault.b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64url(s) { return ST.vault.unb64(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)); }

function passkeysPossible() {
  return !!(window.PublicKeyCredential && navigator.credentials && /^https?:$/.test(location.protocol) && window.isSecureContext);
}

/* the passkey's PRF secret for our salt; asks for Face ID / Touch ID / PIN */
function prfSecret(credId, prfSalt) {
  return navigator.credentials.get({ publicKey: {
    challenge: ST.vault.random(32), rpId: location.hostname, userVerification: 'required', timeout: 120000,
    allowCredentials: [{ type: 'public-key', id: unb64url(credId) }],
    extensions: { prf: { eval: { first: prfSalt } } }
  } }).then(function (a) {
    const r = a && a.getClientExtensionResults().prf;
    if (!r || !r.results || !r.results.first) throw new Error('This passkey can’t unlock Subtrackr here.');
    return new Uint8Array(r.results.first);
  });
}

function createPasskey() {
  const prfSalt = ST.vault.random(32);
  return navigator.credentials.create({ publicKey: {
    rp: { name: 'Subtrackr', id: location.hostname },
    user: { id: ST.vault.random(16), name: 'Subtrackr on this device', displayName: 'Subtrackr' },
    challenge: ST.vault.random(32),
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    timeout: 120000,
    extensions: { prf: { eval: { first: prfSalt } } }
  } }).then(function (cred) {
    const credId = b64url(cred.rawId);
    const r = cred.getClientExtensionResults().prf;
    if (r && r.results && r.results.first) return { credId: credId, prfSalt: prfSalt, secret: new Uint8Array(r.results.first) };
    if (!r || r.enabled === false) throw Object.assign(new Error('no-prf'), { noPrf: true });
    /* some browsers only give the secret when the passkey is used, not when made */
    return prfSecret(credId, prfSalt).then(function (secret) { return { credId: credId, prfSalt: prfSalt, secret: secret }; });
  });
}

/* ── turning it on and off ── */

let dataKey = null;   /* the unlocked data key, in memory only */

function finish(rec, raw) {
  const code = recoveryCode();
  return wrapWithPassphrase(raw, normaliseCode(code)).then(function (w) {
    rec.wrapped.recovery = w;
    return ST.vault.fromRaw(raw);
  }).then(function (k) {
    dataKey = k;
    saveRecord(rec);
    ST.store.setLockKey(k);
    try { localStorage.removeItem(ST.store.KEY_V1); } catch (e) { /* the old unencrypted backup must not outlive the lock */ }
    return ST.store.saveNowAsync(ST.app.state).then(function () { return runHooks(true); }).then(function () { return code; });
  });
}

function enablePasskey() {
  const raw = ST.vault.random(32);
  return createPasskey().then(function (p) {
    return ST.vault.fromSecret(p.secret, 'subtrackr lock').then(function (kek) { return ST.vault.sealBytes(kek, raw); })
      .then(function (env) {
        return finish({ v: 1, method: 'passkey', credId: p.credId, prfSalt: ST.vault.b64(p.prfSalt), wrapped: { prf: env } }, raw);
      });
  });
}

function enablePassphrase(pass) {
  const raw = ST.vault.random(32);
  return wrapWithPassphrase(raw, pass).then(function (w) {
    return finish({ v: 1, method: 'passphrase', wrapped: { passphrase: w } }, raw);
  });
}

function disable() {
  /* the lock is off from here on, but the data key stays in memory until the
     other secrets sealed under it have been opened and stored plainly again */
  localStorage.removeItem(LOCK);
  ST.store.setLockKey(null);
  return ST.store.saveNowAsync(ST.app.state).then(function () { return runHooks(false); })
    .then(function () { dataKey = null; });
}

function clear() { dataKey = null; try { localStorage.removeItem(LOCK); } catch (e) { /* storage blocked */ } }

/* Other secrets this device keeps (the sync key, a Gemini API key, a GitHub
   token) are stored sealed under the data key while the lock is on, so the
   lock can't be stepped around by reading them. Their owners register here
   and re-store them when the lock is turned on or off. */
const hooks = [];
function onChange(fn) { hooks.push(fn); }
function runHooks(on) { return Promise.all(hooks.map(function (fn) { return Promise.resolve(fn(on)).catch(function () { /* best effort */ }); })); }
function unlocked() { return !!dataKey; }
function sealBytes(bytes) { return ST.vault.sealBytes(dataKey, bytes); }
function openBytes(env) { return ST.vault.openBytes(dataKey, env); }
function sealString(str) { return sealBytes(new TextEncoder().encode(str)); }
function openString(env) { return openBytes(env).then(function (b) { return new TextDecoder().decode(b); }); }

/* ── unlocking ── */

function unlockWith(how, value) {
  const rec = record();
  let raw;
  if (how === 'passkey') {
    raw = prfSecret(rec.credId, ST.vault.unb64(rec.prfSalt))
      .then(function (secret) { return ST.vault.fromSecret(secret, 'subtrackr lock'); })
      .then(function (kek) { return ST.vault.openBytes(kek, rec.wrapped.prf); });
  } else if (how === 'passphrase') {
    raw = unwrapWithPassphrase(rec.wrapped.passphrase, value);
  } else {
    raw = unwrapWithPassphrase(rec.wrapped.recovery, normaliseCode(value));
  }
  return raw.then(ST.vault.fromRaw);
}

function prefs() { try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch (e) { return {}; } }
function savePrefs(settings) {
  try { localStorage.setItem(PREFS, JSON.stringify({ theme: settings.theme, textsize: settings.textsize })); } catch (e) { /* storage blocked */ }
}

const ICON = '<svg width="40" height="40" viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="7" fill="#0f7b4f"></rect><path d="M8 17.5c1.2 1.4 3 2 5 2 2.6 0 4.5-1.1 4.5-3s-1.7-2.5-4.5-3c-2.6-.5-4-1.2-4-2.9C9 8.8 10.8 8 13 8c1.7 0 3.2.5 4.3 1.6" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"></path></svg>';

/* the lock screen; resolves with the decrypted saved state */
function showLockScreen(envelope) {
  const p = prefs();
  document.documentElement.setAttribute('data-theme', p.theme || 'auto');
  document.documentElement.setAttribute('data-textsize', p.textsize || 'medium');
  document.body.classList.add('locked');
  const rec = record() || {};
  const byPasskey = rec.method === 'passkey';
  const el = document.createElement('div');
  el.className = 'lockscreen';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'lockTitle');
  el.innerHTML = '<div class="lock-box">' + ICON +
    '<h1 id="lockTitle">Subtrackr is locked</h1>' +
    '<p class="sub">Your data on this device is encrypted. ' + (byPasskey ? 'Unlock it with your passkey.' : 'Enter your passphrase to open it.') + '</p>' +
    (byPasskey ? '<button class="btn btn-primary lock-main" type="button" data-unlock="passkey">Unlock with passkey</button>'
      : '<form data-form="passphrase"><label class="sr-only" for="lockPass">Passphrase</label><input id="lockPass" type="password" autocomplete="current-password" placeholder="Passphrase">' +
        '<button class="btn btn-primary" type="submit">Unlock</button></form>') +
    '<details class="lock-more"><summary>Use your recovery code</summary>' +
      '<form data-form="recovery"><label class="sr-only" for="lockCode">Recovery code</label><input id="lockCode" type="text" autocomplete="off" spellcheck="false" placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX">' +
      '<button class="btn" type="submit">Unlock</button></form></details>' +
    '<p class="lock-error" role="alert" hidden></p>' +
    '<details class="lock-more"><summary>Lost both?</summary><p class="muted">Without the passkey' + (byPasskey ? '' : ' or passphrase') + ' or the recovery code the saved data can’t be opened by anyone. ' +
      'You can erase it and start again.</p><button class="btn btn-danger btn-sm" type="button" data-unlock="erase">Erase this device’s data</button></details>' +
    '</div>';
  document.body.appendChild(el);
  const err = el.querySelector('.lock-error');
  const first = el.querySelector('.lock-main, #lockPass');
  if (first) first.focus();

  return new Promise(function (resolve) {
    function attempt(how, value) {
      err.hidden = true;
      el.classList.add('busy');
      unlockWith(how, value).then(function (k) {
        return ST.vault.open(k, envelope).then(function (state) {
          dataKey = k;
          ST.store.setLockKey(k);
          el.remove();
          document.body.classList.remove('locked');
          watchIdle();
          resolve(state);
        });
      }).catch(function (e) {
        el.classList.remove('busy');
        err.textContent = how === 'passkey'
          ? (e && e.name === 'NotAllowedError' ? 'The passkey request was cancelled or timed out.' : (e && e.message) || 'That passkey did not unlock Subtrackr.')
          : how === 'recovery' ? 'That recovery code does not open this device’s data.' : 'That passphrase does not open this device’s data.';
        err.hidden = false;
      });
    }
    el.addEventListener('click', function (e) {
      const b = e.target.closest('[data-unlock]');
      if (!b) return;
      if (b.dataset.unlock === 'passkey') attempt('passkey');
      else if (b.dataset.unlock === 'erase' && confirm('Erase everything Subtrackr saved on this device? This cannot be undone.')) {
        ST.store.wipe();
        clear();
        location.reload();
      }
    });
    el.addEventListener('submit', function (e) {
      e.preventDefault();
      const f = e.target.dataset.form;
      attempt(f, f === 'passphrase' ? el.querySelector('#lockPass').value : el.querySelector('#lockCode').value);
    });
  });
}

/* lock again after a while in the background */
let hiddenAt = 0, watching = false;
function watchIdle() {
  if (watching) return;
  watching = true;
  document.addEventListener('visibilitychange', function () {
    if (!enabled()) return;
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > IDLE_MS) lockNow();
  });
}
function lockNow() {
  ST.store.saveNowAsync(ST.app.state).then(function () { location.reload(); });
}

/* ── Your data card ── */

function showRecoveryCode(code) {
  const UI = ST.ui;
  return new Promise(function (resolve) {
    UI.openModal('Save your recovery code',
      '<p class="sub">If this passkey is ever lost or deleted, this code is the only other way to open Subtrackr’s data on this device. ' +
        'Write it down or keep it in your password manager. It won’t be shown again.</p>' +
      '<p class="recovery-code" id="recoveryCode">' + ST.util.esc(code) + '</p>' +
      '<div class="row-btns" style="margin-top:0"><button class="btn btn-sm" type="button" id="copyCode">Copy</button></div>' +
      '<label class="check" style="margin-top:14px"><input type="checkbox" id="codeSaved"> I’ve saved it somewhere safe</label>' +
      '<div class="modal-foot"><button class="btn btn-primary" type="button" id="codeDone" disabled>Done</button></div>',
      { onClose: resolve });
    UI.$('#copyCode').addEventListener('click', function () {
      if (navigator.clipboard) navigator.clipboard.writeText(code).then(function () { UI.toast('Copied.'); }, function () { /* select it by hand */ });
    });
    UI.$('#codeSaved').addEventListener('change', function (e) { UI.$('#codeDone').disabled = !e.target.checked; });
    UI.$('#codeDone').addEventListener('click', function () { UI.closeModal(true); });
  });
}

function cardHtml() {
  const on = enabled();
  const pk = passkeysPossible();
  return '<section class="card" id="lockCard"><div class="card-head"><h2>Lock <span class="tag">Optional</span></h2></div>' +
    (on
      ? '<p class="muted" style="margin:0">Locked with ' + (method() === 'passkey' ? 'a passkey' : 'a passphrase') + '. Your data on this device is encrypted; ' +
          'Subtrackr asks to be unlocked each time it opens and after five minutes in the background.</p>' +
        '<div class="row-btns"><button class="btn" type="button" id="lockNowBtn">Lock now</button>' +
          '<button class="btn" type="button" id="lockOffBtn">Turn the lock off</button></div>'
      : '<p class="muted" style="margin:0">' + (pk
          ? 'Lock Subtrackr on this device with a passkey — Face ID, Touch ID, Windows Hello or your phone. Your data here is encrypted and only the passkey, or a recovery code you keep, can open it.'
          : 'Lock Subtrackr on this device with a passphrase. Your data here is encrypted and only the passphrase, or a recovery code you keep, can open it.') + '</p>' +
        '<div class="row-btns">' +
          (pk ? '<button class="btn btn-primary" type="button" id="lockPasskeyBtn">Lock with a passkey</button>' : '') +
          '<button class="btn' + (pk ? ' btn-quiet' : ' btn-primary') + '" type="button" id="lockPassBtn">' + (pk ? 'Use a passphrase instead' : 'Lock with a passphrase') + '</button>' +
        '</div>') +
    '</section>';
}

function wire() {
  const UI = ST.ui;
  function rerender() { ST.views.data.render(); }
  function fail(e) {
    if (!e || e.message === 'cancelled') return;
    if (e.noPrf) { UI.toast('This passkey can’t encrypt data in this browser. Use a passphrase instead.'); return; }
    if (e.name === 'NotAllowedError') { UI.toast('The passkey request was cancelled.'); return; }
    UI.toast(e.message || 'That did not work.');
  }
  UI.$('#dataRoot').addEventListener('click', function (e) {
    const id = e.target.closest('button') && e.target.closest('button').id;
    if (id === 'lockPasskeyBtn') {
      enablePasskey().then(showRecoveryCode).then(function () { rerender(); UI.toast('Locked with your passkey.'); watchIdle(); }).catch(fail);
    } else if (id === 'lockPassBtn') {
      ST.sync.askPassphrase('Choose a passphrase for the lock', true).then(enablePassphrase).then(showRecoveryCode)
        .then(function () { rerender(); UI.toast('Locked with your passphrase.'); watchIdle(); }).catch(fail);
    } else if (id === 'lockNowBtn') {
      lockNow();
    } else if (id === 'lockOffBtn') {
      if (!confirm('Turn the lock off? Your data on this device will be saved unencrypted again.')) return;
      disable().then(function () { rerender(); UI.toast('The lock is off.'); }).catch(fail);
    }
  });
}

ST.lock = { enabled: enabled, showLockScreen: showLockScreen, cardHtml: cardHtml, wire: wire, clear: clear,
            savePrefs: savePrefs, watchIdle: watchIdle, onChange: onChange, unlocked: unlocked,
            sealBytes: sealBytes, openBytes: openBytes, sealString: sealString, openString: openString,
            /* for tests */ recoveryCode: recoveryCode, normaliseCode: normaliseCode,
            wrapWithPassphrase: wrapWithPassphrase, unwrapWithPassphrase: unwrapWithPassphrase };

})(window.ST = window.ST || {});
