/* catalog.js — the built-in service catalog.
 *
 * Prices are publisher list prices in LOCAL currency, gathered as a best-effort
 * snapshot (2025-26). They move constantly and vary by promo, bundle and tax
 * treatment, so every one of them is editable once a subscription is tracked.
 * Where a market's exact price isn't carried here, the app estimates it from the
 * US price and the market's price-level factor and marks the number "est.".
 *
 *   m = monthly price by region code        y = yearly price by region code
 *   only = tier exists in these markets only
 */

const CATEGORIES = [
  { id: 'video', name: 'Video & Entertainment Streaming', icon: '🎬', groups: [
    { id: 'video.movies', name: 'Movies & TV' },
    { id: 'video.live',   name: 'Ad-Free Video & Live TV' },
    { id: 'video.niche',  name: 'Anime & Niche' } ] },
  { id: 'audio', name: 'Music, Audiobooks & Podcasts', icon: '🎧', groups: [
    { id: 'audio.music',  name: 'Music Streaming' },
    { id: 'audio.spoken', name: 'Spoken Word & Audio' } ] },
  { id: 'cloud', name: 'Cloud Storage, Security & Privacy', icon: '🔐', groups: [
    { id: 'cloud.storage',  name: 'Cloud Storage' },
    { id: 'cloud.passwords', name: 'Password Managers' },
    { id: 'cloud.vpn',      name: 'VPNs & Antivirus' } ] },
  { id: 'connect', name: 'Phone & Internet', icon: '📶', groups: [
    { id: 'connect.mobile', name: 'Mobile Plans' },
    { id: 'connect.home',   name: 'Home Internet & Broadband' } ] },
  { id: 'work', name: 'Productivity, Creative & Professional Tools', icon: '🛠️', groups: [
    { id: 'work.creative', name: 'Creative & Design' },
    { id: 'work.notes',    name: 'Productivity & Notes' },
    { id: 'work.dev',      name: 'Web & Development' } ] },
  { id: 'ai', name: 'Artificial Intelligence', icon: '🤖', groups: [
    { id: 'ai.chat',  name: 'Chat & Coding Assistants' },
    { id: 'ai.media', name: 'Media Generation' } ] },
  { id: 'games', name: 'Gaming & Interactive Platforms', icon: '🎮', groups: [
    { id: 'games.pass',  name: 'Consoles & PC Passes' },
    { id: 'games.cloud', name: 'Cloud & Mobile Gaming' } ] },
  { id: 'learn', name: 'Learning, Reading & News', icon: '📚', groups: [
    { id: 'learn.edu',  name: 'Education Platforms' },
    { id: 'learn.news', name: 'Digital Journalism & Newsletters' } ] },
  { id: 'health', name: 'Health, Fitness & Wellness', icon: '💪', groups: [
    { id: 'health.fitness', name: 'Workout & Tracking' },
    { id: 'health.mind',    name: 'Mindfulness' } ] },
  { id: 'retail', name: 'E-Commerce, Delivery & Subscription Boxes', icon: '📦', groups: [
    { id: 'retail.perks', name: 'Retail & Delivery Perks' },
    { id: 'retail.meals', name: 'Meal Kits & Food' },
    { id: 'retail.boxes', name: 'Curated Physical Boxes' } ] }
];

const GROUP_BY_ID = {};
const CATEGORY_BY_GROUP = {};
CATEGORIES.forEach(c => c.groups.forEach(g => { GROUP_BY_ID[g.id] = g; CATEGORY_BY_GROUP[g.id] = c; }));

/* tier builder */
function t(name, m, benefits, opts) {
  return Object.assign({ name: name, m: m || {}, benefits: benefits || [] }, opts || {});
}
/* service builder. opts.markets locks a service to the markets it is actually sold
   in — carriers and ISPs are national, unlike everything else in the catalogue. */
function s(id, name, company, group, color, site, blurb, tiers, opts) {
  return Object.assign({ id: id, name: name, company: company, group: group, color: color,
                         site: site, blurb: blurb, tiers: tiers }, opts || {});
}

const CATALOG = [];

/* ─────────────────────────────  VIDEO — Movies & TV  ───────────────────────── */

CATALOG.push(
s('netflix', 'Netflix', 'Netflix', 'video.movies', '#E50914', 'netflix.com',
  'Originals-led movie and series streaming, with ad-supported and 4K tiers.', [
  t('Mobile', { IN: 149 },
    ['One phone or tablet at a time', '480p standard definition', 'Full catalogue, ad-free', 'No TV or computer playback'], { only: ['IN'] }),
  t('Standard with ads', { US: 7.99, GB: 5.99, DE: 4.99, CA: 8.99, AU: 7.99, BR: 20.90, JP: 890, IN: 199 },
    ['1080p Full HD', 'Watch on 2 devices at once', 'Ads before and during most titles', 'A few titles unavailable', 'No downloads on the India tier']),
  t('Standard', { US: 17.99, GB: 12.99, DE: 13.99, CA: 18.99, AU: 18.99, BR: 44.90, JP: 1590, IN: 499 },
    ['1080p Full HD, no ads', 'Watch on 2 devices at once', 'Download on 2 devices', 'Add one extra member outside your home (paid)']),
  t('Premium', { US: 24.99, GB: 19.99, DE: 19.99, CA: 23.99, AU: 25.99, BR: 59.90, JP: 2290, IN: 649 },
    ['4K Ultra HD + HDR', 'Watch on 4 devices at once', 'Download on 6 devices', 'Spatial audio', 'Add up to two extra members (paid)'])
]),

s('disneyplus', 'Disney+', 'Disney', 'video.movies', '#0063e5', 'disneyplus.com',
  'Disney, Pixar, Marvel, Star Wars and National Geographic, plus general entertainment via Star/Hulu.', [
  t('Standard with Ads', { US: 11.99, GB: 6.99, DE: 5.99, CA: 9.99, AU: 9.99, BR: 25.99 },
    ['Full catalogue with ad breaks', 'Up to 1080p', '2 streams at once', 'No downloads']),
  t('Standard', { US: 12.99, GB: 8.99, DE: 9.99, CA: 12.99, AU: 15.99, BR: 34.90 },
    ['Ad-free', 'Up to 1080p', '2 streams at once', '10 devices for downloads']),
  t('Premium', { US: 18.99, GB: 12.99, DE: 13.99, CA: 16.99, AU: 20.99, BR: 46.90 },
    ['Ad-free', '4K UHD + HDR and Dolby Atmos', '4 streams at once', '10 devices for downloads'])
]),

s('hulu', 'Hulu', 'Disney', 'video.movies', '#1ce783', 'hulu.com',
  'Next-day US network TV, FX originals and a large film library. US-only; folded into Disney+ elsewhere.', [
  t('Hulu (With Ads)', { US: 11.99 },
    ['Full streaming library with ads', 'Next-day episodes of current network shows', '2 streams at once'], { only: ['US'] }),
  t('Hulu (No Ads)', { US: 18.99 },
    ['Ad-free on nearly the whole library', 'Downloads on up to 25 titles', '2 streams at once'], { only: ['US'] }),
  t('Hulu + Live TV', { US: 89.99 },
    ['95+ live channels', 'Unlimited cloud DVR', 'Disney+ and ESPN+ included', '2 streams at once (unlimited at home add-on)'], { only: ['US'] })
]),

s('primevideo', 'Amazon Prime Video', 'Amazon', 'video.movies', '#00A8E1', 'primevideo.com',
  'Included with Prime, or standalone. Ads run by default unless you pay the ad-free add-on.', [
  t('Prime Video (standalone)', { US: 8.99, GB: 5.99, DE: 5.99, IN: 299 },
    ['Prime Originals and licensed film/TV', 'Ad-supported by default', 'Up to 3 concurrent streams', 'No Prime shipping benefits']),
  t('Ad-free add-on', { US: 2.99, GB: 2.99, DE: 2.99 },
    ['Removes ads from Prime Video', 'Stacks on top of Prime or standalone Video', 'Does not cover live sport ad breaks'], { addon: true })
]),

s('max', 'HBO Max', 'Warner Bros. Discovery', 'video.movies', '#7B2BF9', 'max.com',
  'HBO originals, Warner Bros. film, DC and the Discovery reality catalogue.', [
  t('Basic with Ads', { US: 10.99, GB: 6.99, DE: 6.99, BR: 29.90 },
    ['Ad-supported streaming', '1080p', '2 concurrent streams', 'No offline downloads']),
  t('Standard', { US: 18.49, GB: 10.99, DE: 10.99, BR: 44.90 },
    ['Ad-free', '1080p', '2 concurrent streams', '30 offline downloads']),
  t('Premium', { US: 24.99, GB: 14.99, DE: 14.99, BR: 59.90 },
    ['Ad-free', '4K UHD + Dolby Atmos', '4 concurrent streams', '100 offline downloads'])
]),

s('peacock', 'Peacock', 'NBCUniversal', 'video.movies', '#FA4616', 'peacocktv.com',
  'NBC and Bravo next-day, Universal film, WWE and Premier League in the US.', [
  t('Premium', { US: 10.99 },
    ['Full library with ads', 'Next-day NBC and Bravo', 'Live sport including Premier League', '3 concurrent streams'], { only: ['US'] }),
  t('Premium Plus', { US: 16.99 },
    ['Nearly ad-free on demand', 'Live stream of your local NBC channel', 'Offline downloads', '3 concurrent streams'], { only: ['US'] })
]),

s('paramountplus', 'Paramount+', 'Paramount', 'video.movies', '#0064FF', 'paramountplus.com',
  'CBS, Star Trek, Yellowstone-adjacent originals and UEFA football.', [
  t('Essential', { US: 7.99, GB: 6.99, DE: 7.99, CA: 7.99, AU: 8.99 },
    ['Ad-supported library', 'Live NFL on CBS and UEFA', 'No local CBS live feed', '3 concurrent streams']),
  t('Premium (with Showtime)', { US: 12.99, GB: 10.99, CA: 12.99, AU: 12.99 },
    ['Ad-free except live TV and a few shows', 'Showtime catalogue included', 'Live local CBS station', 'Offline downloads'])
]),

s('appletvplus', 'Apple TV+', 'Apple', 'video.movies', '#000000', 'tv.apple.com',
  'A small, entirely original, entirely ad-free catalogue.', [
  t('Apple TV+', { US: 12.99, GB: 9.99, DE: 9.99, CA: 12.99, AU: 12.99, IN: 99, JP: 900, BR: 21.90 },
    ['All originals, no ads, ever', '4K HDR with Dolby Atmos', 'Share with up to 5 family members', 'Offline downloads', 'Included in every Apple One bundle'])
])
);

/* ────────────────────  VIDEO — Ad-Free Video & Live TV  ──────────────────── */

CATALOG.push(
s('ytpremium', 'YouTube Premium', 'Google', 'video.live', '#FF0000', 'youtube.com/premium',
  'Ad-free YouTube, background play, downloads, and YouTube Music.', [
  t('Premium Lite', { US: 7.99, GB: 5.99, DE: 5.99, AU: 11.99 },
    ['No ads on most videos', 'Ads remain on Shorts, music and search', 'No background play or downloads', 'No YouTube Music']),
  t('Individual', { US: 13.99, GB: 12.99, DE: 12.99, CA: 15.99, AU: 22.99, IN: 149, BR: 24.90, JP: 1280 },
    ['Ad-free across all of YouTube', 'Background and picture-in-picture play', 'Offline downloads', 'YouTube Music Premium included']),
  t('Student', { US: 7.99, GB: 6.99, DE: 7.49, IN: 89, BR: 13.90 },
    ['Everything in Individual', 'Annual re-verification of student status', 'Up to 4 years total']),
  t('Family', { US: 22.99, GB: 19.99, DE: 19.99, CA: 22.99, AU: 34.99, IN: 299, BR: 41.90 },
    ['Up to 5 household members aged 13+', 'Each gets their own recommendations', 'All members must share a home address'])
]),

s('yttv', 'YouTube TV', 'Google', 'video.live', '#FF0000', 'tv.youtube.com',
  'A full cable replacement: 100+ live US channels with unlimited DVR.', [
  t('Base Plan', { US: 82.99 },
    ['100+ live channels', 'Unlimited cloud DVR, kept 9 months', '3 concurrent streams', '6 household accounts'], { only: ['US'] }),
  t('4K Plus add-on', { US: 9.99 },
    ['4K streams where broadcast', 'Unlimited concurrent home streams', 'Offline DVR downloads'], { only: ['US'], addon: true })
]),

s('twitchturbo', 'Twitch Turbo', 'Amazon', 'video.live', '#9146FF', 'twitch.tv/turbo',
  'Removes Twitch pre-roll and display ads platform-wide.', [
  t('Turbo', { US: 11.99, GB: 8.99, DE: 8.99 },
    ['No pre-roll or display ads site-wide', 'Expanded 60-day VOD storage', 'Custom chat username colour', 'Turbo-only emote set', 'Does not remove creator-run sponsor reads'])
]),

s('sling', 'Sling TV', 'DISH', 'video.live', '#00B0F0', 'sling.com',
  'Cheaper skinny bundles of US live TV, split across two channel packs.', [
  t('Sling Orange', { US: 45.99 },
    ['~32 channels including ESPN and Disney', '1 stream at a time', '50 hours of DVR'], { only: ['US'] }),
  t('Sling Blue', { US: 45.99 },
    ['~45 channels including FOX and NBC', '3 streams at a time', '50 hours of DVR'], { only: ['US'] }),
  t('Orange + Blue', { US: 60.99 },
    ['~50 channels, both packs combined', '4 streams at a time', '50 hours of DVR'], { only: ['US'] })
]),

s('fubo', 'Fubo', 'Fubo / Disney', 'video.live', '#F8007F', 'fubo.tv',
  'Sports-first live TV with a heavy football and international-league lean.', [
  t('Essential', { US: 84.99 },
    ['~185 channels, sports-weighted', '1000 hours cloud DVR', '10 home streams']),
  t('Pro', { US: 84.99 },
    ['~230 channels', 'Regional sports networks', '1000 hours cloud DVR']),
  t('Elite', { US: 94.99 },
    ['~275 channels', 'Fubo Extra entertainment pack', '4K where available']),
  t('Premier', { US: 104.99 },
    ['Everything in Elite', 'Showtime included', 'Highest channel count'])
])
);

/* ─────────────────────  VIDEO — Anime & Niche  ───────────────────── */

CATALOG.push(
s('crunchyroll', 'Crunchyroll', 'Sony', 'video.niche', '#F47521', 'crunchyroll.com',
  'The largest licensed anime library, with same-day simulcasts from Japan.', [
  t('Fan', { US: 7.99, GB: 5.99, DE: 5.99, CA: 9.99, AU: 10.99, IN: 79, BR: 20.90 },
    ['Ad-free anime', 'Simulcasts within an hour of Japan', '1 concurrent stream', 'Digital manga library']),
  t('Mega Fan', { US: 11.99, GB: 7.99, DE: 7.99, CA: 14.99, AU: 15.99, IN: 99, BR: 27.90 },
    ['Everything in Fan', '4 concurrent streams', 'Offline downloads', 'Discounts in the Crunchyroll store']),
  t('Ultimate Fan', { US: 15.99, GB: 12.99, DE: 12.99, CA: 19.99, AU: 21.99, IN: 149 },
    ['Everything in Mega Fan', '6 concurrent streams', 'An annual swag box', 'Early access to store merch'])
]),

s('criterion', 'The Criterion Channel', 'Criterion', 'video.niche', '#8B0000', 'criterionchannel.com',
  'Curated arthouse, world and classic cinema with heavy supplementary material.', [
  t('Monthly', { US: 10.99, CA: 12.99 },
    ['Rotating curated collections', 'Restorations and director retrospectives', 'Commentaries and archival extras', 'Offline downloads'], { only: ['US', 'CA'] }),
  t('Annual', { US: 8.33, CA: 9.99 },
    ['Same as monthly, billed once a year', 'Roughly two months free versus monthly'], { only: ['US', 'CA'], billedYearly: true, y: { US: 99.99, CA: 119.99 } })
]),

s('shudder', 'Shudder', 'AMC Networks', 'video.niche', '#E4322B', 'shudder.com',
  'Horror, thriller and supernatural, including exclusive originals.', [
  t('Monthly', { US: 6.99, GB: 5.99, CA: 6.99, AU: 6.99 },
    ['Curated horror library', 'Shudder Originals and exclusives', 'The Last Drive-In live events', 'Ad-free']),
  t('Annual', { US: 5.99, GB: 4.99 },
    ['Same catalogue, billed yearly', 'About two months cheaper than monthly'], { billedYearly: true, y: { US: 71.88, GB: 59.88 } })
]),

s('britbox', 'BritBox', 'BBC Studios', 'video.niche', '#1B1B3A', 'britbox.com',
  'British TV — drama, panel shows, and the ITV/BBC archive — for viewers outside the UK.', [
  t('Monthly', { US: 8.99, CA: 10.99, AU: 8.99 },
    ['BBC and ITV archive series', 'Same-day soap episodes', 'Ad-free', '5 profiles, 3 streams']),
  t('Annual', { US: 7.50, CA: 9.16, AU: 7.50 },
    ['Same catalogue, billed yearly', 'Roughly two months free'], { billedYearly: true, y: { US: 89.99, CA: 109.99, AU: 89.99 } })
])
);

