# Subtrackr

Subscriptions priced for where you live, what your credit cards actually pay you
back, and where the rest of the money goes.

Pick subscriptions from a catalogue of **130 services and 466 tiers**, priced in the
local currency of your market — Spotify Individual is ₹119 in India and $12.99 in the
United States, and that is a real difference in what Spotify charges, not a currency
conversion. Add the credit cards you hold from a list of **37 cards in the US, UK and
India** and see each one's credits, rewards and fee side by side. Log or import
everything else you spend, and set budgets against it.

Plain HTML, CSS and JavaScript. No build step, no framework, no backend, no account
needed. Everything is saved in your browser and stays on your device. The extras are
all optional and off until you turn them on: Google sign-in with end-to-end encrypted
sync, a passkey lock for the device, and Gemini analysis of your month.

**Live at → https://just-rice.github.io/subtrackr/**

---

## What it does

**Overview** — a glance, not a report: what goes out this month, the next charge,
what your cards have paid back this year, the next few charges and the one thing
that most needs your attention — a trial to cancel, a card credit about to lapse, a
budget overspent, a price rise. Every block opens the tab with the detail. The layout
fills the window and the type grows with it; **Text size** in the sidebar scales
everything further.

Every catalogue service and card issuer shows its **real logo**. The 136 logos ship
with the app (`logos/`), so showing one never contacts anyone.

**Subscriptions** — add from the catalogue in two clicks or create your own. Each
keeps its own amount, currency and billing cycle (weekly through yearly, plus 28-day
packs), so you record what you *actually* pay. Mark the card it is paid with, when a
free trial ends (you are reminded the day before), and how many people share it —
totals count only your share. Browse the catalogue by category, or compare any
services tier by tier with a cheapest-way-in table.

- **Price changes** — a subscription remembers the list price it was added at. When
  the catalogue moves, it says so and offers to update your amount or keep it.
- **Ways to save** — one tier down on the same service, two services doing the same
  job, a card credit that would pay for something you pay for another way, a card you
  hold that earns more on it, and a high cost per use (from a `+1 use` counter).

**Cards** — for each card, what you are **getting now** (credits used, rewards earned
so far and the perks you value, minus the fee) against what you **could get** if
every credit were used, with how much more it takes to cover the fee. This period's
credits are a checklist — monthly Uber Cash, quarterly Resy, semi-annual hotel credit,
card-year travel credit — with whatever lapses soonest first. The tab also shows
which of your subscriptions a card's credits pay for, the categories it is your best
card for, and sign-up bonus progress against the deadline. Rewards come from
subscriptions paid with the card, expenses logged on it and a monthly spending
estimate.

**Spending** — a month at a time: everything that is not a subscription, where it
went by category, and how it compares with the month before. Import a CSV statement
from your bank or card: payments and refunds are skipped, anything already imported
is recognised, statement lines for a tracked subscription are linked to it instead of
counted twice, and your column choices are remembered for next time. Charges that
recur at a steady amount and interval from a merchant you are not tracking are
flagged as **looks like a subscription**. Set monthly budgets per category;
subscriptions count against theirs.

**Calendar** — four weeks at a time: charges, card fees, credits about to lapse and
trials to cancel, with a total for each week. Export it all as an `.ics` file —
recurring events with a reminder the day before — into any calendar app.

**Your data** — export to JSON and import it back (merge or replace). Optional
reminders, install as an app that works offline, encrypted backup and Gist sync, and
the optional extras below.

## Optional extras

All off until you turn them on in **Your data**.

