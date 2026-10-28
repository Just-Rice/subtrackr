/* patch-catalog.mjs — changes single numbers in js/data/catalog.js and
 * js/data/cards.js without touching anything else: comments, wording and
 * layout stay exactly as written. Every function takes the file's text and
 * returns the new text, or throws when what it was asked to change is not there.
 */

const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const quoted = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

/* [start, end) of the s('<id>', …) block in catalog.js */
function serviceBlock(src, id) {
  const start = src.indexOf('\ns(' + quoted(id) + ',');
  if (start < 0) throw new Error('service ' + id + ' not found');
  const rest = src.slice(start + 1);
  const next = rest.search(/\n(s\(|CATALOG\.push\(|\);|\/\* ─)/);
  return [start + 1, next < 0 ? src.length : start + 1 + next];
}

/* [start, end) of one t('<tier>', …) call inside a service block */
function tierCall(src, block, tier) {
  const text = src.slice(block[0], block[1]);
  const at = text.indexOf('t(' + quoted(tier) + ',');
  if (at < 0) throw new Error('tier ' + tier + ' not found');
  const after = text.slice(at + 2);
  const next = after.search(/\n\s*(t\(|\])/);
  return [block[0] + at, next < 0 ? block[1] : block[0] + at + 2 + next];
}

/* rewrite MARKET: number inside the first { … } at or after `from` */
function setInObject(src, from, to, market, value) {
  const open = src.indexOf('{', from);
  const close = src.indexOf('}', open);
  if (open < 0 || close < 0 || close > to) throw new Error('price object not found');
  const obj = src.slice(open, close + 1);
  const re = new RegExp('(\\b' + esc(market) + ':\\s*)(-?[0-9.]+)');
  if (!re.test(obj)) throw new Error(market + ' not carried');
  return src.slice(0, open) + obj.replace(re, '$1' + value) + src.slice(close + 1);
}

/* the price a tier lists for a market (per billing period); y = the yearly price
   of a billed-yearly tier */
export function setTierPrice(src, id, tier, market, value, field = 'm') {
  const block = serviceBlock(src, id);
  const call = tierCall(src, block, tier);
  if (field === 'm') return setInObject(src, call[0], call[1], market, value);
  const y = src.slice(call[0], call[1]).indexOf('y: {');
  if (y < 0) throw new Error('tier ' + tier + ' has no yearly price');
  return setInObject(src, call[0] + y, call[1], market, value);
}

/* the YYYY-MM a market's prices were last checked, added if missing */
export function setServiceAsOf(src, id, market, ym) {
  const block = serviceBlock(src, id);
  const text = src.slice(block[0], block[1]);
  const asOf = text.lastIndexOf('asOf: {');
  if (asOf >= 0) {
    const open = block[0] + asOf + 'asOf: '.length;
    const close = src.indexOf('}', open);
    const obj = src.slice(open, close + 1);
    const re = new RegExp('(\\b' + esc(market) + ":\\s*')([0-9-]+)(')");
    const next = re.test(obj) ? obj.replace(re, '$1' + ym + '$3')
      : obj.replace(/\s*}$/, (obj.trim() === '{}' ? ' ' : ', ') + market + ": '" + ym + "' }");
    return src.slice(0, open) + next + src.slice(close + 1);
  }
  /* the tiers array closes on a line starting with "]" */
  const end = text.lastIndexOf('\n]');
  if (end < 0) throw new Error('end of ' + id + ' not found');
  const at = block[0] + end + 2;
  if (src.slice(at, at + 3) === ', {') return src.slice(0, at + 3) + ' asOf: { ' + market + ": '" + ym + "' }," + src.slice(at + 3);
  if (src[at] === ')') return src.slice(0, at) + ', { asOf: { ' + market + ": '" + ym + "' } }" + src.slice(at);
  throw new Error('cannot place asOf for ' + id);
}

/* [start, end) of card('<id>', …) in cards.js */
function cardBlock(src, id) {
  const start = src.indexOf('\ncard(' + quoted(id) + ',');
  if (start < 0) throw new Error('card ' + id + ' not found');
  const rest = src.slice(start + 1);
  const next = rest.search(/\n(card\(|\/\* ─|\];)/);
  return [start + 1, next < 0 ? src.length : start + 1 + next];
}

function replaceIn(src, block, re, value, what) {
  const text = src.slice(block[0], block[1]);
  if (!re.test(text)) throw new Error(what + ' not found');
  return src.slice(0, block[0]) + text.replace(re, '$1' + value) + src.slice(block[1]);
}

export function setCardFee(src, id, value) {
  return replaceIn(src, cardBlock(src, id), /(\bfee:\s*)([0-9.]+)/, value, id + ' fee');
}

/* key: amount | spend | months */
export function setCardBonus(src, id, key, value) {
  const block = cardBlock(src, id);
  const text = src.slice(block[0], block[1]);
  const b = text.indexOf('bonus: {');
  if (b < 0) throw new Error(id + ' has no bonus');
  const sub = [block[0] + b, src.indexOf('}', block[0] + b) + 1];
  return replaceIn(src, sub, new RegExp('(\\b' + esc(key) + ':\\s*)([0-9.]+)'), value, id + ' bonus ' + key);
}

export function setCreditAmount(src, id, creditId, value) {
  return replaceIn(src, cardBlock(src, id), new RegExp('(cr\\(' + esc(quoted(creditId)) + ",\\s*'(?:[^'\\\\]|\\\\.)*',\\s*)([0-9.]+)"), value, id + ' credit ' + creditId);
}

export function setCardAsOf(src, id, ym) {
  const block = cardBlock(src, id);
  const text = src.slice(block[0], block[1]);
  if (/\basOf:\s*'/.test(text)) return replaceIn(src, block, /(\basOf:\s*')([0-9-]+)/, ym, id + ' asOf');
  const site = /(\n  site: '[^']*',)/.exec(text);
  if (!site) throw new Error('cannot place asOf for ' + id);
  const at = block[0] + site.index + site[0].length;
  return src.slice(0, at) + " asOf: '" + ym + "'," + src.slice(at);
}
