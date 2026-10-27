/* spending.js — spending categories, shared by expenses, budgets and card
 * earn rates. A child category (flights) falls back to its parent (travel)
 * when a card has no rate of its own for it, then to "other".
 */

const SPEND_CATS = [
  { id: 'groceries',     name: 'Groceries',            color: '#1baf7a' },
  { id: 'dining',        name: 'Dining out',           color: '#eb6834' },
  { id: 'travel',        name: 'Travel',               color: '#2a78d6' },
  { id: 'flights',       name: 'Flights',              color: '#2a78d6', parent: 'travel' },
  { id: 'hotels',        name: 'Hotels',               color: '#2a78d6', parent: 'travel' },
  { id: 'transport',     name: 'Transport',            color: '#4a3aa7' },
  { id: 'gas',           name: 'Fuel',                 color: '#4a3aa7', parent: 'transport' },
  { id: 'transit',       name: 'Transit & rideshare',  color: '#4a3aa7', parent: 'transport' },
  { id: 'shopping',      name: 'Shopping',             color: '#e87ba4' },
  { id: 'online',        name: 'Online shopping',      color: '#e87ba4', parent: 'shopping' },
  { id: 'subscriptions', name: 'Subscriptions',        color: '#0F7B4F' },
  { id: 'streaming',     name: 'Streaming',            color: '#0F7B4F', parent: 'subscriptions' },
  { id: 'bills',         name: 'Bills & utilities',    color: '#eda100' },
  { id: 'home',          name: 'Home & rent',          color: '#8a6d3b' },
  { id: 'health',        name: 'Health',               color: '#e34948' },
  { id: 'entertainment', name: 'Entertainment',        color: '#9085e9' },
  { id: 'other',         name: 'Everything else',      color: '#85837c' }
];

const SPEND_CAT_BY_ID = Object.fromEntries(SPEND_CATS.map(c => [c.id, c]));

/* The top-level category a spend rolls up to, for budgets and charts. */
function spendRoot(catId) {
  const c = SPEND_CAT_BY_ID[catId] || SPEND_CAT_BY_ID.other;
  return c.parent || c.id;
}

/* Catalogue groups map onto a spending category, so a tracked subscription
   counts against the right budget and earns at the right card rate. */
const GROUP_SPEND_CAT = {
  'video.movies': 'streaming', 'video.live': 'streaming', 'video.niche': 'streaming',
  'audio.music': 'streaming', 'audio.spoken': 'streaming',
  'connect.mobile': 'bills', 'connect.home': 'bills',
  'retail.meals': 'groceries'
};
function groupSpendCat(group) { return GROUP_SPEND_CAT[group] || 'subscriptions'; }
