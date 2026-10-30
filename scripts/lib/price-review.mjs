/* price-review.mjs — decides which of Gemini's answers may change the catalogue.
 *
 * A number is changed only when
 *   - it came with a source page that Gemini actually read for the request (its
 *     domain is among the pages the URL tool fetched), so it was not made up;
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

/* the domains of the pages behind an answer: pages the URL tool read, or Google
   Search grounding chunks, which carry the site in `title` (their uri is a
   redirect), so both are read */
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

/* the name a site is registered under: netflix for help.netflix.com, amazon for
   amazon.co.uk, so a provider's country domains count as its own */
const SECOND_LEVEL = /\.(co|com|org|net|ne|or|ac|gov)\.[a-z]{2}$/;
export function brandOf(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  const parts = h.split('.');
  if (parts.length < 2) return h;
  return SECOND_LEVEL.test(h) && parts.length >= 3 ? parts[parts.length - 3] : parts[parts.length - 2];
}

/* is this page on the provider's own website? officialSite is a domain, optionally with a path */
export function isOfficial(url, officialSite) {
  const d = domainOf(url);
  const o = domainOf('https://' + String(officialSite || '').split('/')[0]);
  return !!d && !!o && (sameSite(d, o) || brandOf(d) === brandOf(o));
}

/* items: [{ label, current, proposed, cur, source }] → { apply, human, confirmed } */
export function review(items, grounding, officialSite) {
  const domains = groundedDomains(grounding);
  const out = { apply: [], human: [], confirmed: [] };
  items.forEach(it => {
    const n = it.proposed;
    if (n == null || n === '' || !isFinite(Number(n))) return;           /* not confirmed */
    const v = Number(n);
    const src = domainOf(it.source);
    const grounded = !!src && [...domains].some(d => sameSite(d, src));
    const entry = Object.assign({}, it, { proposed: v, sourceDomain: src, official: isOfficial(it.source, officialSite) });
    if (Math.abs(v - it.current) < 0.005) { if (grounded) out.confirmed.push(entry); return; }
    let why = '';
    if (!grounded) why = src ? 'source ' + src + ' was not among the pages read' : 'no source given';
    else if (v <= 0) why = 'not a positive amount';
    else if (WHOLE.has(it.cur) && v !== Math.round(v)) why = it.cur + ' prices are whole numbers';
    else if (Math.abs(v - it.current) / Math.max(it.current, 0.01) > MAX_MOVE) why = 'moved more than ' + Math.round(MAX_MOVE * 100) + '%';
    (why ? out.human : out.apply).push(Object.assign(entry, { why: why }));
  });
  return out;
}