/* ─────────────────────  AUDIO — Music Streaming  ───────────────────── */

CATALOG.push(
s('spotify', 'Spotify Premium', 'Spotify', 'audio.music', '#1DB954', 'spotify.com',
  'The largest music catalogue, with the widest regional price spread of any service here.', [
  t('Mini', { IN: 107 },
    ['One device, mobile only', 'Ad-free listening and offline downloads', 'Actually sold as a ₹7 day pass or ₹25 week pass — the figure here is the monthly equivalent', 'Cheapest paid Spotify tier anywhere'], { only: ['IN'] }),
  t('Individual', { US: 11.99, GB: 11.99, DE: 10.99, CA: 11.99, AU: 13.99, IN: 119, BR: 21.90, JP: 980 },
    ['Ad-free music and podcasts', 'Offline downloads on 5 devices', 'Unlimited skips', 'Higher-bitrate streaming', 'One account']),
  t('Duo', { US: 16.99, GB: 16.99, DE: 14.99, CA: 15.99, AU: 18.99, IN: 149, BR: 27.90 },
    ['Two Premium accounts for people at one address', 'Separate libraries and recommendations', 'Duo Mix, a shared playlist']),
  t('Family', { US: 19.99, GB: 19.99, DE: 17.99, CA: 18.99, AU: 21.99, IN: 179, BR: 34.90, JP: 1580 },
    ['Up to 6 accounts at one address', 'Explicit-content block per account', 'Spotify Kids app', 'Family Mix playlist']),
  t('Student', { US: 5.99, GB: 5.99, DE: 5.99, CA: 5.99, AU: 6.99, IN: 59, BR: 11.90 },
    ['Full Premium at about half price', 'Verify enrolment each year', 'Up to 4 years', 'Bundled with Hulu in the US'])
]),

s('applemusic', 'Apple Music', 'Apple', 'audio.music', '#FA243C', 'music.apple.com',
  'Lossless and spatial audio at no extra cost, tightly bound to the Apple ecosystem.', [
  t('Voice', { US: 4.99 },
    ['Siri-only request and playback', 'No on-screen library browsing', 'No lossless or offline downloads'], { only: ['US'] }),
  t('Student', { US: 5.99, GB: 5.99, DE: 5.99, CA: 5.99, AU: 5.99, IN: 59, JP: 580 },
    ['Full Apple Music', 'Apple TV+ included in most markets', 'Verify enrolment each year']),
  t('Individual', { US: 10.99, GB: 10.99, DE: 10.99, CA: 10.99, AU: 12.99, IN: 99, BR: 21.90, JP: 1080 },
    ['100M+ tracks, ad-free', 'Lossless and Dolby Atmos spatial audio', 'Offline downloads', 'Live radio and curated stations']),
  t('Family', { US: 16.99, GB: 16.99, DE: 16.99, CA: 16.99, AU: 19.99, IN: 149, BR: 34.90, JP: 1680 },
    ['Up to 6 people via Family Sharing', 'Personal library and recommendations each', 'Everything in Individual'])
]),

s('amazonmusic', 'Amazon Music Unlimited', 'Amazon', 'audio.music', '#25D1DA', 'music.amazon.com',
  'Full-catalogue music streaming, discounted if you already pay for Prime.', [
  t('Single Device', { US: 5.99 },
    ['One Echo or Fire TV device only', 'Full catalogue on that device', 'No phone or web playback'], { only: ['US'] }),
  t('Individual (Prime member)', { US: 9.99, GB: 9.99, DE: 9.99, IN: 149 },
    ['Full catalogue, ad-free', 'Ultra HD and spatial audio', 'Offline downloads', 'Requires an active Prime membership']),
  t('Individual', { US: 11.99, GB: 11.99, DE: 11.99, CA: 11.99, AU: 13.99, IN: 149, BR: 19.90 },
    ['Full catalogue, ad-free', 'Ultra HD lossless and Dolby Atmos', 'Offline downloads', 'No Prime membership needed']),
  t('Family', { US: 19.99, GB: 19.99, DE: 17.99, CA: 17.99, AU: 21.99, IN: 199 },
    ['Up to 6 accounts', 'Simultaneous playback on 6 devices', 'Everything in Individual']),
  t('Student', { US: 5.99, GB: 5.99, DE: 5.99 },
    ['Full Unlimited at student rate', 'Annual verification required'])
]),

s('tidal', 'Tidal', 'Block, Inc.', 'audio.music', '#00FFFF', 'tidal.com',
  'Hi-res audio with an above-average artist payout model.', [
  t('Individual', { US: 10.99, GB: 10.99, DE: 10.99, CA: 10.99, AU: 12.99, BR: 19.90 },
    ['HiRes FLAC up to 24-bit/192kHz', 'Dolby Atmos and Sony 360 Reality Audio', 'Offline downloads', 'Direct artist payouts from your subscription']),
  t('Family', { US: 16.99, GB: 16.99, DE: 16.99, CA: 16.99 },
    ['Up to 6 accounts at one address', 'Everything in Individual per account']),
  t('Student', { US: 5.49, GB: 5.49, DE: 5.49 },
    ['Full Tidal at student rate', 'Annual re-verification']),
  t('DJ add-on', { US: 9.00, GB: 9.00 },
    ['Streams into rekordbox, Serato and djay', 'Extra on top of any paid plan'], { addon: true })
]),

s('deezer', 'Deezer', 'Deezer', 'audio.music', '#A238FF', 'deezer.com',
  'French-founded streaming with strong lyric and Flow recommendation features.', [
  t('Premium', { US: 11.99, GB: 11.99, DE: 11.99, CA: 11.99, AU: 13.99, BR: 21.90 },
    ['Ad-free, 120M+ tracks', 'HiFi FLAC lossless included', 'Offline downloads', 'Flow personalised radio', 'Live lyrics']),
  t('Duo', { US: 15.99, GB: 15.99, DE: 15.99 },
    ['Two accounts for one household', 'Separate Flow and libraries']),
  t('Family', { US: 19.99, GB: 19.99, DE: 19.99, BR: 34.90 },
    ['Up to 6 profiles', 'Deezer Kids mode', 'Everything in Premium']),
  t('Student', { US: 5.99, GB: 5.99, DE: 5.99 },
    ['Full Premium at student rate', 'Annual verification'])
]),

s('pandora', 'Pandora Plus', 'SiriusXM', 'audio.music', '#3668FF', 'pandora.com',
  'Radio-style personalised stations built on the Music Genome Project. US only.', [
  t('Plus', { US: 4.99 },
    ['Ad-free personalised radio', 'Unlimited skips and replays', '4 offline stations', 'No on-demand track search'], { only: ['US'] }),
  t('Premium', { US: 10.99 },
    ['On-demand search and playlists', 'Ad-free with offline downloads', 'Share playlists', 'Everything in Plus'], { only: ['US'] }),
  t('Premium Family', { US: 16.99 },
    ['Up to 6 accounts', 'Personalised stations each', 'Everything in Premium'], { only: ['US'] })
])
);

/* ────────────────────  AUDIO — Spoken Word & Audio  ──────────────────── */

CATALOG.push(
s('audible', 'Audible', 'Amazon', 'audio.spoken', '#F8991C', 'audible.com',
  'Audiobook credits plus a rotating included-listening catalogue.', [
  t('Plus', { US: 7.95 },
    ['Unlimited access to the Plus Catalog', 'Audible Originals and podcasts', 'No monthly credits — no à-la-carte titles'], { only: ['US'] }),
  t('Premium Plus', { US: 14.95, GB: 8.99, DE: 9.95, CA: 14.95, AU: 16.45, IN: 199 },
    ['One credit a month for any title, yours to keep', 'Full Plus Catalog included', '30% off extra audiobook purchases', 'Credits roll over for a year']),
  t('Premium Plus Annual', { US: 12.50, GB: 7.50, IN: 166 },
    ['12 credits up front', 'Cheapest cost per credit', 'Everything in Premium Plus'], { billedYearly: true, y: { US: 149.50, GB: 90.00, IN: 1998 } })
]),

s('siriusxm', 'SiriusXM', 'SiriusXM', 'audio.spoken', '#0000EB', 'siriusxm.com',
  'Satellite and streaming radio: sport play-by-play, talk and ad-free music channels.', [
  t('Music & Entertainment', { US: 9.99, CA: 12.99 },
    ['Ad-free music channels', 'Talk and comedy', 'Streaming app included', 'No live play-by-play sport']),
  t('All Access', { US: 24.99, CA: 25.99 },
    ['Every channel including live sport', 'Howard Stern', 'In-car satellite plus app streaming', 'Video content in-app']),
  t('Streaming Platinum', { US: 12.99 },
    ['All Access channels, app only', 'No in-car satellite receiver'], { only: ['US'] })
]),

s('wondery', 'Wondery+', 'Amazon', 'audio.spoken', '#FF3B58', 'wondery.com',
  'Ad-free and early access to Wondery narrative podcasts.', [
  t('Monthly', { US: 4.99, GB: 4.99, AU: 6.99 },
    ['Ad-free Wondery shows', 'Episodes days or weeks early', 'Exclusive bonus series', 'Binge full seasons at launch']),
  t('Annual', { US: 2.92, GB: 2.92 },
    ['Same access, billed once a year', 'Roughly 40% cheaper than monthly'], { billedYearly: true, y: { US: 34.99, GB: 34.99 } })
]),

s('pocketcasts', 'Pocket Casts Plus', 'Automattic', 'audio.spoken', '#F43E37', 'pocketcasts.com',
  'A power-user podcast player with cross-device sync.', [
  t('Plus', { US: 3.99, GB: 3.49, DE: 3.99 },
    ['Desktop and web apps', '20GB cloud file storage', 'Apple Watch and Wear OS playback', 'Folders, themes and app icons', 'Bookmarks']),
  t('Patron', { US: 9.99, GB: 9.99, DE: 9.99 },
    ['Everything in Plus', '100GB cloud storage', 'Early access to new features', 'Supports independent development'])
])
);

/* ─────────────────────  CLOUD — Storage  ───────────────────── */

CATALOG.push(
s('googleone', 'Google One', 'Google', 'cloud.storage', '#4285F4', 'one.google.com',
  'Storage shared across Drive, Gmail and Photos — and, at the top, the Gemini subscription.', [
  t('Basic 100GB', { US: 1.99, GB: 1.59, DE: 1.99, CA: 2.79, AU: 2.49, IN: 130, BR: 6.99, JP: 250 },
    ['100GB across Drive, Gmail and Photos', 'Share with 5 family members', 'Google Photos editing features', '10% back in the Google Store']),
  t('Standard 200GB', { US: 2.99, GB: 2.49, DE: 2.99, CA: 3.99, AU: 4.39, IN: 210, BR: 9.99, JP: 380 },
    ['200GB pooled storage', 'Family sharing for 5', 'Extra Photos editing tools', '3% back in the Google Store']),
  t('Premium 2TB', { US: 9.99, GB: 7.99, DE: 9.99, CA: 13.99, AU: 12.49, IN: 650, BR: 34.99, JP: 1300 },
    ['2TB pooled storage', 'Google Workspace premium features', 'Dark web report and VPN in some markets', 'Family sharing for 5']),
  t('Google AI Pro', { US: 19.99, GB: 18.99, DE: 21.99, CA: 27.99, AU: 32.99, IN: 1950, BR: 96.99, JP: 2900 },
    ['2TB storage', 'Gemini 3 Pro with higher limits', 'Gemini in Gmail, Docs and Sheets', 'Veo video generation credits', 'NotebookLM higher limits']),
  t('Google AI Ultra', { US: 249.99, GB: 234.99, IN: 24500 },
    ['30TB storage', 'Highest Gemini model access and limits', 'Veo and Flow at the top quota', 'YouTube Premium included', 'Project Mariner agent access'])
]),

s('icloud', 'iCloud+', 'Apple', 'cloud.storage', '#3693F3', 'apple.com/icloud',
  'Device-backup-first storage plus Apple\'s privacy add-ons.', [
  t('50GB', { US: 0.99, GB: 0.99, DE: 0.99, CA: 1.29, AU: 1.49, IN: 75, BR: 4.90, JP: 130 },
    ['50GB iCloud storage', 'iCloud Private Relay', 'Hide My Email', 'Custom email domain', 'HomeKit Secure Video for 1 camera']),
  t('200GB', { US: 2.99, GB: 2.99, DE: 2.99, CA: 3.99, AU: 4.49, IN: 219, BR: 14.90, JP: 400 },
    ['200GB, shareable with family', 'Everything in 50GB', 'HomeKit Secure Video for 5 cameras']),
  t('2TB', { US: 9.99, GB: 8.99, DE: 9.99, CA: 12.99, AU: 14.99, IN: 749, BR: 49.90, JP: 1300 },
    ['2TB, shareable with family', 'Unlimited HomeKit Secure Video cameras', 'Everything in 200GB']),
  t('6TB', { US: 29.99, GB: 26.99, DE: 29.99, IN: 2199 },
    ['6TB pooled storage', 'All iCloud+ privacy features']),
  t('12TB', { US: 59.99, GB: 54.99, DE: 59.99, IN: 4399 },
    ['12TB pooled storage', 'All iCloud+ privacy features'])
]),

s('onedrive', 'Microsoft OneDrive', 'Microsoft', 'cloud.storage', '#0078D4', 'onedrive.com',
  'Storage sold standalone or, more usually, folded into Microsoft 365.', [
  t('OneDrive Standalone 100GB', { US: 1.99, GB: 1.99, DE: 2.00, IN: 145 },
    ['100GB cloud storage', 'Sync on all devices', 'Web versions of Office apps', 'No desktop Office apps']),
  t('Microsoft 365 Basic', { US: 1.99, GB: 1.99, DE: 2.00, IN: 145 },
    ['100GB storage', 'Ad-free Outlook mail', 'Web and mobile Office apps', 'Standard security support']),
  t('OneDrive for Business Plan 1', { US: 5.00, GB: 3.90, DE: 4.20 },
    ['1TB per user', 'Per-user commercial licence', 'Version history and retention', 'Admin controls and audit'])
]),

s('dropbox', 'Dropbox', 'Dropbox', 'cloud.storage', '#0061FF', 'dropbox.com',
  'Sync-first storage with strong file-request and sharing tooling.', [
  t('Plus', { US: 11.99, GB: 9.99, DE: 11.99, AU: 17.99, IN: 999 },
    ['2TB for one user', '30-day file recovery', 'Dropbox Passwords and Vault', 'Send files up to 50GB', 'Automatic camera uploads']),
  t('Essentials', { US: 19.99, GB: 16.58, DE: 18.00 },
    ['3TB for one user', '180-day file recovery', 'PDF editing and e-signatures', 'Branded sharing and viewer analytics']),
  t('Business', { US: 18.00, GB: 15.00, DE: 16.00 },
    ['9TB shared across the team', 'Per-user pricing, 3 users minimum', 'Admin console and tiered permissions', '180-day recovery']),
  t('Business Plus', { US: 30.00, GB: 24.00, DE: 26.00 },
    ['15TB shared team storage', 'Unlimited e-signatures', 'Compliance tracking and legal hold', '1-year file recovery'])
]),

s('box', 'Box', 'Box', 'cloud.storage', '#0061D5', 'box.com',
  'Enterprise-leaning content management with granular governance.', [
  t('Personal Pro', { US: 14.00, GB: 11.00, DE: 12.00 },
    ['100GB storage', '5GB per-file upload limit', 'Password-protected links and expiry', 'Box Sign, 15 documents a month']),
  t('Business', { US: 20.00, GB: 15.00, DE: 16.80 },
    ['Unlimited storage', '5GB file uploads', 'Per-user pricing, 3 users minimum', 'Full user management and audit', 'Unlimited integrations']),
  t('Business Plus', { US: 33.00, GB: 25.00, DE: 28.00 },
    ['Unlimited storage and external collaborators', '15GB file uploads', 'Advanced admin and reporting', 'Unlimited Box Sign'])
])
);

/* ─────────────────────  CLOUD — Password Managers  ───────────────────── */

