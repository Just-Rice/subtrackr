/* cloud/ai.js — optional Gemini analysis. Off until turned on in Your data;
 * while off, nothing is sent anywhere and no AI code is loaded.
 *
 * Two ways to reach Gemini:
 *   - your own Gemini API key (free from Google AI Studio): no sign-in, the
 *     request goes from this browser straight to Google on your own allowance,
 *     and the key is kept in this browser only;
 *   - your Google account: signed in, through Firebase AI Logic on this site's
 *     shared allowance (needs App Check, see js/firebase-config.js).
 * Either way every request tries the best model first and moves down
 * GEMINI_MODELS as each one's free allowance runs out (js/core/gemini.js).
 *
 * What Gemini sees is built in js/core/aidata.js, and shown to you before the
 * first request of each kind (and before every statement categorising).
 */

(function (ST) {
'use strict';

const KEY = 'subtrackr.ai';      /* { on, mode: 'key'|'account', key, skipPreview: { kind: true } } */
const GEN = { temperature: 0.4, maxOutputTokens: 1200, thinkingConfig: { thinkingBudget: 0 } };
const KINDS = {
  review: 'Monthly money review',
  ask: 'Ask about your money',
  cards: 'Card keep-or-cancel advice',
  categorise: 'Statement categories'
};

function settings() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ } }
function enabled() { const s = settings(); return !!(s.on && (s.mode === 'key' ? (s.key || s.keyEnc) : s.mode === 'account')); }

/* the API key: plain in this browser, or sealed under the passkey lock's data
   key while the lock is on (js/core/lock.js), so the lock can't be stepped round */
function apiKey() {
  const s = settings();
  if (s.key) return Promise.resolve(s.key);
  if (s.keyEnc && ST.lock && ST.lock.unlocked()) return ST.lock.openString(s.keyEnc);
  return Promise.reject(new Error('Your Gemini key could not be read. Turn AI analysis off and on again.'));
}
function storeApiKey(key) {
  const s = settings();
  delete s.key; delete s.keyEnc;
  if (ST.lock && ST.lock.enabled() && ST.lock.unlocked()) {
    return ST.lock.sealString(key).then(function (env) { s.keyEnc = env; saveSettings(s); });
  }
  s.key = key;
  saveSettings(s);
  return Promise.resolve();
}
if (ST.lock) ST.lock.onChange(function () {
  const s = settings();
  return s.mode === 'key' && (s.key || s.keyEnc) ? apiKey().then(storeApiKey) : null;
});
function accountPossible() { return !!(ST.firebase && ST.firebase.available && ST.firebase.hasAppCheck); }

/* ── requests ── */

function viaKey(key, prompt, json) {
  const G = ST.gemini;
  const gen = json ? Object.assign({}, GEN, { responseMimeType: 'application/json', temperature: 0.1 }) : GEN;
  return G.withModels('own', function (model) {
    return G.generate(key, model, { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: gen })
      .then(function (r) { if (!r.text.trim()) throw new Error('empty answer'); return r.text; });
  }).then(function (r) { return r.value; }, function (e) { throw new Error(G.describeKeyError(e)); });
}

let aiMod = null;
function viaAccount(prompt, json) {
  if (!ST.account || !ST.account.signedIn()) return Promise.reject(new Error('Sign in with Google in Your data first, or use your own Gemini key.'));
  const gen = json ? Object.assign({}, GEN, { responseMimeType: 'application/json', temperature: 0.1 }) : GEN;
  return ST.firebase.load().then(function (fb) {
    return ST.firebase.ensureAppCheck(fb).then(function () {
      aiMod = aiMod || ST.firebase.importModule('firebase-ai');
      return aiMod;
    }).then(function (ai) {
      const backend = ai.getAI(fb.appInstance, { backend: new ai.GoogleAIBackend() });
      return ST.gemini.withModels('site', function (model) {
        return ai.getGenerativeModel(backend, { model: model, generationConfig: gen }).generateContent(prompt)
          .then(function (r) { const t = r.response.text(); if (!t.trim()) throw new Error('empty answer'); return t; });
      }).then(function (r) { return r.value; });
    });
  }).catch(function (e) { throw new Error(describeAccountError(e)); });
}

