/* ============================================================================
   Classroom Exam App — core/bingocard.js
   Loaded as a plain script in the order set by index.html; every file shares one
   global scope, so nothing is imported or exported.
   ============================================================================ */

/* The arithmetic of a bingo card, in core, because three screens have to agree about it: the
   student's card, the teacher's verification of a claim, and the projected list of what has
   been called.

   ---------------------------------------------------------------------------
   WHY THE CARD IS DRAWN ON THE PHONE AND NOT HANDED OUT BY THE TEACHER

   A card is nine words out of twenty. Writing twenty-five cards into the run would be the
   teacher's device deciding what every phone holds, and a student cannot read another
   student's record — so each phone would have to be told its card through a node that every
   phone can read, which is the roster problem again with nine times the data.

   Instead the card is DERIVED from the student's own id. Same id, same card, every time —
   so a reload gives back the card they were playing, rather than a fresh one with the words
   they still needed. That is not a nicety: a student who could reroll their card by pulling
   down on the page would be playing a different game from everybody else.
   --------------------------------------------------------------------------- */

const BINGO_SIDE = 3;                       // 3 x 3. Chris: "Grid 3x3 is enough."
const BINGO_CELLS = BINGO_SIDE * BINGO_SIDE;

/* The list must be more than twice the card — Chris's rule, and the reason is the duration.

   A full card on a 3x3 needs all nine of a student's words called. With a list of N, the
   expected number of calls before one given card is complete is about 9(N+1)/10, and the
   FIRST of twenty-five cards finishes a good deal earlier than that. At N=20 the first
   winner lands around call 15 or 16, which is four to five minutes of play. At N=12 the game
   is over in ninety seconds and half the room has not looked up yet; at N=40 it outlasts the
   lesson.

   So the list length is the duration dial, and this is the floor below which the dial does
   not work at all. */
const BINGO_MIN_WORDS = 2 * BINGO_CELLS + 1;   // 19

/* A small deterministic generator, so a card can be rebuilt from an id rather than stored.

   mulberry32: thirty-two bits of state, one multiply and a couple of shifts. Not a
   cryptographic generator and it does not need to be — nothing here is secret, the words are
   on the teacher's screen anyway. It needs to be STABLE: the same seed gives the same
   sequence on every browser and every version, which Math.random cannot promise and a hash
   of the id alone cannot give a sequence of. */
