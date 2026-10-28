/* sync.js — optional, encrypted backup and sync.
 *
 * Nothing leaves the browser unless you ask. When you do, the whole state is
 * encrypted first with a key derived from your passphrase (PBKDF2-SHA256,
 * 310,000 rounds → AES-256-GCM), so a backup file in a cloud drive or a private
 * GitHub Gist only ever holds ciphertext. The passphrase is never stored; a
 * Gist token is kept on this device only if you tick "remember".
 */

(function (ST) {
'use strict';

const ITER = 310000;
const LOCAL = 'subtrackr.sync';     /* per-device: { gistId, token? } */
const FILE = 'subtrackr.enc.json';

function b64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function unb64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function key(passphrase, salt, iter) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
    .then(function (base) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
}

/* object → JSON text of the envelope */
function encrypt(obj, passphrase) {
  if (!passphrase || passphrase.length < 8) return Promise.reject(new Error('Use a passphrase of at least 8 characters.'));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return key(passphrase, salt, ITER).then(function (k) {
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, new TextEncoder().encode(JSON.stringify(obj)));
  }).then(function (ct) {
    return JSON.stringify({ app: 'Subtrackr', encrypted: 1, kdf: 'PBKDF2-SHA256', iter: ITER, cipher: 'AES-256-GCM',
                            salt: b64(salt), iv: b64(iv), data: b64(ct), at: new Date().toISOString() });
  });
}

function isEncrypted(text) {
  try { const o = JSON.parse(text); return !!(o && o.encrypted && o.data && o.salt && o.iv); } catch (e) { return false; }
}

/* envelope text → object; rejects on a wrong passphrase */
function decrypt(text, passphrase) {
  let env;
  try { env = JSON.parse(text); } catch (e) { return Promise.reject(new Error('Not a Subtrackr backup.')); }
  return key(passphrase, unb64(env.salt), Number(env.iter) || ITER).then(function (k) {
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, k, unb64(env.data));
  }).then(function (pt) {
    return JSON.parse(new TextDecoder().decode(pt));
  }, function () {
    throw new Error('That passphrase does not open this backup.');
  });
}

/* ── per-device settings ── */

function local() {
  try { return JSON.parse(localStorage.getItem(LOCAL)) || {}; } catch (e) { return {}; }
}
function saveLocal(o) {
  try { localStorage.setItem(LOCAL, JSON.stringify(o)); } catch (e) { /* storage blocked */ }
}

/* a remembered GitHub token: plain, or sealed under the passkey lock while it is on */
function storedToken() {
  const l = local();
  if (l.token) return Promise.resolve(l.token);
  if (l.tokenEnc && ST.lock && ST.lock.unlocked()) return ST.lock.openString(l.tokenEnc);
  return Promise.resolve('');
}
function remember(gistId, token) {
  const o = { gistId: gistId };
  if (!token) { saveLocal(o); return Promise.resolve(); }
  if (ST.lock && ST.lock.enabled() && ST.lock.unlocked()) {
    return ST.lock.sealString(token).then(function (env) { o.tokenEnc = env; saveLocal(o); });
  }
  o.token = token;
  saveLocal(o);
  return Promise.resolve();
}
/* re-store a remembered token when the lock is turned on or off (registered in wire(): lock.js loads after this file) */
function reseal() {
  const l = local();
  return l.token || l.tokenEnc ? storedToken().then(function (t) { return remember(l.gistId, t); }) : null;
}

/* ── GitHub Gist ── */

function gistRequest(method, path, token, body) {
  return fetch('https://api.github.com' + path, {
    method: method,
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token,
               'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  }).then(function (r) {
    if (r.status === 401) throw new Error('GitHub rejected the token.');
    if (r.status === 404) throw new Error('No gist with that ID for this token.');
    if (!r.ok) throw new Error('GitHub answered ' + r.status + '.');
    return r.json();
  });
}

function push(state, passphrase, gistId, token) {
  return encrypt(ST.store.exportPayload(state), passphrase).then(function (content) {
    const files = {};
    files[FILE] = { content: content };
    return gistId
      ? gistRequest('PATCH', '/gists/' + encodeURIComponent(gistId), token, { files: files })
      : gistRequest('POST', '/gists', token, { description: 'Subtrackr encrypted backup', public: false, files: files });
  }).then(function (g) { return g.id; });
}

function pull(passphrase, gistId, token) {
  return gistRequest('GET', '/gists/' + encodeURIComponent(gistId), token).then(function (g) {
    const f = g.files && g.files[FILE];
    if (!f) throw new Error('That gist has no Subtrackr backup in it.');
    return f.truncated ? fetch(f.raw_url).then(function (r) { return r.text(); }) : f.content;
  }).then(function (text) { return decrypt(text, passphrase); })
    .then(function (payload) { return ST.store.parseImport(JSON.stringify(payload)); });
}

/* ── Data tab card ── */

