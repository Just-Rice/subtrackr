# Subtrackr

A subscription tracker that knows the price is different where you live.

Pick from a catalogue of **95 services and 341 tiers** — sorted by company, grouped
by category — or add your own. Change your market and every price is re-quoted:
Spotify Individual is ₹119 in India and $11.99 in the United States, and that is a
real difference in what Spotify charges, not a currency conversion.

Plain HTML, CSS and JavaScript. No build step, no framework, no backend, no account.
Everything you track is saved in your browser's local storage and stays on your device.

---

## What it does

**Track** — add a subscription from the catalogue in two clicks, or create a custom
one for anything not listed. Each entry keeps its own editable amount, currency and
billing cycle (weekly through yearly), so you record what you *actually* pay after
promos, bundles and student rates. Pause an entry instead of deleting it when you
cancel.

**See the damage** — monthly and annualised totals, spend broken down by category,
the largest single line, and a list of what is about to renew, with anything inside
three days flagged.

**Switch markets** — 50 markets and 45 currencies. Prices come from the publisher's
local price list where it's carried in the catalogue; everywhere else they are
estimated from the US price and that market's typical price level for digital
subscriptions, and marked `est.` so you know the difference. A tier that isn't sold
in your market says so rather than inventing a number.

**Compare** — every service has a **Compare to similar services** button. It pulls up
every competitor in the same sub-category with a cheapest-way-in table, then lays out
every tier of every service side by side with the benefits each one lists. Or build a
comparison by hand from the Compare tab.

**Keep your data** — export to JSON and import it back. Nothing is ever uploaded.

**Live at → https://just-rice.github.io/subtrackr/**

## Running it locally

Any static file server will do:

```sh
python3 -m http.server 8777
# then open http://localhost:8777
```

Opening `index.html` directly from the filesystem works too — you just lose the live
exchange-rate fetch.

## Deploying

The repository root *is* the site — there is no build step. `.github/workflows/pages.yml`
publishes it on every push to `main`; set **Settings → Pages → Source** to
**GitHub Actions** once and it takes over from there.

If you'd rather not use the workflow, **Settings → Pages → Source → Deploy from a
branch → `main` / `/ (root)`** serves the same files directly. `.nojekyll` keeps
GitHub from running the files through Jekyll either way.

Every asset path is relative, so the site works unchanged at a repository sub-path
(`/subtrackr/`), at a custom domain, or from a local folder.

## How the pricing model works

| | |
|---|---|
| **Market** | Which country's price list to quote. Changes the *price*. |
| **Show prices in** | Which currency to render the numbers in. Changes the *display* only. |

`js/catalog.js` stores each tier's price in the local currency of the markets it's
carried for — `{ US: 11.99, GB: 11.99, IN: 119, JP: 980 }`. For any other market,
`js/app.js` estimates from the US price times that market's `ppp` factor in
`js/regions.js`, converts, rounds to a sensible local increment, and tags the result
`est.`

Exchange rates only ever affect the display currency. They come from
[open.er-api.com](https://open.er-api.com) (free, no key) with a static table in
`js/regions.js` as the offline fallback.

Tiers flagged `only: ['IN']` are regional exclusives — Netflix Mobile, Spotify Mini,
Amazon Prime Lite. Tiers flagged `addon: true` are excluded from "cheapest way in",
because a $2.99 ad-free add-on isn't a way to get Prime Video.

## What's in the catalogue

| Category | Services |
|---|---|
| Video & Entertainment Streaming | 17 |
| Music, Audiobooks & Podcasts | 10 |
| Cloud Storage, Security & Privacy | 13 |
| Productivity, Creative & Professional Tools | 13 |
| Artificial Intelligence | 7 |
| Gaming & Interactive Platforms | 7 |
| Learning, Reading & News | 10 |
| Health, Fitness & Wellness | 7 |
| E-Commerce, Delivery & Subscription Boxes | 11 |

Every tier carries the benefits the publisher lists for it, so the comparison view is
a like-for-like read of what each tier actually gets you.

> **On price accuracy.** Catalogue prices are a best-effort snapshot taken in 2025–26.
> Publishers change them constantly, and they vary by promo, bundle, platform and tax
> treatment. Treat them as a starting point — once a subscription is tracked, its
> amount is yours to edit, and that edited number is what every total uses.

## Adding a service

`js/catalog.js` is plain data. Append to the relevant `CATALOG.push(...)` block:

```js
s('example', 'Example', 'Example Inc.', 'video.movies', '#2a78d6', 'example.com',
  'One sentence on what it is and who it is for.', [
  t('Basic', { US: 4.99, GB: 3.99, IN: 149 },
    ['A benefit', 'Another benefit']),
  t('Pro', { US: 9.99 },
    ['Everything in Basic', 'Something more'], { billedYearly: true, y: { US: 99.99 } })
])
```

`s(id, name, company, groupId, colour, site, blurb, tiers)` — group ids are listed at
the top of the file. `t(name, pricesByMarket, benefits, options)` — options are
`only`, `addon`, `billedYearly` and `y`.

## Files

```
index.html                     markup and panel shells
css/styles.css                 design tokens, light and dark
js/regions.js                  50 markets, 45 currencies, fallback FX table, price-level factors
js/catalog.js                  the catalogue — 95 services, 341 tiers
js/app.js                      state, pricing maths, rendering, localStorage
.github/workflows/pages.yml    publishes to GitHub Pages on push to main
```

## Licence

MIT.
