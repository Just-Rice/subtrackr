const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load');

const TODAY = '2026-10-27';

function state(ctx, raw) { return ctx.ST.store.migrate(Object.assign({ version: 2, settings: { region: 'US' } }, raw)); }

test('advisor: one tier down, overlap, a covering card credit, and low use', () => {
  const ctx = load({ today: TODAY });
  const st = state(ctx, {
    subs: [
      { id: 'n', name: 'Netflix', serviceId: 'netflix', tierName: 'Premium', amount: 26.99, cur: 'USD', group: 'video.movies' },
      { id: 's', name: 'Spotify', serviceId: 'spotify', tierName: 'Individual', amount: 12.99, cur: 'USD', group: 'audio.music' },
      { id: 'a', name: 'Apple Music', serviceId: 'applemusic', tierName: 'Individual', amount: 11.99, cur: 'USD', group: 'audio.music' },
      { id: 'd', name: 'Disney+', serviceId: 'disneyplus', tierName: 'Premium', amount: 21.49, cur: 'USD', group: 'video.movies' },
      { id: 'c', name: 'ChatGPT', serviceId: 'chatgpt', tierName: 'Plus', amount: 20, cur: 'USD', group: 'ai.chat', uses: { '2026-10': 3 } }
    ],
    cards: [{ id: 'p', cardId: 'amex-platinum' }]
  });
  const tips = ctx.ST.advisor.tips(st);
  const byId = Object.fromEntries(tips.map(t => [t.id, t]));
  assert.ok(byId['down:n'], 'Netflix Premium → Standard');
  assert.match(byId['down:n'].title, /Premium → Standard$/, 'one step down, not to the ads tier');
  assert.equal(Math.round(byId['down:n'].saveUsd), 84);
  assert.ok(!byId['down:s'], 'Spotify Individual is not pushed to Student');
  assert.ok(byId['overlap:audio.music']);
  assert.equal(Math.round(byId['overlap:audio.music'].saveUsd), Math.round(11.99 * 12));
  assert.ok(byId['cover:d'], 'Disney+ is covered by the Platinum entertainment credit');
  assert.ok(byId['use:c']);
  assert.match(byId['use:c'].title, /\$6\.67 a use/);
  assert.equal(tips[0].saveUsd >= tips[tips.length - 1].saveUsd, true, 'biggest saving first');
});

test('ics: recurring events with reminders, folded and escaped', () => {
  const ctx = load({ today: TODAY });
  const st = state(ctx, {
    subs: [{ id: 'n', name: 'Netflix, Inc; test', amount: 19.99, cur: 'USD', cycle: 'monthly', nextDate: '2026-01-31' },
           { id: 't', name: 'Disney+', amount: 21.49, cur: 'USD', trialEnds: '2026-11-04' }],
    cards: [{ id: 'p', cardId: 'amex-platinum', fee: 895, feeDate: '2027-01-15' }]
  });
  const { text, count } = ctx.ST.ics.build(st, new Date(Date.UTC(2026, 9, 27, 12, 0, 0)));
  assert.equal(count, 3);
  assert.match(text, /^BEGIN:VCALENDAR\r\n/);
  assert.match(text, /DTSTART;VALUE=DATE:20261031\r\n/, 'stale date rolled forward');
  assert.match(text, /RRULE:FREQ=MONTHLY;BYMONTHDAY=-1/, 'a 31st anchor uses the last day');
  assert.match(text, /SUMMARY:Netflix\\, Inc\\; test renews/);
  assert.match(text, /DTSTART;VALUE=DATE:20261103/, 'trial reminder is the day before it ends');
  assert.match(text, /RRULE:FREQ=YEARLY/);
  assert.match(text, /TRIGGER:-P1D/);
  assert.ok(text.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75), 'every line folded to 75 octets');
});

test('ics rrules per cycle', () => {
  const ctx = load();
  const r = ctx.ST.ics.rrule;
  assert.equal(r('fourweekly', '2026-10-01'), 'FREQ=WEEKLY;INTERVAL=4');
  assert.equal(r('quarterly', '2026-10-15'), 'FREQ=MONTHLY;INTERVAL=3');
  assert.equal(r('yearly', '2026-02-29'), 'FREQ=YEARLY');
});

test('sync: encrypt then decrypt round-trips; a wrong passphrase fails', async () => {
  const ctx = load();
  const S = ctx.ST.sync;
  const payload = { hello: 'world', n: [1, 2, 3] };
  const env = await S.encrypt(payload, 'correct horse battery');
  assert.ok(S.isEncrypted(env));
  assert.ok(!env.includes('world'), 'no plaintext in the envelope');
  const back = await S.decrypt(env, 'correct horse battery');
  assert.equal(JSON.stringify(back), JSON.stringify(payload));
  await assert.rejects(S.decrypt(env, 'wrong passphrase'), /does not open/);
  await assert.rejects(S.encrypt(payload, 'short'), /at least 8/);
  assert.equal(S.isEncrypted('{"subs":[]}'), false);
});
