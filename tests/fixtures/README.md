# Frozen prices for the tests

`catalog.js` and `cards.js` here are copies of `js/data/catalog.js` and
`js/data/cards.js` as they stood in October 2026.

The tests that check the app's sums (what a card is worth, when a price rise
shows up, what the monthly price check changes) need figures that stay put:
"Netflix Premium is 26.99", "the Platinum Card's credits add up to 2,984.40".
The live files can't give them that, because the monthly price check exists to
change those figures. So `tests/load.js` and the price-check tests read these
copies, and `tests/live-data.test.js` checks the live files on their own
terms: every price is a real number, every card adds up, and the price check
can still find every figure it looks after.

Refresh the copies only when a test needs something new from the data (a new
field, a new kind of plan), and update the figures the tests expect with them:

    cp js/data/catalog.js js/data/cards.js tests/fixtures/