CATALOG.push(
s('1password', '1Password', 'AgileBits', 'cloud.passwords', '#0572EC', '1password.com',
  'A polished cross-platform vault with strong sharing and travel modes.', [
  t('Individual', { US: 3.99, GB: 2.99, DE: 3.49 },
    ['Unlimited passwords and devices', '1GB document storage', 'Watchtower breach alerts', 'Travel Mode', 'Passkey support']),
  t('Individual (annual)', { US: 2.99, GB: 2.49, DE: 2.99 },
    ['Same as Individual, billed yearly', 'About 25% cheaper than monthly'], { billedYearly: true, y: { US: 35.88, GB: 29.88, DE: 35.88 } }),
  t('Families', { US: 6.99, GB: 4.99, DE: 5.99 },
    ['5 family members, more at extra cost', 'Shared and private vaults', 'Recover a locked-out family member', 'Everything in Individual']),
  t('Families (annual)', { US: 4.99, GB: 4.16, DE: 4.99 },
    ['Same as Families, billed yearly'], { billedYearly: true, y: { US: 59.88, GB: 49.92, DE: 59.88 } })
]),

s('bitwarden', 'Bitwarden Premium', 'Bitwarden', 'cloud.passwords', '#175DDC', 'bitwarden.com',
  'Open-source, auditable, and by far the cheapest paid manager here.', [
  t('Premium', { US: 0.83 },
    ['Built-in TOTP authenticator', '1GB encrypted file attachments', 'Emergency access contacts', 'Vault health reports', 'Yubikey and FIDO2 hardware keys'], { billedYearly: true, y: { US: 10.00, GB: 10.00, DE: 10.00 } }),
  t('Families', { US: 3.33 },
    ['6 users', 'Unlimited shared collections', 'Premium features for every member'], { billedYearly: true, y: { US: 40.00, GB: 40.00, DE: 40.00 } }),
  t('Teams', { US: 4.00 },
    ['Per-user business plan', 'Shared collections and groups', 'Event logs and directory sync']),
  t('Enterprise', { US: 6.00 },
    ['SSO with SAML and OIDC', 'Enterprise policy enforcement', 'Free Families plan for every member'])
]),

s('dashlane', 'Dashlane', 'Dashlane', 'cloud.passwords', '#0E353D', 'dashlane.com',
  'Password management bundled with a VPN and dark-web monitoring.', [
  t('Premium', { US: 4.99, GB: 4.99, DE: 4.99 },
    ['Unlimited passwords and devices', 'Dark web monitoring', 'Hotspot Shield VPN included', 'Live phishing alerts']),
  t('Friends & Family', { US: 7.49, GB: 7.49, DE: 7.49 },
    ['10 accounts', 'Premium features for everyone', 'Family dashboard', 'Individual private vaults']),
  t('Business', { US: 8.00, GB: 8.00, DE: 8.00 },
    ['Per-seat business plan', 'SSO and SCIM provisioning', 'Admin policy controls', 'Credential-risk reporting'])
])
);

/* ─────────────────────  CLOUD — VPNs & Antivirus  ───────────────────── */

CATALOG.push(
s('nordvpn', 'NordVPN', 'Nord Security', 'cloud.vpn', '#4687FF', 'nordvpn.com',
  'Large server fleet; the headline price only applies on multi-year commitments.', [
  t('Basic (monthly)', { US: 12.99, GB: 10.99, DE: 12.99, IN: 1050 },
    ['VPN on 10 devices', '7,000+ servers in 118 countries', 'Threat Protection ad and malware blocking', 'No long-term commitment']),
  t('Basic (2-year)', { US: 3.39, GB: 2.99, DE: 3.39, IN: 290 },
    ['Same as Basic, prepaid for 2 years', 'Roughly a quarter of the monthly rate', 'Renews at a higher rate'], { billedYearly: true, y: { US: 40.68, GB: 35.88, IN: 3480 } }),
  t('Plus (2-year)', { US: 4.39, GB: 3.89, DE: 4.39 },
    ['Everything in Basic', 'NordPass password manager', 'Data-breach scanner'], { billedYearly: true, y: { US: 52.68, GB: 46.68 } }),
  t('Complete (2-year)', { US: 5.39, GB: 4.79, DE: 5.39 },
    ['Everything in Plus', '1TB NordLocker encrypted storage', 'File-level encryption'], { billedYearly: true, y: { US: 64.68, GB: 57.48 } })
]),

s('expressvpn', 'ExpressVPN', 'Kape Technologies', 'cloud.vpn', '#DA3940', 'expressvpn.com',
  'Premium-priced, audited, with the widest router-firmware support.', [
  t('Monthly', { US: 12.95, GB: 12.95, DE: 12.95, IN: 1080 },
    ['8 simultaneous devices', 'Servers in 105 countries', 'Lightway protocol', 'Router firmware and split tunnelling', '24/7 live chat']),
  t('12-month', { US: 6.67, GB: 6.67, DE: 6.67 },
    ['Same features, prepaid annually', 'Often bundled with extra free months'], { billedYearly: true, y: { US: 99.95, GB: 99.95, DE: 99.95 } }),
  t('24-month', { US: 4.99, GB: 4.99, DE: 4.99 },
    ['Cheapest per-month ExpressVPN rate', 'Identity Defender in some markets'], { billedYearly: true, y: { US: 59.88, GB: 59.88 } })
]),

s('surfshark', 'Surfshark', 'Nord Security', 'cloud.vpn', '#178A81', 'surfshark.com',
  'The only major VPN with genuinely unlimited simultaneous devices.', [
  t('Starter (monthly)', { US: 15.45, GB: 12.99, DE: 15.45, IN: 1250 },
    ['Unlimited devices on one account', '3,200+ servers in 100 countries', 'CleanWeb ad and tracker blocking', 'Bypasser split tunnelling']),
  t('Starter (2-year)', { US: 2.19, GB: 1.99, DE: 2.19, IN: 180 },
    ['Same as Starter, prepaid for 2 years', 'The cheapest mainstream VPN rate', 'Renews annually at a higher price'], { billedYearly: true, y: { US: 26.28, GB: 23.88, IN: 2160 } }),
  t('One (2-year)', { US: 3.19, GB: 2.89, DE: 3.19 },
    ['Everything in Starter', 'Antivirus and webcam protection', 'Alternative ID and alias email', 'Real-time breach alerts'], { billedYearly: true, y: { US: 38.28, GB: 34.68 } }),
  t('One+ (2-year)', { US: 5.99, GB: 5.39, DE: 5.99 },
    ['Everything in One', 'Incogni automated data-broker removal'], { billedYearly: true, y: { US: 71.88, GB: 64.68 } })
]),

s('protonvpn', 'Proton VPN', 'Proton AG', 'cloud.vpn', '#6D4AFF', 'protonvpn.com',
  'Swiss-based, open-source clients, and the only credible free tier.', [
  t('Free', { US: 0 },
    ['Servers in 5 countries', '1 device', 'No logs, no ads, no data cap', 'Slower speeds at peak times']),
  t('VPN Plus (monthly)', { US: 9.99, GB: 9.99, DE: 9.99, IN: 850 },
    ['10 devices', '8,000+ servers in 110+ countries', 'Secure Core double-hop routing', 'NetShield ad blocker', 'P2P and streaming support']),
  t('VPN Plus (annual)', { US: 4.99, GB: 4.99, DE: 4.99 },
    ['Same as VPN Plus, billed yearly', 'Half the monthly rate'], { billedYearly: true, y: { US: 59.88, GB: 59.88, DE: 59.88 } }),
  t('Proton Unlimited', { US: 12.99, GB: 12.99, DE: 12.99 },
    ['Everything in VPN Plus', '500GB Proton Drive and Mail storage', 'Proton Pass password manager', 'Proton Calendar and 15 email aliases'])
]),

s('malwarebytes', 'Malwarebytes Premium', 'Malwarebytes', 'cloud.vpn', '#0D3ECC', 'malwarebytes.com',
  'Lightweight real-time malware protection, often run alongside another AV.', [
  t('Standard', { US: 3.33, GB: 2.99, DE: 3.33 },
    ['Real-time malware and ransomware protection', 'Brute-force attack protection', '1 to 5 devices', 'Browser Guard included'], { billedYearly: true, y: { US: 44.99, GB: 39.99, DE: 44.99 } }),
  t('Premium + VPN', { US: 6.66, GB: 5.99, DE: 6.66 },
    ['Everything in Standard', 'Unlimited-bandwidth VPN', 'Servers in 50+ countries'], { billedYearly: true, y: { US: 79.99, GB: 71.99 } }),
  t('Personal Data Remover', { US: 8.33, GB: 7.49, DE: 8.33 },
    ['Everything in Premium + VPN', 'Automated data-broker opt-outs', 'Identity-exposure monitoring'], { billedYearly: true, y: { US: 99.99, GB: 89.99 } })
])
);

/* ─────────────────────  WORK — Creative & Design  ───────────────────── */

CATALOG.push(
s('adobecc', 'Adobe Creative Cloud', 'Adobe', 'work.creative', '#FF0000', 'adobe.com',
  'The industry-standard creative suite, priced very differently by commitment length.', [
  t('Photography (20GB)', { US: 9.99, GB: 9.98, DE: 11.89, CA: 13.99, AU: 14.99, IN: 850 },
    ['Photoshop and Lightroom on desktop and mobile', '20GB cloud storage', 'Adobe Portfolio and Fonts', 'Annual commitment, billed monthly']),
  t('Photography (1TB)', { US: 19.99, GB: 19.97, DE: 23.79, IN: 1699 },
    ['Same apps as the 20GB plan', '1TB cloud storage', 'Generative AI credits']),
  t('Single App', { US: 22.99, GB: 21.98, DE: 25.99, CA: 29.99, AU: 32.99, IN: 1596 },
    ['One app of your choice — Photoshop, Illustrator, Premiere Pro…', '100GB cloud storage', 'Adobe Fonts and Portfolio', 'Firefly generative credits']),
  t('All Apps (annual, paid monthly)', { US: 59.99, GB: 56.98, DE: 64.99, CA: 74.99, AU: 81.99, IN: 4230 },
    ['20+ apps including Photoshop, Illustrator, InDesign, Premiere Pro, After Effects', '100GB cloud storage', 'Firefly generative AI credits', 'Adobe Express Premium']),
  t('All Apps (month-to-month)', { US: 89.99, GB: 85.97, DE: 97.49, IN: 6349 },
    ['Identical to the annual plan', 'Cancel any month with no fee', 'About 50% more per month']),
  t('Acrobat Pro', { US: 19.99, GB: 15.17, DE: 18.75, IN: 1420 },
    ['Create, edit and combine PDFs', 'E-signatures and signature tracking', 'Redaction and password protection', 'Works on desktop, web and mobile'])
]),

s('canva', 'Canva Pro', 'Canva', 'work.creative', '#00C4CC', 'canva.com',
  'Template-first design that non-designers can actually finish work in.', [
  t('Pro (monthly)', { US: 15.00, GB: 12.99, DE: 11.99, CA: 17.99, AU: 21.99, IN: 500, BR: 44.90 },
    ['140M+ premium stock photos, video and audio', 'Magic Studio AI tools and Magic Resize', 'Background remover', '1TB cloud storage', 'Brand Kit and one-click brand application']),
  t('Pro (annual)', { US: 10.00, GB: 8.99, DE: 9.17, IN: 333, AU: 14.58 },
    ['Same as Pro monthly, billed yearly', 'Around a third cheaper'], { billedYearly: true, y: { US: 120.00, GB: 107.88, IN: 3999, AU: 174.99 } }),
  t('Canva Teams', { US: 10.00, GB: 8.50, DE: 8.00, IN: 300 },
    ['Everything in Pro, per person', 'Minimum 3 people', 'Brand controls and template locking', 'Team workflows and approvals']),
  t('Canva Enterprise', { US: 42.00, GB: 36.00 },
    ['Everything in Teams', 'SSO and SCIM provisioning', 'Multiple brand kits with enforcement', 'Admin insights and 24/7 support'])
]),

s('figma', 'Figma', 'Figma', 'work.creative', '#F24E1E', 'figma.com',
  'Collaborative interface design; seats are billed by the role each person holds.', [
  t('Collab seat', { US: 5.00, GB: 4.00, DE: 4.50 },
    ['Comment, inspect and prototype', 'Cannot edit design files', 'Unlimited files in shared projects', 'Cheapest way to include stakeholders']),
  t('Dev seat', { US: 15.00, GB: 12.00, DE: 13.50 },
    ['Dev Mode with code and measurement handoff', 'Full FigJam editing', 'Annotations and status tracking', 'No design-file editing']),
  t('Full seat (Professional, annual)', { US: 16.00, GB: 12.00, DE: 14.00, IN: 1200 },
    ['Unlimited Figma design and FigJam files', 'Shared team libraries', 'Unlimited version history', 'Private plugins and widgets']),
  t('Full seat (Professional, monthly)', { US: 20.00, GB: 15.00, DE: 17.50 },
    ['Same as the annual full seat', 'No annual commitment', '25% more per month']),
  t('Organization', { US: 55.00, GB: 45.00, DE: 50.00 },
    ['Everything in Professional', 'Org-wide design systems and analytics', 'SSO with SAML', 'Branching and merging', 'Centralised admin']),
  t('Enterprise', { US: 90.00, GB: 75.00 },
    ['Everything in Organization', 'Multiple workspaces', 'Idle-seat management', 'Guest and access controls', 'Dedicated support'])
])
);

/* ─────────────────────  WORK — Productivity & Notes  ───────────────────── */

CATALOG.push(
s('microsoft365', 'Microsoft 365', 'Microsoft', 'work.notes', '#D83B01', 'microsoft.com/microsoft-365',
  'Desktop Office apps plus 1TB of OneDrive, with Copilot now folded into consumer plans.', [
  t('Basic', { US: 1.99, GB: 1.99, DE: 2.00, IN: 145, AU: 3.00 },
    ['100GB OneDrive storage', 'Ad-free Outlook mail and calendar', 'Web and mobile Office apps only', 'Standard security support']),
  t('Personal', { US: 9.99, GB: 8.49, DE: 10.00, CA: 12.00, AU: 14.00, IN: 489, BR: 42.00, JP: 1490 },
    ['Word, Excel, PowerPoint, Outlook on desktop', '1TB OneDrive storage', 'One person, up to 5 devices at once', 'Microsoft Copilot AI credits', 'Microsoft Defender and Editor']),
  t('Family', { US: 12.99, GB: 10.99, DE: 13.00, CA: 16.00, AU: 18.00, IN: 619, BR: 52.00, JP: 2100 },
    ['Everything in Personal for up to 6 people', '1TB OneDrive each — 6TB total', 'Family Safety location and screen time', 'Each person gets their own Copilot credits']),
  t('Business Standard', { US: 12.50, GB: 10.30, DE: 11.70, IN: 770 },
    ['Desktop and web Office apps per user', 'Custom business email domain', 'Teams with webinar hosting', '1TB OneDrive per user']),
  t('Business Premium', { US: 22.00, GB: 18.10, DE: 20.60 },
    ['Everything in Business Standard', 'Intune device management', 'Advanced threat protection', 'Information protection and DLP'])
]),

s('googleworkspace', 'Google Workspace', 'Google', 'work.notes', '#34A853', 'workspace.google.com',
  'Gmail on your own domain, plus Docs, Meet and Drive for a team.', [
  t('Workspace Individual', { US: 9.99, GB: 7.99, DE: 9.99, IN: 700 },
    ['For solo businesses, no custom domain', 'Longer Meet calls with recording', 'Booking pages and email marketing', '1TB storage']),
  t('Business Starter', { US: 7.00, GB: 5.75, DE: 6.50, IN: 136, BR: 27.00 },
    ['Custom domain email', '30GB pooled storage per user', 'Meet for 100 participants', 'Gemini in Gmail and Docs']),
  t('Business Standard', { US: 14.00, GB: 11.50, DE: 13.00, IN: 736, BR: 55.00 },
    ['2TB pooled storage per user', 'Meet for 150 with recording', 'Appointment booking pages', 'Gemini with higher limits and NotebookLM']),
  t('Business Plus', { US: 22.00, GB: 18.00, DE: 20.50, IN: 1380 },
    ['5TB pooled storage per user', 'Meet for 500 with attendance tracking', 'Vault eDiscovery and retention', 'Advanced endpoint management']),
  t('Enterprise Standard', { US: 34.00, GB: 28.00 },
    ['Unlimited pooled storage on request', 'Data loss prevention and data regions', 'S/MIME encryption', 'Enterprise Gemini and security centre'])
]),

s('notion', 'Notion', 'Notion Labs', 'work.notes', '#000000', 'notion.so',
  'A modular docs-and-database workspace; AI is now bundled into the paid tiers.', [
  t('Plus (annual)', { US: 10.00, GB: 8.00, DE: 9.00, IN: 700 },
    ['Unlimited blocks for teams', '30-day page history', 'Up to 100 guests', 'Unlimited file uploads', 'Charts and custom automations']),
  t('Plus (monthly)', { US: 12.00, GB: 10.00, DE: 11.00, IN: 840 },
    ['Same as Plus annual', 'No yearly commitment']),
  t('Business (annual)', { US: 20.00, GB: 16.00, DE: 18.00 },
    ['Everything in Plus', 'Notion AI included', 'SAML single sign-on', 'Private team spaces', '90-day page history', '250 guests']),
  t('Business (monthly)', { US: 24.00, GB: 19.00, DE: 22.00 },
    ['Same as Business annual', 'No yearly commitment']),
  t('Enterprise', { US: 30.00, GB: 25.00 },
    ['Everything in Business', 'Advanced security and audit log', 'User provisioning via SCIM', 'Workspace analytics', 'Customer success manager'])
]),

s('evernote', 'Evernote', 'Bending Spoons', 'work.notes', '#00A82D', 'evernote.com',
  'Long-running note capture with best-in-class search across scanned documents.', [
  t('Personal', { US: 14.99, GB: 12.99, DE: 14.99 },
    ['Sync across unlimited devices', '20GB monthly uploads', 'Offline access on mobile', 'Tasks and calendar integration', 'PDF and document search']),
  t('Professional', { US: 17.99, GB: 15.99, DE: 17.99 },
    ['Everything in Personal', '20GB monthly uploads plus larger notes', 'Boolean and location search', 'Task assignment', 'Slack and Salesforce integrations']),
  t('Teams', { US: 24.99, GB: 20.99, DE: 24.99 },
    ['Everything in Professional per user', 'Shared team spaces', 'Centralised admin and billing', '20GB extra per user'])
]),

s('todoist', 'Todoist', 'Doist', 'work.notes', '#E44332', 'todoist.com',
  'Fast, keyboard-first task capture with natural-language due dates.', [
  t('Pro (annual)', { US: 4.00, GB: 3.00, DE: 4.00, IN: 280 },
    ['300 active projects', 'Reminders and location alerts', 'Calendar layout and filter views', 'AI Assistant', '150MB file uploads']),
  t('Pro (monthly)', { US: 5.00, GB: 4.00, DE: 5.00, IN: 350 },
    ['Same as Pro annual', 'No yearly commitment']),
  t('Business (annual)', { US: 6.00, GB: 5.00, DE: 6.00 },
    ['500 projects per member', 'Shared team workspace and roles', 'Team activity log', 'Admin and billing controls']),
  t('Business (monthly)', { US: 8.00, GB: 6.50, DE: 8.00 },
    ['Same as Business annual', 'No yearly commitment'])
])
);

