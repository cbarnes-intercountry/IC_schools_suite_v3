/* ============================================================================
   Classroom Exam App — core/backend.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* The database, and the one place that talks to Firebase. */

/* ---------- Firebase config ----------
   Paste your project's values here (Firebase console → Project settings → your web app).
   This config is NOT a secret — it's safe to publish; real protection comes from the
   Realtime Database security rules you set during setup. Without it the app cannot run. */
const firebaseConfig = {
  apiKey: "AIzaSyCDnTwzXufyJcg9teybNp9Z-hmL7BCl8Po",
  authDomain: "icquizapp-api.firebaseapp.com",
  databaseURL: "https://icquizapp-api-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "icquizapp-api",
  storageBucket: "icquizapp-api.firebasestorage.app",
  messagingSenderId: "149736129678",
  appId: "1:149736129678:web:318900fbcb9431e04c75df"
};


/* ---------- Backend ----------
   Every persistent operation goes through Backend, which reads and writes the Firebase
   Realtime Database and holds the real-time listeners for a live session. There is no
   second mode: if the database cannot be reached the app blocks, because a lesson run
   against nothing is worse than a lesson that stops. */
let db = null;


const Backend = {
  _authReady: null,
  init(){
    // Three ways this can fail, and two of them used to be silent. Each now names itself on a
    // blocking screen: an unconfigured file, a library that did not load, and a sign-in the
    // security rules will reject.
    if(!firebaseConfig.apiKey || firebaseConfig.apiKey.indexOf("PASTE_YOUR")!==-1){
      backendUnavailable(t("backend.no_settings", "This copy of the app has no database settings \u2014 the Firebase API key is still a placeholder."));
      return;
    }
    if(typeof firebase==="undefined"){
      backendUnavailable(t("backend.library_missing", "The Firebase library did not load. Check the internet connection, and any content blocker in the browser."));
      return;
    }
    try{
      firebase.initializeApp(firebaseConfig); db = firebase.database();
    }catch(e){
      db = null;
      backendUnavailable(t("backend.could_not_start", "Firebase could not start: {why}", {why:(e&&e.message)||e}));
      return;
    }
    // Every client signs in before touching data, so the security rules have an identity to
    // judge. Students get an invisible anonymous account; teachers upgrade to their own
    // account when they sign in (see teacherSignIn). If this fails the rules reject every
    // read and write, so it blocks rather than logging quietly.
    if(firebase.auth){
      this._authReady = firebase.auth().signInAnonymously()
        .catch(e=>{ backendUnavailable(t("backend.anon_sign_in_refused", "Signing in to the database was refused \u2014 check that Anonymous authentication is switched on in the Firebase console. ({why})", {why:(e&&e.message)||e})); });
    }
  },
  get live(){ return !!db; },
  // Await the initial sign-in before any live read/write, so rules never see an unauthenticated call.
  _ready(){ return this._authReady || Promise.resolve(); },
  // The signed-in user id, used as the student's identity so rules can scope their writes.
  uid(){ try{ return (firebase.auth().currentUser||{}).uid || null; }catch(e){ return null; } },
  _sess(runId){ return db.ref("sessions/"+runId); },
  _part(runId){ return db.ref("participants/"+runId); },
  _now(){ return firebase.database.ServerValue.TIMESTAMP; },

  // High-level operations (same names/shape in both modes).
  // Sessions are keyed by a unique runId so reusing a code keeps every past run.
  async createSession(runId, code, meta, questions){
    await this._ready();
    await this._sess(runId).set({ runId, code, runAt:Date.now(), meta, questions });
    // Tiny public index so a student can resolve a join code without being able to read
    // every session (which would expose other tests' answers).
    await db.ref("codeIndex/"+code).set(runId);
    return {ok:true};
  },
  async getActiveSession(code){ // latest run for a code
    await this._ready();
    const runId = (await db.ref("codeIndex/"+code).once("value")).val();
    if(!runId) return null;
    const r = (await this._sess(runId).once("value")).val();
    if(!r) return null;
    return { runId:r.runId||runId, meta:r.meta, questions:r.questions||[] };
  },
  async getRun(runId){ // full run incl questions
    await this._ready();
    const r = (await this._sess(runId).once("value")).val();
    return r ? { code:r.code, runAt:r.runAt, meta:r.meta, questions:r.questions||[] } : null;
  },
  async getMeta(runId){ // meta only
    await this._ready();
    const m = (await this._sess(runId).child("meta").once("value")).val();
    return m ? { meta:m } : null;
  },
  async updateMeta(runId, meta){
    await this._ready();
    await this._sess(runId).child("meta").set(meta); return {ok:true};
  },
  async listSessions(){ // for History tab
    await this._ready();
    const sessVal = (await db.ref("sessions").once("value")).val() || {};
    const partVal = (await db.ref("participants").once("value")).val() || {};
    const sessions = Object.values(sessVal).sort((a,b)=>b.runAt-a.runAt).map(r=>({
      runId:r.runId, code:r.code, runAt:r.runAt, school:(r.meta&&r.meta.school)||"",
      teacherName:(r.meta&&r.meta.teacherName)||"",
      // Carried so Home can spot a run this teacher left open — see findOpenRuns().
      teacherEmail:(r.meta&&r.meta.teacherEmail)||"",
      status:(r.meta&&r.meta.status)||"",
      kind:runKind(r.meta),   // one definition of what a run without a kind is
      studentCount: Object.keys(partVal[r.runId]||{}).length }));
    return { sessions };
  },
  async joinSession(runId, studentId, surname, firstName, consent){
    await this._ready();
    await this._part(runId).child(studentId).update({ surname, firstName, consent:!!consent, status:"joined", lastSeen:this._now() });
    return {ok:true};
  },
  async listParticipants(runId){
    await this._ready();
    const val = (await this._part(runId).once("value")).val() || {};
    return { participants: Object.keys(val).map(id=>Object.assign({studentId:id}, val[id])) };
  },
  async saveProgress(runId, studentId, surname, firstName, progress){
    await this._ready();
    await this._part(runId).child(studentId).update({ surname, firstName, status:"in_progress", lastSeen:this._now(), progress });
    return {ok:true};
  },
  async submitResult(runId, studentId, surname, firstName, result){
    await this._ready();
    await this._part(runId).child(studentId).update({ surname, firstName, status:"submitted", lastSeen:this._now(), result, progress:null });
    return {ok:true};
  },
  // One student's own record — used to resume after an unintentional disconnect.
  async getParticipant(runId, studentId){
    await this._ready();
    return (await this._part(runId).child(studentId).once("value")).val() || null;
  },
  // Teacher dismisses a student's cheat alerts by setting a baseline = current alert count.
  // Monitoring stays active; only alerts logged AFTER this baseline are counted/shown/exported.
  async resetCheat(runId, studentId, baseline){
    await this._ready();
    await this._part(runId).child(studentId).update({ cheatBaseline: baseline });
    return {ok:true};
  },
  // kind: "quiz" (marked test) or "poll" (live opinion poll). Stored on the same node so
  // polls need no new database path — and therefore no change to the security rules.
  async saveQuiz(key, name, questions, schools, kind){
    await this._ready();
    await db.ref("quizzes/"+key).set({ name, questions, schools:schools||[], kind:kind||"quiz", savedAt:Date.now() });
    return {ok:true};
  },
  async listQuizzes(){
    await this._ready();
    const val = (await db.ref("quizzes").once("value")).val() || {};
    return { quizzes: Object.keys(val).map(k=>({ key:k, name:val[k].name, schools:quizSchools(val[k]), kind:setKind(val[k]), count:(val[k].questions||[]).length })) };
  },
  async getQuiz(key){
    await this._ready();
    return (await db.ref("quizzes/"+key).once("value")).val() || null;
  },
  async deleteQuiz(key){
    await this._ready();
    await db.ref("quizzes/"+key).remove(); return {ok:true};
  },
  async listSchools(){
    await this._ready();
    const val = (await db.ref("schools").once("value")).val() || {};
    return { schools: Object.values(val).sort((a,b)=>String(a).localeCompare(String(b))) };
  },
  async addSchool(name){
    await this._ready();
    const n=(name||"").trim(); if(n) await db.ref("schools/"+schoolKey(n)).set(n); return {ok:true};
  },
  async removeSchool(name){
    await this._ready();
    await db.ref("schools/"+schoolKey(name)).remove(); return {ok:true};
  },
  /* ---- Teacher accounts & roles ----
     One record per teacher at teachers/$uid. The uid, not the email, is the key, because the
     security rules can only test auth.uid — matching on an email string would let anyone who
     could write their own record grant themselves access. */
  async listTeachers(){
    await this._ready();
    const val = (await db.ref("teachers").once("value")).val() || {};
    return { teachers: Object.keys(val).map(uid=>Object.assign({uid}, val[uid])) };
  },
  async getTeacher(uid){
    await this._ready();
    const v=(await db.ref("teachers/"+uid).once("value")).val();
    return v ? Object.assign({uid}, v) : null;
  },
  async setTeacher(uid, rec){
    await this._ready();
    await db.ref("teachers/"+uid).update(rec); return {ok:true};
  },
  async countTeachers(){
    await this._ready();
    // Used once, to decide whether this is a first-run bootstrap. Reads the node shallowly.
    const v=(await db.ref("teachers").once("value")).val() || {};
    return { count: Object.keys(v).length };
  },
  async getConfig(key){
    await this._ready();
    return { value: (await db.ref("config/"+key).once("value")).val() || "" };
  },
  async setConfig(key, value){
    await this._ready();
    await db.ref("config/"+key).set(value); return {ok:true};
  },
  // Delete a run entirely (session + participants) — used by the retention purge.
  async deleteRun(runId){
    const code = ((await this._sess(runId).child("code").once("value")).val())||null;
    await this._sess(runId).remove();
    // Participants are removed one child at a time. The security rules grant write at
    // participants/$runId/$studentId but not at participants/$runId, and Realtime Database
    // rules never cascade upwards — so deleting the parent outright is refused.
    try{
      const val=(await this._part(runId).once("value")).val()||{};
      for(const sid of Object.keys(val)){ await this._part(runId).child(sid).remove(); }
    }catch(e){ console.warn("participant cleanup:", e); }
    try{ await this._part(runId).remove(); }catch(e){ /* already empty; parent node disappears on its own */ }
    // Drop the code index entry too, but only if it still points at this run.
    if(code){
      const idxRef = db.ref("codeIndex/"+code);
      if(((await idxRef.once("value")).val())===runId) await idxRef.remove();
    }
    return {ok:true};
  },

  // ---- real-time subscriptions ----
  // Each returns an unsubscribe function.
  subscribeMeta(runId, cb){
    if(this.live){
      let ref=null, h=null, cancelled=false;
      // Wait for sign-in before attaching, or the rules would reject the listener.
      this._ready().then(()=>{
        if(cancelled) return;
        ref=this._sess(runId).child("meta");
        h=ref.on("value", snap=>{ const m=snap.val(); cb(m?{meta:m}:null); });
      });
      return ()=>{ cancelled=true; if(ref&&h) ref.off("value", h); };
    }
    return ()=>{};   // no database: nothing to listen to, but callers still get an unsubscribe
  },
  /* The live class list.

     `onError` is not optional politeness. A refused read here — an expired token, a teacher
     record that is not active, a rules change — makes the callback never fire, and a dashboard
     that has never been told anything looks exactly like a room nobody has joined. The teacher
     then starts a test believing the class is not there, or ends one believing nobody sat it.
     Whoever listens has to be able to tell those two apart. */
  subscribeParticipants(runId, cb, onError){
    if(this.live){
      let ref=null, h=null, cancelled=false;
      this._ready().then(()=>{
        if(cancelled) return;
        ref=this._part(runId);
        h=ref.on("value",
          snap=>{ const v=snap.val()||{}; cb({ participants:Object.keys(v).map(id=>Object.assign({studentId:id},v[id])) }); },
          err=>{ if(!cancelled && onError) onError(err); });
      });
      return ()=>{ cancelled=true; if(ref&&h) ref.off("value", h); };
    }
    return ()=>{};   // no database: nothing to listen to, but callers still get an unsubscribe
  },



};


/* ---------- Mode badge ---------- */
function refreshModeBadge(){
  const b = document.getElementById("mode-badge");
  if(!b) return;
  if(Backend.live){ b.textContent=t("backend.live_synced", "LIVE — synced"); b.className="badge live"; }
  else { b.textContent=t("backend.no_database", "NO DATABASE"); b.className="badge demo"; }
}


/* The app has no offline mode: without the database nothing can be saved, no session can be
   created and no student can join. Rather than let that fail quietly mid-lesson, everything
   is covered by a screen that says which part is broken. First cause reported wins — later
   failures are consequences of it. */
let BACKEND_FAIL = null;

function backendUnavailable(reason){
  if(BACKEND_FAIL) return;
  BACKEND_FAIL = reason;
  console.error("Database unavailable:", reason);
  const show = () => {
    const el = document.getElementById("backend-down");
    if(!el) return;
    const d = document.getElementById("backend-down-detail");
    if(d) d.textContent = reason;
    el.hidden = false;
  };
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", show);
  else show();
  try{ refreshModeBadge(); }catch(e){}
}
