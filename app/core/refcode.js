/* Reference codes.
   -----------------------------------------------------------------------------------------
   Every saved set carries a permanent code — TST-4KRW — assigned the first time it is saved
   and never changed again. It is the only stable identity a set has: the record KEY is still
   derived from the name (core/bank.js quizKey), so renaming a set moves it to a new record.
   That is a known fault, left alone in v4.0 on purpose; the code is what you quote in a lesson
   plan, an email or across a staffroom, and it survives the rename that the key does not.

   THE ALPHABET CONTAINS NO TWINS. A teacher reads this code off a laptop and somebody else
   types it into a phone, or it is said out loud across a room of twenty-five people. So the
   characters are grouped by what they are mistaken for, and AT MOST ONE SURVIVES EACH GROUP:

       group                 kept      why
       0  O  Q  D            none      four round shapes; none is safe beside the others
       1  I  L               none      upright strokes
       2  Z                  none      5  S   none      8  B   none
       U  V  W               W         U and V are said alike in French
       6  G                  6         3  E   E         M  N   M   (M/N heard alike)
       7  T                  T         a 7 with no crossbar is a T on a projector

   What is left is 17 characters — 469ACEFHJKMPRTWXY — and 83,521 codes per kind.
   NOTE there is no 7 in it: an example code is TST-4KRW, never TST-4KRW.

   THE FIRST VERSION OF THIS FILE GOT IT WRONG and the mistake is worth recording, because it
   looked like a kindness. It kept Q and J in the alphabet and had the normaliser "repair" a
   typo by folding O onto Q and I onto J. But every one of those folds turns a mistyped code
   into a DIFFERENT VALID CODE: type TST-IKRW meaning nothing, and the normaliser hands you
   TST-JKRW, a real set, silently, with no sign anything was corrected. Opening the wrong test
   is far worse than finding none. With no twins in the alphabet there is nothing to repair:
   a character that is not in the alphabet cannot be part of any code, so a typo finds nothing
   and says so. refNormalise now only upper-cases and drops punctuation.

   The code is NOT a secret and NOT a join code. The four-digit run code stays what it is: it
   belongs to one sitting, it is reused, and it dies when the run ends. A reference code is
   permanent and identifies the authored set, so it must never become the way a student joins —
   that would make a permanent credential out of something printed on a lesson plan. */

const REF_ALPHABET = "469ACEFHJKMPRTWXY";   // see the table above; no pair in here is a twin
const REF_LEN = 4;

/* Prefix per activity kind. These are the CURRENT game names (the design system renamed six of
   them): Poll is Synapse, Quiz game is Quizfire, Describe It is Off-Limits, Word Partners is
   Word Pairs, Twenty Questions is 20 Questions. The stored `kind` values are unchanged — they
   are database keys, and renaming those would be a migration for no gain. */
const REF_PREFIX = {
  quiz:       "TST",   // Test
  livequiz:   "QZF",   // Quizfire
  poll:       "SYN",   // Synapse
  roleplay:   "RPL",   // Role Play
  describeit: "OFL",   // Off-Limits
  partners:   "WPR",   // Word Pairs
  twentyq:    "20Q",   // 20 Questions
  bingo:      "BNG"    // Bingo!
};

/* Name what belongs, never what does not — the v3.1.1 lesson. A kind with no prefix yet gets a
   usable one rather than an undefined, so a new game is born with a code instead of born
   broken. It warns, because a permanent prefix should be chosen deliberately. */
function refPrefix(kind){
  const k = String(kind || "").toLowerCase();
  if(REF_PREFIX[k]) return REF_PREFIX[k];
  console.warn("no reference prefix for kind " + JSON.stringify(k) + " — using a derived one");
  const letters = k.replace(/[^a-z]/g, "").toUpperCase();
  return (letters + "XXX").slice(0, 3);
}