/* ─────────────────────  WORK — Web & Development  ───────────────────── */

CATALOG.push(
s('webflow', 'Webflow', 'Webflow', 'work.dev', '#4353FF', 'webflow.com',
  'Visual web development that exports real production sites; billed per site and per seat.', [
  t('Site: Basic', { US: 18.00, GB: 14.00, DE: 16.00 },
    ['Custom domain hosting', '150 static pages', '250GB bandwidth', 'No CMS collections']),
  t('Site: CMS', { US: 29.00, GB: 23.00, DE: 26.00 },
    ['2,000 CMS items', '200GB bandwidth', '3 content editor seats', 'Site search']),
  t('Site: Business', { US: 49.00, GB: 39.00, DE: 44.00 },
    ['10,000 CMS items', '400GB bandwidth', '10 content editors', 'Form file uploads and uptime SLA']),
  t('Workspace: Core', { US: 19.00, GB: 15.00, DE: 17.00 },
    ['Per full seat', '10 unhosted staging sites', 'Custom code and page branching', 'Code export']),
  t('Workspace: Growth', { US: 49.00, GB: 39.00, DE: 44.00 },
    ['Everything in Core', 'Unlimited unhosted sites', 'Advanced roles and permissions', 'Advanced publishing options'])
]),

s('copilot', 'GitHub Copilot', 'Microsoft', 'work.dev', '#24292F', 'github.com/features/copilot',
  'AI code completion and chat inside the editor, with agent mode on the paid tiers.', [
  t('Free', { US: 0 },
    ['2,000 completions a month', '50 chat requests a month', 'Access to a limited model set']),
  t('Pro', { US: 10.00, GB: 8.00, DE: 9.00, IN: 700 },
    ['Unlimited completions and chat', 'Coding agent and agent mode', 'Access to premium models', 'Free for verified students and OSS maintainers'], { yNote: '$100/year' }),
  t('Pro+', { US: 39.00, GB: 32.00, DE: 36.00 },
    ['Everything in Pro', '30x the premium-model request budget', 'Access to the largest models', 'Copilot code review at scale']),
  t('Business', { US: 19.00, GB: 16.00, DE: 18.00 },
    ['Per-seat organisational plan', 'Policy management and IP indemnity', 'Excludes your code from training', 'Audit logs']),
  t('Enterprise', { US: 39.00, GB: 33.00 },
    ['Everything in Business', 'Fine-tuned models on your codebase', 'Copilot in the GitHub web UI', 'Knowledge bases across repos'])
]),

s('cursor', 'Cursor', 'Anysphere', 'work.dev', '#000000', 'cursor.com',
  'An AI-native code editor built as a VS Code fork; priced on model usage.', [
  t('Hobby', { US: 0 },
    ['Limited agent requests', 'Limited tab completions', 'Two-week Pro trial on signup']),
  t('Pro', { US: 20.00, GB: 16.00, DE: 18.00, IN: 1400 },
    ['Extended agent limits', 'Unlimited tab completions', 'Background agents', 'Bug-bot code review', 'Maximum-context mode']),
  t('Pro+', { US: 60.00, GB: 48.00, DE: 55.00 },
    ['3x the Pro usage on every model', 'Priority access at peak times']),
  t('Ultra', { US: 200.00, GB: 160.00, DE: 185.00 },
    ['20x Pro usage', 'Priority access to new features', 'Highest model rate limits']),
  t('Teams', { US: 40.00, GB: 32.00, DE: 37.00 },
    ['Per-user plan', 'Org-wide privacy mode enforced', 'Centralised billing and admin', 'SAML SSO and analytics'])
]),

s('replit', 'Replit', 'Replit', 'work.dev', '#F26207', 'replit.com',
  'Browser-based development and hosting, with Agent doing most of the building.', [
  t('Starter', { US: 0 },
    ['Public workspaces', 'Limited Agent checkpoints', '3 development apps']),
  t('Core (annual)', { US: 20.00, GB: 16.00, DE: 18.00, IN: 1400 },
    ['$25 of monthly Agent credit', 'Unlimited public and private apps', 'Access to frontier models', 'Deployments included']),
  t('Core (monthly)', { US: 25.00, GB: 20.00, DE: 23.00, IN: 1750 },
    ['Same as Core annual', 'No yearly commitment']),
  t('Teams', { US: 40.00, GB: 32.00, DE: 37.00 },
    ['Per-user, $40 monthly credit each', 'Role-based access control', 'Centralised billing', 'Private team deployments'])
]),

s('hubspot', 'HubSpot', 'HubSpot', 'work.dev', '#FF7A59', 'hubspot.com',
  'CRM with marketing, sales and service hubs layered on top; sold per seat and per contact.', [
  t('Starter Customer Platform', { US: 20.00, GB: 16.00, DE: 18.00 },
    ['Per seat, all hubs at starter level', 'Email marketing to 1,000 contacts', 'Live chat and simple automation', 'Removes most HubSpot branding']),
  t('Marketing Hub Professional', { US: 890.00, GB: 720.00, DE: 800.00 },
    ['3 seats included, 2,000 marketing contacts', 'Omni-channel marketing automation', 'Campaign reporting and A/B testing', 'Custom reporting and dashboards']),
  t('Sales Hub Professional', { US: 100.00, GB: 80.00, DE: 90.00 },
    ['Per seat', 'Sequences and forecasting', 'Custom quotes and playbooks', 'Deal and pipeline automation']),
  t('Service Hub Professional', { US: 100.00, GB: 80.00, DE: 90.00 },
    ['Per seat', 'Customer portal and knowledge base', 'SLA management', 'Customer feedback surveys'])
])
);

/* ─────────────────────  AI — Chat & Coding Assistants  ───────────────────── */

CATALOG.push(
s('chatgpt', 'ChatGPT', 'OpenAI', 'ai.chat', '#10A37F', 'chatgpt.com',
  'The most widely used assistant; cheaper regional tiers exist in a handful of markets.', [
  t('Free', { US: 0 },
    ['Access to the standard model', 'Limited reasoning and image generation', 'Rate-limited at busy times']),
  t('Go', { IN: 399, ID: 75000, BR: 39.90 },
    ['A low-cost regional tier', '10x the free message limits', 'Image generation and file uploads', 'Not sold in the US or EU'], { only: ['IN', 'ID', 'BR'] }),
  t('Plus', { US: 20.00, GB: 16.00, DE: 23.00, CA: 28.00, AU: 30.00, IN: 1999, BR: 100.00, JP: 3000 },
    ['5x free message limits', 'Advanced reasoning models', 'Deep research and agent mode', 'Sora video generation', 'Custom GPTs and Projects']),
  t('Pro', { US: 200.00, GB: 160.00, DE: 229.00, IN: 19900 },
    ['Near-unlimited access to every model', 'Pro reasoning mode with extended compute', 'Highest Sora and agent quotas', 'Priority at peak times']),
  t('Business (per seat, annual)', { US: 25.00, GB: 20.00, DE: 23.00 },
    ['Shared workspace with admin console', 'Data excluded from training by default', 'Higher limits than Plus', 'Connectors to internal tools']),
  t('Business (per seat, monthly)', { US: 30.00, GB: 24.00, DE: 28.00 },
    ['Same as annual Business', 'No yearly commitment'])
]),

s('claude', 'Claude', 'Anthropic', 'ai.chat', '#D97757', 'claude.ai',
  'Assistant with a strong long-document and coding lean; Claude Code is bundled from Pro up.', [
  t('Free', { US: 0 },
    ['Daily message allowance on the standard model', 'Web search and file analysis', 'Resets every few hours']),
  t('Pro (monthly)', { US: 20.00, GB: 18.00, DE: 21.50, IN: 1650 },
    ['About 5x free usage', 'Claude Code in the terminal', 'Projects and extended thinking', 'Connectors and integrations', 'Early access to new features']),
  t('Pro (annual)', { US: 17.00, GB: 15.00, DE: 18.00, IN: 1400 },
    ['Same as Pro monthly', 'About 15% cheaper prepaid'], { billedYearly: true, y: { US: 204.00, GB: 180.00, IN: 16800 } }),
  t('Max 5x', { US: 100.00, GB: 90.00, DE: 108.00 },
    ['5x the Pro usage limits', 'Higher Claude Code limits', 'Priority access at peak times']),
  t('Max 20x', { US: 200.00, GB: 180.00, DE: 215.00 },
    ['20x the Pro usage limits', 'The highest individual limits', 'Earliest access to new capabilities']),
  t('Team (per seat, annual)', { US: 25.00, GB: 22.00, DE: 27.00 },
    ['Minimum 5 seats', 'Central billing and admin', 'Shared projects', 'Data excluded from training']),
  t('Enterprise', { US: 60.00, GB: 52.00 },
    ['Everything in Team', 'SSO and SCIM provisioning', 'Expanded context window', 'Audit logs and role-based permissions'])
]),

s('gemini', 'Google Gemini Advanced', 'Google', 'ai.chat', '#8E7CF7', 'gemini.google.com',
  'Sold as the Google AI tiers of Google One — storage and Gemini in one subscription.', [
  t('Google AI Pro', { US: 19.99, GB: 18.99, DE: 21.99, CA: 27.99, AU: 32.99, IN: 1950, BR: 96.99, JP: 2900 },
    ['Gemini 3 Pro with the highest consumer limits', 'Gemini in Gmail, Docs, Sheets and Meet', '2TB Google One storage', 'Veo video generation', 'NotebookLM with raised limits']),
  t('Google AI Ultra', { US: 249.99, GB: 234.99, IN: 24500 },
    ['Top model tier and Deep Think mode', '30TB storage', 'Highest Veo and Flow quotas', 'YouTube Premium included', 'Agentic tools in early access']),
  t('Gemini Code Assist Standard', { US: 22.80, GB: 19.00, DE: 21.00 },
    ['AI code assistance across IDEs', 'Per-user commercial licence', 'Larger context for codebases', 'Google Cloud integration'])
]),

s('perplexity', 'Perplexity Pro', 'Perplexity AI', 'ai.chat', '#20808D', 'perplexity.ai',
  'Search-first answers with inline citations and a shopping/agent layer.', [
  t('Free', { US: 0 },
    ['Unlimited quick searches', '3 Pro searches a day', 'Standard model only']),
  t('Pro (monthly)', { US: 20.00, GB: 17.00, DE: 20.00, IN: 1950 },
    ['300+ Pro searches a day', 'Choice of frontier models', 'Unlimited file uploads', 'Comet browser and assistant', 'API credits each month']),
  t('Pro (annual)', { US: 16.67, GB: 14.17, IN: 1625 },
    ['Same as Pro monthly, billed yearly'], { billedYearly: true, y: { US: 200.00, GB: 170.00, IN: 19500 } }),
  t('Max', { US: 200.00, GB: 170.00, DE: 200.00 },
    ['Unlimited Labs usage', 'Priority access to the newest models', 'Highest research and agent limits']),
  t('Enterprise Pro', { US: 40.00, GB: 34.00 },
    ['Per seat, minimum commitment', 'Internal knowledge search', 'SSO and SCIM', 'Data retention controls'])
])
);

/* ─────────────────────  AI — Media Generation  ───────────────────── */

CATALOG.push(
s('midjourney', 'Midjourney', 'Midjourney', 'ai.media', '#4B4BFF', 'midjourney.com',
  'Image generation billed as GPU time, with a stealth mode only on the top tiers.', [
  t('Basic', { US: 10.00 },
    ['~200 images a month (3.3 fast GPU hours)', 'No relaxed generations', 'Member gallery access', 'General commercial terms']),
  t('Standard', { US: 30.00 },
    ['15 fast GPU hours', 'Unlimited relaxed generations', 'Everything in Basic']),
  t('Pro', { US: 60.00 },
    ['30 fast GPU hours', 'Stealth mode — generations stay private', 'Unlimited relaxed generations', '12 concurrent fast jobs']),
  t('Mega', { US: 120.00 },
    ['60 fast GPU hours', 'Stealth mode', 'Highest concurrency', 'Everything in Pro'])
]),

s('runway', 'Runway', 'Runway', 'ai.media', '#00E5A0', 'runwayml.com',
  'Video generation and editing, priced in credits per month.', [
  t('Standard (annual)', { US: 12.00, GB: 10.00, DE: 11.50 },
    ['625 credits a month', 'Up to 4K upscaling', 'Remove the watermark', 'Custom voices']),
  t('Standard (monthly)', { US: 15.00, GB: 12.50, DE: 14.00 },
    ['Same as Standard annual', 'No yearly commitment']),
  t('Pro (annual)', { US: 28.00, GB: 23.00, DE: 26.00 },
    ['2,250 credits a month', '100GB assets', 'Custom AI training runs', 'Everything in Standard']),
  t('Unlimited (annual)', { US: 76.00, GB: 63.00, DE: 71.00 },
    ['Unlimited relaxed-rate generations', '2,250 fast credits a month', 'Everything in Pro']),
  t('Enterprise', { US: 1500.00 },
    ['Custom credit volume', 'SSO and admin controls', 'Dedicated support and onboarding', 'Contract terms and indemnity'])
]),

s('elevenlabs', 'ElevenLabs', 'ElevenLabs', 'ai.media', '#000000', 'elevenlabs.io',
  'Voice synthesis and cloning, billed by characters of generated speech.', [
  t('Free', { US: 0 },
    ['10,000 characters a month', 'Attribution required', '3 custom voices']),
  t('Starter', { US: 5.00, GB: 4.20, DE: 4.80 },
    ['30,000 characters a month (~30 min)', 'Instant voice cloning', 'Commercial licence', '10 custom voices']),
  t('Creator', { US: 22.00, GB: 18.00, DE: 21.00 },
    ['100,000 characters a month (~100 min)', 'Professional voice cloning', 'Higher-quality audio output', 'Usage-based billing beyond the quota']),
  t('Pro', { US: 99.00, GB: 82.00, DE: 94.00 },
    ['500,000 characters a month', '44.1kHz PCM audio output', 'API access at higher concurrency']),
  t('Scale', { US: 330.00, GB: 275.00 },
    ['2,000,000 characters a month', 'Multi-seat workspace', 'Higher concurrency limits'])
])
);

/* ─────────────────────  GAMES — Consoles & PC Passes  ───────────────────── */

