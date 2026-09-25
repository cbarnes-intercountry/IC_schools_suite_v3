/* ============================================================================
   Classroom Exam App — core/i18n.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Text lookup. Every string a person reads comes from here, by a key that describes what the
   string is for, never by its English wording — change the English and every other language
   would break silently.

   v3.3 is the extraction pass: 369 keys, generated mechanically from index.html and from the
   t() calls wrapped around the alerts and status lines. English still sits in the markup as
   the fallback, so the page reads correctly before a single script has run; lang/en.js is
   generated from that markup rather than typed a second time, and the suite fails if the two
   ever disagree.

   French is scaffolded, not written: lang/fr.js holds every key with an empty value. An empty
   value falls back to English, so the app is usable at any point during translation rather
   than only at the end. */

const LANG = {
  en: (typeof LANG_EN !== "undefined" ? LANG_EN : {}),
  fr: (typeof LANG_FR !== "undefined" ? LANG_FR : {})
};
const UI_LANGS = [["en","English"],["fr","Français"]];
let UI_LANG = "en";

/* Look a string up by key.

   An empty value is treated as missing, not as "this string is blank on purpose": that is what
   lets a half-finished lang/fr.js ship without holes appearing in the interface. */
function t(key, fallback){
  const table = LANG[UI_LANG] || {};
  const v = table[key];
  if (typeof v === "string" && v !== "") return v;
  if (UI_LANG !== "en") {
    const en = LANG.en[key];
    if (typeof en === "string" && en !== "") return en;
  }
  return fallback !== undefined ? fallback : key;
}

/* Write the current language into a piece of the page.

   Called on every language change and once at boot. It only touches elements that carry a
   key, and no element whose text is written at runtime carries one — a live count, a
   countdown or a status line is translated where it is set, through t(), so switching
   language never overwrites what the class is looking at. */
function applyI18n(root){
  const scope = root || document;
  scope.querySelectorAll("[data-i18n]").forEach(el=>{
    const s = t(el.getAttribute("data-i18n"), null);
    if (s !== null) el.textContent = s;
  });
  scope.querySelectorAll("[data-i18n-ph]").forEach(el=>{
    const s = t(el.getAttribute("data-i18n-ph"), null);
    if (s !== null) el.setAttribute("placeholder", s);
  });
  scope.querySelectorAll("[data-i18n-title]").forEach(el=>{
    const s = t(el.getAttribute("data-i18n-title"), null);
    if (s !== null) el.setAttribute("title", s);
  });
}

/* Switch the interface language: one call, no reload, and the whole page redrawn from the
   keys it already carries.

   This is the teacher's setting and it follows them between devices, so it is stored on their
   own record rather than in this browser. A teacher who is not signed in — a student, or the
   sign-in screen itself — simply changes it for this visit. */
function setUiLang(code, opts){
  if (!LANG[code]) return false;
  UI_LANG = code;
  try { document.documentElement.lang = code; } catch(e){}
  applyI18n(document);
  const sel = document.getElementById("ui-lang-select");
  if (sel && sel.value !== code) sel.value = code;
  if (!(opts && opts.remember === false)) rememberUiLang(code);
  return true;
}
function uiLang(){ return UI_LANG; }

/* Is anything actually translated into this language yet? Used to keep the toggle honest:
   offering French that turns out to be English everywhere is worse than not offering it. */
function langIsTranslated(code){
  const table = LANG[code] || {};
  return Object.keys(table).some(k => typeof table[k] === "string" && table[k] !== "");
}

function rememberUiLang(code){
  try {
    if (typeof TEACHER_USER !== "undefined" && TEACHER_USER && TEACHER_USER.uid) {
      Backend.setTeacher(TEACHER_USER.uid, { uiLang: code }).catch(e=>console.warn("uiLang not saved", e));
    }
  } catch(e){ console.warn("uiLang not saved", e); }
}

/* Called once a teacher is recognised, so their saved choice arrives with them. */
function applyTeacherUiLang(rec){
  const code = rec && rec.uiLang;
  if (code && LANG[code] && code !== UI_LANG) setUiLang(code, { remember:false });
}

/* Fills the toggle and puts the page into its starting language. Boot calls this. */
function initUiLang(){
  const sel = document.getElementById("ui-lang-select");
  if (sel && !sel.options.length){
    UI_LANGS.forEach(([code,label])=>{
      const o = document.createElement("option");
      o.value = code;
      // A language is named in its own language — "Français", never "French".
      o.textContent = label + (langIsTranslated(code) || code === "en" ? "" : " (not translated yet)");
      sel.appendChild(o);
    });
    sel.value = UI_LANG;
    sel.addEventListener("change", ()=> setUiLang(sel.value));
  }
  applyI18n(document);
}