function bingoRng(seed){
  let a = seed >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/* The seed for one student in one run. Both halves matter: the id, so two students in a room
   hold different cards; the run, so the same class playing the same list after the break does
   not get the same cards back. */
function bingoSeed(runId, studentId){
  const s = String(runId || "") + "|" + String(studentId || "");
  let h = 2166136261 >>> 0;                 // FNV-1a
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/* Nine words out of the list, without repeats. Returns the INDEXES into the list rather than
   the words, so a card survives the list being re-read and never holds a stale copy of a word
   the author has since corrected. */
function bingoCard(words, runId, studentId){
  const n = (words || []).length;
  if(n < BINGO_CELLS) return [];
  const rnd = bingoRng(bingoSeed(runId, studentId));
  const pool = [];
  for(let i = 0; i < n; i++) pool.push(i);
  // Fisher-Yates with our own generator, then the first nine.
  for(let i = n - 1; i > 0; i--){
    const j = Math.floor(rnd() * (i + 1));
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }
  return pool.slice(0, BINGO_CELLS);
}

/* The order the teacher calls them in, shuffled once and stored in the run — so every phone
   and the projector agree on what has been called, and a reconnecting teacher does not start
   calling a different sequence. */
function bingoCallOrder(count, rnd){
  const r = typeof rnd === "function" ? rnd : Math.random;
  const out = [];
  for(let i = 0; i < count; i++) out.push(i);
  for(let i = out.length - 1; i > 0; i--){
    const j = Math.floor(r() * (i + 1));
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

/* Which list positions have been called so far. `callIdx` is how many calls have been made,
   so a run that has not started has called nothing rather than called the first word. */
function bingoCalled(order, callIdx){
  const n = Math.max(0, Math.min(Number(callIdx) || 0, (order || []).length));
  return (order || []).slice(0, n);
}

/* ---------------------------------------------------------------------------
   THE CLAIM, AND WHY IT IS CHECKED RATHER THAN TRUSTED

   A student marks a cell by tapping it, and tapping is ALLOWED ON ANY CELL. It has to be: in
   the strong version the teacher calls a definition and the student has to work out which of
   their nine words it describes. If the app only let them tap words that had been called, the
   app would be doing the comprehension and the game would play itself.

   So a full card is a CLAIM, and the claim is verified: every marked cell must name a word
   that has actually been called. A card marked optimistically fails, and that is the whole of
   "false bingo auto-rejected" — the student finds out from their own phone, nobody is
   accused of anything in front of the room, and play continues.
   --------------------------------------------------------------------------- */

/* Is this card complete and honest? `card` is the list indexes on it, `marks` the subset the
   student has tapped, `called` what has actually been called. */
function bingoVerify(card, marks, called){
  const cells = (card || []).length;
  if(cells !== BINGO_CELLS) return { full:false, valid:false, wrong:[] };
  const marked = (marks || []).filter(i => card.indexOf(i) >= 0);
  const full = marked.length === cells;
  /* Every marked word, not just the ones that complete a line: a card is won whole here, so
     a single optimistic mark anywhere on it is what makes the claim false. */
  const seen = {};
  (called || []).forEach(i => { seen[i] = true; });
  const wrong = marked.filter(i => !seen[i]);
  return { full:full, valid: full && wrong.length === 0, wrong:wrong };
}

/* What a word is called on the board, and what is read out for it.

   The two versions of the game, and the difference is the whole pedagogy. In the WEAK version
   the teacher reads the word and the student finds it — recognition, which is a warm-up. In
   the STRONG version the teacher reads a definition or a gapped sentence and the student has
   to work out which word it describes — which is the exercise. Same list either way, so a set
   written for one plays as the other. */
function bingoCallText(item, strong){
  if(!item) return "";
  const clue = String(item.clue || "").trim();
  if(strong && clue) return clue;
  return String(item.word || "");
}

/* A set from the bank, read as a word list. The ANSWER is what goes on the card; the QUESTION
   is what gets read out in the strong version — which is why a short-answer set written for a
   test plays as bingo with nothing added to it.

   Anything without a usable one-or-two-word answer is left out rather than put on a card it
   will not fit: a card cell holds a word, not a sentence. */
function bingoWords(questions){
  const out = [], seen = {};
  (questions || []).forEach(q => {
    if(!q || isPollType(q.type)) return;
    const raw = Array.isArray(q.correct) ? q.correct[0] : q.correct;
    const word = String(raw === undefined || raw === null ? "" : raw).trim();
    if(!word) return;
    if(word.split(/\s+/).length > 3) return;          // too long for a cell
    const key = word.toLowerCase();
    if(seen[key]) return;                              // a word can only be on a card once
    seen[key] = true;
    out.push({ word: word, clue: String(q.text || "").trim() });
  });
  return out;
}

/* How long this will take, so the setup screen can say so rather than leaving the teacher to
   find out in front of a class. The first of `players` cards to complete, by simulation —
   closed form for "the maximum of k coupon-collector-ish draws" is not worth deriving for a
   number that only has to be right to the nearest minute. */
function bingoExpectedCalls(listLen, players, trials){
  const n = Math.max(BINGO_CELLS, listLen | 0);
  const k = Math.max(1, players | 0);
  const runs = Math.max(1, trials | 0) || 200;
  const rnd = bingoRng(bingoSeed("estimate", n + "x" + k));
  let total = 0;
  /* Not named `t`: that is the text lookup, and a local of the same name shadowing it is the
     defect that emptied Teacher Accounts in v3.3. The suite fails if one comes back. */
  for(let trial = 0; trial < runs; trial++){
    const cards = [];
    for(let c = 0; c < k; c++) cards.push(bingoCard(new Array(n), "estimate", trial + ":" + c));
    const order = bingoCallOrder(n, rnd);
    const called = {};
    let calls = n;
    for(let i = 0; i < order.length; i++){
      called[order[i]] = true;
      const done = cards.some(card => card.every(ix => called[ix]));
      if(done){ calls = i + 1; break; }
    }
    total += calls;
  }
  return Math.round(total / runs);
}
