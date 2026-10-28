/* price-review.mjs — decides which of Gemini's answers may change the catalogue.
 *
 * A number is changed only when
 *   - it came with a source page that Google Search actually returned for the
 *     request (its domain is in the grounding metadata), so it was not made up;
 *   - it is a sane amount for its currency (positive, whole for JPY/INR/KRW…);
 *   - it moved by no more than MAX_MOVE either way.
 * Anything else that differs goes to "needs a human look" in the pull request.
 * Prices Gemini could not confirm are left alone; ones it confirmed unchanged
 * only refresh the "checked" date.
 */

export const MAX_MOVE = 0.4;
const WHOLE = new Set(['JPY', 'INR', 'KRW', 'IDR', 'VND', 'CLP', 'HUF', 'TWD', 'COP', 'PKR', 'NGN', 'COUNT']);   /* COUNT: points, months */

export const domainOf = url => {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; }
};

/* the domains Google Search returned: grounding chunks carry the site in `title`
   (their uri is a redirect), so both are read */
export function groundedDomains(grounding) {
  const out = new Set();
  (grounding || []).forEach(g => {
    const t = String(g.title || '').toLowerCase().replace(/^www\./, '');
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(t)) out.add(t);
    const d = domainOf(g.uri);
    if (d && !/vertexaisearch|googleusercontent|google\.com$/.test(d)) out.add(d);
  });
  return out;
}

const sameSite = (a, b) => a === b || a.endsWith('.' + b) || b.endsWith('.' + a);

/* items: [{ label, current, proposed, cur, source }] → { apply, human, confirmed } */
export function review(items, grounding, officialSite) {
  const domains = groundedDomains(grounding);
  const official = domainOf('https://' + String(officialSite || '').split('/')[0]);
  const out = { apply: [], human: [], confirmed: [] };
  items.forEach(it => {
    const n = it.proposed;
    if (n == null || n === '' || !isFinite(Number(n))) return;           /* not confirmed */
    const v = Number(n);
    const src = domainOf(it.source);
    const grounded = !!src && [...domains].some(d => sameSite(d, src));
    const entry = Object.assign({}, it, { proposed: v, sourceDomain: src, official: !!official && sameSite(src, official) });
    if (Math.abs(v - it.current) < 0.005) { if (grounded) out.confirmed.push(entry); return; }
    let why = '';
    if (!grounded) why = src ? 'source ' + src + ' was not among the search results' : 'no source given';
    else if (v <= 0) why = 'not a positive amount';
    else if (WHOLE.has(it.cur) && v !== Math.round(v)) why = it.cur + ' prices are whole numbers';
    else if (Math.abs(v - it.current) / Math.max(it.current, 0.01) > MAX_MOVE) why = 'moved more than ' + Math.round(MAX_MOVE * 100) + '%';
    (why ? out.human : out.apply).push(Object.assign(entry, { why: why }));
  });
  return out;
}