CATALOG.push(
s('gamepass', 'Xbox Game Pass', 'Microsoft', 'games.pass', '#107C10', 'xbox.com/game-pass',
  'A rotating library across console, PC and cloud, restructured into three console tiers.', [
  t('Essential', { US: 9.99, GB: 8.99, DE: 9.99, CA: 12.99, AU: 15.95, IN: 499, BR: 39.99 },
    ['~50 game library on console, PC and cloud', 'Online console multiplayer', 'Cloud gaming at 1080p', 'Member discounts']),
  t('Premium', { US: 14.99, GB: 12.99, DE: 14.99, CA: 19.99, AU: 22.95, IN: 749, BR: 59.99 },
    ['~200 game library', 'Online console multiplayer', 'New Xbox games within a year of launch', 'Cloud gaming at 1440p']),
  t('Ultimate', { US: 29.99, GB: 22.99, DE: 26.99, CA: 39.99, AU: 44.95, IN: 1349, BR: 109.99 },
    ['~400 game library', 'Day-one Xbox Game Studios and Activision releases', 'Fortnite Crew and EA Play included', 'Cloud gaming at 4K', 'Console, PC and cloud all covered']),
  t('PC Game Pass', { US: 16.49, GB: 12.99, DE: 14.99, CA: 21.99, AU: 24.95, IN: 749 },
    ['PC library including day-one first-party', 'EA Play on PC included', 'No console entitlement'])
]),

s('psplus', 'PlayStation Plus', 'Sony', 'games.pass', '#0070D1', 'playstation.com',
  'Console multiplayer plus, on the higher tiers, a large back catalogue.', [
  t('Essential', { US: 11.99, GB: 8.99, DE: 8.99, CA: 14.99, AU: 15.95, IN: 499, BR: 44.90, JP: 850 },
    ['Online multiplayer', 'Two monthly games to keep while subscribed', 'Cloud saves', 'Exclusive store discounts']),
  t('Extra', { US: 17.99, GB: 13.49, DE: 13.99, CA: 21.99, AU: 24.95, IN: 849, BR: 69.90, JP: 1300 },
    ['Everything in Essential', '400+ PS5 and PS4 game catalogue', 'Game trials on select titles']),
  t('Premium', { US: 21.99, GB: 16.99, DE: 16.99, CA: 26.99, AU: 29.95, IN: 999, BR: 84.90, JP: 1550 },
    ['Everything in Extra', 'Classics catalogue from PS1, PS2, PSP and PS3', 'Cloud streaming', 'Time-limited game trials'])
]),

s('nso', 'Nintendo Switch Online', 'Nintendo', 'games.pass', '#E60012', 'nintendo.com',
  'The cheapest console online service, sold almost entirely on annual terms.', [
  t('Individual (monthly)', { US: 3.99, GB: 3.49, DE: 3.99, CA: 4.99, AU: 5.95, JP: 306 },
    ['Online play', 'NES and SNES libraries', 'Cloud save backup', 'Smartphone voice chat app']),
  t('Individual (annual)', { US: 1.67, GB: 1.50, DE: 1.67, CA: 2.08, AU: 2.50, JP: 202 },
    ['Same as monthly, billed yearly', 'Less than half the monthly rate'], { billedYearly: true, y: { US: 19.99, GB: 17.99, DE: 19.99, CA: 24.99, AU: 29.95, JP: 2400 } }),
  t('Family (annual)', { US: 2.92, GB: 2.58, DE: 2.92, AU: 4.58 },
    ['Up to 8 Nintendo Accounts', 'Each member gets full benefits', 'Accounts need not share an address'], { billedYearly: true, y: { US: 34.99, GB: 31.49, DE: 34.99, AU: 54.95 } }),
  t('Expansion Pack — Individual (annual)', { US: 4.17, GB: 3.42, DE: 4.17 },
    ['Everything in Individual', 'Nintendo 64, Mega Drive and GBA libraries', 'Animal Crossing and Splatoon DLC included'], { billedYearly: true, y: { US: 49.99, GB: 34.99, DE: 39.99 } }),
  t('Expansion Pack — Family (annual)', { US: 6.67, GB: 5.83, DE: 6.67 },
    ['Expansion Pack for up to 8 accounts', 'All retro libraries and included DLC'], { billedYearly: true, y: { US: 79.99, GB: 69.99, DE: 79.99 } })
]),

s('eaplay', 'EA Play', 'Electronic Arts', 'games.pass', '#FF4747', 'ea.com/ea-play',
  'EA\'s own catalogue plus early trials of its new releases.', [
  t('EA Play (monthly)', { US: 5.99, GB: 3.99, DE: 3.99, CA: 6.99, AU: 8.99, IN: 315, BR: 22.50 },
    ['The EA Play catalogue of past titles', '10-hour trials of new EA games', '10% discount on EA digital purchases', 'In-game rewards']),
  t('EA Play (annual)', { US: 3.33, GB: 2.42, DE: 2.42, IN: 175 },
    ['Same as monthly, billed yearly', 'About 45% cheaper'], { billedYearly: true, y: { US: 39.99, GB: 29.00, DE: 29.00, IN: 2099 } }),
  t('EA Play Pro (monthly)', { US: 16.99, GB: 14.99, DE: 14.99, IN: 899 },
    ['Full new EA releases at launch, not trials', 'Premium editions and their content', 'PC only', 'Everything in EA Play']),
  t('EA Play Pro (annual)', { US: 9.99, GB: 8.99, DE: 8.99 },
    ['Same as Pro monthly, billed yearly'], { billedYearly: true, y: { US: 119.99, GB: 107.99, DE: 107.99 } })
]),

s('ubisoftplus', 'Ubisoft+', 'Ubisoft', 'games.pass', '#0F8CE9', 'ubisoft.com/ubisoftplus',
  'Ubisoft\'s catalogue, split between a back-catalogue tier and a day-one tier.', [
  t('Classics', { US: 7.99, GB: 6.99, DE: 7.99, CA: 9.99, AU: 11.99 },
    ['100+ past Ubisoft titles', 'Available on PC, Xbox and PlayStation', 'No day-one releases']),
  t('Premium', { US: 17.99, GB: 14.99, DE: 17.99, CA: 22.99, AU: 26.99 },
    ['New Ubisoft releases on day one', 'Premium editions and season passes', 'Full back catalogue', 'PC and Amazon Luna'])
])
);

/* ─────────────────────  GAMES — Cloud & Mobile  ───────────────────── */

CATALOG.push(
s('geforcenow', 'GeForce NOW', 'NVIDIA', 'games.cloud', '#76B900', 'nvidia.com/geforce-now',
  'Streams games you already own from cloud RTX hardware.', [
  t('Free', { US: 0 },
    ['1-hour sessions', 'Standard queue — long waits at peak', 'Basic rigs, no ray tracing']),
  t('Performance', { US: 9.99, GB: 8.99, DE: 9.99, CA: 12.99, AU: 15.99 },
    ['Up to 1440p at 60fps', '6-hour sessions', 'RTX ray tracing and DLSS', 'Priority server access']),
  t('Ultimate', { US: 19.99, GB: 17.99, DE: 19.99, CA: 24.99, AU: 29.99 },
    ['Up to 4K at 120fps', '8-hour sessions', 'RTX 5080-class rigs', 'Lowest-latency Reflex mode', 'First in queue'])
]),

s('applearcade', 'Apple Arcade', 'Apple', 'games.cloud', '#FF2D55', 'apple.com/apple-arcade',
  'A curated set of premium mobile and TV games with no ads or in-app purchases.', [
  t('Apple Arcade', { US: 6.99, GB: 6.99, DE: 6.99, CA: 8.99, AU: 9.99, IN: 99, BR: 14.90, JP: 900 },
    ['200+ games with no ads or IAP', 'Plays on iPhone, iPad, Mac, Apple TV and Vision Pro', 'Family Sharing for up to 6', 'Offline play and cross-device saves', 'Included in Apple One Individual and above'])
])
);

/* ─────────────────────  LEARN — Education Platforms  ───────────────────── */

CATALOG.push(
s('masterclass', 'MasterClass', 'MasterClass', 'learn.edu', '#E50914', 'masterclass.com',
  'Cinematic courses from well-known practitioners; annual billing only.', [
  t('Standard', { US: 10.00, GB: 8.00, DE: 9.00, CA: 13.00, AU: 15.00 },
    ['200+ classes on one device at a time', 'Offline downloads', 'Class workbooks', 'Billed as a single annual payment'], { billedYearly: true, y: { US: 120.00, GB: 96.00, DE: 108.00, CA: 156.00, AU: 180.00 } }),
  t('Plus', { US: 15.00, GB: 12.00, DE: 14.00 },
    ['Everything in Standard', 'Two devices at once', 'Access on TV apps'], { billedYearly: true, y: { US: 180.00, GB: 144.00, DE: 168.00 } }),
  t('Premium', { US: 20.00, GB: 16.00, DE: 18.00 },
    ['Everything in Plus', 'Six devices at once', 'Highest video quality'], { billedYearly: true, y: { US: 240.00, GB: 192.00, DE: 216.00 } })
]),

s('courseraplus', 'Coursera Plus', 'Coursera', 'learn.edu', '#0056D2', 'coursera.org',
  'One subscription across most university and industry certificates on the platform.', [
  t('Monthly', { US: 59.00, GB: 49.00, DE: 55.00, IN: 4132 },
    ['7,000+ courses from 170+ partners', 'Unlimited certificates while subscribed', 'Hands-on guided projects', 'Excludes degrees and a few certificates']),
  t('Annual', { US: 33.25, GB: 27.42, DE: 31.00, IN: 2325 },
    ['Same catalogue, billed once a year', 'About 45% cheaper than monthly'], { billedYearly: true, y: { US: 399.00, GB: 329.00, DE: 372.00, IN: 27900 } }),
  t('Coursera Plus Teams', { US: 399.00, GB: 329.00 },
    ['Per user, billed annually', 'Team analytics and skill tracking', 'Assigned learning paths'])
]),

s('skillshare', 'Skillshare', 'Skillshare', 'learn.edu', '#00FF84', 'skillshare.com',
  'Project-based creative classes taught by working practitioners.', [
  t('Monthly', { US: 32.00, GB: 26.00, DE: 29.00 },
    ['Unlimited classes', 'Offline mobile viewing', 'Class projects and feedback', 'No annual commitment']),
  t('Annual', { US: 13.75, GB: 11.25, DE: 12.50 },
    ['Same catalogue, billed yearly', 'Less than half the monthly rate'], { billedYearly: true, y: { US: 165.00, GB: 135.00, DE: 150.00 } }),
  t('Teams', { US: 159.00, GB: 129.00 },
    ['Per user, billed annually', 'Team dashboard and usage reporting', 'Centralised billing'])
]),

s('brilliant', 'Brilliant', 'Brilliant.org', 'learn.edu', '#00B2FF', 'brilliant.org',
  'Interactive maths, science and computer-science problem sets.', [
  t('Monthly', { US: 24.99, GB: 19.99, DE: 22.99 },
    ['70+ interactive courses', 'Daily problems', 'Guided paths in maths, CS and data', 'Offline mobile lessons']),
  t('Annual', { US: 12.49, GB: 9.99, DE: 11.49 },
    ['Same access, billed yearly', 'Half the monthly rate'], { billedYearly: true, y: { US: 149.88, GB: 119.88, DE: 137.88 } }),
  t('Family (annual)', { US: 19.99, GB: 15.99 },
    ['Up to 6 accounts', 'Individual progress tracking', 'Everything in the annual plan'], { billedYearly: true, y: { US: 239.88, GB: 191.88 } })
]),

s('duolingo', 'Duolingo Super', 'Duolingo', 'learn.edu', '#58CC02', 'duolingo.com',
  'Gamified language learning; Super removes ads and hearts, Max adds AI practice.', [
  t('Super (monthly)', { US: 12.99, GB: 9.99, DE: 11.99, CA: 16.99, AU: 19.99, IN: 480, BR: 39.90 },
    ['No ads', 'Unlimited hearts — mistakes never lock you out', 'Unlimited Legendary attempts', 'Personalised practice hub']),
  t('Super (annual)', { US: 7.00, GB: 5.42, DE: 6.50, IN: 267, BR: 21.60 },
    ['Same as Super monthly, billed yearly', 'About 45% cheaper'], { billedYearly: true, y: { US: 83.99, GB: 64.99, DE: 77.99, IN: 3200, BR: 259.00 } }),
  t('Super Family (annual)', { US: 10.00, GB: 8.33, DE: 9.58, IN: 400 },
    ['Up to 6 accounts', 'Everything in Super for each member'], { billedYearly: true, y: { US: 119.99, GB: 99.99, DE: 114.99, IN: 4800 } }),
  t('Max (monthly)', { US: 29.99, GB: 24.99, DE: 27.99, IN: 1100 },
    ['Everything in Super', 'Video Call with Lily, an AI conversation partner', 'Explain My Answer', 'Roleplay scenarios']),
  t('Max (annual)', { US: 14.00, GB: 11.67, DE: 13.00, IN: 533 },
    ['Same as Max monthly, billed yearly'], { billedYearly: true, y: { US: 167.99, GB: 139.99, DE: 155.99, IN: 6400 } })
]),

s('linkedinlearning', 'LinkedIn Learning', 'Microsoft', 'learn.edu', '#0A66C2', 'linkedin.com/learning',
  'Professional video courses bundled with LinkedIn Premium features.', [
  t('Monthly', { US: 39.99, GB: 34.99, DE: 39.99, IN: 1400 },
    ['21,000+ business, tech and creative courses', 'Certificates on your LinkedIn profile', 'Offline mobile viewing', 'Includes LinkedIn Premium features']),
  t('Annual', { US: 19.99, GB: 17.50, DE: 19.99, IN: 700 },
    ['Same catalogue, billed yearly', 'Half the monthly rate'], { billedYearly: true, y: { US: 239.88, GB: 209.99, DE: 239.88, IN: 8400 } }),
  t('Teams', { US: 379.88 },
    ['Per user, billed annually', 'Admin dashboard and skill analytics', 'Assigned learning paths', 'Custom content upload'])
])
);

/* ─────────────────────  LEARN — Journalism & Newsletters  ───────────────────── */

CATALOG.push(
s('nyt', 'The New York Times', 'The New York Times Company', 'learn.news', '#000000', 'nytimes.com',
  'Sold as separate products; the bundle is only worth it if you use more than news.', [
  t('News (introductory)', { US: 4.00, GB: 4.00, CA: 4.00 },
    ['Full news access', 'Introductory rate for the first year', 'Renews at the standard rate']),
  t('News (standard)', { US: 25.00, GB: 20.00, CA: 30.00, AU: 32.00 },
    ['Unlimited articles', 'The Morning and other newsletters', 'App and audio articles', 'Billed every 4 weeks, not monthly']),
  t('Games', { US: 6.00, GB: 5.00 },
    ['The full Crossword archive back to 1993', 'Spelling Bee, Connections and Wordle stats', 'No news access']),
  t('Cooking', { US: 5.00, GB: 4.00 },
    ['20,000+ recipes', 'Recipe box and notes', 'No news access']),
  t('All Access bundle', { US: 30.00, GB: 25.00 },
    ['News, Games, Cooking, Wirecutter and The Athletic', 'Best value if you use two or more', 'Billed every 4 weeks'])
]),

s('wsj', 'The Wall Street Journal', 'News Corp', 'learn.news', '#0274B6', 'wsj.com',
  'Business and markets coverage, with a steep step up after the intro period.', [
  t('Digital (introductory)', { US: 4.00, GB: 4.00 },
    ['Full digital access', 'Intro rate for the first year', 'Renews at the standard rate']),
  t('Digital (standard)', { US: 38.99, GB: 32.00, DE: 36.00 },
    ['WSJ.com and the apps', 'Markets data and analysis', 'Newsletters and podcasts', 'WSJ Magazine']),
  t('Digital + Print', { US: 51.99, GB: 44.00 },
    ['Everything in Digital', 'Print delivery of the daily paper', 'Weekend edition included']),
  t('Professional', { US: 59.00 },
    ['Everything in Digital', 'Factiva-adjacent research tools', 'Deeper company and industry data'])
]),

s('medium', 'Medium', 'A Medium Corporation', 'learn.news', '#000000', 'medium.com',
  'A flat fee for everything behind the paywall across all publications.', [
  t('Monthly', { US: 5.00, GB: 4.00, DE: 5.00, IN: 350 },
    ['Unlimited member-only stories', 'Offline reading in the app', 'Audio versions of articles', 'Supports writers you read']),
  t('Annual', { US: 4.17, GB: 3.33, DE: 4.17, IN: 292 },
    ['Same as monthly, billed yearly', 'Two months cheaper'], { billedYearly: true, y: { US: 50.00, GB: 40.00, DE: 50.00, IN: 3500 } }),
  t('Friend of Medium', { US: 15.00, GB: 12.00 },
    ['Everything in the standard plan', 'A larger share goes to the writers you read', 'Supporter badge on your profile'])
]),

s('substack', 'Substack publication', 'Substack', 'learn.news', '#FF6719', 'substack.com',
  'Per-writer newsletters — add one entry per publication you actually pay for.', [
  t('Typical monthly', { US: 6.00, GB: 5.00, DE: 6.00, IN: 420 },
    ['Paid posts and full archive', 'Subscriber-only comment threads', 'Set by the individual writer', 'Most sit between $5 and $10']),
  t('Typical annual', { US: 4.17, GB: 3.33, DE: 4.17, IN: 292 },
    ['Same as monthly, billed yearly', 'Writers usually discount 15–20%'], { billedYearly: true, y: { US: 50.00, GB: 40.00, DE: 50.00, IN: 3500 } }),
  t('Founding member', { US: 12.50, GB: 10.00 },
    ['A voluntary higher tier', 'Sometimes adds calls or extra threads', 'Amount is often reader-chosen'], { billedYearly: true, y: { US: 150.00, GB: 120.00 } })
])
);

