/* ============================================================================
   Classroom Exam App — admin/accounts.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Schools, teacher accounts and app settings. */

async function renderTeacherPanel(){
  const box=document.getElementById("teacher-list");
  if(!box) return;
  if(!isOwner()){ box.innerHTML=""; return; }
  box.innerHTML='<p class="sub">'+t("teacher_history.loading", 'Loading…')+'</p>';
  try{ TEACHER_LIST=(await Backend.listTeachers()).teachers||[]; }
  catch(e){ box.innerHTML='<p class="sub">Couldn’t load accounts: '+escapeHtml(e.message)+'</p>'; return; }
  TEACHER_LIST.sort((a,b)=>String(a.name||a.email||"").localeCompare(String(b.name||b.email||"")));
  if(!TEACHER_LIST.length){ box.innerHTML='<p class="sub">'+t("accounts.no_accounts_yet", 'No accounts yet.')+'</p>'; return; }
  const me=(TEACHER_USER&&TEACHER_USER.uid)||"";
  const owners=TEACHER_LIST.filter(t=>t.role==="owner" && t.active!==false).length;
  box.innerHTML="";
  TEACHER_LIST.forEach(t=>{
    const isMe=t.uid===me, off=t.active===false;
    const row=document.createElement("div");
    row.className="row";
    row.style.cssText="align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--line,#e5e5e5);"+(off?"opacity:.5;":"");
    const who=document.createElement("div"); who.style.flex="1";
    who.innerHTML="<b>"+escapeHtml(t.name||"(no name)")+"</b>"+(isMe?" <span class='sub'>"+t("accounts.you", "(you)")+"</span>":"")+
      "<br><small class='sub'>"+escapeHtml(t.email||"")+"</small>";
    const tag=document.createElement("span"); tag.className="qtag";
    tag.textContent = off ? "DEACTIVATED" : (t.role==="owner" ? "OWNER" : "TEACHER");
    if(t.role==="owner" && !off){ tag.style.background="var(--success-soft)"; tag.style.borderColor="var(--success)"; tag.style.color="var(--success)"; }
    row.appendChild(who); row.appendChild(tag);

    const mk=(label,fn,danger)=>{ const b=document.createElement("button");
      b.className=danger?"btn-danger":"btn-outline"; b.style.cssText="flex:0 0 auto;padding:6px 10px;font-size:.85rem;";
      b.textContent=label; b.onclick=fn; row.appendChild(b); return b; };

    if(!off){
      if(t.role==="owner"){
        // Never let the last active owner step down — nobody could then manage anything.
        const b=mk("Make teacher", ()=>setTeacherRole(t, "user"));
        if(owners<=1){ b.disabled=true; b.style.opacity=".4"; b.title="The last owner can't be demoted."; }
      } else {
        mk("Make owner", ()=>setTeacherRole(t, "owner"));
      }
      mk("Reset password", ()=>sendTeacherReset(t));
      if(!isMe){
        const b=mk("Deactivate", ()=>setTeacherActive(t, false), true);
        if(t.role==="owner" && owners<=1){ b.disabled=true; b.style.opacity=".4"; }
      }
    } else {
      mk("Reactivate", ()=>setTeacherActive(t, true));
    }
    box.appendChild(row);
  });
}


/* The Unsplash access key. It is a public-ish credential — any browser using the API sends it —
   but it still does not belong in a file students can read, so it lives in config/ with the
   GitHub token, where the rules admit only signed-in teachers. */
async function loadUnsplashKeyUI(){
  const box=document.getElementById("unsplash-key");
  const st=document.getElementById("unsplash-status");
  if(!box || !isOwner()) return;
  try{
    const r=await Backend.getConfig("unsplashKey");
    const key=(r&&r.value)||"";
    box.value=key;
    st.textContent = key ? "\u2713 A key is set — image search is using Unsplash." : "No key yet — image search is falling back to the Creative Commons archives.";
  }catch(e){ st.textContent="Couldn\u2019t read the current key: "+e.message; }
}

