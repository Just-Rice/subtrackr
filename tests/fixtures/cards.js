/* cards.js — credit cards: fees, statement credits, earn rates and sign-up
 * bonuses for the US, UK and India. A dated snapshot (October 2026) of each
 * issuer's published terms — they change often, so everything is editable once
 * a card is tracked.
 *
 *   fee     annual fee in the market's currency (firstYearFree when waived)
 *   cpp     what one reward unit is worth, in hundredths of the currency
 *           (cents, pence, paise). Cash back: x is the percentage and cpp is 1.
 *   earn    [{ cat, x }] — reward units per 1 unit of currency, on spending
 *           anyone could put there. Rates that need a travel portal or one
 *           brand go in earnNotes instead and are not counted in estimates.
 *   credits [{ id, name, amount, cadence, covers }] — cadence is how often it
 *           refills: monthly | quarterly | semiannual | yearly (calendar year) |
 *           cardyear (from the fee date) | once. covers = catalogue service ids
 *           the credit pays for.
 *   perks   things worth something only to some people — valued by the user.
 */

function cr(id, name, amount, cadence, opts) {
  return Object.assign({ id: id, name: name, amount: amount, cadence: cadence, covers: [] }, opts || {});
}

function card(id, name, issuer, market, color, o) {
  return Object.assign({
    id: id, name: name, issuer: issuer, market: market, color: color,
    cur: { US: 'USD', GB: 'GBP', IN: 'INR' }[market],
    fee: 0, kind: 'points', unit: 'points', cpp: 1, earn: [], earnNotes: [], credits: [], perks: [],
    bonus: null, asOf: '2026-10'
  }, o);
}

