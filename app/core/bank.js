/* ============================================================================
   Classroom Exam App — core/bank.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* The questions themselves, and what a set belongs to. */

 // Firebase database handle when live

function schoolKey(name){ return String(name||"").trim().replace(/[.#$/\[\]]/g,"_").slice(0,180) || "_"; }

// Normalise a quiz's school assignment to an array (handles older single-school records).
function quizSchools(q){ if(!q) return []; if(Array.isArray(q.schools)) return q.schools; if(q.school) return [q.school]; return []; }


/* ---------- Poll helpers (shared by admin, teacher and student) ----------
   A "poll" question has no right answer: POLL_TYPES are the two live-vote formats.
   Saved sets carry kind:"quiz" or kind:"poll"; records saved before polls existed have
   no kind at all, so setKind() infers it from the questions rather than guessing. */
const POLL_TYPES = ["poll","cloud"];

function isPollType(type){ return POLL_TYPES.indexOf(type)>=0; }

/* ---------- a poll question that DOES have a right answer (v3.20) ----------

   Until v3.20 "a poll is never marked" and "a poll has no right answer" were the same
   sentence, and the code said it in both forms interchangeably. They are not the same
   sentence any more. A poll question may now carry a key, which makes it a comprehension
   check the class answers together — but it is still never marked: points stay 0, no score
   is written, nothing reaches a report, and `keeps:false` still means the run is deleted at
   Close Poll. The key exists only so the room can be told the answer.

   Which is why this lives in core rather than in modules/poll.js: the editor, the importer
   and the three poll views all have to agree on what counts as a key, and a second
   implementation of that rule is how they would stop agreeing. (The same lesson as
   RP_MAX_ROLES in v3.19 and uniqueFirstName in v3.17.)

   The membership test is not ceremony. An author who marks choice C correct and later edits
   the choices leaves a key naming an option that is no longer on the card; without this the
   projector would highlight nothing while still announcing an answer, which is worse than
   having no key at all. A key that has fallen off its own question is no key, and the
   question quietly goes back to being an opinion vote. */
function pollKey(q){
  if(!q || q.type!=="poll") return null;
  const c=q.correct;
  if(c===undefined || c===null || c==="") return null;
  return (q.options||[]).indexOf(c)>=0 ? c : null;
}

function pollIsChecked(q){ return pollKey(q)!==null; }

function setKind(rec){
  if(!rec) return "quiz";
  // Whatever the record says it is, it is. Listing the known kinds here meant role play came
  // back as "quiz" in v3.1 — it landed in the Test Creator list and never appeared in its own,
  // which looked exactly like "it isn't saving". A new kind must not need this function edited.
  if(rec.kind) return rec.kind;
  // Only a record saved before kinds existed has to be guessed at.
  const qs=rec.questions||[];
  return (qs.length>0 && qs.every(q=>isPollType(q.type))) ? "poll" : "quiz";
}


/* ============ TEACHER: SESSION ============ */
let TEACHER = { sessionCode:null, runId:null, questions:[], settings:{} };


/* An overall limit and per-question limits would run two clocks at once, so the quiz's own
   timings win: if any question carries one, the overall field is zeroed and locked. */
// A function, not a constant: a constant built at load holds one language for ever.
function timerHintDefault(){ return t("bank.timer_hint_default", "Per-question limits only apply in free navigation \u2014 the question locks when time runs out."); }

function applyPerQuestionTimerLock(){
  const fld=document.getElementById("opt-time-limit"), hint=document.getElementById("opt-time-limit-hint");
  if(!fld||!hint) return;
  const n=(TEACHER.questions||[]).filter(q=>(parseInt(q.timeLimitSec,10)||0)>0).length;
  if(n>0){
    fld.value=0; fld.disabled=true; fld.style.opacity="0.45"; fld.style.cursor="not-allowed";
    hint.innerHTML="<strong>"+t("bank.overall_limit_switched_off", "Overall limit switched off.")+"</strong> "+
      t("bank.overall_limit_reason", "{count} {questions} its own time limit, and the two clocks can\u2019t run together. Per-question limits only apply in free navigation \u2014 in teacher-paced mode they are ignored.",
        { count:n, questions: plural(n, t("bank.question_has", "question has"), t("bank.questions_have", "questions have")) });
  } else {
    fld.disabled=false; fld.style.opacity=""; fld.style.cursor="";
    hint.textContent=timerHintDefault();
  }
}


/* ============ SAVED QUIZ LIBRARY (admin) ============ */
function quizKey(name){ return name.trim().replace(/[^A-Za-z0-9_-]/g,"_").slice(0,120); }

function blankQuestion(){
  const poll = (typeof BUILDER_MODE!=="undefined" && BUILDER_MODE==="poll");
  return { id:"q_"+uid(6), type: poll?"poll":"mcq", text:"", points: poll?0:1, image:null, timeLimitSec:0 };
}
