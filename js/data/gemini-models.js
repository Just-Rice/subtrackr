/* gemini-models.js — the Gemini models Subtrackr may use, best first.
 *
 * Each model has its own free allowance (per minute and per day), counted
 * separately, so when one runs out the next one answers: see withModels in
 * js/core/gemini.js. Nothing older or weaker than the 3.1 generation is used.
 * A name Google has not released (or has retired) is skipped automatically, so
 * the list can run ahead of what a given key can reach. The monthly price check
 * (scripts/check-prices.mjs) reads this same list.
 */

const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite'
];