function cardHtml() {
  const l = local();
  const esc = ST.util.esc;
  return '<section class="card" id="syncCard"><div class="card-head"><h2>Back up and sync <span class="tag">Optional</span></h2></div>' +
    '<p class="muted" style="margin:0 0 12px">Encrypted with a passphrase before anything leaves this browser. ' +
      'The passphrase is never stored — lose it and the backup cannot be opened.</p>' +
    '<div class="row-btns" style="margin-top:0"><button class="btn" type="button" id="encExport">Download encrypted backup</button>' +
      '<span class="muted" style="align-self:center">Import it with Import JSON above.</span></div>' +
    '<details class="cardbox-more" style="margin-top:12px"' + (l.gistId ? ' open' : '') + '><summary>Sync through a private GitHub Gist</summary>' +
      '<p class="muted">Needs a GitHub token with only the <strong>gist</strong> scope. Push from one device, pull on another.</p>' +
      '<div class="field-row"><div class="field"><label for="gistId">Gist ID</label><input id="gistId" type="text" value="' + esc(l.gistId || '') + '" placeholder="Created on first push"></div>' +
      '<div class="field"><label for="gistToken">Token</label><input id="gistToken" type="password" autocomplete="off" value="' + esc(l.token || '') + '"' +
        (l.tokenEnc ? ' placeholder="Saved on this device, encrypted"' : '') + '></div></div>' +
      '<label class="check"><input type="checkbox" id="gistRemember"' + (l.token || l.tokenEnc ? ' checked' : '') + '> Remember the token on this device</label>' +
      '<div class="row-btns"><button class="btn" type="button" id="gistPush">Push</button><button class="btn" type="button" id="gistPull">Pull</button></div>' +
    '</details></section>';
}

/* ask for the passphrase in the modal → Promise<string> */
function askPassphrase(title, confirmTwice) {
  const UI = ST.ui;
  return new Promise(function (resolve, reject) {
    UI.openModal(title,
      '<form id="ppForm" novalidate><div class="field"><label for="pp1">Passphrase</label><input id="pp1" type="password" autocomplete="new-password" minlength="8"></div>' +
      (confirmTwice ? '<div class="field"><label for="pp2">Again</label><input id="pp2" type="password" autocomplete="new-password"></div>' : '') +
      '<div class="modal-foot"><button class="btn" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit">Continue</button></div></form>',
      { focus: '#pp1', onClose: function () { reject(new Error('cancelled')); } });
    UI.$('#ppForm').addEventListener('submit', function (e) {
      e.preventDefault();
      const p = UI.$('#pp1').value;
      if (p.length < 8) { UI.toast('At least 8 characters.'); return; }
      if (confirmTwice && p !== UI.$('#pp2').value) { UI.toast('The two passphrases differ.'); return; }
      resolve(p);
      UI.closeModal(true);
    });
  });
}

function wire() {
  const UI = ST.ui;
  if (ST.lock) ST.lock.onChange(reseal);
  function fail(err) { if (err && err.message !== 'cancelled') UI.toast(err.message || 'That did not work.'); }
  UI.$('#dataRoot').addEventListener('click', function (e) {
    const id = e.target.closest('button') && e.target.closest('button').id;
    if (id === 'encExport') {
      askPassphrase('Encrypt the backup', true).then(function (p) {
        return encrypt(ST.store.exportPayload(ST.app.state), p);
      }).then(function (text) {
        UI.download('subtrackr-' + ST.dates.todayStr() + '.enc.json', text, 'application/json');
      }).catch(fail);
    } else if (id === 'gistPush' || id === 'gistPull') {
      const gistId = UI.$('#gistId').value.trim();
      const typed = UI.$('#gistToken').value.trim();
      const keep = UI.$('#gistRemember').checked;
      (typed ? Promise.resolve(typed) : storedToken()).then(function (token) {
        if (!token) { UI.toast('Add a GitHub token first.'); return; }
        if (id === 'gistPull' && !gistId) { UI.toast('Add the gist ID to pull from.'); return; }
        return askPassphrase(id === 'gistPush' ? 'Encrypt and push' : 'Pull and decrypt', id === 'gistPush' && !gistId).then(function (p) {
          UI.toast(id === 'gistPush' ? 'Pushing…' : 'Pulling…');
          return id === 'gistPush'
            ? push(ST.app.state, p, gistId, token).then(function (newId) {
                return remember(newId, keep ? token : '').then(function () {
                  UI.$('#gistId').value = newId;
                  UI.toast('Pushed — encrypted.');
                });
              })
            : pull(p, gistId, token).then(function (incoming) {
                return remember(gistId, keep ? token : '').then(function () { ST.views.data.confirmImport(incoming); });
              });
        });
      }).catch(fail);
    }
  });
}

ST.sync = { encrypt: encrypt, decrypt: decrypt, isEncrypted: isEncrypted, askPassphrase: askPassphrase,
            cardHtml: cardHtml, wire: wire, push: push, pull: pull };

})(window.ST = window.ST || {});