function describeAccountError(err) {
  const msg = String((err && err.message) || err);
  if (/enabled?\b/i.test(msg) && /\bai\b|vertexai|ailogic/i.test(msg)) return 'Gemini isn’t switched on for this Firebase project yet (Firebase console → AI Logic → Get started).';
  if (/quota|429|exhausted|used up/i.test(msg)) return 'The shared Gemini allowance is used up on every model for now. Try again later, or use your own free key.';
  if (/high demand|overloaded|unavailable|\b50[03]\b/i.test(msg)) return 'Gemini is very busy right now. Try again in a minute.';
  if (/app.?check/i.test(msg)) return 'This copy of Subtrackr isn’t registered with Firebase App Check, so Gemini refused. Use your own Gemini key instead.';
  if (/\b401\b|unauthenticated|authentication credential/i.test(msg)) return 'Your sign-in has expired. Sign in again in Your data, then try once more.';
  if (/network|offline|failed to fetch/i.test(msg)) return 'Could not reach Gemini. Check your internet connection.';
  return 'Gemini could not answer: ' + msg;
}

function request(prompt, json) {
  const s = settings();
  return s.mode === 'key' ? apiKey().then(function (k) { return viaKey(k, prompt, json); }) : viaAccount(prompt, json);
}

/* ── showing what is sent, then the answer ── */

function preview(kind, shown, always) {
  const UI = ST.ui, esc = ST.util.esc;
  if (!always && settings().skipPreview && settings().skipPreview[kind]) return Promise.resolve();
  return new Promise(function (resolve, reject) {
    let sent = false;
    UI.openModal('Send this to Gemini?',
      '<p class="sub">' + esc(KINDS[kind]) + ' sends only what is below to Google’s Gemini' +
        (settings().mode === 'key' ? ', using your own key.' : ', through your Google account.') +
        ' Nothing else from Subtrackr is included.</p>' +
      '<pre class="ai-preview">' + esc(typeof shown === 'string' ? shown : JSON.stringify(shown, null, 2)) + '</pre>' +
      (always ? '' : '<label class="check"><input type="checkbox" id="aiSkip"> Don’t show this again for ' + esc(KINDS[kind].toLowerCase()) + '</label>') +
      '<div class="modal-foot"><button class="btn" type="button" data-close>Cancel</button>' +
      '<button class="btn btn-primary" type="button" id="aiSend">Send</button></div>',
      { onClose: function () { if (!sent) reject(new Error('cancelled')); } });
    UI.$('#aiSend').addEventListener('click', function () {
      if (!always && UI.$('#aiSkip').checked) {
        const s = settings();
        s.skipPreview = Object.assign({}, s.skipPreview);
        s.skipPreview[kind] = true;
        saveSettings(s);
      }
      sent = true;
      UI.closeModal(true);
      resolve();
    });
  });
}

function showAnswer(title, text) {
  ST.ui.openModal(title,
    '<div class="ai-answer">' + ST.aidata.renderAnswer(text) + '</div>' +
    '<p class="muted ai-foot">Written by Gemini from your Subtrackr data. AI can get things wrong — check anything that matters.</p>' +
    '<div class="modal-foot"><button class="btn btn-primary" type="button" data-close>Done</button></div>', { wide: true });
}

function thinking(title) {
  ST.ui.openModal(title, '<p class="ai-wait" role="status"><span class="spinner" aria-hidden="true"></span> Asking Gemini…</p>');
}

function fail(e) {
  if (!e || e.message === 'cancelled') return;
  ST.ui.closeModal(true);
  ST.ui.toast(e.message || 'Gemini could not answer.');
}

function needOn() {
  ST.ui.toast('Turn on AI analysis in Your data first.');
  ST.app.go('#/data');
}

/* ── the four features ── */

function review() {
  if (!enabled()) return needOn();
  const sum = ST.aidata.summary(ST.app.state);
  preview('review', sum).then(function () {
    thinking('Your month, reviewed');
    return request(ST.aidata.reviewPrompt(sum));
  }).then(function (text) { showAnswer('Your month, reviewed', text); }).catch(fail);
}