async function saveUnsplashKey(){
  if(!requireOwner("change the image search key")) return;
  const box=document.getElementById("unsplash-key");
  const st=document.getElementById("unsplash-status");
  const key=(box.value||"").trim();
  st.textContent=t("accounts.saving", "Saving\u2026");
  try{
    await Backend.setConfig("unsplashKey", key);
    _unsplashKey=key;                     // drop the cached value so the next search uses it
    st.textContent = key ? "\u2713 Saved. Try \u201cFind a free image\u201d on any question." : "\u2713 Cleared — image search will use the Creative Commons archives.";
  }catch(e){ st.textContent="\u2717 Couldn\u2019t save: "+e.message; }
}


async function addTeacherUI(){
  if(!requireOwner("add a teacher account")) return;
  const st=document.getElementById("teacher-add-status");
  const name=(document.getElementById("teacher-add-name").value||"").trim();
  const email=(document.getElementById("teacher-add-email").value||"").trim();
  const pass=(document.getElementById("teacher-add-pass").value||"");
  const role=document.getElementById("teacher-add-role").value||"user";
  if(!name || !email || !pass){ st.textContent=t("accounts.fill_name_email_starting_password", "Fill in the name, email and a starting password."); return; }
  if(pass.length<6){ st.textContent=t("accounts.firebase_needs_password_least_6_characters", "Firebase needs a password of at least 6 characters."); return; }
  const auth=secondaryAuth();
  if(!auth){ st.textContent=t("accounts.account_creation_needs_firebase_available_demo", "Account creation needs Firebase — not available in demo mode."); return; }
  st.textContent=t("accounts.creating", "Creating…");
  try{
    const res=await auth.createUserWithEmailAndPassword(email, pass);
    try{ await res.user.updateProfile({ displayName:name }); }catch(e){}
    await Backend.setTeacher(res.user.uid, {
      email, name, role: role==="owner"?"owner":"user", active:true,
      addedAt:Date.now(), addedBy:(TEACHER_USER&&TEACHER_USER.email)||"" });
    await auth.signOut();   // leave the side connection empty; the owner's session is untouched
    document.getElementById("teacher-add-name").value="";
    document.getElementById("teacher-add-email").value="";
    document.getElementById("teacher-add-pass").value="";
    st.textContent="✓ "+name+" added. Tell them their password — they should change it on first sign-in.";
    renderTeacherPanel();
  }catch(e){
    const code=(e&&e.code)||"";
    st.textContent = code==="auth/email-already-in-use"
      ? "✗ That email already has an account. If they should have access, it may just need reactivating below."
      : code==="auth/invalid-email" ? "✗ That email address isn't valid."
      : code==="auth/weak-password" ? "✗ Password too weak — use at least 6 characters."
      : "✗ Couldn't create the account: "+((e&&e.message)||e);
  }
}


async function setTeacherRole(t, role){
  if(!requireOwner("change a teacher's role")) return;
  if(!confirm((role==="owner"?"Make ":"Remove owner rights from ")+(t.name||t.email)+
    (role==="owner"?" an owner? They'll be able to delete results and manage accounts.":"? They'll keep normal teacher access."))) return;
  try{ await Backend.setTeacher(t.uid, { role }); renderTeacherPanel(); }
  catch(e){ alert(t("accounts.couldn_t_change_role", "Couldn't change the role: ")+e.message); }
}


async function setTeacherActive(t, active){
  if(!requireOwner("deactivate or reactivate an account")) return;
  if(!active && !confirm(t("accounts.deactivate", "Deactivate ")+(t.name||t.email)+"?\n\nThey'll be signed out and refused access at the next attempt. Their quizzes and past results are kept.\n\nThe Firebase login itself still exists — delete it in the Firebase console to free the email address.")) return;
  try{ await Backend.setTeacher(t.uid, { active:!!active }); renderTeacherPanel(); }
  catch(e){ alert(t("accounts.couldn_t_update_account", "Couldn't update the account: ")+e.message); }
}