/* ─────────────────────  HEALTH — Workout & Tracking  ───────────────────── */

CATALOG.push(
s('peloton', 'Peloton App', 'Peloton', 'health.fitness', '#DF1F26', 'onepeloton.com',
  'Studio classes without owning the hardware — three tiers by class access.', [
  t('App Free', { US: 0 },
    ['A rotating set of 50+ classes', 'No live classes', 'Limited class types']),
  t('App One', { US: 12.99, GB: 12.99, DE: 12.99, CA: 16.99, AU: 19.99 },
    ['Thousands of classes', 'Strength, yoga, running and meditation', 'Limited cycling, rowing and treadmill classes', 'Live and on-demand']),
  t('App+', { US: 24.00, GB: 24.00, DE: 24.00, CA: 30.00, AU: 34.99 },
    ['Everything in App One', 'Unlimited cycling, rowing and treadmill classes', 'Works with third-party equipment', 'Apple Watch and heart-rate integration']),
  t('All-Access (with hardware)', { US: 44.00, GB: 39.00, DE: 39.00, CA: 55.00, AU: 59.00 },
    ['Required for Bike, Tread and Row owners', 'Unlimited household profiles', 'Everything in App+', 'Leaderboard and metrics'])
]),

s('fitnessplus', 'Apple Fitness+', 'Apple', 'health.fitness', '#A0E82C', 'apple.com/apple-fitness-plus',
  'Guided workouts with live Apple Watch metrics on screen.', [
  t('Monthly', { US: 9.99, GB: 9.99, DE: 9.99, CA: 12.99, AU: 14.99 },
    ['12 workout types with new classes weekly', 'Real-time Apple Watch metrics on screen', 'Time to Walk and Meditate audio', 'Custom Plans and Stacks', 'Family Sharing for up to 6']),
  t('Annual', { US: 6.67, GB: 6.67, DE: 6.67, CA: 8.33, AU: 10.00 },
    ['Same as monthly, billed yearly', 'Roughly two months free'], { billedYearly: true, y: { US: 79.99, GB: 79.99, DE: 79.99, CA: 99.99, AU: 119.99 } })
]),

s('classpass', 'ClassPass', 'Mindbody', 'health.fitness', '#0A0A0A', 'classpass.com',
  'Credits spent at third-party gyms and studios; credit cost varies by class and city.', [
  t('Intro (8 credits)', { US: 19.00, GB: 15.00, DE: 17.00 },
    ['About 1 class a month in most cities', 'Access to gyms, studios and spas', 'Credits roll over for one cycle']),
  t('Basic (28 credits)', { US: 59.00, GB: 45.00, DE: 52.00 },
    ['Roughly 3–5 classes a month', 'Digital on-demand library', 'Guest passes']),
  t('Standard (44 credits)', { US: 89.00, GB: 69.00, DE: 79.00 },
    ['Roughly 5–8 classes a month', 'Everything in Basic']),
  t('Premium (80 credits)', { US: 159.00, GB: 125.00, DE: 142.00 },
    ['Roughly 10–14 classes a month', 'Priority booking on popular classes']),
  t('Unlimited-style (100+ credits)', { US: 219.00, GB: 175.00 },
    ['Highest credit allocation', 'Best per-credit rate', 'Everything in Premium'])
]),

s('strava', 'Strava', 'Strava', 'health.fitness', '#FC4C02', 'strava.com',
  'Activity tracking with the social layer and route tools behind the paywall.', [
  t('Monthly', { US: 11.99, GB: 8.99, DE: 9.99, CA: 15.99, AU: 17.99, IN: 700, BR: 34.90 },
    ['Route planner with heatmaps', 'Segment leaderboards and live segments', 'Training log and fitness/freshness', 'Matched runs and rides', 'Beacon live location safety']),
  t('Annual', { US: 6.67, GB: 4.99, DE: 5.83, IN: 400, BR: 19.90 },
    ['Same features, billed yearly', 'About 45% cheaper than monthly'], { billedYearly: true, y: { US: 79.99, GB: 59.99, DE: 69.99, IN: 4800, BR: 239.00 } }),
  t('Family (annual)', { US: 9.17, GB: 6.67, DE: 7.92 },
    ['Up to 4 accounts', 'Everything in the annual plan for each'], { billedYearly: true, y: { US: 109.99, GB: 79.99, DE: 94.99 } })
]),

s('whoop', 'Whoop', 'Whoop', 'health.fitness', '#FF0026', 'whoop.com',
  'A screenless strap sold as a membership — the hardware is included in the fee.', [
  t('One (annual)', { US: 16.58, GB: 16.58, DE: 16.58, AU: 24.00 },
    ['Whoop 5.0 band included', 'Strain, recovery and sleep tracking', 'Health Monitor vitals', 'Free hardware upgrade every 2 years'], { billedYearly: true, y: { US: 199.00, GB: 199.00, DE: 199.00, AU: 288.00 } }),
  t('Peak (annual)', { US: 19.92, GB: 19.92, DE: 19.92 },
    ['Everything in One', 'Healthspan and Whoop Age', 'Advanced health insights', 'Free hardware upgrade every 2 years'], { billedYearly: true, y: { US: 239.00, GB: 239.00, DE: 239.00 } }),
  t('Life (annual)', { US: 29.92, GB: 29.92, DE: 29.92 },
    ['Whoop MG hardware with medical-grade ECG', 'Blood pressure insights', 'Irregular heart rhythm notifications', 'Free hardware upgrade every year'], { billedYearly: true, y: { US: 359.00, GB: 359.00, DE: 359.00 } })
])
);

/* ─────────────────────  HEALTH — Mindfulness  ───────────────────── */

CATALOG.push(
s('headspace', 'Headspace', 'Headspace', 'health.mind', '#F47D31', 'headspace.com',
  'Structured meditation courses with a strong beginner on-ramp.', [
  t('Monthly', { US: 12.99, GB: 9.99, DE: 12.99, CA: 17.99, AU: 19.99, IN: 999 },
    ['Guided meditation courses', 'Sleepcasts and sleep music', 'Focus music and movement sessions', 'Offline downloads']),
  t('Annual', { US: 5.83, GB: 4.99, DE: 5.83, IN: 500 },
    ['Same content, billed yearly', 'Roughly 55% cheaper than monthly'], { billedYearly: true, y: { US: 69.99, GB: 59.99, DE: 69.99, IN: 5999 } }),
  t('Family (annual)', { US: 8.33, GB: 7.50, DE: 8.33 },
    ['Up to 6 accounts', 'Everything in the annual plan for each'], { billedYearly: true, y: { US: 99.99, GB: 89.99, DE: 99.99 } }),
  t('Student', { US: 9.99 },
    ['Full Headspace at a discounted annual rate', 'Annual enrolment verification'], { billedYearly: true, y: { US: 9.99 } })
]),

s('calm', 'Calm', 'Calm', 'health.mind', '#2C6BED', 'calm.com',
  'Sleep-first mindfulness — the Sleep Stories are the reason most people pay.', [
  t('Monthly', { US: 14.99, GB: 12.99, DE: 14.99, CA: 19.99, AU: 22.99, IN: 1150 },
    ['Sleep Stories read by well-known narrators', 'Daily Calm meditation', 'Soundscapes and breathing exercises', 'Masterclasses']),
  t('Annual', { US: 5.83, GB: 4.99, DE: 5.83, IN: 500 },
    ['Same content, billed yearly', 'About 60% cheaper than monthly'], { billedYearly: true, y: { US: 69.99, GB: 59.99, DE: 69.99, IN: 5999 } }),
  t('Family (annual)', { US: 8.33, GB: 7.50, DE: 8.33 },
    ['Up to 6 accounts', 'Everything in the annual plan for each'], { billedYearly: true, y: { US: 99.99, GB: 89.99, DE: 99.99 } }),
  t('Lifetime', { US: 399.99, GB: 349.99 },
    ['A single one-off payment', 'Permanent access to everything', 'Track it as a one-time cost, not a subscription'])
])
);

/* ─────────────────────  RETAIL — Delivery & Perks  ───────────────────── */

CATALOG.push(
s('amazonprime', 'Amazon Prime', 'Amazon', 'retail.perks', '#FF9900', 'amazon.com/prime',
  'Shipping first, but the bundle is why it survives a cost-cutting pass.', [
  t('Prime (monthly)', { US: 14.99, GB: 8.99, DE: 8.99, CA: 10.49, AU: 9.99, IN: 299, BR: 19.90, JP: 600 },
    ['Free one and two-day delivery', 'Prime Video, Music and Reading', 'Prime Gaming with monthly titles', 'Grocery and pharmacy perks', 'Early access to Lightning Deals']),
  t('Prime (annual)', { US: 11.58, GB: 7.92, DE: 7.42, CA: 8.25, AU: 6.58, IN: 125, BR: 12.42, JP: 492 },
    ['Everything in monthly Prime', 'Around 20–60% cheaper depending on market'], { billedYearly: true, y: { US: 139.00, GB: 95.00, DE: 89.90, CA: 99.00, AU: 79.00, IN: 1499, BR: 149.00, JP: 5900 } }),
  t('Prime Student', { US: 7.49, GB: 4.49, DE: 4.49, IN: 149 },
    ['Half-price Prime for up to 4 years', 'Full delivery and Video benefits', 'Requires an accredited-institution email']),
  t('Prime Lite', { IN: 79 },
    ['Standard delivery benefits', 'Prime Video on one device at 720p', 'No Prime Music', 'Cheaper regional tier'], { only: ['IN'] })
]),

s('walmartplus', 'Walmart+', 'Walmart', 'retail.perks', '#0071DC', 'walmart.com/plus',
  'Grocery delivery with a fuel discount and Paramount+ thrown in.', [
  t('Monthly', { US: 12.95 },
    ['Free delivery from local stores with no order minimum', 'Free shipping with no minimum', 'Up to 10¢/gal fuel discount', 'Paramount+ Essential included', 'Scan & Go in store'], { only: ['US'] }),
  t('Annual', { US: 8.17 },
    ['Everything in monthly', 'About 35% cheaper'], { only: ['US'], billedYearly: true, y: { US: 98.00 } }),
  t('Walmart+ Assist', { US: 6.47 },
    ['Half-price membership', 'For customers on government assistance', 'All standard benefits'], { only: ['US'], billedYearly: true, y: { US: 49.00 } })
]),

s('dashpass', 'DoorDash DashPass', 'DoorDash', 'retail.perks', '#FF3008', 'doordash.com/dashpass',
  'Waives delivery fees and cuts service fees on qualifying restaurant orders.', [
  t('Monthly', { US: 9.99, CA: 9.99, AU: 9.99 },
    ['$0 delivery fee over the order minimum', 'Reduced service fees', 'Grocery and convenience orders included', '5% back in credits on pickup']),
  t('Annual', { US: 8.00, CA: 8.00 },
    ['Same benefits, billed yearly', 'Roughly two months free'], { billedYearly: true, y: { US: 96.00, CA: 96.00 } }),
  t('Student', { US: 4.99 },
    ['Half-price DashPass', 'Requires student verification', 'All standard benefits'], { only: ['US'] })
]),

s('uberone', 'Uber One', 'Uber', 'retail.perks', '#000000', 'uber.com/one',
  'Covers both Uber Eats delivery fees and ride discounts in one membership.', [
  t('Monthly', { US: 9.99, GB: 5.99, DE: 5.99, CA: 9.99, AU: 9.99, IN: 149, BR: 24.90 },
    ['$0 delivery fee on eligible orders', '5–10% off eligible orders and rides', 'Top-rated driver requests', 'Member-only promotions']),
  t('Annual', { US: 8.00, GB: 4.58, DE: 4.58, IN: 108 },
    ['Same benefits, billed yearly', 'Roughly two months free'], { billedYearly: true, y: { US: 96.00, GB: 54.99, DE: 54.99, IN: 1299 } }),
  t('Student', { US: 4.99, GB: 2.99 },
    ['Half-price Uber One', 'Annual student verification', 'All standard benefits'])
]),

s('instacart', 'Instacart+', 'Instacart', 'retail.perks', '#43B02A', 'instacart.com',
  'Grocery delivery membership across a wide set of US and Canadian retailers.', [
  t('Monthly', { US: 9.99, CA: 9.99 },
    ['$0 delivery on orders over $35', 'Reduced service fees', '5% credit back on eligible pickup orders', 'Family account sharing with one other person'], { only: ['US', 'CA'] }),
  t('Annual', { US: 8.25, CA: 8.25 },
    ['Same benefits, billed yearly', 'About two months free'], { only: ['US', 'CA'], billedYearly: true, y: { US: 99.00, CA: 99.00 } })
])
);

/* ─────────────────────  RETAIL — Meal Kits & Food  ───────────────────── */

CATALOG.push(
s('hellofresh', 'HelloFresh', 'HelloFresh', 'retail.meals', '#91C11E', 'hellofresh.com',
  'Recipe kits billed per box. Prices below are a typical monthly run of four boxes.', [
  t('2 people, 3 meals a week', { US: 100.00, GB: 88.00, DE: 92.00, CA: 132.00, AU: 148.00 },
    ['6 servings a week, about $12.50 a serving', 'Shipping charged per box', 'Skip any week without a fee', '30+ recipes to choose from']),
  t('2 people, 4 meals a week', { US: 124.00, GB: 108.00, DE: 112.00 },
    ['8 servings a week, lower per-serving cost', 'Everything in the 3-meal plan']),
  t('4 people, 3 meals a week', { US: 176.00, GB: 156.00, DE: 164.00 },
    ['12 servings a week, about $10.99 a serving', 'Family-friendly recipe filter', 'Free shipping on larger boxes']),
  t('4 people, 5 meals a week', { US: 264.00, GB: 236.00, DE: 248.00 },
    ['20 servings a week, the lowest per-serving price', 'Everything in the smaller plans'])
]),

s('blueapron', 'Blue Apron', 'Blue Apron', 'retail.meals', '#1E4B7B', 'blueapron.com',
  'Chef-designed meal kits with a wine add-on; a typical month is four boxes.', [
  t('2 servings, 2 meals a week', { US: 96.00 },
    ['4 servings a week, about $11.99 each', 'Shipping about $10 a box', 'Skip or pause any week'], { only: ['US'] }),
  t('2 servings, 4 meals a week', { US: 176.00 },
    ['8 servings a week at a lower per-serving rate', 'Wine pairings available'], { only: ['US'] }),
  t('4 servings, 3 meals a week', { US: 216.00 },
    ['12 servings a week, about $8.99 each', 'Free shipping at this size'], { only: ['US'] }),
  t('Wine add-on', { US: 79.99 },
    ['6 bottles a month', 'Pairs with your delivered recipes', 'Independent of the food plan'], { only: ['US'], addon: true })
]),

s('factor', 'Factor', 'HelloFresh', 'retail.meals', '#00A651', 'factor75.com',
  'Fully prepared, refrigerated meals — heat and eat, no cooking. Billed per week.', [
  t('6 meals a week', { US: 78.00, GB: 68.00, CA: 104.00 },
    ['About $13 a meal, monthly figure shown', 'Dietitian-designed, no cooking', 'Keto, calorie-smart and protein-plus options', 'Shipping charged per box']),
  t('10 meals a week', { US: 120.00, GB: 105.00, CA: 160.00 },
    ['About $11.50 a meal', 'Free shipping at this size', 'Everything in the smaller plan']),
  t('18 meals a week', { US: 198.00, GB: 175.00 },
    ['About $11 a meal, the lowest rate', 'Add-on smoothies and breakfasts', 'Free shipping'])
])
);

/* ─────────────────────  RETAIL — Curated Boxes  ───────────────────── */

