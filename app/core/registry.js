/* ============================================================================
   Classroom Exam App — core/registry.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* The module contract.

   An activity registers itself here; the core never names one. Four things are asked of every
   module: how students join it, what the teacher can do while it runs, whether and how it
   scores, and what it shows at the end. A module that needs the core changed to fit is a sign
   the contract is wrong, not a reason for an exception.

   v3.0 introduces the registry alongside the two activities that already exist; they are not
   yet routed through it. Role play is the first module to be built against it. */

const ACTIVITIES = {};

/* Register an activity. The four keys are the contract:
     join(runId, student)   how a student enters it
     teacher(runId)         what the teacher drives while it runs
     score(run)             a result, or null when the activity does not score
     finish(run)            what everyone sees at the end
   Anything else an activity needs belongs to that activity, not to the core. */
function registerActivity(id, def){
  if (!id || typeof id !== "string") throw new Error("an activity needs an id");
  if (ACTIVITIES[id]) // Developer-facing: this never reaches a screen, so it stays in English on purpose.
    throw new Error("activity already registered: " + id);
  const missing = ["join","teacher","score","finish"].filter(k => typeof def[k] !== "function" && def[k] !== null);
  if (missing.length) throw new Error(id + " is missing: " + missing.join(", "));
  /* Since v3.21 an activity must also say what a student is called in it. Required rather
     than defaulted: a new module that forgets would otherwise quietly ask a class for their
     surnames in a game that keeps nothing. */
  // Developer-facing, like the throws above: this never reaches a screen.
  if (typeof def.nameMode !== "function") throw new Error(id + " is missing: " + "nameMode");
  ACTIVITIES[id] = Object.assign({ id: id }, def);
  return ACTIVITIES[id];
}
function activity(id){ return ACTIVITIES[id] || null; }

/* What kind of run this is.

   A run's meta says so — except for a test, which never wrote it: the test was the router's
   default path until v3.3, so nothing needed to ask. Removing that default in v3.3 turned
   every quiz already in the database into a session of no recognised kind, and students
   joining one were told to check with their teacher.

   Tests created from v3.4.1 carry kind:"quiz". This function is what covers the ones created
   before that, and it will keep being needed: a run made last term does not get rewritten.
   Same shape as setKind() in core/bank.js, and for the same reason. */
function runKind(meta){
  const k = meta && meta.kind;
  return (typeof k === "string" && k) ? k : "quiz";
}

/* What to call this activity in a sentence, in the reader's language.

   `label` stays the plain English name: registration runs as the page loads, so a t() call in
   the definition would freeze whatever language the page started in and never change again.
   The lookup happens here instead, when the word is actually needed. */
function activityLabel(id){
  const a = activity(id);
  if (!a) return t("registry.session", "Session");
  return t("activity." + id, a.label);
}
function activityIds(){ return Object.keys(ACTIVITIES); }

/* ---------- what a student is called (v3.21) ----------

   Four ways, and WHICH ONE IS A PROPERTY OF THE ACTIVITY, not a setting a teacher picks each
   time. The activity knows what it needs:

     "full"       surname and first name  — a test: it is an exam and it leaves a CSV
     "first"      first name only         — role play, Describe It, Twenty Questions, Word
                                            Partners: you pair people by reading a name aloud,
                                            and a pseudonym cannot be paired across a room
     "pseudonym"  a name the app gives    — quiz, bingo: nothing is kept and nobody needs to
                                            be identified afterwards
     "anonymous"  nothing at all          — an opinion poll, where being identifiable is the
                                            thing that stops an honest answer

   A poll is the one activity where the teacher chooses, because all three of the last modes
   are defensible for it; everything else returns a constant. That is why this takes meta.

   Replaces three separate hooks — `anonymous`, `firstNameOnly`, and an unstated default —
   which between them encoded the same decision in three places and had no room for a fourth
   answer. One question, one answer. */
const NAME_MODES = ["full", "first", "pseudonym", "anonymous"];

function activityNameMode(kind, meta){
  const a = activity(kind);
  if(!a || typeof a.nameMode !== "function") return "full";
  const m = a.nameMode(meta);
  /* An unrecognised mode falls back to asking for a full name rather than to asking for
     nothing. Getting this wrong in the safe direction means a student types a name they did
     not need to; in the other direction it means an exam with no names on it. */
  return NAME_MODES.indexOf(m) >= 0 ? m : "full";
}

/* Does a finished run leave anything behind? A test is archived; a poll and a role play are
   removed, because their records name students and there is nothing worth keeping. Declared
   by the activity as `keeps:false` so the core never has to ask which is which. */
function activityKeepsNothing(kind){
  const a = activity(kind);
  return !!(a && a.keeps === false);
}
