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
  if (ACTIVITIES[id]) throw new Error("activity already registered: " + id);
  const missing = ["join","teacher","score","finish"].filter(k => typeof def[k] !== "function" && def[k] !== null);
  if (missing.length) throw new Error(id + " is missing: " + missing.join(", "));
  ACTIVITIES[id] = Object.assign({ id: id }, def);
  return ACTIVITIES[id];
}
function activity(id){ return ACTIVITIES[id] || null; }
function activityIds(){ return Object.keys(ACTIVITIES); }

/* Does a finished run leave anything behind? A test is archived; a poll and a role play are
   removed, because their records name students and there is nothing worth keeping. Declared
   by the activity as `keeps:false` so the core never has to ask which is which. */
function activityKeepsNothing(kind){
  const a = activity(kind);
  return !!(a && a.keeps === false);
}
