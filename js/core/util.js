/* util.js — small helpers every other file leans on. No DOM, no state.
 *
 * Every script attaches to one namespace, window.ST, and loads as a classic
 * <script> so the app still runs straight from the filesystem. The tests load
 * the same files into a Node vm context in the same order.
 */

(function (ST) {
'use strict';

function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* colours land inside style="…"; anything but a plain hex could smuggle CSS in */
function safeColor(c, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(c)) ? String(c) : (fallback || '#888888');
}

/* a finite number, at least min (default 0), or the fallback */
function num(v, fallback, min) {
  const n = Number(v);
  const lo = min == null ? 0 : min;
  return isFinite(n) && n >= lo ? n : (fallback == null ? lo : fallback);
}

function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

function str(v, fallback) { return v == null ? (fallback || '') : String(v); }

function initials(name) {
  const words = String(name || '').replace(/[^A-Za-z0-9 +]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function sum(list, fn) { return list.reduce(function (n, x) { return n + (fn ? fn(x) : x); }, 0); }

function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

ST.util = { uid: uid, esc: esc, safeColor: safeColor, num: num, isObj: isObj, str: str,
            initials: initials, sum: sum, plural: plural };

})(window.ST = window.ST || {});