function refRandom(){
  let out = "";
  const n = REF_ALPHABET.length;
  // crypto where it exists; a code is not a secret, but Math.random across 25 phones opening
  // the same page in the same second is not a distribution worth relying on.
  const c = (typeof crypto !== "undefined" && crypto.getRandomValues) ? crypto : null;
  const buf = c ? new Uint32Array(REF_LEN) : null;
  if(c) c.getRandomValues(buf);
  for(let i = 0; i < REF_LEN; i++){
    const r = c ? (buf[i] / 4294967296) : Math.random();
    out += REF_ALPHABET.charAt(Math.floor(r * n));
  }
  return out;
}

/* Upper-case, drop the hyphen, spaces and any stray punctuation. NOTHING is remapped — see the
   header. A character outside the alphabet simply makes the code match nothing, which is the
   honest outcome. */
function refNormalise(s){
  return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/* True for a complete, well-formed code. The suffix must be drawn entirely from the alphabet,
   so TST-IKRW is refused rather than quietly treated as something else. The prefix is checked
   for shape, not membership, so a kind added later is not rejected by an older build. */
function refIsWellFormed(code){
  const s = String(code || "").toUpperCase();
  const m = /^([A-Z0-9]{3})-([A-Z0-9]{4})$/.exec(s);
  if(!m) return false;
  for(let i = 0; i < m[2].length; i++) if(REF_ALPHABET.indexOf(m[2].charAt(i)) < 0) return false;
  return true;
}

/* Does this query look like somebody trying to type a code, rather than a word? Used to tell
   them "no set has that code" instead of a bare empty list. A query of four or more characters
   that are all alphanumeric, with at least one digit or a hyphen in it, is the signal. */
function refLooksLikeCode(query){
  const raw = String(query == null ? "" : query).trim();
  if(raw.length < 4) return false;
  if(/\s/.test(raw)) return false;
  return /^[A-Za-z0-9-]+$/.test(raw) && (/\d/.test(raw) || raw.indexOf("-") >= 0);
}

/* Mint a code for `kind` that nothing in `taken` already holds. `taken` is whatever the caller
   has — an array of codes, a Set, or the list of records from listQuizzes. It is checked
   rather than trusted: two owners can be saving at the same moment, so the caller re-reads the
   bank immediately before writing. */
function refTakenSet(taken){
  const out = new Set();
  (taken || []).forEach(x => {
    const code = (x && typeof x === "object") ? x.ref : x;
    if(code) out.add(String(code).toUpperCase());
  });
  return out;
}

function refMint(kind, taken){
  const used = (taken instanceof Set) ? taken : refTakenSet(taken);
  const prefix = refPrefix(kind);
  for(let attempt = 0; attempt < 200; attempt++){
    const code = prefix + "-" + refRandom();
    if(!used.has(code)) return code;
  }
  // 200 misses against 83,521 codes means the bank is not what we think it is. Say so rather
  // than returning a duplicate that two sets then share for ever.
  throw new Error("could not find a free reference code for " + kind + " after 200 attempts");
}

/* ---- matching, for the search box -------------------------------------------------------

   One matcher, used by every launcher and the editor, so the eight pickers cannot drift into
   eight slightly different ideas of what counts as a hit. It searches the three things the
   list already holds: the name, the code and the schools. Question text is deliberately NOT
   searched — that would mean loading every set's full content on every keystroke. */
function refMatches(rec, query){
  if(!rec) return false;
  const raw = String(query == null ? "" : query).trim();
  if(!raw) return true;                                  // an empty box hides nothing

  const codeQ = refNormalise(raw);
  const codeR = refNormalise(rec.ref || "");
  // a code match is whole-query, not per word, so a partial code still works: type "4KRW"
  if(codeQ && codeR && codeR.indexOf(codeQ) >= 0) return true;

  const hay = [];
  if(rec.name) hay.push(String(rec.name).toLowerCase());
  (rec.schools || []).forEach(s => hay.push(String(s).toLowerCase()));

  // Every word the user typed must appear somewhere — "insurance bts2" finds the set tagged
  // BTS2 and named Insurance basics, which one combined string could not.
  return raw.toLowerCase().split(/\s+/).filter(Boolean)
            .every(w => hay.some(h => h.indexOf(w) >= 0));
}
