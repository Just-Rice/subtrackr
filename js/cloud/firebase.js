/* cloud/firebase.js — loads the Firebase SDK, only when something needs it.
 *
 * The SDK comes from Google's CDN as ES modules, pulled in with import() from
 * this classic script, so nothing is fetched for anyone who never signs in.
 * Firestore Lite is enough: sync reads and writes one document, no live
 * listeners. Not offered when the app is opened as a file, since Google sign-in
 * only works from a web address the Firebase project lists.
 */

(function (ST) {
'use strict';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0';

const configured = typeof FIREBASE_CONFIG !== 'undefined' && !!FIREBASE_CONFIG;
const servable = /^https?:$/.test(location.protocol);

let base = null;
/* → { app, auth, store, appInstance, authInstance, db } */
function load() {
  if (!configured || !servable) return Promise.reject(new Error('Sign-in isn’t set up for this copy of Subtrackr.'));
  base = base || Promise.all(['firebase-app', 'firebase-auth', 'firebase-firestore-lite'].map(function (m) {
    return import(SDK + '/' + m + '.js');
  })).then(function (mods) {
    const app = mods[0], auth = mods[1], store = mods[2];
    const appInstance = app.getApps().length ? app.getApp() : app.initializeApp(FIREBASE_CONFIG);
    return { app: app, auth: auth, store: store, appInstance: appInstance,
             authInstance: auth.getAuth(appInstance), db: store.getFirestore(appInstance) };
  });
  base.catch(function () { base = null; });   /* a failed load (offline) can be retried */
  return base;
}

/* App Check proves requests come from this site; Firebase requires it for AI Logic */
let appCheck = null;
function ensureAppCheck(fb) {
  if (typeof RECAPTCHA_SITE_KEY === 'undefined' || !RECAPTCHA_SITE_KEY) return Promise.resolve(false);
  appCheck = appCheck || import(SDK + '/firebase-app-check.js').then(function (m) {
    m.initializeAppCheck(fb.appInstance, { provider: new m.ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
    return true;
  });
  return appCheck;
}

function importModule(name) { return import(SDK + '/' + name + '.js'); }

ST.firebase = { configured: configured, available: configured && servable, load: load,
                ensureAppCheck: ensureAppCheck, importModule: importModule,
                hasAppCheck: typeof RECAPTCHA_SITE_KEY !== 'undefined' && !!RECAPTCHA_SITE_KEY };

})(window.ST = window.ST || {});
