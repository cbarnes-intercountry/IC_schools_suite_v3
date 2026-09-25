/* ============================================================================
   Classroom Exam App — core/auth.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Who is signed in, and what they are allowed to do. */

/* =========================================================================
   CLASSROOM EXAM APP — Firebase Realtime Database backend.
   There is no offline or local mode: without the database the app blocks
   rather than pretending to work. See backendUnavailable().
   ========================================================================= */
/* No separate admin password: the Admin area is reachable from the teacher screen,
   which is already behind Firebase teacher sign-in. Every signed-in teacher is an admin. */

/* =========================================================================
   TEACHER SIGN-IN — Firebase Authentication (email + password)
   Each teacher has their own account, created by the app owner in the
   Firebase console: Authentication -> Users -> Add user.
   This needs no Microsoft/Entra involvement and works on the free plan.
   Signing in gives the browser a non-anonymous identity, which is what the
   database rules use to grant teacher-level access. Students stay anonymous.
   ========================================================================= */
const TEACHER_LOGIN = {
  // Optional guard: only accept these email domains, e.g. ["intercountry.com"]. Empty = any account you created.
  allowedDomains: []
};


let TEACHER_USER = null;
   // {name, email} once signed in
function teacherAuthAvailable(){
  return Backend.live && typeof firebase!=="undefined" && !!firebase.auth;
}

function teacherCheckAllowed(email){
  const e=(email||"").toLowerCase();
  if(TEACHER_LOGIN.allowedDomains && TEACHER_LOGIN.allowedDomains.length){
    const ok = TEACHER_LOGIN.allowedDomains.some(d=>e.endsWith("@"+String(d).toLowerCase()));
    if(!ok) return t("auth.not_permitted_to_run_tests", "This account isn't permitted to run tests ({reason}).", {reason:e});
  }
  return null;
}

/* ---- Roles ----
   Two tiers. An OWNER can delete things and manage accounts; a USER can do everything else.
   The tier lives in the database at teachers/$uid, not in the browser, so the security rules
   enforce it for real — hiding a button only stops an accident, not a determined person.

   Bootstrap: on a database with no teacher records at all, the first account to sign in
   becomes the owner and writes its own record. That removes the one manual console step that
   would otherwise be needed to get started. It is safe here only because accounts cannot be
   self-registered — an account has to be created by an existing owner (or, the first time, in
   the Firebase console) before it can sign in at all. */
function isOwner(){ return !!(TEACHER_USER && TEACHER_USER.role==="owner"); }

function requireOwner(action){
  if(isOwner()) return true;
  alert(t("auth.only_owner", "Only an owner can ")+action+".\n\nAsk whoever manages the app to do it, or to make you an owner.");
  return false;
}


async function teacherAcceptUser(user){
  const problem = teacherCheckAllowed(user.email);
  if(problem) return teacherRejectUser(problem);

  const label = user.displayName || (user.email||"").split("@")[0] || t("auth.default_teacher_name", "Teacher");
  let rec=null;
  try{ rec = await Backend.getTeacher(user.uid); }
  catch(e){ console.warn("teacher lookup failed", e); }

  if(!rec){
    // No record. Either this is the very first sign-in on a fresh database (become owner), or
    // the account exists in Firebase Auth but nobody has granted it access yet (refuse).
    let count=0;
    try{ count=(await Backend.countTeachers()).count||0; }catch(e){ count=1; }  // on error, assume not first
    if(count===0){
      rec={ email:user.email||"", name:label, role:"owner", active:true, addedAt:Date.now(), addedBy:"bootstrap" };
      try{ await Backend.setTeacher(user.uid, rec); }
      catch(e){ return teacherRejectUser(t("auth.owner_setup_failed", "Couldn't set up the first owner account: {why}", {why:e.message})); }
    } else {
      return teacherRejectUser(t("auth.no_access_yet", "This account hasn't been given access yet. An owner needs to add it in Admin \u2192 Teacher Accounts."));
    }
  }
  if(rec.active===false) return teacherRejectUser(t("auth.account_deactivated", "This account has been deactivated."));

  TEACHER_USER = { name: rec.name || label, email: user.email || "", uid: user.uid,
                   role: rec.role==="owner" ? "owner" : "user" };
  const badge=document.getElementById("teacher-identity");
  if(badge){
    badge.textContent = TEACHER_USER.name + (isOwner() ? t("auth.owner_suffix", " \u00b7 Owner") : "");
    badge.style.display="inline-block";
  }
  applyRoleVisibility();
  applyTeacherUiLang(rec);   // their interface language follows them between devices
  return true;
}


