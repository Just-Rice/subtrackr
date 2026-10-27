/* views/cards.js — placeholder until the cards module lands. */

(function (ST) {
'use strict';

function render() {
  ST.ui.$('#cardsRoot').innerHTML =
    '<div class="view-head"><div><h1 id="h-cards">Cards</h1></div></div>' +
    '<section class="card">' + ST.ui.empty('Credit card tracking is on its way.') + '</section>';
}

ST.views = ST.views || {};
ST.views.cards = { wire: function () {}, render: render };

})(window.ST = window.ST || {});