const CARDS = [

/* ──────────────────────────────  United States  ────────────────────────────── */

card('amex-platinum', 'Platinum Card', 'American Express', 'US', '#9da3ab', {
  site: 'americanexpress.com', fee: 895, unit: 'Membership Rewards points', cpp: 1.2,
  blurb: 'A $895 fee offset by a long list of monthly, quarterly and semi-annual credits — worth it only if you use them.',
  earn: [{ cat: 'flights', x: 5 }, { cat: 'other', x: 1 }],
  earnNotes: ['5x on flights booked with airlines or Amex Travel (first $500k a year)', '5x on prepaid hotels through Amex Travel'],
  credits: [
    cr('uber', 'Uber Cash', 15, 'monthly', { note: 'Rides and Uber Eats in the US' }),
    cr('uber-dec', 'Uber Cash — December extra', 20, 'yearly'),
    cr('uberone', 'Uber One membership', 120, 'yearly', { covers: ['uberone'] }),
    cr('stream', 'Digital entertainment', 25, 'monthly',
      { covers: ['disneyplus', 'hulu', 'peacock', 'nyt', 'wsj', 'paramountplus', 'ytpremium', 'yttv'], note: 'Enrolment required' }),
    cr('hotel', 'Fine Hotels + Resorts / Hotel Collection', 300, 'semiannual', { note: 'Prepaid through Amex Travel' }),
    cr('resy', 'Resy restaurants', 100, 'quarterly'),
    cr('lulu', 'lululemon', 75, 'quarterly'),
    cr('airline', 'Airline incidental fees', 200, 'yearly', { note: 'One airline you select' }),
    cr('clear', 'CLEAR+', 209, 'yearly'),
    cr('walmart', 'Walmart+ membership', 12.95, 'monthly', { covers: ['walmartplus'] }),
    cr('oura', 'Oura Ring', 200, 'yearly'),
    cr('equinox', 'Equinox', 300, 'yearly')
  ],
  perks: [{ id: 'lounge', name: 'Centurion and Priority Pass lounges' }, { id: 'status', name: 'Marriott and Hilton Gold status' }],
  bonus: { amount: 175000, spend: 8000, months: 6, note: 'Offers vary by applicant; this is the highest advertised' }
}),

card('amex-gold', 'Gold Card', 'American Express', 'US', '#c9a24a', {
  site: 'americanexpress.com', fee: 325, unit: 'Membership Rewards points', cpp: 1.2,
  blurb: 'The dining and groceries card, with small monthly credits that cover most of the fee if you use them.',
  earn: [{ cat: 'dining', x: 4 }, { cat: 'groceries', x: 4 }, { cat: 'flights', x: 3 }, { cat: 'other', x: 1 }],
  earnNotes: ['4x dining capped at $50k a year', '4x US supermarkets capped at $25k a year', '2x prepaid hotels through Amex Travel'],
  credits: [
    cr('dining', 'Dining partners', 10, 'monthly', { note: 'Grubhub, Five Guys, The Cheesecake Factory and others' }),
    cr('uber', 'Uber Cash', 10, 'monthly'),
    cr('resy', 'Resy restaurants', 50, 'semiannual'),
    cr('dunkin', "Dunkin'", 7, 'monthly')
  ],
  bonus: { amount: 60000, spend: 6000, months: 6 }
}),

card('amex-bcp', 'Blue Cash Preferred', 'American Express', 'US', '#2f6fd6', {
  site: 'americanexpress.com', fee: 95, firstYearFree: true, kind: 'cashback', unit: 'cash back', cpp: 1,
  blurb: 'Six percent at US supermarkets and on streaming — the strongest grocery cash back.',
  earn: [{ cat: 'groceries', x: 6 }, { cat: 'streaming', x: 6 }, { cat: 'transit', x: 3 }, { cat: 'gas', x: 3 }, { cat: 'other', x: 1 }],
  earnNotes: ['6% groceries capped at $6,000 a year, then 1%'],
  credits: [cr('disney', 'Disney Bundle', 10, 'monthly', { covers: ['disneyplus', 'hulu'] })],
  bonus: { amount: 250, spend: 3000, months: 6, cash: true }
}),

card('amex-bce', 'Blue Cash Everyday', 'American Express', 'US', '#5b8fe0', {
  site: 'americanexpress.com', fee: 0, kind: 'cashback', unit: 'cash back', cpp: 1,
  blurb: 'No fee; three percent on groceries, gas and online shopping.',
  earn: [{ cat: 'groceries', x: 3 }, { cat: 'gas', x: 3 }, { cat: 'online', x: 3 }, { cat: 'other', x: 1 }],
  earnNotes: ['Each 3% category capped at $6,000 a year'],
  credits: [cr('disney', 'Disney Bundle', 7, 'monthly', { covers: ['disneyplus', 'hulu'] })],
  bonus: { amount: 200, spend: 2000, months: 6, cash: true }
}),

card('chase-csp', 'Sapphire Preferred', 'Chase', 'US', '#1b3a6b', {
  site: 'chase.com', fee: 95, unit: 'Ultimate Rewards points', cpp: 1.25,
  blurb: 'The $95 travel card most people start with. Refreshed in June 2026: 3x gas, a $100 hotel credit.',
  earn: [{ cat: 'dining', x: 3 }, { cat: 'streaming', x: 3 }, { cat: 'gas', x: 3 }, { cat: 'travel', x: 2 }, { cat: 'other', x: 1 }],
  earnNotes: ['5x on travel through Chase Travel', '3x on online groceries (not Target, Walmart or wholesale clubs)', '3x on vacation rentals'],
  credits: [cr('hotel', 'Chase Travel hotel', 100, 'cardyear', { note: 'At least $100 paid on a Chase Travel hotel' })],
  perks: [{ id: 'appletv', name: 'Apple TV for a year (activate by 31 Dec 2026)' }, { id: 'ge', name: 'Global Entry / TSA PreCheck credit every 4 years' }],
  bonus: { amount: 75000, spend: 5000, months: 3 }
}),

card('chase-csr', 'Sapphire Reserve', 'Chase', 'US', '#22314a', {
  site: 'chase.com', fee: 795, unit: 'Ultimate Rewards points', cpp: 1.5,
  blurb: 'Premium Chase card rebuilt in 2025 around lifestyle credits — StubHub, DoorDash, The Edit hotels.',
  earn: [{ cat: 'flights', x: 4 }, { cat: 'hotels', x: 4 }, { cat: 'dining', x: 3 }, { cat: 'other', x: 1 }],
  earnNotes: ['8x on everything through Chase Travel, including The Edit', '4x flights and hotels when booked direct'],
  credits: [
    cr('travel', 'Annual travel credit', 300, 'cardyear'),
    cr('edit', 'The Edit hotels', 500, 'yearly', { note: 'Two $250 uses, two-night minimum' }),
    cr('chase-hotel', 'Chase Travel hotel (2026)', 250, 'once'),
    cr('dining', 'Exclusive Tables dining', 150, 'semiannual'),
    cr('stubhub', 'StubHub / viagogo', 150, 'semiannual'),
    cr('doordash', 'DoorDash', 25, 'monthly', { covers: ['dashpass'] }),
    cr('lyft', 'Lyft', 10, 'monthly'),
    cr('peloton', 'Peloton', 10, 'monthly', { covers: ['peloton'] })
  ],
  perks: [{ id: 'apple', name: 'Apple TV and Apple Music included' }, { id: 'lounge', name: 'Priority Pass and Sapphire lounges' }],
  bonus: { amount: 100000, spend: 5000, months: 3 }
}),

card('cap1-venturex', 'Venture X', 'Capital One', 'US', '#3d3d45', {
  site: 'capitalone.com', fee: 395, unit: 'miles', cpp: 1,
  blurb: 'Two miles on everything, and a $300 travel credit plus 10,000 anniversary miles that cover the fee.',
  earn: [{ cat: 'other', x: 2 }],
  earnNotes: ['10x hotels and rental cars through Capital One Travel', '5x flights and vacation rentals through Capital One Travel'],
  credits: [
    cr('travel', 'Capital One Travel credit', 300, 'cardyear'),
    cr('anniv', 'Anniversary miles (10,000)', 100, 'cardyear', { auto: true })
  ],
  perks: [{ id: 'lounge', name: 'Capital One and Priority Pass lounges (primary cardholder)' }],
  bonus: { amount: 75000, spend: 4000, months: 3 }
}),

card('cap1-venture', 'Venture', 'Capital One', 'US', '#5a5f6b', {
  site: 'capitalone.com', fee: 95, unit: 'miles', cpp: 1,
  blurb: 'A flat two miles everywhere for $95.',
  earn: [{ cat: 'other', x: 2 }],
  earnNotes: ['5x hotels and rental cars through Capital One Travel'],
  bonus: { amount: 75000, spend: 4000, months: 3 }
}),

card('cap1-savor', 'Savor', 'Capital One', 'US', '#b0442f', {
  site: 'capitalone.com', fee: 0, kind: 'cashback', unit: 'cash back', cpp: 1,
  blurb: 'No-fee three percent on dining, entertainment, streaming and groceries.',
  earn: [{ cat: 'dining', x: 3 }, { cat: 'entertainment', x: 3 }, { cat: 'streaming', x: 3 }, { cat: 'groceries', x: 3 }, { cat: 'other', x: 1 }],
  bonus: { amount: 200, spend: 500, months: 3, cash: true }
}),

card('cap1-quicksilver', 'Quicksilver', 'Capital One', 'US', '#8a8f99', {
  site: 'capitalone.com', fee: 0, kind: 'cashback', unit: 'cash back', cpp: 1,
  blurb: 'No-fee one-and-a-half percent on everything.',
  earn: [{ cat: 'other', x: 1.5 }],
  bonus: { amount: 200, spend: 500, months: 3, cash: true }
}),

card('chase-cfu', 'Freedom Unlimited', 'Chase', 'US', '#2a6db5', {
  site: 'chase.com', fee: 0, unit: 'Ultimate Rewards points', cpp: 1,
  blurb: 'No fee, 1.5x everywhere, and points that become more valuable alongside a Sapphire card.',
  earn: [{ cat: 'dining', x: 3 }, { cat: 'health', x: 3 }, { cat: 'other', x: 1.5 }],
  earnNotes: ['3x at drugstores', '5x on Chase Travel'],
  bonus: { amount: 20000, spend: 500, months: 3 }
}),

card('chase-cff', 'Freedom Flex', 'Chase', 'US', '#3b7dc4', {
  site: 'chase.com', fee: 0, unit: 'Ultimate Rewards points', cpp: 1,
  blurb: 'Five percent in rotating quarterly categories, three on dining and drugstores.',
  earn: [{ cat: 'dining', x: 3 }, { cat: 'health', x: 3 }, { cat: 'other', x: 1 }],
  earnNotes: ['5x in quarterly categories on up to $1,500 (activate each quarter)'],
  bonus: { amount: 20000, spend: 500, months: 3 }
}),

card('citi-doublecash', 'Double Cash', 'Citi', 'US', '#0c5a9e', {
  site: 'citi.com', fee: 0, kind: 'cashback', unit: 'cash back', cpp: 1,
  blurb: 'Two percent on everything — one when you buy, one when you pay.',
  earn: [{ cat: 'other', x: 2 }],
  bonus: { amount: 200, spend: 1500, months: 6, cash: true }
}),

card('citi-premier', 'Strata Premier', 'Citi', 'US', '#14325c', {
  site: 'citi.com', fee: 95, unit: 'ThankYou points', cpp: 1,
  blurb: 'Three points across travel, dining, groceries and gas for $95.',
  earn: [{ cat: 'travel', x: 3 }, { cat: 'dining', x: 3 }, { cat: 'groceries', x: 3 }, { cat: 'gas', x: 3 }, { cat: 'other', x: 1 }],
  earnNotes: ['10x hotels, cars and attractions through Citi Travel'],
  credits: [cr('hotel', 'Hotel savings ($500+ stay via Citi Travel)', 100, 'yearly')],
  bonus: { amount: 60000, spend: 4000, months: 3 }
}),

card('citi-elite', 'Strata Elite', 'Citi', 'US', '#0b1e3a', {
  site: 'citi.com', fee: 595, unit: 'ThankYou points', cpp: 1,
  blurb: 'Citi\'s premium card: big portal multipliers and hotel, Splurge and Blacklane credits.',
  earn: [{ cat: 'dining', x: 3 }, { cat: 'other', x: 1.5 }],
  earnNotes: ['12x hotels, cars and attractions through Citi Travel', '6x flights through Citi Travel', '6x restaurants Friday and Saturday 6pm–6am (Citi Nights)'],
  credits: [
    cr('hotel', 'Citi Travel hotel (2+ nights)', 300, 'yearly'),
    cr('splurge', 'Splurge credit', 200, 'yearly', { note: 'Pick from partners such as Best Buy and Live Nation' }),
    cr('blacklane', 'Blacklane', 100, 'semiannual')
  ],
  perks: [{ id: 'lounge', name: 'Priority Pass and Admirals Club passes' }],
  bonus: { amount: 75000, spend: 6000, months: 3 }
}),

card('wf-activecash', 'Active Cash', 'Wells Fargo', 'US', '#c4161c', {
  site: 'wellsfargo.com', fee: 0, kind: 'cashback', unit: 'cash back', cpp: 1,
  blurb: 'A flat two percent with no fee.',
  earn: [{ cat: 'other', x: 2 }],
  bonus: { amount: 200, spend: 500, months: 3, cash: true }
}),

card('wf-autograph', 'Autograph', 'Wells Fargo', 'US', '#9e1b22', {
  site: 'wellsfargo.com', fee: 0, unit: 'points', cpp: 1,
  blurb: 'No-fee three points on dining, travel, gas, transit, streaming and phone plans.',
  earn: [{ cat: 'dining', x: 3 }, { cat: 'travel', x: 3 }, { cat: 'gas', x: 3 }, { cat: 'transit', x: 3 },
         { cat: 'streaming', x: 3 }, { cat: 'bills', x: 3 }, { cat: 'other', x: 1 }],
  earnNotes: ['3x on phone plans; other bills earn 1x'],
  bonus: { amount: 20000, spend: 1000, months: 3 }
}),

card('discover-it', 'Discover it Cash Back', 'Discover', 'US', '#e55c20', {
  site: 'discover.com', fee: 0, kind: 'cashback', unit: 'cash back', cpp: 1,
  blurb: 'Rotating five percent categories, with all first-year cash back matched.',
  earn: [{ cat: 'other', x: 1 }],
  earnNotes: ['5% in quarterly categories on up to $1,500 (activate each quarter)', 'First-year cash back matched for new cardmembers']
}),

card('apple-card', 'Apple Card', 'Goldman Sachs', 'US', '#d6d6d6', {
  site: 'apple.com/apple-card', fee: 0, kind: 'cashback', unit: 'Daily Cash', cpp: 1,
  blurb: 'Two percent through Apple Pay, three at Apple and select merchants.',
  earn: [{ cat: 'other', x: 1 }],
  earnNotes: ['2% on anything paid with Apple Pay', '3% at Apple and select partners with Apple Pay']
}),

card('chase-primevisa', 'Prime Visa', 'Chase', 'US', '#232f3e', {
  site: 'amazon.com', fee: 0, kind: 'cashback', unit: 'cash back', cpp: 1,
  blurb: 'Five percent at Amazon and Whole Foods for Prime members.',
  earn: [{ cat: 'dining', x: 2 }, { cat: 'gas', x: 2 }, { cat: 'transit', x: 2 }, { cat: 'other', x: 1 }],
  earnNotes: ['5% at Amazon, Whole Foods and Chase Travel with an eligible Prime membership'],
  bonus: { amount: 150, spend: 0, months: 0, cash: true, note: 'Gift card on approval' }
}),

card('delta-reserve', 'Delta SkyMiles Reserve', 'American Express', 'US', '#2b2b2b', {
  site: 'americanexpress.com', fee: 650, unit: 'SkyMiles', cpp: 1.1,
  blurb: 'For Delta loyalists: Sky Club access, a companion certificate and Resy and rideshare credits.',
  earn: [{ cat: 'other', x: 1 }],
  earnNotes: ['3x on Delta purchases'],
  credits: [
    cr('resy', 'Resy restaurants', 20, 'monthly'),
    cr('ride', 'Rideshare', 10, 'monthly'),
    cr('stays', 'Delta Stays', 200, 'yearly')
  ],
  perks: [{ id: 'companion', name: 'Annual companion certificate' }, { id: 'skyclub', name: 'Delta Sky Club visits' }],
  bonus: { amount: 70000, spend: 5000, months: 6 }
}),

card('hilton-aspire', 'Hilton Honors Aspire', 'American Express', 'US', '#104c97', {
  site: 'americanexpress.com', fee: 550, unit: 'Hilton Honors points', cpp: 0.5,
  blurb: 'Diamond status, a free night, and resort and flight credits.',
  earn: [{ cat: 'dining', x: 7 }, { cat: 'flights', x: 7 }, { cat: 'other', x: 3 }],
  earnNotes: ['14x at Hilton hotels'],
  credits: [
    cr('resort', 'Hilton resort', 200, 'semiannual'),
    cr('flight', 'Flights', 50, 'quarterly'),
    cr('clear', 'CLEAR+', 209, 'yearly')
  ],
  perks: [{ id: 'night', name: 'Free weekend night each year' }, { id: 'diamond', name: 'Hilton Diamond status' }],
  bonus: { amount: 150000, spend: 6000, months: 6 }
}),

card('marriott-brilliant', 'Marriott Bonvoy Brilliant', 'American Express', 'US', '#6d2c2c', {
  site: 'americanexpress.com', fee: 650, unit: 'Bonvoy points', cpp: 0.8,
  blurb: 'Platinum Elite status, an 85,000-point free night and a monthly dining credit.',
  earn: [{ cat: 'dining', x: 3 }, { cat: 'flights', x: 3 }, { cat: 'other', x: 2 }],
  earnNotes: ['6x at Marriott hotels'],
  credits: [cr('dining', 'Restaurants worldwide', 25, 'monthly')],
  perks: [{ id: 'night', name: 'Free night up to 85,000 points' }, { id: 'platinum', name: 'Marriott Platinum Elite status' }],
  bonus: { amount: 95000, spend: 6000, months: 6 }
}),

/* ──────────────────────────────  United Kingdom  ────────────────────────────── */

card('amex-platinum-uk', 'Platinum Card', 'American Express', 'GB', '#9da3ab', {
  site: 'americanexpress.com/uk', fee: 650, unit: 'Membership Rewards points', cpp: 1,
  blurb: 'Lounges, hotel status and £400 a year of restaurant credit split between the UK and abroad.',
  earn: [{ cat: 'other', x: 1 }],
  earnNotes: ['2 points per £1 through Amex Travel'],
  credits: [
    cr('dine-uk', 'UK restaurants', 100, 'semiannual', { note: 'Offer runs to 31 Dec 2026; enrolment required' }),
    cr('dine-abroad', 'Restaurants abroad', 100, 'semiannual')
  ],
  perks: [{ id: 'lounge', name: 'Priority Pass and Centurion lounges' }, { id: 'status', name: 'Hotel status' }],
  bonus: { amount: 50000, spend: 6000, months: 3 }
}),

card('amex-gold-uk', 'Preferred Rewards Gold', 'American Express', 'GB', '#c9a24a', {
  site: 'americanexpress.com/uk', fee: 195, firstYearFree: true, unit: 'Membership Rewards points', cpp: 1,
  blurb: 'Free for a year, then £195 — with a Deliveroo credit and 1:1 transfers to Avios.',
  earn: [{ cat: 'flights', x: 2 }, { cat: 'other', x: 1 }],
  earnNotes: ['2 points per £1 on foreign-currency spending', '3 points per £1 through Amex Travel'],
  credits: [cr('deliveroo', 'Deliveroo (2 × £5)', 10, 'monthly')],
  bonus: { amount: 20000, spend: 3000, months: 3 }
}),

card('ba-amex-pp', 'British Airways Premium Plus', 'American Express', 'GB', '#1d3f8a', {
  site: 'americanexpress.com/uk', fee: 300, unit: 'Avios', cpp: 1,
  blurb: 'The 2-for-1 companion voucher at £15,000 a year is the reason to hold it.',
  earn: [{ cat: 'other', x: 1.25 }],
  earnNotes: ['3 Avios per £1 on British Airways flights and holidays', 'General earn cut to 1.25 per £1 from 7 October 2026'],
  perks: [{ id: 'companion', name: 'Companion voucher after £15,000 a year' }],
  bonus: { amount: 30000, spend: 6000, months: 3 }
}),

card('ba-amex', 'British Airways Credit Card', 'American Express', 'GB', '#3d5ea8', {
  site: 'americanexpress.com/uk', fee: 0, unit: 'Avios', cpp: 1,
  blurb: 'Free Avios earning, with a companion voucher on high spend.',
  earn: [{ cat: 'other', x: 1 }],
  bonus: { amount: 5000, spend: 2000, months: 3 }
}),

card('barclaycard-avios-plus', 'Avios Plus Mastercard', 'Barclaycard', 'GB', '#00395d', {
  site: 'barclaycard.co.uk', fee: 240, unit: 'Avios', cpp: 1,
  blurb: 'Avios on a Mastercard, so it works where Amex does not.',
  earn: [{ cat: 'other', x: 1.5 }],
  perks: [{ id: 'upgrade', name: 'Upgrade voucher after £10,000 a year' }],
  bonus: { amount: 25000, spend: 3000, months: 3 }
}),

/* ──────────────────────────────  India  ────────────────────────────── */

card('hdfc-infinia', 'Infinia Metal', 'HDFC Bank', 'IN', '#1c1c1c', {
  site: 'hdfcbank.com', fee: 12500, unit: 'reward points', cpp: 100,
  blurb: 'Invitation-only. About 3.3% back across spending at ₹1 a point on SmartBuy travel.',
  earn: [{ cat: 'other', x: 5 / 150 }],
  earnNotes: ['5 points per ₹150', 'Up to 10x through SmartBuy', 'Points worth ₹1 on flights and hotels, less as cash'],
  perks: [{ id: 'lounge', name: 'Unlimited lounge access' }, { id: 'golf', name: 'Golf games' }]
}),

card('hdfc-dcb', 'Diners Club Black Metal', 'HDFC Bank', 'IN', '#2d2d2d', {
  site: 'hdfcbank.com', fee: 10000, unit: 'reward points', cpp: 100,
  blurb: 'Infinia\'s earn rate without the invitation; fee waived at ₹8 lakh a year.',
  earn: [{ cat: 'other', x: 5 / 150 }],
  earnNotes: ['5 points per ₹150', 'Up to 10x through SmartBuy', 'Monthly milestone vouchers on ₹80,000 spend'],
  perks: [{ id: 'memberships', name: 'Complimentary memberships (Swiggy One, Amazon Prime and others)' }]
}),

card('hdfc-regalia-gold', 'Regalia Gold', 'HDFC Bank', 'IN', '#a07a2c', {
  site: 'hdfcbank.com', fee: 2500, unit: 'reward points', cpp: 50,
  blurb: 'Mid-tier HDFC card with partner-brand multipliers and lounge access.',
  earn: [{ cat: 'other', x: 4 / 150 }],
  earnNotes: ['4 points per ₹150', '5x on Myntra, Nykaa, Marks & Spencer and Reliance Digital'],
  perks: [{ id: 'lounge', name: 'Domestic and international lounge visits' }]
}),

card('axis-atlas', 'Atlas', 'Axis Bank', 'IN', '#3a2a5e', {
  site: 'axisbank.com', fee: 5000, unit: 'EDGE Miles', cpp: 100,
  blurb: 'Travel-first miles card — closed to new applicants since 2026, still held by many.',
  closed: true,
  earn: [{ cat: 'travel', x: 5 / 100 }, { cat: 'other', x: 2 / 100 }],
  earnNotes: ['5 EDGE Miles per ₹100 on travel up to ₹2 lakh a month', 'Transfers to partners at 1:2 since April 2026']
}),

card('axis-magnus', 'Magnus', 'Axis Bank', 'IN', '#5e1e2b', {
  site: 'axisbank.com', fee: 12500, unit: 'EDGE Reward points', cpp: 20,
  blurb: 'High-spend card; fee waived at ₹25 lakh a year.',
  earn: [{ cat: 'other', x: 12 / 200 }],
  earnNotes: ['12 points per ₹200', 'Transfer ratio varies by relationship tier — check Axis']
}),

card('sbi-cashback', 'Cashback Card', 'SBI Card', 'IN', '#2f6db3', {
  site: 'sbicard.com', fee: 999, kind: 'cashback', unit: 'cash back', cpp: 1,
  blurb: 'Five percent on online spending with no merchant restrictions.',
  earn: [{ cat: 'online', x: 5 }, { cat: 'other', x: 1 }],
  earnNotes: ['5% online capped at ₹2,000 a month since April 2026', 'Fee waived at ₹2 lakh a year']
}),

card('icici-amazonpay', 'Amazon Pay', 'ICICI Bank', 'IN', '#232f3e', {
  site: 'icicibank.com', fee: 0, kind: 'cashback', unit: 'cash back', cpp: 1,
  blurb: 'Lifetime-free; five percent at Amazon for Prime members.',
  earn: [{ cat: 'other', x: 1 }],
  earnNotes: ['5% at Amazon with Prime (3% without)', '2% at Amazon Pay partner merchants']
}),

card('hdfc-swiggy', 'Swiggy', 'HDFC Bank', 'IN', '#fc8019', {
  site: 'hdfcbank.com', fee: 500, kind: 'cashback', unit: 'cash back', cpp: 1,
  blurb: 'Ten percent on Swiggy, five on other online spending.',
  earn: [{ cat: 'online', x: 5 }, { cat: 'other', x: 1 }],
  earnNotes: ['10% on Swiggy food, Instamart and Dineout (₹249 minimum order)']
}),

card('axis-flipkart', 'Flipkart', 'Axis Bank', 'IN', '#2874f0', {
  site: 'axisbank.com', fee: 500, kind: 'cashback', unit: 'cash back', cpp: 1,
  blurb: 'Five percent on Flipkart and Cleartrip, seven and a half on Myntra.',
  earn: [{ cat: 'other', x: 1 }],
  earnNotes: ['5% on Flipkart and Cleartrip, 7.5% on Myntra (quarterly caps)', '4% on Swiggy, Uber, PVR and Cult.fit']
})

];

const CARD_BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));
const CARD_MARKETS = ['US', 'GB', 'IN'];