CATALOG.push(
s('barkbox', 'BarkBox', 'Bark', 'retail.boxes', '#FBC02D', 'barkbox.com',
  'A monthly themed box of dog toys and treats, sized to your dog.', [
  t('Month-to-month', { US: 45.00, CA: 55.00 },
    ['2 toys, 2 treat bags and a chew', 'Themed monthly', 'Free replacement if a toy is destroyed', 'Cancel any month'], { only: ['US', 'CA'] }),
  t('6-month plan', { US: 35.00, CA: 45.00 },
    ['Same box, prepaid for 6 months', 'About 22% cheaper a month'], { only: ['US', 'CA'] }),
  t('12-month plan', { US: 23.00, CA: 32.00 },
    ['Same box, prepaid for a year', 'The cheapest monthly rate'], { only: ['US', 'CA'], billedYearly: true, y: { US: 276.00, CA: 384.00 } }),
  t('Super Chewer', { US: 45.00, CA: 55.00 },
    ['Tougher toys for destructive dogs', '2 durable toys, 2 treats, 2 chews', 'Same replacement guarantee'], { only: ['US', 'CA'] })
]),

s('dollarshaveclub', 'Dollar Shave Club', 'Dollar Shave Club', 'retail.boxes', '#00A6CE', 'dollarshaveclub.com',
  'Razor cartridges on a schedule, with grooming products as add-ons.', [
  t('Razor blades only', { US: 10.00, GB: 8.00, CA: 12.00, AU: 14.00 },
    ['4 cartridges every month or two', 'Handle included on the first order', 'Change cadence or skip anytime']),
  t('Shave & Shower set', { US: 25.00, GB: 20.00, CA: 30.00 },
    ['Blades plus shave butter and body wash', 'Refills on your chosen cadence', 'Everything in the blades plan']),
  t('Full grooming box', { US: 40.00, GB: 32.00 },
    ['Blades, shave, hair and body products', 'Customisable contents each cycle', 'Best per-item value'])
]),

s('stitchfix', 'Stitch Fix', 'Stitch Fix', 'retail.boxes', '#2C2C2C', 'stitchfix.com',
  'A stylist picks clothes and ships them; you pay a styling fee plus whatever you keep.', [
  t('Styling fee per Fix', { US: 20.00, GB: 20.00 },
    ['5 hand-picked items per shipment', 'Fee credited against anything you keep', 'Free returns on the rest', 'No obligation to buy']),
  t('Monthly Fix cadence', { US: 20.00, GB: 20.00 },
    ['One Fix a month', 'Styling fee only — clothing is charged separately', 'Typical keep spend is $100–200 a Fix']),
  t('Style Pass (annual)', { US: 4.17, GB: 4.17 },
    ['A single $49 annual fee replaces all styling fees', 'Unlimited Fixes with no per-shipment charge', 'Credited toward your first purchase'], { billedYearly: true, y: { US: 49.00, GB: 49.00 } })
])
);

/* ─────────────────────  PHONE & INTERNET — Mobile Plans  ─────────────────────
   Carriers are national, so each of these is locked to its market with `markets`
   and simply disappears when you switch to another one. US prices are the single-
   line rate with autopay and paperless billing, which is how carriers advertise
   them — multi-line rates are usually far lower per line. Indian prepaid packs
   run 28 days, not a calendar month; track them on the "Every 28 days" cycle.  */

CATALOG.push(
s('verizon', 'Verizon myPlan', 'Verizon', 'connect.mobile', '#EE0000', 'verizon.com',
  'Widest US coverage, highest list prices, and perks sold à la carte at $10 each.', [
  t('Unlimited Welcome', { US: 65 },
    ['Unlimited talk, text and data', '5G nationwide, deprioritised when busy', 'No mobile hotspot data', 'Perks available at $10 each']),
  t('Unlimited Plus', { US: 80 },
    ['5G Ultra Wideband, never deprioritised', '30GB of mobile hotspot', '2TB Verizon Cloud', 'Perks available at $10 each']),
  t('Unlimited Ultimate', { US: 100 },
    ['Everything in Unlimited Plus', '60GB of mobile hotspot', '10GB high-speed international data a month', 'Talk and text in 210+ countries'])
], { markets: ['US'] }),

s('att', 'AT&T Unlimited', 'AT&T', 'connect.mobile', '#00A8E0', 'att.com',
  'Middle of the US big three; the cheapest tier caps speed rather than data.', [
  t('Value Plus VL', { US: 50.99 },
    ['Unlimited talk, text and data', 'Single line only, no discounts', 'No mobile hotspot', 'Slowed after network congestion']),
  t('Unlimited Starter SL', { US: 65.99 },
    ['Unlimited data, may slow anytime', '5GB of mobile hotspot', 'Unlimited talk and text to Mexico and Canada']),
  t('Unlimited Extra EL', { US: 75.99 },
    ['75GB of premium data before slowing', '30GB of mobile hotspot', '$10 off a second connected device']),
  t('Unlimited Premium PL', { US: 85.99 },
    ['Unlimited premium data, never deprioritised', '60GB of mobile hotspot', 'AT&T Turbo priority included', 'International roaming in 20+ countries'])
], { markets: ['US'] }),

s('tmobile', 'T-Mobile Experience', 'T-Mobile', 'connect.mobile', '#E20074', 't-mobile.com',
  'Taxes and fees included in the advertised price, and streaming bundled at the top.', [
  t('Essentials', { US: 60 },
    ['Unlimited talk, text and data', 'Deprioritised after 50GB', '3G-speed mobile hotspot', 'Taxes and fees not included on this tier']),
  t('Experience More', { US: 90 },
    ['Unlimited premium data', '60GB of high-speed hotspot', 'Netflix and Apple TV+ on us', 'Taxes and fees included', '5GB high-speed data in 215+ countries']),
  t('Experience Beyond', { US: 105 },
    ['Everything in Experience More', '250GB of high-speed hotspot', '30GB high-speed international data', 'Free in-flight Wi-Fi', 'Yearly device upgrade'])
], { markets: ['US'] }),

s('mintmobile', 'Mint Mobile', 'T-Mobile', 'connect.mobile', '#74B72E', 'mintmobile.com',
  'Prepaid on T-Mobile towers, sold in 3, 6 or 12-month blocks paid up front.', [
  t('5GB', { US: 15 },
    ['5GB of high-speed data a month', 'Unlimited talk and text', 'Free hotspot', 'Cheapest rate needs 12 months prepaid']),
  t('15GB', { US: 20 },
    ['15GB of high-speed data', 'Unlimited talk and text', 'Free calls to Mexico and Canada']),
  t('20GB', { US: 25 },
    ['20GB of high-speed data', 'Everything in the 15GB plan']),
  t('Unlimited', { US: 30 },
    ['Unlimited data, 40GB at high speed', 'Free hotspot', '10GB of data in Canada and Mexico'])
], { markets: ['US'] }),

s('visible', 'Visible', 'Verizon', 'connect.mobile', '#0B0B45', 'visible.com',
  'Verizon-owned, app-only, one flat price with taxes and fees included.', [
  t('Visible', { US: 25 },
    ['Unlimited data on the Verizon network', 'Deprioritised at all times', 'Unlimited hotspot at 5Mbps', 'Taxes and fees included']),
  t('Visible+', { US: 35 },
    ['Unlimited premium data on 5G Ultra Wideband', 'Never deprioritised', '10GB of high-speed hotspot', 'Global calling to 30+ countries']),
  t('Visible+ Pro', { US: 45 },
    ['Everything in Visible+', '50GB of high-speed hotspot', 'International data in 140+ countries', 'Smartwatch line included'])
], { markets: ['US'] }),

s('googlefi', 'Google Fi Wireless', 'Google', 'connect.mobile', '#4285F4', 'fi.google.com',
  'Switches between T-Mobile and US Cellular, with international data as standard.', [
  t('Flexible', { US: 20 },
    ['$20 base plus $10 a GB used', 'Data charges stop after 6GB', 'Best if you use very little data', 'International data at the same rate']),
  t('Simply Unlimited', { US: 50 },
    ['Unlimited data, 35GB before slowing', '5GB of hotspot', 'Calls and texts to Canada and Mexico']),
  t('Unlimited Plus', { US: 65 },
    ['Unlimited data, 50GB before slowing', '50GB of hotspot', 'Free data in 200+ countries', '100GB Google One storage'])
], { markets: ['US'] }),

s('metro', 'Metro by T-Mobile', 'T-Mobile', 'connect.mobile', '#FF00B4', 'metrobyt-mobile.com',
  'T-Mobile\'s prepaid brand, sold in stores, taxes included.', [
  t('5GB', { US: 25 },
    ['5GB of high-speed data', 'Unlimited talk and text', 'Taxes and fees included']),
  t('Unlimited', { US: 40 },
    ['Unlimited data, deprioritised when busy', '5GB of hotspot', 'Taxes and fees included']),
  t('Unlimited + 100GB Google One', { US: 50 },
    ['Everything in Unlimited', '15GB of hotspot', '100GB Google One storage', 'Scam shield premium']),
  t('Unlimited Plus', { US: 60 },
    ['Unlimited premium data', '25GB of hotspot', 'Amazon Prime included', 'Yearly device upgrade'])
], { markets: ['US'] }),

s('cricket', 'Cricket Wireless', 'AT&T', 'connect.mobile', '#6CC24A', 'cricketwireless.com',
  'AT&T\'s prepaid brand — reliable coverage, permanently deprioritised data.', [
  t('5GB', { US: 30 },
    ['5GB of high-speed data', 'Unlimited talk and text', 'Taxes and fees included']),
  t('Unlimited', { US: 40 },
    ['Unlimited data, capped at 8Mbps video', 'No mobile hotspot', 'Taxes and fees included']),
  t('Unlimited + 15GB Hotspot', { US: 60 },
    ['Unlimited data at full 5G speed', '15GB of mobile hotspot', 'HBO Max with ads included', 'Calls to Mexico and Canada'])
], { markets: ['US'] })
);

CATALOG.push(
s('jio', 'Reliance Jio', 'Reliance', 'connect.mobile', '#0A2885', 'jio.com',
  'India\'s largest network. Prepaid packs run 28 days, so you pay 13 times a year.', [
  t('₹349 pack', { IN: 349 },
    ['2GB a day of high-speed data', 'Unlimited voice calls', '100 SMS a day', '28-day validity', 'JioTV and JioCinema included'], { cycle: 'fourweekly' }),
  t('₹399 pack', { IN: 399 },
    ['2.5GB a day of high-speed data', 'Unlimited voice calls', '28-day validity', 'JioHotstar mobile included'], { cycle: 'fourweekly' }),
  t('₹449 pack', { IN: 449 },
    ['3GB a day of high-speed data', 'Unlimited 5G on eligible plans', '28-day validity', 'Full JioApps suite'], { cycle: 'fourweekly' }),
  t('₹3,599 annual pack', { IN: 300 },
    ['2.5GB a day for 365 days', 'One payment covers the year', 'Cheapest per-day rate', 'Unlimited voice and 100 SMS a day'], { billedYearly: true, y: { IN: 3599 } })
], { markets: ['IN'] }),

s('airtel', 'Airtel', 'Bharti Airtel', 'connect.mobile', '#E40000', 'airtel.in',
  'Usually rated the best network quality in India, priced a little above Jio.', [
  t('₹379 pack', { IN: 379 },
    ['2GB a day of high-speed data', 'Unlimited voice calls', '100 SMS a day', '28-day validity', 'Airtel Xstream Play included'], { cycle: 'fourweekly' }),
  t('₹409 pack', { IN: 409 },
    ['2.5GB a day of high-speed data', 'Unlimited 5G data', '28-day validity', 'Free Apollo 24|7 Circle membership'], { cycle: 'fourweekly' }),
  t('₹449 pack', { IN: 449 },
    ['3GB a day of high-speed data', 'Unlimited 5G', '28-day validity', 'Xstream Play Premium'], { cycle: 'fourweekly' }),
  t('₹3,599 annual pack', { IN: 300 },
    ['2GB a day for 365 days', 'One payment covers the year', 'Unlimited voice and 100 SMS a day'], { billedYearly: true, y: { IN: 3599 } })
], { markets: ['IN'] }),

s('vi', 'Vi (Vodafone Idea)', 'Vodafone Idea', 'connect.mobile', '#EE1C25', 'myvi.in',
  'The third private network — cheaper packs, patchier 5G rollout.', [
  t('₹365 pack', { IN: 365 },
    ['2GB a day of high-speed data', 'Unlimited voice calls', '28-day validity', 'Data delivered overnight rolls over'], { cycle: 'fourweekly' }),
  t('₹409 pack', { IN: 409 },
    ['2.5GB a day of high-speed data', 'Binge All Night unlimited 12am–6am', '28-day validity', 'Weekend data rollover'], { cycle: 'fourweekly' }),
  t('₹475 pack', { IN: 475 },
    ['3GB a day of high-speed data', 'Unlimited night data', '28-day validity', 'Vi Movies and TV included'], { cycle: 'fourweekly' })
], { markets: ['IN'] }),

s('bsnl', 'BSNL', 'BSNL', 'connect.mobile', '#F58220', 'bsnl.co.in',
  'The state operator — by far the cheapest, with the weakest urban coverage.', [
  t('₹199 pack', { IN: 199 },
    ['2GB a day of high-speed data', 'Unlimited voice calls', '28-day validity', 'Cheapest daily-data pack in India'], { cycle: 'fourweekly' }),
  t('₹347 pack (54 days)', { IN: 196 },
    ['2GB a day of high-speed data', '₹347 charged every 54 days — shown here as its monthly equivalent',
     'Unlimited voice and 100 SMS a day', 'Track it on the monthly cycle, or set your own']),
  t('₹439 pack (90 days)', { IN: 148 },
    ['3GB a day of high-speed data', '₹439 charged every 90 days — shown here as its monthly equivalent',
     'Best value per day of any Indian pack', 'Track it on the monthly cycle, or set your own'])
], { markets: ['IN'] })
);

CATALOG.push(
s('ee', 'EE', 'BT Group', 'connect.mobile', '#00B5B0', 'ee.co.uk',
  'The UK\'s fastest and most expensive network, owned by BT.', [
  t('5GB', { GB: 16 },
    ['5GB of data a month', 'Unlimited UK calls and texts', '5G included', 'Roam in 48 European destinations']),
  t('25GB', { GB: 23 },
    ['25GB of data a month', 'Unlimited calls and texts', 'One inclusive Smart Benefit', 'EU roaming included']),
  t('Unlimited', { GB: 30 },
    ['Unlimited data at full 5G speed', 'Three inclusive Smart Benefits', 'Tethering included', 'Roaming in 100+ destinations'])
], { markets: ['GB'] }),

s('o2', 'O2', 'Virgin Media O2', 'connect.mobile', '#0019A5', 'o2.co.uk',
  'Strong retail presence, Priority ticket perks, mid-tier network speed.', [
  t('10GB', { GB: 12 },
    ['10GB of data a month', 'Unlimited calls and texts', 'O2 Priority early ticket access', 'Roam in 27 EU destinations']),
  t('50GB', { GB: 18 },
    ['50GB of data a month', 'Volt boost doubles data for Virgin broadband customers', 'Unlimited calls and texts']),
  t('Unlimited', { GB: 26 },
    ['Unlimited data', 'Tethering included', 'O2 Priority and Blue Light discounts', 'Inclusive EU roaming'])
], { markets: ['GB'] }),

s('vodafoneuk', 'Vodafone UK', 'Vodafone', 'connect.mobile', '#E60000', 'vodafone.co.uk',
  'Merging with Three; entertainment add-ons sold alongside the data allowance.', [
  t('20GB', { GB: 14 },
    ['20GB of data a month', 'Unlimited calls and texts', '5G included', 'Roam-free in 50+ destinations']),
  t('Unlimited Lite', { GB: 18 },
    ['Unlimited data capped at 2Mbps', 'Fine for music, messaging and standard video', 'Unlimited calls and texts']),
  t('Unlimited Max', { GB: 22 },
    ['Unlimited data at maximum 5G speed', 'One entertainment or security add-on', 'Tethering included'])
], { markets: ['GB'] }),

s('three', 'Three UK', 'Three', 'connect.mobile', '#EE2E7B', 'three.co.uk',
  'Cheapest unlimited data in the UK, with the most variable coverage.', [
  t('12GB', { GB: 10 },
    ['12GB of data a month', 'Unlimited calls and texts', '5G at no extra cost', 'Go Roam in 50+ destinations']),
  t('Unlimited', { GB: 16 },
    ['Genuinely unlimited data', 'Unlimited tethering', 'Unlimited calls and texts', 'Cheapest unlimited plan of the four networks']),
  t('Unlimited+', { GB: 20 },
    ['Everything in Unlimited', 'Priority network access at peak times', 'Three+ rewards and ticket presales'])
], { markets: ['GB'] }),

s('giffgaff', 'giffgaff', 'Virgin Media O2', 'connect.mobile', '#000000', 'giffgaff.com',
  'SIM-only on the O2 network, no contract, run through community support.', [
  t('10GB', { GB: 10 },
    ['10GB of data a month', 'Unlimited calls and texts', 'No contract — change or cancel monthly', 'Unused data rolls over']),
  t('40GB', { GB: 15 },
    ['40GB of data a month', 'Unlimited calls and texts', 'EU roaming included', 'Data rollover']),
  t('Unlimited', { GB: 20 },
    ['Unlimited data', 'Unlimited calls and texts', 'Tethering included', 'Still no contract'])
], { markets: ['GB'] })
);