function teacherRejectUser(message){
  const st=document.getElementById("signin-status");
  if(st) st.textContent = "✗ " + message;
  TEACHER_USER=null;
  try{ firebase.auth().signOut().then(()=>{ Backend._authReady = firebase.auth().signInAnonymously(); }); }catch(e){}
  return false;
}


/* Hides owner-only controls from a plain user. This is presentation only — every one of these
   actions is also refused by requireOwner() and, in a live database, by the security rules. */
function applyRoleVisibility(){
  const owner=isOwner();
  document.querySelectorAll("[data-owner-only]").forEach(el=>{
    el.style.display = owner ? "" : "none";
  });
}


/* ============ TEACHER ACCOUNTS (owner only) ============
   Creating a Firebase account normally signs you in as the new user, which would throw the
   owner out of their own session halfway through adding someone. The way round it is a second,
   invisible connection to the same Firebase project: the new account is created on that one and
   immediately signed out of it, leaving the owner's session on the main connection untouched.

   What this cannot do is DELETE a Firebase login — that needs admin credentials no browser
   should ever hold. "Remove" therefore deactivates: the account survives in Firebase Auth but
   its teachers/$uid record is switched off, and every rule and screen refuses it. To free the
   email address for good, delete the user in the Firebase console. */
let _secondaryApp=null;

function secondaryAuth(){
  if(typeof firebase==="undefined" || !firebase.auth) return null;
  if(!_secondaryApp){
    try{ _secondaryApp = firebase.initializeApp(firebaseConfig, "acctmaker"); }
    catch(e){ try{ _secondaryApp = firebase.app("acctmaker"); }catch(e2){ return null; } }
  }
  return _secondaryApp.auth();
}


let TEACHER_LIST=[];


async function sendTeacherReset(rec){
  if(!requireOwner(t("auth.action_send_reset", "send a password reset"))) return;
  if(!rec.email){ alert(t("auth.no_email_address_account", "No email address on this account.")); return; }
  try{ await firebase.auth().sendPasswordResetEmail(rec.email); alert(t("auth.password_reset_email_sent", "Password reset email sent to ")+rec.email+"."); }
  catch(e){ alert(t("auth.couldn_t_send_reset_email", "Couldn't send the reset email: ")+e.message); }
}

// "I'm the Teacher" — if this browser is already signed in, go straight to the session screen
// instead of asking for the password again (e.g. after returning Home mid-lesson).
async function goTeacher(){
  if(TEACHER_USER){ showScreen("screen-teacher-login"); return; }
  try{
    const u = firebase.auth().currentUser;
    if(u && !u.isAnonymous && await teacherAcceptUser(u)){ showScreen("screen-teacher-login"); return; }
  }catch(e){ /* not signed in / Firebase unavailable — fall through to sign-in */ }
  showScreen("screen-teacher-password");
}

/* "Home" for a signed-in teacher = the Teacher — Session screen, NOT the role screen.
   Logging out is a separate, explicit action (teacherSignOut). If somehow nobody is
   signed in, fall back to the role screen so the app can't strand the user. */
async function teacherHome(){
  if(typeof stopDashboardPolling === "function"){ try{ stopDashboardPolling(); }catch(e){} }
  if(TEACHER_USER){ showScreen("screen-teacher-login"); return; }
  try{
    const u = firebase.auth().currentUser;
    if(u && !u.isAnonymous && await teacherAcceptUser(u)){ showScreen("screen-teacher-login"); return; }
  }catch(e){ /* not signed in / Firebase unavailable */ }
  showScreen("screen-role");
}

