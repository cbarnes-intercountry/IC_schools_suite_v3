/* ============================================================================
   Classroom Exam App — core/i18n.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Text lookup. Every string a person reads should come from here, by a key that describes
   what the string is for, never by its English wording — change the English and every other
   language would break silently.

   v3.0 ships the mechanism only: nothing has been extracted yet, so t() falls back to the key
   and the app reads exactly as before. Extraction happens module by module in v3.1. */

const LANG = { en: (typeof LANG_EN !== "undefined" ? LANG_EN : {}) };
let UI_LANG = "en";

/* Look a string up by key. Nothing is extracted yet, so an unknown key returns the key
   itself — which is why the app reads identically to v2.22.1 today. */
function t(key, fallback){
  const table = LANG[UI_LANG] || {};
  if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
  return fallback !== undefined ? fallback : key;
}

/* Switching language is one call, so the teacher-facing toggle has somewhere to land.
   Re-rendering the current screen is the caller's job. */
function setUiLang(code){
  if (!LANG[code]) return false;
  UI_LANG = code;
  try { document.documentElement.lang = code; } catch(e){}
  return true;
}
function uiLang(){ return UI_LANG; }