function cards() {
  if (!enabled()) return needOn();
  const sum = ST.aidata.summary(ST.app.state);
  if (!sum.cards.length) { ST.ui.toast('Add a card first.'); return; }
  const shown = { currency: sum.currency, cards: sum.cards, subscriptions: sum.subscriptions, spendingThisMonth: sum.spendingThisMonth };
  preview('cards', shown).then(function () {
    thinking('Keep or cancel?');
    return request(ST.aidata.cardsPrompt(sum));
  }).then(function (text) { showAnswer('Keep or cancel?', text); }).catch(fail);
}

const EXAMPLES = ['Can I afford another streaming service?', 'Which card should I use for groceries?', 'Where could I save $50 a month?', 'Am I paying for anything twice?'];

function ask() {
  if (!enabled()) return needOn();
  const UI = ST.ui, esc = ST.util.esc;
  UI.openModal('Ask about your money',
    '<form id="aiAskForm"><div class="field"><label for="aiQ">Your question</label><textarea id="aiQ" maxlength="600" rows="3" required></textarea></div>' +
    '<div class="chips" style="margin:-4px 0 6px">' + EXAMPLES.map(function (q) { return '<button class="chip" type="button" data-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') + '</div>' +
    '<div class="modal-foot"><button class="btn" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit">Ask Gemini</button></div></form>',
    { focus: '#aiQ' });
  UI.$('#aiAskForm').addEventListener('click', function (e) {
    const c = e.target.closest('[data-q]');
    if (c) { UI.$('#aiQ').value = c.dataset.q; UI.$('#aiQ').focus(); }
  });
  UI.$('#aiAskForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const q = UI.$('#aiQ').value.trim();
    if (!q) return;
    UI.closeModal(true);
    const sum = ST.aidata.summary(ST.app.state);
    preview('ask', { question: q, data: sum }).then(function () {
      thinking('Ask about your money');
      return request(ST.aidata.askPrompt(sum, q));
    }).then(function (text) { showAnswer(q.length > 70 ? q.slice(0, 67) + '…' : q, text); }).catch(fail);
  });
}

/* statement lines no rule could place → { merchant: categoryId } */
function categorise(names) {
  if (!enabled()) return Promise.reject(new Error('AI analysis is off.'));
  return preview('categorise', { descriptions: names }, true).then(function () {
    thinking('Sorting descriptions');
    return request(ST.aidata.categorisePrompt(names), true);
  }).then(function (text) {
    const out = {};
    const got = (ST.gemini.parseJson(text) || {}).categories || {};
    names.forEach(function (n) {
      const id = got[n];
      if (id && id !== 'other' && SPEND_CAT_BY_ID[id]) out[n] = id;
    });
    return out;
  });
}

/* ── Your data card ── */

function cardHtml() {
  const s = settings();
  const on = enabled();
  return '<section class="card" id="aiCard"><div class="card-head"><h2>AI analysis <span class="tag">Optional</span></h2></div>' +
    (on
      ? '<p class="muted" style="margin:0">On, using ' + (s.mode === 'key' ? 'your own Gemini key (kept in this browser only)' : 'your Google account') + '. ' +
          'Look for “Review my month”, “Ask about your money” and “Keep or cancel?” on the Overview, Spending and Cards tabs. ' +
          'Gemini only sees what you send it, and you see it first.</p>' +
        '<p class="muted" style="margin:8px 0 0">Tries ' + ST.util.esc(GEMINI_MODELS[0].replace('gemini-', 'Gemini ').replace(/-/g, ' ')) +
          ' first and moves down to the next model whenever one’s free allowance runs out.</p>' +
        '<div class="row-btns"><button class="btn" type="button" id="aiShow">Show what is shared</button>' +
          '<button class="btn" type="button" id="aiOff">Turn off</button></div>'
      : '<p class="muted" style="margin:0">Off. Nothing is sent to any AI and no AI code is loaded. ' +
          'Turn it on for a written review of your month, answers to questions about your money, and keep-or-cancel advice on your cards, from Google’s Gemini.</p>' +
        '<div class="row-btns"><button class="btn" type="button" id="aiOn">Turn on…</button></div>') +
    '</section>';
}