**Account and encrypted sync.** Sign in with Google to keep a copy of your data in
your account for your other devices. The copy is sealed in your browser with a key
from your *sync passphrase* (PBKDF2-SHA256, 310,000 rounds → AES-256-GCM) before it is
uploaded, so Firebase — and whoever runs the Firebase project — only ever stores
ciphertext. The passphrase is typed once per device and never stored or sent. Changes
upload a few seconds after you make them and come down when the app returns to the
front; when two devices both changed things, a three-way merge keeps each side's own
edits. Needs a Firebase project (see [Setting up sign-in, sync and AI](#setting-up-sign-in-sync-and-ai));
without one the account card simply isn't shown.

**Passkey lock.** Lock Subtrackr on a device with a passkey — Face ID, Touch ID,
Windows Hello, a phone or a security key. The passkey's PRF secret wraps a random data
key that encrypts everything saved on the device, so without the passkey the saved
data is ciphertext. A recovery code, shown once, opens it too. While locked nothing is
shown until it is unlocked, and it locks again after five minutes in the background.
The sync key, a Gemini key and a GitHub token kept on the device are sealed under the
lock as well. Browsers or passkeys without PRF support get a passphrase lock that works
the same way. No account or server is involved.

**AI analysis (Gemini).** A written **review of your month**, **answers to questions
about your money**, **keep-or-cancel advice** on each card, and **sorting statement
lines** no rule could place. Two ways to reach Gemini:

- **your Google account**, the main way — signed in, through Firebase AI Logic on the
  site's shared free allowance;
- **or your own Gemini API key** — free from [Google AI Studio](https://aistudio.google.com/apikey),
  for anyone who'd rather not sign in (and the only way on a copy without Firebase);
  requests go from your browser straight to Google on your own allowance, and the key
  stays in your browser.

Every request tries Gemini 3.8 Flash first and moves down the list in
`js/data/gemini-models.js` (nothing older than the 3.1 generation) whenever a model's
free per-minute or per-day allowance runs out. What Gemini sees is built in
`js/core/aidata.js` — totals, subscription names and prices, card values and budgets;
never ids, notes or the shops in your expenses — and the first request of each kind
shows you exactly what will be sent. Sorting statement lines sends only the unplaced
shop names, and always asks first.

**Switch markets** — 50 markets and 45 currencies. A tier that isn't sold in your
market says so rather than inventing a number; prices not carried for a market are
estimated and marked `est.`

## Privacy

Nothing leaves your browser except:

- a request for exchange rates to [open.er-api.com](https://open.er-api.com) (free,
  no key, nothing about you in it) — a built-in table is used if it fails;
- anything you explicitly sync. **Download encrypted backup**, **Sync through a
  private GitHub Gist** and **encrypted sync** through your account all encrypt the
  whole state in the browser first with a passphrase that is never stored, so GitHub,
  Firebase or wherever you keep the file only ever see ciphertext. Gist sync needs a
  token with only the `gist` scope, kept on the device only if you ask;
- if you sign in, Google sign-in itself, and the Firebase SDK is loaded from Google's
  CDN — only for someone who signs in;
- if you turn AI analysis on, what each request shows you before it is sent.

No web fonts, analytics or tracking scripts are loaded, and logos are bundled rather
than fetched.

## Running it locally

Any static file server will do:

```sh
python3 -m http.server 8777
# then open http://localhost:8777
```

Opening `index.html` directly from the filesystem works too — you lose the live
exchange-rate fetch and offline caching, nothing else.

## Tests

The app's logic — money, dates, pricing, storage and migration, card value, CSV
parsing, budgets, the advisor, the calendar export, encryption and the lock, sync's
merge, what AI is shown, the Gemini model fallback, the price-check guardrails and
catalogue patcher — is plain functions with Node tests and no dependencies:

```sh
npm test        # node --test, Node 18+
```

The tests load the same classic scripts the page does, in the same order, into a Node
`vm` context.

## Deploying

The repository root *is* the site — there is no build step. `.github/workflows/pages.yml`
publishes it on every push to `main`; set **Settings → Pages → Source** to
**GitHub Actions** once and it takes over from there.

If you'd rather not use the workflow, **Settings → Pages → Source → Deploy from a
branch → `main` / `/ (root)`** serves the same files directly. `.nojekyll` keeps
GitHub from running the files through Jekyll either way.

Every asset path is relative, so the site works unchanged at a repository sub-path
(`/subtrackr/`), at a custom domain, or from a local folder. When you add a script,
add it to the `SHELL` list in `sw.js` too — a test fails if you forget.

## Setting up sign-in, sync and AI

Sign-in, encrypted sync and AI through an account need a Firebase project. Its free
Spark plan is enough. Until `js/firebase-config.js` is filled in, none of it is shown
and nothing is loaded from Google; AI with your own key works either way.

1. In the [Firebase console](https://console.firebase.google.com), **Add project**
   (Google Analytics isn't needed).
2. **Project settings → General → Your apps → Web (`</>`)**: register the app (no
   Hosting) and copy its `firebaseConfig` object into `FIREBASE_CONFIG` in
   `js/firebase-config.js`. These values identify the project and are meant to be public.
3. **Authentication → Get started → Sign-in method → Google → Enable.** Under
   **Settings → Authorized domains**, add the site's domain (`just-rice.github.io`);
   `localhost` is there already.
4. **Firestore Database → Create database** (production mode). Under **Rules**, paste
   `firestore.rules` and **Publish**. Each account can then read and write only its own
   encrypted copy.
5. For AI through sign-in: **AI Logic → Get started → Gemini Developer API**, then
   **App Check → Apps →** register the web app with **reCAPTCHA Enterprise** for the
   site's domain and put its site key in `RECAPTCHA_SITE_KEY`. Firebase requires App
   Check for AI Logic.

## Keeping prices fresh

`.github/workflows/prices.yml` runs `scripts/check-prices.mjs` on the 1st of every
month. Gemini reads each provider's own pricing page and reports the current list
price of every plan in every market the catalogue carries, and the current fee,
welcome offer and credits of every built-in card. It works on a free Gemini key:
reading pages (Gemini's URL tool) is free, while Google Search grounding needs a
billed project, so the check doesn't use it.

Which page to read is kept in `scripts/data/pricing-pages.json`. For a market with
no page yet, Gemini suggests one first, and only a page on the provider's own website
is accepted (its country domains count, so amazon.co.uk for Amazon). A page that was
read and showed prices is saved for next month; one that couldn't be read or showed
none is dropped and looked for again.

A figure is changed only when its source is a page Gemini actually read, it is a sane
amount for its currency and it moved by 40% or less; everything else is listed for a
person to check. Plans, markets and credits are never added or removed automatically.
The result is a pull request with a table of every change and its source — nothing
merges by itself. Services and cards checked longest ago go first, so a run cut short
by the free daily allowance still reaches the stalest ones; the rest wait for the next
run.

Setup, once:

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey),
   in a project of its own (free allowances are per project, so this keeps the site's
   own Gemini allowance for the people using it). Don't add billing.
2. **Settings → Secrets and variables → Actions → New repository secret**:
   `GEMINI_API_KEY`.
3. **Settings → Actions → General → Workflow permissions**: tick **Allow GitHub
   Actions to create and approve pull requests**.

To try it: **Actions → Price check → Run workflow**, with **Dry run** ticked and, say,
`netflix,amex-gold` in **Only**. **Probe** instead tests which Gemini features the key
can use on each model (plain answers, Google Search, reading a page) and changes
nothing. Locally:

```sh
GEMINI_API_KEY=… node scripts/check-prices.mjs --only netflix,spotify --dry-run
GEMINI_API_KEY=… node scripts/check-prices.mjs --probe
```

The first full run makes about 330 requests (one to find each service's pages, one to
read them); later runs about 165, paced to stay inside the free per-minute limits, and
move to the next model when one's daily allowance runs out. A request that gets no
reply in 90 seconds is given up and the next model is asked.

## Logos

`scripts/fetch-logos.mjs` downloads each service's and issuer's own icon once,
normalises it to a 96px PNG in `logos/` and rewrites `js/data/logos.js`. Run it again
after adding services or cards (it needs Playwright with Chromium). Sites that turn
scripts away fall back to icon services and, for a few brands, the CC0
[Simple Icons](https://simpleicons.org) set; a bad one can be pointed elsewhere in the
script's `OVERRIDES`. The logos are trademarks of their owners, shown only to identify
the service. Anything without one keeps its coloured initials.

## Upgrading from the subscription-only version

Saved data moves from `subtrackr.v1` to `subtrackr.v2` on the first load. The v1 key
is left in place as a backup. Old JSON exports import as they are. Subscriptions you
added from the catalogue take their current amount as the price they were added at,
so this year's price rises show up straight away.

## How the pricing model works

| | |
|---|---|
| **Market** | Which country's price list to quote. Changes the *price*. |
| **Show prices in** | Which currency to render the numbers in. Changes the *display* only. |

`js/data/catalog.js` stores each tier's price in the local currency of the markets it's
carried for — `{ US: 12.99, GB: 11.99, IN: 119, JP: 980 }`. For any other market,
`js/core/pricing.js` estimates from the US price times that market's `ppp` factor in
`js/data/regions.js`, converts, rounds to a sensible local increment, and tags the
result `est.`

Exchange rates only ever affect the display currency. The fallback table in
`js/data/regions.js` was refreshed in October 2026.

Tiers flagged `only: ['IN']` are regional exclusives — Netflix Mobile, Spotify Mini,
Amazon Prime Lite. Tiers flagged `addon: true` are excluded from "cheapest way in",
because a $2.99 ad-free add-on isn't a way to get Prime Video.

### Phone and internet plans are different

Everything else in the catalogue is global. Carriers and ISPs are not: Jio does not
exist in Germany and Verizon does not exist in India. Those services carry
`markets: ['IN']` on the service itself, which locks every one of their tiers, and
they simply disappear from the catalogue when you switch to a market they don't
serve — with a line saying how many were hidden.

US mobile, US broadband, India and the UK are covered with real providers. Every
other market falls back to two generic templates, `Mobile plan` and `Home broadband`,
which are marked `fallbackOnly: true` so they only appear where the catalogue has no
local provider. They are a shape to edit, not a price list.

Indian prepaid packs run **28 days**, so thirteen of them fall in a year rather than
twelve. Those tiers carry `cycle: 'fourweekly'`, and the app quotes them per pack, per
month equivalent, and per year on the correct count.

## What's in the catalogue

| Category | Services |
|---|---|
| Video & Entertainment Streaming | 17 |
| Music, Audiobooks & Podcasts | 10 |
| Cloud Storage, Security & Privacy | 13 |
| Productivity, Creative & Professional Tools | 13 |
| Artificial Intelligence | 7 |
| Phone & Internet | 35 |
| Gaming & Interactive Platforms | 7 |
| Learning, Reading & News | 10 |
| Health, Fitness & Wellness | 7 |
| E-Commerce, Delivery & Subscription Boxes | 11 |

Every tier carries the benefits the publisher lists for it, so the comparison view is
a like-for-like read of what each tier actually gets you.

> **On price accuracy.** The catalogue started as a snapshot taken in 2025. In October
> 2026 the services whose prices moved most — Netflix, Disney+, Hulu, HBO Max,
> Peacock, Paramount+, YouTube Premium, Crunchyroll, Spotify, Apple Music, Amazon
> Music, ChatGPT, Google AI, Xbox Game Pass and PlayStation Plus — were checked
> against current US list prices (and Netflix's UK prices). Those services carry
> `asOf` dates by market, and tier cards say when a price was checked. Prices still
> from the snapshot are marked as possibly out of date.
> Phone and broadband are the roughest of them: US carrier prices are the single-line
> rate with autopay, and broadband figures are the promotional rate that steps up
> after a year or two. Treat every price as a starting point — once a subscription is
> tracked, its amount is yours to edit, and that edited number is what every total uses.

## The cards

| Market | Cards |
|---|---|
| United States | 23 — Amex Platinum, Gold, Blue Cash Preferred and Everyday; Chase Sapphire Preferred and Reserve, Freedom Unlimited and Flex, Prime Visa; Capital One Venture X, Venture, Savor, Quicksilver; Citi Double Cash, Strata Premier and Elite; Wells Fargo Active Cash and Autograph; Discover it; Apple Card; Delta Reserve; Hilton Aspire; Marriott Brilliant |
| United Kingdom | 5 — Amex Platinum and Preferred Rewards Gold, British Airways Amex and Premium Plus, Barclaycard Avios Plus |
| India | 9 — HDFC Infinia, Diners Club Black, Regalia Gold and Swiggy; Axis Atlas, Magnus and Flipkart; SBI Cashback; ICICI Amazon Pay |

Fees, credits, earn rates and welcome offers are the issuers' published terms as of
October 2026 — they change often and welcome offers vary by applicant, so check before
applying. Rates that need a travel portal or a single brand (8x through Chase Travel,
14x at Hilton) are shown as notes and left out of the value estimates, so a card is
never made to look better than ordinary spending makes it. Point values (`cpp`) are
conservative defaults and editable per card.

## Adding a service

`js/data/catalog.js` is plain data. Append to the relevant `CATALOG.push(...)` block:

```js
s('example', 'Example', 'Example Inc.', 'video.movies', '#2a78d6', 'example.com',
  'One sentence on what it is and who it is for.', [
  t('Basic', { US: 4.99, GB: 3.99, IN: 149 },
    ['A benefit', 'Another benefit']),
  t('Pro', { US: 9.99 },
    ['Everything in Basic', 'Something more'], { billedYearly: true, y: { US: 99.99 } })
], { asOf: { US: '2026-10' } })
```

`s(id, name, company, groupId, colour, site, blurb, tiers, options)` — group ids are
listed at the top of the file. `t(name, pricesByMarket, benefits, options)` — options
are `only`, `addon`, `billedYearly`, `y` and `cycle`. Service options are `markets`,
`fallbackOnly` and `asOf`, the month each market's prices were last checked.

## Adding a card

`js/data/cards.js` works the same way:

```js
card('example-card', 'Example Rewards', 'Example Bank', 'US', '#1b3a6b', {
  site: 'example.com', fee: 95, unit: 'points', cpp: 1.25,
  earn: [{ cat: 'dining', x: 3 }, { cat: 'other', x: 1 }],
  earnNotes: ['5x through the Example travel portal'],
  credits: [cr('travel', 'Travel credit', 50, 'cardyear'),
            cr('stream', 'Streaming', 10, 'monthly', { covers: ['netflix', 'hulu'] })],
  perks: [{ id: 'lounge', name: 'Lounge access' }],
  bonus: { amount: 60000, spend: 4000, months: 3 }
})
```

`earn` uses the spending categories in `js/data/spending.js`; a child category such as
`flights` falls back to its parent `travel`, then to `other`. Credit cadences are
`monthly`, `quarterly`, `semiannual`, `yearly` (calendar year), `cardyear` (from the
fee date) and `once`; `covers` lists the catalogue services a credit pays for. For
cash back, `x` is the percentage and `cpp` is `1`.

## Files

```
index.html                     page shell: sidebar, tabs, modal
manifest.webmanifest, sw.js    install and offline support
css/styles.css                 design tokens (light and dark) and components
icons/                         app icons
js/data/regions.js             50 markets, 45 currencies, fallback FX table, price-level factors
js/data/catalog.js             130 services, 466 tiers
js/data/cards.js               37 cards — US, UK, India
js/data/spending.js            spending categories
js/data/logos.js, logos/       bundled logos (written by scripts/fetch-logos.mjs)
js/data/gemini-models.js       Gemini models to use, best first
js/firebase-config.js          the Firebase project, or null for local-only
js/core/                       pure logic, tested in Node:
  util, money, dates, pricing      formatting, cycles, dates without UTC drift, tier prices
  store                            saved state, v1 → v2 migration, cleaning, import, merge
  ledger, insights                 what is charged when; the most urgent alerts
  pricewatch                       list-price changes under tracked subscriptions
  cardvalue                        credits, rewards, card-years, bonuses, best card
  csv, budgets, advisor            statement import, budgets and recurring charges, ways to save
  ics, sync                        calendar export, encrypted backup and Gist sync
  vault, lock                      keys and envelopes; the passkey lock
  gemini, aidata                   model fallback and REST calls; what Gemini is shown and asked
  ui                               DOM helpers, modal, toasts, logos
js/cloud/                      firebase (loads the SDK on demand), account (sign-in, encrypted sync), ai
js/views/                      overview, subs, cards, spending, calendar, data
js/app.js                      state, routing, settings, reminders, boot
tests/                         node --test suites
scripts/                       fetch-logos.mjs, check-prices.mjs (+ lib/ patcher and guardrails, data/pricing-pages.json)
firestore.rules                who may read and write the encrypted copies
.github/workflows/             pages.yml publishes; test.yml runs the tests; prices.yml checks prices monthly
```

## Licence

MIT.
