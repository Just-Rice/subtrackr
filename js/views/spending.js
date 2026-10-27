/* views/spending.js — placeholder until the spending module lands. */

(function (ST) {
'use strict';

function render() {
  ST.ui.$('#spendingRoot').innerHTML =
    '<div class="view-head"><div><h1 id="h-spending">Spending</h1></div></div>' +
    '<section class="card">' + ST.ui.empty('Expense tracking is on its way.') + '</section>';
}

ST.views = ST.views || {};
ST.views.spending = { wire: function () {}, render: render };

})(window.ST = window.ST || {});