async function teacherSignIn(){
  const status=document.getElementById("signin-status");
  const email=(document.getElementById("t-email").value||"").trim();
  const pass=document.getElementById("t-pass").value||"";
  if(!teacherAuthAvailable()){ status.textContent=t("auth.sign_isn_t_available_firebase_configured", "Sign-in isn't available (Firebase not configured) — use the password below."); return; }
  if(!email || !pass){ status.textContent=t("auth.enter_email_password", "Enter your email and password."); return; }
  status.textContent=t("auth.signing", "Signing in…");
  try{
    const res = await firebase.auth().signInWithEmailAndPassword(email, pass);
    if(await teacherAcceptUser(res.user)){
      document.getElementById("t-pass").value="";
      status.textContent="";
      showScreen("screen-teacher-login");
    }
  }catch(e){
    const code=(e&&e.code)||"";
    if(code==="auth/invalid-credential" || code==="auth/wrong-password" || code==="auth/user-not-found"){
      status.textContent=t("auth.email_password_recognised", "✗ Email or password not recognised.");
    } else if(code==="auth/too-many-requests"){
      status.textContent=t("auth.too_many_attempts_wait_few_minutes", "✗ Too many attempts. Wait a few minutes, or reset your password.");
    } else if(code==="auth/user-disabled"){
      status.textContent=t("auth.account_been_disabled", "✗ This account has been disabled.");
    } else if(code==="auth/operation-not-allowed"){
      status.textContent=t("auth.email_password_sign_isn_t_enabled", "✗ Email/password sign-in isn't enabled in Firebase (Authentication → Sign-in method).");
    } else {
      status.textContent=t("auth.sign_in_failed", "\u2717 Sign-in failed: {why}", {why:(e&&e.message)||e});
    }
  }
}

// Teachers can reset their own password by email, so the app owner isn't a bottleneck.
async function teacherResetPassword(){
  const status=document.getElementById("signin-status");
  const email=(document.getElementById("t-email").value||"").trim();
  if(!teacherAuthAvailable()){ status.textContent=t("auth.available_offline", "Not available offline."); return; }
  if(!email){ status.textContent=t("auth.type_email_address_first_then_click", "Type your email address first, then click reset."); return; }
  try{
    await firebase.auth().sendPasswordResetEmail(email);
    status.textContent=t("auth.reset_email_sent", "Reset email sent to {email} \u2014 check your inbox (and spam).", {email:email});
  }catch(e){
    status.textContent=t("auth.reset_email_failed", "\u2717 Couldn't send reset email: {why}", {why:(e&&e.message)||e});
  }
}

async function teacherSignOut(){
  TEACHER_USER=null;
  const badge=document.getElementById("teacher-identity"); if(badge) badge.style.display="none";
  // Drop teacher-level database access straight away, back to an anonymous session.
  if(Backend.live && typeof firebase!=="undefined" && firebase.auth){
    try{ await firebase.auth().signOut(); Backend._authReady = firebase.auth().signInAnonymously(); }
    catch(e){ console.warn(e); }
  }
  showScreen("screen-role");
}

// On load: recognise a teacher already signed in on this device, else show the fallback if offline.
async function teacherAuthBoot(){
  const ready=document.getElementById("signin-ready");
  const status=document.getElementById("signin-status");
  if(!teacherAuthAvailable()){
    // The blocking screen is already up; this just stops the form pretending it can help.
    if(ready) ready.style.display="none";
    if(status) status.textContent=t("auth.t_reach_database_signing_isn_t", "Can't reach the database — signing in isn't possible.");
    return;
  }
  const u = firebase.auth().currentUser;
  if(u && !u.isAnonymous){
    await teacherAcceptUser(u);
    if(status) status.textContent=t("auth.signed_in_as", "Signed in as {email}.", {email:u.email||""});
  }
}

// Step 2 stays hidden until a quiz is actually loaded; changing school or quiz re-arms step 1.
function teacherResetStep2(){
  const st=document.getElementById("teacher-quiz-status");
  st.style.display="none"; st.textContent="";
  document.getElementById("setup-step2").style.display="none";
  document.getElementById("teacher-select-quiz-btn").style.display="block";
}
