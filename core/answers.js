/* ============================================================================
   ANSWER MATCHING — how a short answer is judged right or wrong.

   The rule, settled 2026-09-25: a short answer is marked against exactly what the
   author typed, in the language of the test. No case folding, no accent stripping,
   no typo tolerance. Capitalisation is assessable content — countries, nationalities
   and the pronoun "I" are things we deliberately test for.

   So nothing in this file "helps" a near miss. If you are here to add tolerance,
   read the decisions log entry of 2026-09-25 first: it was a deliberate ruling, not
   an oversight. normWord() folds case and strips accents; it belongs to the word
   cloud and must never be wired into marking.

   This lives in core because both the student's marking (modules/test.js) and the
   author's Excel import (admin/import.js) have to agree on what a number is.
   ============================================================================ */

/* Put on every field where the student or the author types an answer.

   A phone capitalises the first character of a field by default. Under case-sensitive
   marking that hands a mark to a student who does not know nationalities take a
   capital — they type "french", the keyboard returns "French", and the item stops
   testing anything. Autocorrect does the same for spelling, and a spellcheck squiggle
   is a hint mid-test.

   Note this is a hint, not a lock: some keyboards (Gboard among them) can override it.
   For items where capitalisation IS the point, author the answer so the tested word is
   not in first position — "the French market", not "French". Nothing the page can do
   reaches past the first character. */
const NO_KEYBOARD_HELP = 'autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off"';

/* The language a question is marked in. Content language tagging is not built yet, so
   everything is English today; when the tag lands it sets q.lang and this starts
   returning it. Marking must never guess from the student's phone. */
function answerLang(q){
  const l = q && q.lang;
  return (l === "fr") ? "fr" : "en";
}

/* A number written the way the test's language writes numbers, or null.

   null means "this is not a number in this language", which is marked wrong. That is
   the point: parseFloat("3,5") silently returns 3, so a French student typing 3,5
   used to be marked correct against an accepted answer of 3 — and so did one typing
   3,9. That is leniency in the worst possible place, and a silent misread besides.

   English:  1000  1,000  1000.5  -2.75
   French:   1000  1 000  1000,5  -2,75   (space or narrow no-break space groups)

   A thousands separator must group exactly three digits, which is what stops "3,5"
   passing as English. Writing numbers in the conventions of the language is part of
   what a Business English test assesses, so the two notations are not interchangeable. */
function parseStrictNumber(raw, lang){
  const s = String(raw === undefined || raw === null ? "" : raw).trim();
  if(!s) return null;
  if(lang === "fr"){
    if(!/^-?\d{1,3}(?:[   ]\d{3})*(?:,\d+)?$/.test(s) && !/^-?\d+(?:,\d+)?$/.test(s)) return null;
    const n = Number(s.replace(/[   ]/g, "").replace(",", "."));
    return isFinite(n) ? n : null;
  }
  if(!/^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$/.test(s) && !/^-?\d+(?:\.\d+)?$/.test(s)) return null;
  const n = Number(s.replace(/,/g, ""));
  return isFinite(n) ? n : null;
}

/* Exact match against one of the accepted answers, give or take surrounding whitespace.
   Whitespace around the answer is not assessable; everything inside it is.

   caseSensitive is the author's switch, per question, and defaults on. Turning it off is
   a deliberate authoring decision about one item — "either capital counts here" — not a
   blanket kindness. Accents are never folded, in either setting: "modele" is wrong
   against "modèle" exactly as "rísk" is wrong against "risk". */
function matchTextAnswer(given, accepted, caseSensitive){
  const g = String(given === undefined || given === null ? "" : given).trim();
  if(!g) return false;
  const list = Array.isArray(accepted) ? accepted : (accepted === undefined ? [] : [accepted]);
  if(caseSensitive === false){
    const low = g.toLowerCase();
    return list.some(c => String(c).trim().toLowerCase() === low);
  }
  return list.some(c => String(c).trim() === g);
}

/* Numeric marking. Tolerance is the author's, and applies to the value — never to how
   the value is written. A malformed number is wrong however close it looks. */
function markNumeric(given, correct, tolerance, lang){
  const n = parseStrictNumber(given, lang);
  if(n === null) return false;
  return Math.abs(n - correct) <= (tolerance || 0);
}
