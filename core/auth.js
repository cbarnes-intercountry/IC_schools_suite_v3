/* ============================================================================
   Teacher Hub — core/auth.js
   Loaded as a plain script in the order set by index.html; every file shares one
   global scope, so nothing is imported or exported.
   ============================================================================ */

/* Who is signed in, and what they are allowed to do.

   The same Firebase accounts as the app, read from the same teachers/$uid records, so a
   colleague who can run a lesson can read the hub with no second password — which is the
   reason the hub was built rather than put on SharePoint.

   What this file does NOT carry, unlike the app's copy: creating accounts, deactivating them,
   sending resets. Account management has one home, and it is the app's Admin area. Two screens
   that both edit teachers/$uid is two screens to keep in step. */

let TEACHER_USER = null;

function teacherAuthAvailable(){
  return Backend.live && typeof firebase!=="undefined" && !!firebase.auth;
}

function isOwner(){ return !!(TEACHER_USER && TEACHER_USER.role==="owner"); }

function requireOwner(action){
  if(isOwner()) return true;
  alert(t("auth.only_owner", "Only an owner can {action}.\n\nAsk whoever manages the hub to do it, or to make you an owner.",
    { action:action }));
  return false;
}

/* Hides owner-only controls from a plain user. Presentation only — every write is also refused
   by requireOwner() and, in a live database, by the security rules. */
function applyRoleVisibility(){
  const owner=isOwner();
  document.querySelectorAll("[data-owner-only]").forEach(el=>{
    el.style.display = owner ? "" : "none";
  });
}

/* An account that exists in Firebase Auth but has no teachers/$uid record has not been given
   access. The hub refuses it rather than bootstrapping an owner the way the app does on a fresh
   database: the app is where accounts are made, and a hub that could mint its own first owner
   would be a second front door to the same records. */
async function hubAcceptUser(user){
  let rec=null;
  try{ rec = await Backend.getTeacher(user.uid); }
  catch(e){ console.warn("teacher lookup failed", e); }

  if(!rec) return hubRejectUser(t("auth.no_access_yet", "This account hasn’t been given access yet. An owner needs to add it in the app, under Admin → Teacher Accounts."));
  if(rec.active===false) return hubRejectUser(t("auth.account_deactivated", "This account has been deactivated."));

  const label = rec.name || user.displayName || (user.email||"").split("@")[0] || t("auth.default_teacher_name", "Teacher");
  TEACHER_USER = { name: label, email: user.email || "", uid: user.uid,
                   role: rec.role==="owner" ? "owner" : "user" };

  const badge=document.getElementById("teacher-identity");
  if(badge){
    badge.textContent = TEACHER_USER.name + (isOwner() ? t("auth.owner_suffix", " · Owner") : "");
    badge.style.display="inline-block";
  }
  applyRoleVisibility();
  applyTeacherUiLang(user);
  return true;
}

function hubRejectUser(message){
  const st=document.getElementById("signin-status");
  if(st) st.textContent = "✗ " + message;
  TEACHER_USER=null;
  try{ firebase.auth().signOut(); }catch(e){}
  return false;
}

async function hubSignIn(){
  const status=document.getElementById("signin-status");
  const email=(document.getElementById("t-email").value||"").trim();
  const pass=document.getElementById("t-pass").value||"";
  if(!teacherAuthAvailable()){ status.textContent=t("auth.not_available", "Sign-in isn’t available — the hub can’t reach the database."); return; }
  if(!email || !pass){ status.textContent=t("auth.enter_email_password", "Enter your email and password."); return; }
  status.textContent=t("auth.signing", "Signing in…");
  try{
    const res = await firebase.auth().signInWithEmailAndPassword(email, pass);
    if(await hubAcceptUser(res.user)){
      document.getElementById("t-pass").value="";
      status.textContent="";
      await hubHome();
    }
  }catch(e){
    const code=(e&&e.code)||"";
    if(code==="auth/invalid-credential" || code==="auth/wrong-password" || code==="auth/user-not-found"){
      status.textContent=t("auth.email_password_recognised", "✗ Email or password not recognised.");
    } else if(code==="auth/too-many-requests"){
      status.textContent=t("auth.too_many_attempts", "✗ Too many attempts. Wait a few minutes, or reset your password.");
    } else if(code==="auth/user-disabled"){
      status.textContent=t("auth.account_disabled", "✗ This account has been disabled.");
    } else {
      status.textContent=t("auth.sign_in_failed", "✗ Sign-in failed: {why}", {why:(e&&e.message)||e});
    }
  }
}

async function hubResetPassword(){
  const status=document.getElementById("signin-status");
  const email=(document.getElementById("t-email").value||"").trim();
  if(!teacherAuthAvailable()){ status.textContent=t("auth.not_available", "Sign-in isn’t available — the hub can’t reach the database."); return; }
  if(!email){ status.textContent=t("auth.type_email_first", "Type your email address first, then click reset."); return; }
  try{
    await firebase.auth().sendPasswordResetEmail(email);
    status.textContent=t("auth.reset_email_sent", "Reset email sent to {email} — check your inbox (and spam).", {email:email});
  }catch(e){
    status.textContent=t("auth.reset_email_failed", "✗ Couldn’t send reset email: {why}", {why:(e&&e.message)||e});
  }
}

async function hubSignOut(){
  TEACHER_USER=null;
  const badge=document.getElementById("teacher-identity"); if(badge) badge.style.display="none";
  if(Backend.live && typeof firebase!=="undefined" && firebase.auth){
    try{ await firebase.auth().signOut(); }catch(e){ console.warn(e); }
  }
  showScreen("screen-signin");
}

/* On load: recognise a teacher already signed in on this device, so a colleague who signed in
   to the app on the same browser walks straight into the hub. */
async function hubAuthBoot(){
  const status=document.getElementById("signin-status");
  if(!teacherAuthAvailable()){
    if(status) status.textContent=t("auth.cant_reach_database", "Can’t reach the database — signing in isn’t possible.");
    return;
  }
  const u = firebase.auth().currentUser;
  if(u && !u.isAnonymous && await hubAcceptUser(u)){ await hubHome(); return; }
  showScreen("screen-signin");
}
