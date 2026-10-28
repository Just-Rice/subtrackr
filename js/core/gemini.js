/* gemini.js — talking to Gemini without running out: every request goes to the
 * best model in GEMINI_MODELS that still has allowance, and a model that answers
 * "used up" is skipped (for the minute, or for the rest of Google's day) while
 * the next one is asked instead. Ported from Just-Rice/test-prep.
 *
 * Which models are used up is remembered per scope — "own" for a user's own key,
 * "site" for the app's shared Firebase allowance — in localStorage, so a reload
 * does not start again from a model known to be exhausted.
 *
 * Also the direct REST call made with a user's own API key; the Firebase path
 * lives in js/cloud/ai.js. Used by the app and, through a vm, by
 * scripts/check-prices.mjs.
 */

(function (ST) {
'use strict';

const SPENT_KEY = 'subtrackr.geminiSpent';
const API = 'https://generativelanguage.googleapis.com/v1beta/models/';

/* Google resets daily limits at midnight Pacific time */
function pacificDay(at) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(at);
}

let memory = {};          /* when localStorage is unavailable */
function readSpent() {
  try { return JSON.parse(localStorage.getItem(SPENT_KEY) || '{}') || {}; } catch (e) { return memory; }
}
function writeSpent(v) {
  memory = v;
  try { localStorage.setItem(SPENT_KEY, JSON.stringify(v)); } catch (e) { /* kept in memory */ }
}

/* until: a ms time, or a Pacific date meaning "the rest of that day" */
function skipped(scope, name, now) {
  const until = (readSpent()[scope] || {})[name];
  if (until == null) return false;
  return typeof until === 'number' ? now < until : until === pacificDay(now);
}
function skip(scope, name, until) {
  const spent = readSpent();
  spent[scope] = Object.assign({}, spent[scope]);
  spent[scope][name] = until;
  writeSpent(spent);
}

/* what a failure says about its model: used up for the day, busy for the
   minute (or overloaded), not available, no reply at all ('network': offline,
   or a gateway error that came back without CORS headers), or null for a real
   failure that another model would not fix */
function modelProblem(err) {
  const msg = String((err && err.message) || err);
  if (/\b429\b|RESOURCE_EXHAUSTED|quota|exhausted/i.test(msg)) return /per.?day|PerDay|daily/i.test(msg) ? 'day' : 'minute';
  if (/\b404\b|NOT_FOUND|is not found|not supported for generateContent/i.test(msg)) return 'missing';
  if (/\b50[03]\b|UNAVAILABLE|overloaded|high demand/i.test(msg)) return 'minute';
  if (/failed to fetch|fetch failed|NetworkError|Load failed/i.test(msg)) return 'network';
  return null;
}

/* tries each model in turn, best first, until one answers */
async function withModels(scope, request, opts) {
  const now = (opts && opts.now) || function () { return Date.now(); };
  const models = (opts && opts.models) || GEMINI_MODELS;
  let last = null;
  for (const name of models) {
    if (skipped(scope, name, now())) continue;
    try {
      const value = await request(name);
      return { value: value, model: name };
    } catch (err) {
      const problem = modelProblem(err);
      if (!problem) throw err;
      last = err;
      /* no reply says nothing lasting about the model (and offline, every
         model fails the same way), so it is only passed over this once */
      if (problem !== 'network') skip(scope, name, problem === 'day' ? pacificDay(now())
        : now() + (problem === 'minute' ? 60 : 6 * 3600) * 1000);
    }
  }
  throw last || new Error('429 RESOURCE_EXHAUSTED: every Gemini model’s free allowance is used up for now');
}

function resetSpent() { writeSpent({}); }

/* one generateContent call with an API key → { text, grounding: [{ uri, title }] } */
async function generate(key, model, body) {
  const res = await fetch(API + encodeURIComponent(model) + ':generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(function () { return {}; });
  if (!res.ok) {
    const e = data.error || {};
    throw new Error('[' + res.status + '] ' + (e.status || '') + ' ' + (e.message || ''));
  }
  const cand = (data.candidates || [])[0] || {};
  const text = ((cand.content || {}).parts || []).map(function (p) { return p.text || ''; }).join('');
  const chunks = ((cand.groundingMetadata || {}).groundingChunks || []).map(function (c) { return c.web || {}; });
  return { text: text, grounding: chunks.map(function (w) { return { uri: w.uri || '', title: w.title || '' }; }) };
}

/* JSON out of a model's reply, tolerating a ```json fence or prose around it */
function parseJson(text) {
  const t = String(text || '').trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  const body = fenced ? fenced[1] : t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1);
  return JSON.parse(body);
}

/* plain words for an own-key failure */
function describeKeyError(err) {
  const msg = String((err && err.message) || err);
  if (/API_KEY_INVALID|API key not valid|\b400\b.*key/i.test(msg)) return 'That Gemini API key wasn’t accepted. Check it was copied in full from Google AI Studio.';
  if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(msg)) return 'Your Gemini key’s free allowance is used up on every model for now. Try again in a minute, or tomorrow.';
  if (/\b403\b|PERMISSION_DENIED/i.test(msg)) return 'Your Gemini key isn’t allowed to use these models. In Google AI Studio, check the key’s project can use the Gemini API.';
  if (/\b50[03]\b|UNAVAILABLE|overloaded|high demand/i.test(msg)) return 'Gemini is very busy right now. Try again in a minute.';
  if (/failed to fetch|network/i.test(msg)) return 'Could not reach Gemini. Check your internet connection.';
  return 'Gemini could not answer: ' + msg;
}

ST.gemini = { modelProblem: modelProblem, withModels: withModels, resetSpent: resetSpent, pacificDay: pacificDay,
              generate: generate, parseJson: parseJson, describeKeyError: describeKeyError };

})(window.ST = window.ST || {});
