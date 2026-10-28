/* vault.js — the encryption shared by cloud sync and the passkey lock.
 *
 * Keys are non-extractable AES-256-GCM CryptoKeys: once made, the browser can
 * use them but no script can read them out. A key comes from a passphrase
 * (PBKDF2-SHA256, 310,000 rounds, with a stored salt), from a passkey's PRF
 * output (HKDF-SHA256), or is a random data key that is kept only "wrapped" —
 * encrypted under one of the others. Envelopes are small JSON strings.
 *
 * Keys can be remembered on this device in IndexedDB (they stay non-extractable
 * there too), so a passphrase is typed once per device rather than per session.
 */

(function (ST) {
'use strict';

const ITER = 310000;
const te = new TextEncoder(), td = new TextDecoder();

function b64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function unb64(s) {
  const bin = atob(String(s || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function random(n) { return crypto.getRandomValues(new Uint8Array(n)); }

/* passphrase + salt → AES key */
function fromPassphrase(passphrase, salt, iter) {
  return crypto.subtle.importKey('raw', te.encode(passphrase), 'PBKDF2', false, ['deriveKey']).then(function (base) {
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter || ITER, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  });
}

/* high-entropy secret (a passkey's PRF output) → AES key */
function fromSecret(secret, info) {
  return crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']).then(function (base) {
    return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: te.encode(info || 'subtrackr') },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  });
}

/* raw 32 bytes → AES key (for a data key once unwrapped) */
function fromRaw(raw) {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function sealBytes(key, bytes) {
  const iv = random(12);
  return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, bytes).then(function (ct) {
    return JSON.stringify({ v: 1, iv: b64(iv), data: b64(ct) });
  });
}
function openBytes(key, envelope) {
  let env;
  try { env = typeof envelope === 'string' ? JSON.parse(envelope) : envelope; } catch (e) { return Promise.reject(new Error('Not an encrypted envelope.')); }
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.data)).then(function (pt) {
    return new Uint8Array(pt);
  }, function () { throw new Error('wrong key'); });
}

/* object ⇄ envelope */
function seal(key, obj) { return sealBytes(key, te.encode(JSON.stringify(obj))); }
function open(key, envelope) { return openBytes(key, envelope).then(function (b) { return JSON.parse(td.decode(b)); }); }

/* ── keys kept on this device (IndexedDB) ── */
const DB = 'subtrackr-keys', STORE = 'keys';
function db() {
  return new Promise(function (resolve, reject) {
    if (typeof indexedDB === 'undefined') return reject(new Error('no IndexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
}
function tx(mode, fn) {
  return db().then(function (d) {
    return new Promise(function (resolve, reject) {
      const t = d.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = function () { resolve(r && r.result); d.close(); };
      t.onerror = t.onabort = function () { reject(t.error); d.close(); };
    });
  });
}
function remember(name, key) { return tx('readwrite', function (s) { return s.put(key, name); }).catch(function () { return null; }); }
function recall(name) { return tx('readonly', function (s) { return s.get(name); }).catch(function () { return null; }); }
function forget(name) { return tx('readwrite', function (s) { return s.delete(name); }).catch(function () { return null; }); }

ST.vault = { ITER: ITER, b64: b64, unb64: unb64, random: random,
             fromPassphrase: fromPassphrase, fromSecret: fromSecret, fromRaw: fromRaw,
             seal: seal, open: open, sealBytes: sealBytes, openBytes: openBytes,
             remember: remember, recall: recall, forget: forget };

})(window.ST = window.ST || {});