function turnOn() {
  const UI = ST.ui;
  const canAccount = accountPossible();
  /* signing in is the main way where the site has Firebase; an own key is the alternative */
  const accountChoice = canAccount ? '<div class="ai-choice"><h3>Your Google account</h3>' +
      '<p class="muted">Sign in with Google and use this site’s shared free allowance — no key to manage.' +
      (ST.account && ST.account.signedIn() ? '' : ' You will be asked to sign in.') + '</p>' +
      '<button class="btn btn-primary" type="button" id="aiUseAccount">' + (ST.account && ST.account.signedIn() ? 'Use my Google account' : 'Sign in and use my Google account') + '</button></div>' : '';
  const keyChoice = '<div class="ai-choice"><h3>' + (canAccount ? 'Or your own Gemini API key' : 'Your own Gemini API key') + '</h3>' +
      '<p class="muted">No sign-in. Free from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a>. ' +
      'Requests go from this browser straight to Google, on your own allowance, and the key never leaves this browser.</p>' +
      '<form id="aiKeyForm" class="field-row" style="grid-template-columns:1fr auto"><div class="field" style="margin:0"><label class="sr-only" for="aiKey">Gemini API key</label>' +
      '<input id="aiKey" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your key"></div>' +
      '<button class="btn' + (canAccount ? '' : ' btn-primary') + '" type="submit">Use this key</button></form></div>';
  UI.openModal('Turn on AI analysis',
    '<p class="sub">Choose how Subtrackr reaches Gemini. Either way you see exactly what is sent before it goes.</p>' +
    accountChoice + keyChoice +
    '<div class="modal-foot"><button class="btn" type="button" data-close>Cancel</button></div>');
  UI.$('#aiKeyForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const key = UI.$('#aiKey').value.trim();
    if (!key) return;
    const btn = UI.$('#aiKeyForm button');
    btn.disabled = true; btn.textContent = 'Checking…';
    viaKey(key, 'Reply with the single word OK.').then(function () {
      saveSettings(Object.assign(settings(), { on: true, mode: 'key' }));
      return storeApiKey(key);
    }).then(function () {
      UI.closeModal(true);
      ST.app.render();
      UI.toast('AI analysis is on, with your own key.');
    }, function (err) {
      btn.disabled = false; btn.textContent = 'Use this key';
      UI.toast(err.message);
    });
  });
  const acct = UI.$('#aiUseAccount');
  if (acct) acct.addEventListener('click', function () {
    (ST.account.signedIn() ? Promise.resolve() : ST.account.signIn()).then(function () {
      if (!ST.account.signedIn()) return;
      const s = settings();
      delete s.key; delete s.keyEnc;
      saveSettings(Object.assign(s, { on: true, mode: 'account' }));
      UI.closeModal(true);
      ST.app.render();
      UI.toast('AI analysis is on, through your Google account.');
    }).catch(function (err) { UI.toast(err.message); });
  });
}

function wire() {
  const UI = ST.ui;
  UI.$('#dataRoot').addEventListener('click', function (e) {
    const id = e.target.closest('button') && e.target.closest('button').id;
    if (id === 'aiOn') turnOn();
    else if (id === 'aiOff') {
      saveSettings({});           /* forgets the key too */
      ST.gemini.resetSpent();
      ST.app.render();
      UI.toast('AI analysis is off.');
    } else if (id === 'aiShow') {
      UI.openModal('What Gemini can see', '<p class="sub">The figures a review or question sends — nothing else from Subtrackr.</p>' +
        '<pre class="ai-preview">' + ST.util.esc(JSON.stringify(ST.aidata.summary(ST.app.state), null, 2)) + '</pre>' +
        '<div class="modal-foot"><button class="btn btn-primary" type="button" data-close>Done</button></div>', { wide: true });
    }
  });
  document.addEventListener('click', function (e) {
    const b = e.target.closest('[data-ai-action]');
    if (!b) return;
    ({ review: review, ask: ask, cards: cards })[b.dataset.aiAction]();
  });
}

/* the feature buttons in each tab show only while AI is on */
function refresh() {
  const on = enabled();
  ST.ui.$$('[data-ai-action]').forEach(function (b) { b.hidden = !on; });
}

ST.ai = { enabled: enabled, cardHtml: cardHtml, wire: wire, refresh: refresh, categorise: categorise,
          review: review, ask: ask, cards: cards };

})(window.ST = window.ST || {});