/* ──────────────  PHONE & INTERNET — Home Internet & Broadband  ──────────────
   Broadband advertises a promotional rate that steps up sharply after 12 or 24
   months. The figure here is the promotional rate; the benefits note the step-up
   where it is steep, and your tracked entry should hold whatever you now pay.  */

CATALOG.push(
s('xfinity', 'Xfinity Internet', 'Comcast', 'connect.home', '#0089FF', 'xfinity.com',
  'The largest US cable ISP. Cheap for a year or two, then the price jumps.', [
  t('Connect 300 Mbps', { US: 30 },
    ['300 Mbps download, ~10 Mbps upload', '1.2TB monthly data cap in most markets', 'Modem rental $15 extra', 'Price roughly doubles after the promo']),
  t('Fast 500 Mbps', { US: 45 },
    ['500 Mbps download', 'Unlimited data on some bundles', 'Includes a year of Xfinity Mobile line in places']),
  t('Superfast 1 Gbps', { US: 70 },
    ['1,000 Mbps download, ~35 Mbps upload', 'xFi Complete gateway included on some terms', 'Cable upload speeds stay low']),
  t('Gigabit Extra 1.2 Gbps', { US: 100 },
    ['1,200 Mbps download', 'Unlimited data included', 'Whole-home Wi-Fi equipment included'])
], { markets: ['US'] }),

s('spectrum', 'Spectrum Internet', 'Charter', 'connect.home', '#0033A0', 'spectrum.com',
  'Cable with no data caps and no term contracts, but the same promo step-up.', [
  t('Internet 500 Mbps', { US: 50 },
    ['500 Mbps download', 'No data caps, no contracts', 'Free modem, router $10 extra', 'Rate rises about $25 after 12 months']),
  t('Internet Premier 1 Gbps', { US: 70 },
    ['1,000 Mbps download', 'Free Advanced WiFi router', 'No data caps or contracts']),
  t('Internet Gig 1.2 Gbps', { US: 90 },
    ['1,200 Mbps download', 'Free Advanced WiFi and unlimited mobile line', 'No data caps'])
], { markets: ['US'] }),

s('attfiber', 'AT&T Fiber', 'AT&T', 'connect.home', '#00A8E0', 'att.com/internet/fiber',
  'Symmetrical fibre — upload matches download, which cable cannot do.', [
  t('300 Mbps', { US: 55 },
    ['300 Mbps up and down', 'No data caps, no equipment fee', 'No annual contract', 'Price holds for 12 months']),
  t('500 Mbps', { US: 65 },
    ['500 Mbps symmetrical', 'Wi-Fi 6 gateway included', 'No data caps']),
  t('1 Gbps', { US: 80 },
    ['1,000 Mbps symmetrical', 'ActiveArmor security included', 'No data caps or contracts']),
  t('2 Gbps', { US: 145 },
    ['2,000 Mbps symmetrical', 'Wi-Fi 6E gateway and extender', 'HBO Max included on some terms']),
  t('5 Gbps', { US: 245 },
    ['5,000 Mbps symmetrical', 'Top-tier gateway and installation', 'For very heavy multi-user households'])
], { markets: ['US'] }),

s('fios', 'Verizon Fios', 'Verizon', 'connect.home', '#EE0000', 'verizon.com/home/fios',
  'Consistently the highest-rated US home ISP, limited to the Northeast.', [
  t('300 Mbps', { US: 50 },
    ['300 Mbps symmetrical fibre', 'Router included', 'No data caps', 'Price guaranteed for 4 years on some terms']),
  t('500 Mbps', { US: 75 },
    ['500 Mbps symmetrical', 'Wi-Fi 6 router included', 'Netflix or Disney+ on some terms']),
  t('1 Gbps', { US: 90 },
    ['940 Mbps symmetrical', 'Whole-home Wi-Fi included', 'Streaming perk included']),
  t('2 Gbps', { US: 110 },
    ['2,000 Mbps symmetrical', 'Wi-Fi 7 router included', 'Highest residential tier'])
], { markets: ['US'] }),

s('tmobilehome', 'T-Mobile Home Internet', 'T-Mobile', 'connect.home', '#E20074', 't-mobile.com/home-internet',
  '5G fixed wireless — no installation, but speed depends on local tower load.', [
  t('Rely', { US: 50 },
    ['Typical 87–415 Mbps download', 'No data caps or contracts', 'Gateway included, self-install in minutes', 'Price locked for 5 years']),
  t('Amplified', { US: 60 },
    ['Typical 133–415 Mbps download', 'Priority over Rely at busy times', 'Wi-Fi 6 gateway included']),
  t('All-In', { US: 70 },
    ['Highest network priority', 'Wi-Fi 7 gateway included', 'Includes Paramount+ and a Netflix credit'])
], { markets: ['US'] }),

s('starlink', 'Starlink', 'SpaceX', 'connect.home', '#000000', 'starlink.com',
  'Low-orbit satellite — the answer where nothing else reaches. Sold in many more countries than the four priced here.', [
  t('Residential Lite', { US: 80, GB: 75, CA: 110, AU: 139 },
    ['Deprioritised during peak hours', 'Typically 45–130 Mbps', 'Hardware costs $349 up front', 'Unlimited data']),
  t('Residential', { US: 120, GB: 75, CA: 140, AU: 139 },
    ['Unlimited priority data', 'Typically 100–200 Mbps', 'No congestion throttling', 'Hardware $349 up front']),
  t('Roam 50GB', { US: 50, GB: 40, CA: 70, AU: 60 },
    ['50GB of mobile data anywhere in-country', 'Pause and resume any month', 'For vans, boats and second homes']),
  t('Roam Unlimited', { US: 165, GB: 130, CA: 200, AU: 195 },
    ['Unlimited data in motion', 'Works across continents on some terms', 'Everything in Roam 50GB'])
], { markets: ['US', 'GB', 'CA', 'AU'] }),

s('googlefiber', 'Google Fiber', 'Google', 'connect.home', '#4285F4', 'fiber.google.com',
  'Flat pricing with no promotional step-up, in a small number of US metros.', [
  t('Core 1 Gig', { US: 70 },
    ['1,000 Mbps symmetrical', 'Wi-Fi 6 router included', 'No contracts, no data caps', 'The price never steps up']),
  t('Home 3 Gig', { US: 100 },
    ['3,000 Mbps symmetrical', 'Wi-Fi 6E router and one mesh extender', 'No installation fee']),
  t('8 Gig', { US: 150 },
    ['8,000 Mbps symmetrical', 'Multi-gig Wi-Fi 7 equipment', 'For home labs and heavy uploads'])
], { markets: ['US'] })
);

CATALOG.push(
s('jiofiber', 'JioFiber', 'Reliance', 'connect.home', '#0A2885', 'jio.com/fiber',
  'India\'s largest fibre network, bundled hard with streaming subscriptions.', [
  t('₹399 — 30 Mbps', { IN: 399 },
    ['30 Mbps symmetrical', 'Unlimited data', 'Free voice calling', 'Cheapest fibre plan in India']),
  t('₹699 — 100 Mbps', { IN: 699 },
    ['100 Mbps symmetrical', 'Unlimited data', 'JioTV and JioCinema included', 'Free installation on annual plans']),
  t('₹899 — 150 Mbps', { IN: 899 },
    ['150 Mbps symmetrical', '14 OTT apps bundled including JioHotstar', 'Set-top box included']),
  t('₹1,299 — 300 Mbps', { IN: 1299 },
    ['300 Mbps symmetrical', 'Full OTT bundle including Netflix Basic', '4K set-top box']),
  t('₹3,999 — 1 Gbps', { IN: 3999 },
    ['1,000 Mbps symmetrical', 'Every bundled OTT app', 'For large households and home offices'])
], { markets: ['IN'] }),

s('airtelfiber', 'Airtel Xstream Fiber', 'Bharti Airtel', 'connect.home', '#E40000', 'airtel.in/broadband',
  'Generally the better-rated Indian fibre service, at a small premium.', [
  t('₹499 — 40 Mbps', { IN: 499 },
    ['40 Mbps symmetrical', 'Unlimited data', 'Free landline calling', 'Airtel Xstream Play included']),
  t('₹799 — 100 Mbps', { IN: 799 },
    ['100 Mbps symmetrical', 'Unlimited data', 'Xstream Play Premium with 20+ OTT apps']),
  t('₹999 — 200 Mbps', { IN: 999 },
    ['200 Mbps symmetrical', 'Full OTT bundle', 'Free Wi-Fi router']),
  t('₹1,499 — 300 Mbps', { IN: 1499 },
    ['300 Mbps symmetrical', 'Netflix Basic and JioHotstar included', 'Priority support']),
  t('₹3,999 — 1 Gbps', { IN: 3999 },
    ['1,000 Mbps symmetrical', 'Every bundled OTT app', 'Dedicated relationship manager'])
], { markets: ['IN'] }),

s('actfibernet', 'ACT Fibernet', 'Atria Convergence', 'connect.home', '#00A94F', 'actcorp.in',
  'A regional favourite in Bengaluru, Hyderabad and Chennai; prices vary by city.', [
  t('ACT Swift — 150 Mbps', { IN: 749 },
    ['150 Mbps symmetrical', 'Unlimited data', 'Free router on annual plans', 'Pricing differs city to city']),
  t('ACT Storm — 250 Mbps', { IN: 1049 },
    ['250 Mbps symmetrical', 'Unlimited data', 'OTT bundle on annual plans']),
  t('ACT Lightning — 400 Mbps', { IN: 1349 },
    ['400 Mbps symmetrical', 'Unlimited data', 'Priority fault resolution'])
], { markets: ['IN'] }),

s('bsnlfiber', 'BSNL Bharat Fiber', 'BSNL', 'connect.home', '#F58220', 'bsnl.co.in',
  'State-run fibre — cheapest per megabit, slowest to fix when it breaks.', [
  t('₹449 — 30 Mbps', { IN: 449 },
    ['30 Mbps symmetrical', '3.3TB monthly data, then 2 Mbps', 'Free voice calling', 'Reaches small towns others do not']),
  t('₹799 — 100 Mbps', { IN: 799 },
    ['100 Mbps symmetrical', '3.3TB monthly data', 'Free landline with unlimited calls']),
  t('₹999 — 200 Mbps', { IN: 999 },
    ['200 Mbps symmetrical', '4TB monthly data', 'Disney+ Hotstar bundled on some circles'])
], { markets: ['IN'] })
);

CATALOG.push(
s('btbroadband', 'BT Broadband', 'BT Group', 'connect.home', '#5514B4', 'bt.com/broadband',
  'The UK incumbent — widest reach, strongest support, highest price.', [
  t('Fibre Essential — 36 Mb', { GB: 28 },
    ['36 Mb average download', 'Unlimited data', '24-month contract', 'Halo support and Wi-Fi guarantee']),
  t('Fibre 2 — 74 Mb', { GB: 33 },
    ['74 Mb average download', 'Unlimited data', 'Smart Hub 2 included', 'Complete Wi-Fi guarantee']),
  t('Full Fibre 150', { GB: 40 },
    ['150 Mb download, 30 Mb upload', 'Full fibre to the premises', 'Hybrid 4G backup connection']),
  t('Full Fibre 500', { GB: 50 },
    ['500 Mb download, 73 Mb upload', 'Smart Hub 2 and Wi-Fi discs', 'For large households'])
], { markets: ['GB'] }),

s('virginmedia', 'Virgin Media', 'Virgin Media O2', 'connect.home', '#CC0000', 'virginmedia.com',
  'Fastest widely available UK download speeds, on its own cable network.', [
  t('M125 Fibre', { GB: 28 },
    ['132 Mb average download', 'Unlimited data', 'Hub 4 router included', '20 Mb upload — cable\'s weak spot']),
  t('M250 Fibre', { GB: 33 },
    ['264 Mb average download', 'Unlimited data', 'Volt boost with an O2 mobile plan']),
  t('M500 Fibre', { GB: 40 },
    ['516 Mb average download', 'Hub 5 router', '52 Mb upload']),
  t('Gig1 Fibre', { GB: 45 },
    ['1,130 Mb average download', 'Wi-Fi 6 Hub 5', '104 Mb upload', 'Fastest mass-market UK tier'])
], { markets: ['GB'] }),

s('skybroadband', 'Sky Broadband', 'Sky', 'connect.home', '#0072C9', 'sky.com/broadband',
  'Usually bought alongside Sky TV, which is where the discounts live.', [
  t('Essential — 36 Mb', { GB: 27 },
    ['36 Mb average download', 'Unlimited data', 'Sky Broadband Hub', '18-month contract']),
  t('Super Fast — 61 Mb', { GB: 30 },
    ['61 Mb average download', 'Unlimited data', 'Sky Broadband Buddy app']),
  t('Full Fibre 150', { GB: 38 },
    ['150 Mb download, 27 Mb upload', 'Wi-Fi Max add-on available', 'Bundles with Sky TV']),
  t('Full Fibre 500', { GB: 45 },
    ['500 Mb download, 70 Mb upload', 'Sky Broadband Hub Pro', 'Wi-Fi guarantee'])
], { markets: ['GB'] }),

s('hyperoptic', 'Hyperoptic', 'Hyperoptic', 'connect.home', '#E4002B', 'hyperoptic.com',
  'Full-fibre in apartment blocks, symmetrical, consistently top-rated for value.', [
  t('50 Mb', { GB: 22 },
    ['50 Mb symmetrical', 'Unlimited data', 'No mid-contract price rises', 'Only in wired buildings']),
  t('150 Mb', { GB: 27 },
    ['150 Mb symmetrical', 'Free router', 'Static IP available']),
  t('500 Mb', { GB: 32 },
    ['500 Mb symmetrical', 'Wi-Fi 6 router included', 'Upload matches download']),
  t('1 Gb', { GB: 40 },
    ['1,000 Mb symmetrical', 'Cheapest gigabit in the UK where available', 'Wi-Fi 6 router'])
], { markets: ['GB'] }),

s('communityfibre', 'Community Fibre', 'Community Fibre', 'connect.home', '#7B2D8E', 'communityfibre.co.uk',
  'London-only full fibre, aggressively priced against the incumbents.', [
  t('150 Mb', { GB: 25 },
    ['150 Mb symmetrical', 'Unlimited data', 'No mid-contract price rises', 'London only']),
  t('500 Mb', { GB: 28 },
    ['500 Mb symmetrical', 'Free Wi-Fi 6 router', 'Netflix included on some terms']),
  t('1 Gb', { GB: 32 },
    ['1,000 Mb symmetrical', 'Wi-Fi 6 mesh included', 'Very cheap for gigabit']),
  t('3 Gb', { GB: 55 },
    ['3,000 Mb symmetrical', 'Multi-gig router', 'For heavy upload workloads'])
], { markets: ['GB'] })
);

/* Templates for every market with no carriers or ISPs in the catalogue yet —
   priced from the US figure and the local price level, so the numbers are a
   starting point to edit rather than a real price list. */

CATALOG.push(
s('genericmobile', 'Mobile plan', 'Your carrier', 'connect.mobile', '#4a3aa7', '',
  'A placeholder for any carrier not in the catalogue. Pick the closest tier and set your real price.', [
  t('Small data plan', { US: 25 },
    ['Roughly 5–15GB a month', 'Typical of a budget or prepaid carrier', 'Edit the amount to what you actually pay']),
  t('Large data plan', { US: 45 },
    ['Roughly 30–100GB a month', 'Typical mid-tier postpaid plan', 'Edit the amount to what you actually pay']),
  t('Unlimited plan', { US: 70 },
    ['Unlimited data, usually with a hotspot allowance', 'Typical flagship postpaid plan', 'Edit the amount to what you actually pay'])
], { fallbackOnly: true }),

s('genericbroadband', 'Home broadband', 'Your provider', 'connect.home', '#4a3aa7', '',
  'A placeholder for any ISP not in the catalogue. Pick the closest speed and set your real price.', [
  t('Entry — up to 100 Mbps', { US: 40 },
    ['Enough for streaming and video calls in a small household', 'Edit the amount to what you actually pay']),
  t('Mid — 100 to 500 Mbps', { US: 60 },
    ['Comfortable for a family and several 4K streams', 'Edit the amount to what you actually pay']),
  t('Gigabit — 1 Gbps and above', { US: 85 },
    ['For large households, heavy uploads and home working', 'Edit the amount to what you actually pay'])
], { fallbackOnly: true })
);


/* A market-locked service locks each of its tiers too, unless the tier already
   names its own markets. Everything downstream then works off tier.only alone. */
CATALOG.forEach(function (svc) {
  if (!svc.markets) return;
  svc.tiers.forEach(function (t) {
    if (!t.only) { t.only = svc.markets; t.inheritedOnly = true; }
  });
});

/* index built once at load */
const SERVICE_BY_ID = Object.fromEntries(CATALOG.map(x => [x.id, x]));
const COMPANIES = Array.from(new Set(CATALOG.map(x => x.company))).sort((a, b) => a.localeCompare(b));