function openAdmin(){
  showScreen("screen-admin");
  applyRoleVisibility();  // owner-only cards and buttons, before anything draws into them
  renderQBank();
  loadQuizList();       // fills the admin's quiz-library-select
  renderSchools();      // fills the schools list + the quiz school checkboxes
  renderTeacherPanel(); // no-op for a plain teacher
  loadUnsplashKeyUI();  // owner-only too
  document.getElementById("archive-status").textContent = "";
}

function clearAdminBank(){
  if(TEACHER.questions.length && !confirm(t("accounts.clear_current_question_bank_saved_quizzes", "Clear the current question bank? (Saved quizzes and polls are not affected.)"))) return;
  TEACHER.questions = [];
  renderQBank();
}


/* ---------- Schools (admin) ---------- */
async function renderSchools(){
  let schools=[];
  try{ const r=await Backend.listSchools(); schools=r.schools||[]; }catch(e){ console.warn(e); }
  // List with remove buttons
  const list=document.getElementById("school-list"); list.innerHTML="";
  if(schools.length===0){ list.innerHTML='<p class="sub">'+t("accounts.no_schools_yet_add_one_above", 'No schools yet. Add one above.')+'</p>'; }
  schools.forEach(name=>{
    const div=document.createElement("div"); div.className="student-row";
    div.innerHTML='<span>'+name+'</span>';
    if(isOwner()){
      const btn=document.createElement("button"); btn.className="btn-outline btn-mini"; btn.style.flex="0 0 auto"; btn.textContent=t("accounts.remove", "Remove");
      btn.onclick=()=>removeSchoolUI(name);
      div.appendChild(btn);
    }
    list.appendChild(div);
  });
  // Populate the "assign to school(s)" checkbox list (preserve current ticks if still valid)
  const already = getCheckedSchools();
  renderSchoolChecks(schools, already);
}

// Render the multi-select school checkboxes; keep any names in `checked` ticked.
function renderSchoolChecks(schools, checked){
  const box=document.getElementById("quiz-school-checks"); if(!box) return;
  const set=new Set(checked||[]);
  box.innerHTML="";
  if(!schools || schools.length===0){ box.innerHTML='<p class="sub" style="margin:0;">'+t("accounts.no_schools_yet_add_one_above_2", 'No schools yet — add one above first.')+'</p>'; return; }
  schools.forEach(n=>{
    const row=document.createElement("label"); row.style.cssText="display:flex;align-items:center;gap:8px;padding:4px 0;font-weight:500;";
    const cb=document.createElement("input"); cb.type="checkbox"; cb.value=n; cb.style.cssText="width:18px;height:18px;flex:0 0 auto;"; if(set.has(n)) cb.checked=true;
    const span=document.createElement("span"); span.textContent=n;
    row.appendChild(cb); row.appendChild(span); box.appendChild(row);
  });
}

function getCheckedSchools(){
  return [...document.querySelectorAll("#quiz-school-checks input[type=checkbox]:checked")].map(cb=>cb.value);
}

function setCheckedSchools(names){
  const set=new Set(names||[]);
  document.querySelectorAll("#quiz-school-checks input[type=checkbox]").forEach(cb=>{ cb.checked=set.has(cb.value); });
}

async function addSchoolUI(){
  if(!requireOwner("add a school")) return;
  const inp=document.getElementById("school-add-name"); const name=inp.value.trim();
  if(!name){ alert(t("accounts.type_school_name_first", "Type a school name first.")); return; }
  try{ await Backend.addSchool(name); inp.value=""; renderSchools(); }catch(e){ alert(t("accounts.add_failed", "Add failed: ")+e.message); }
}

async function removeSchoolUI(name){
  if(!requireOwner("remove a school")) return;
  if(!confirm(t("poll.remove", 'Remove "')+name+'"? Quizzes already assigned to it keep their label until re-saved.')) return;
  try{ await Backend.removeSchool(name); renderSchools(); }catch(e){ alert(t("accounts.remove_failed", "Remove failed: ")+e.message); }
}
