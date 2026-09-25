/* ============================================================================
   Classroom Exam App — modules/roleplay.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Role play: different private briefs to the members of a small group.

   This is the module the others are special cases of — Twenty Questions, Alibi and a
   hidden-role negotiation are all "give each person in a group something different to
   know". It is also the first activity registered through core/registry.js, and the first
   with no score at all, which is the point: the contract must not assume one.

   What it replaces is a teacher at a photocopier at 8am, cutting up role cards. */

let RP = { sessionCode:null, runId:null, scenarios:[], name:"", school:"", sets:[],
           participants:[], unsub:null, projecting:false };

let RSTU = { runId:null, meta:null, scenarios:[], unsub:null, wakeLock:null, hidden:false };

/* ---------- allocation (pure: no DOM, no database) ---------- */

/* A scenario's roles are core unless marked optional. Core roles set the group size; the
   optional one exists so that a spare student joins a group as a third voice rather than
   standing about. 23 students and a two-role scenario is eleven pairs and one trio. */
function rpCoreRoles(sc){ return ((sc&&sc.roles)||[]).filter(r=>!r.optional); }
function rpExtraRole(sc){ return ((sc&&sc.roles)||[]).find(r=>r.optional) || null; }

/* The allocation carries each student's name with it. A student's phone can read the run's
   meta but not the other participants, so without the name here nobody could be told who
   they are looking for in the room. */
function rpAllocate(participants, scenario){
  const core = Math.max(2, rpCoreRoles(scenario).length);
  const extra = !!rpExtraRole(scenario);
  const named = {};
  (participants||[]).forEach(p=>{ named[p.studentId]=displayName(p.surname,p.firstName); });
  const ids = shuffle((participants||[]).map(p=>p.studentId));
  const groups = {}, observers = {};
  const full = Math.floor(ids.length / core);
  let i = 0;
  for(let g=1; g<=full; g++) for(let r=0; r<core; r++){ const id=ids[i++]; groups[id]={ g:g, r:r, n:named[id]||"" }; }
  // Spares: into a group as the optional role, one group at a time, while any remain.
  let g = 1;
  while(i < ids.length && extra && g <= full){ const id=ids[i++]; groups[id]={ g:g, r:core, n:named[id]||"" }; g++; }
  // Anyone still over gets a noticing task rather than a part. Never a marking task: no
  // student assesses another in this app.
  while(i < ids.length){ const id=ids[i++]; observers[id]=named[id]||"?"; }
  return { groups: groups, observers: observers };
}

/* Same partners, different parts. In a trio the parts cycle rather than swap. */
function rpRotateRoles(groups){
  const size = {};
  Object.keys(groups||{}).forEach(id=>{ const g=groups[id].g; size[g]=Math.max(size[g]||0, groups[id].r+1); });
  const out = {};
  Object.keys(groups||{}).forEach(id=>{ const c=groups[id]; out[id]={ g:c.g, r:(c.r+1)%(size[c.g]||1), n:c.n||"" }; });
  return out;
}

/* Who is in a group, in role order — used on both the teacher's screen and the student's. */
function rpGroupMembers(groups, g){
  return Object.keys(groups||{})
    .filter(id=>groups[id].g===g)
    .sort((a,b)=>groups[a].r-groups[b].r)
    .map(id=>({ studentId:id, r:groups[id].r, name:groups[id].n||"?" }));
}

function rpGroupNumbers(groups){
  const seen = {};
  Object.keys(groups||{}).forEach(id=>{ seen[groups[id].g]=true; });
  return Object.keys(seen).map(Number).sort((a,b)=>a-b);
}

function rpRoleLabel(scenario, r){
  const roles=(scenario&&scenario.roles)||[];
  return (roles[r] && roles[r].label) || ("Role "+(r+1));
}

function rpScenarioAt(list, i){ return (list||[])[i] || null; }

/* ---------- teacher: setting one up ---------- */

async function rpCreateSession(){
  if(!(await confirmNoOpenRun("role play"))) return;
  const code = genSessionCode();
  RP = { sessionCode:code, runId:null, scenarios:[], name:"", school:"", sets:[],
         participants:[], unsub:null, projecting:false };
  const c=document.getElementById("rp-setup-code");
  c.textContent="Code · "+code; c.style.display="inline-block";
  rpResetStep2();
  await loadRoleplaySetList();
  showScreen("screen-rp-setup");
}

function rpResetStep2(){
  RP.scenarios=[]; RP.name="";
  document.getElementById("rp-set-select").value="";
  document.getElementById("rp-summary").textContent="";
  document.getElementById("rp-start-btn").disabled=true;
}

async function loadRoleplaySetList(){
  try{
    const [qs, ss] = await Promise.all([Backend.listQuizzes(), Backend.listSchools()]);
    RP.sets = (qs.quizzes||[]).filter(q=>q.kind==="roleplay");
    const sel=document.getElementById("rp-school-select");
    sel.innerHTML = '<option value="">'+t("poll.select_school", '— select a school —')+'</option>';
    (ss.schools||[]).forEach(n=>{ const o=document.createElement("option"); o.value=n; o.textContent=n; sel.appendChild(o); });
    document.getElementById("rp-set-select").innerHTML = '<option value="">'+t("poll.select_school_first", '— select a school first —')+'</option>';
  }catch(e){ console.warn(e); }
}

function filterRoleplaySets(){
  RP.school=document.getElementById("rp-school-select").value;
  const sel=document.getElementById("rp-set-select");
  const mine=RP.sets.filter(s=>(s.schools||[]).indexOf(RP.school)>=0);
  sel.innerHTML = '<option value="">'+(mine.length?"— select a set —":"— no role plays for this school —")+'</option>';
  mine.forEach(s=>{ const o=document.createElement("option"); o.value=s.key;
    o.textContent=s.name+" ("+s.count+" scenario"+(s.count===1?"":"s")+")"; sel.appendChild(o); });
  rpResetStep2();
}

async function rpSetPicked(){
  const key=document.getElementById("rp-set-select").value;
  if(!key){ rpResetStep2(); return; }
  let rec=null;
  try{ rec=await Backend.getQuiz(key); }catch(e){ alert(t("rp.couldn_t_load_set", "Couldn't load that set: ")+e.message); return; }
  if(!rec){ alert(t("rp.set_gone", "That set has gone.")); return; }
  RP.scenarios=rec.questions||[]; RP.name=rec.name||"Role play";
  const first=rpScenarioAt(RP.scenarios,0);
  const core=rpCoreRoles(first).length, extra=rpExtraRole(first);
  document.getElementById("rp-summary").textContent =
    RP.scenarios.length+" scenario"+(RP.scenarios.length===1?"":"s")+" · groups of "+core+
    (extra?" (a spare student joins one group as "+extra.label+")":" (a spare student gets a listening task)");
  document.getElementById("rp-start-btn").disabled = RP.scenarios.length===0;
}

async function rpStartSession(){
  if(!RP.scenarios.length){ alert(t("rp.choose_set_scenarios_first", "Choose a set of scenarios first.")); return; }
  const meta = {
    kind:"roleplay", status:"waiting", scenarioIndex:0, round:0,
    title:RP.name||"Role play", school:RP.school||"",
    teacherName:(TEACHER_USER&&TEACHER_USER.name)||"",
    teacherEmail:(TEACHER_USER&&TEACHER_USER.email)||"",
    groups:{}, observers:{}, startedAt:null
  };
  RP.runId = RP.sessionCode+"-"+Date.now().toString(36).toUpperCase();
  try{ await Backend.createSession(RP.runId, RP.sessionCode, meta, RP.scenarios); }
  catch(e){ alert(t("rp.couldn_t_open_role_play", "Couldn't open the role play: ")+e.message); return; }
  RP.meta=meta;
  document.getElementById("rp-live-code").textContent=RP.sessionCode;
  document.getElementById("rp-title").textContent=RP.name||"Role play";
  document.getElementById("rp-join-code").textContent=RP.sessionCode;
  document.getElementById("rp-lobby").style.display="block";
  document.getElementById("rp-stage").style.display="none";
  rpFillScenarioSelect();
  showScreen("screen-rp-live");
  rpRenderQR();
  rpWatchParticipants();
}

/* A set can hold several scenarios; the teacher moves between them mid-lesson and the parts
   are re-dealt, because a different scenario may want a different number of people. */
function rpFillScenarioSelect(){
  const sel=document.getElementById("rp-scenario-select");
  if(!sel) return;
  sel.innerHTML = RP.scenarios.map((sc,i)=>
    '<option value="'+i+'">'+escapeHtml((i+1)+". "+(sc.title||"Untitled"))+'</option>').join("");
  sel.value = String((RP.meta&&RP.meta.scenarioIndex)||0);
}

function rpRenderQR(){
  const holder=document.getElementById("rp-qr-code"); if(!holder) return;
  holder.innerHTML="";
  const url=location.origin+location.pathname+"?join="+encodeURIComponent(RP.sessionCode);
  try{ new QRCode(holder,{text:url,width:180,height:180}); }catch(e){ holder.textContent=url; }
  const t=document.getElementById("rp-join-url"); if(t) t.textContent=url;
}

function rpWatchParticipants(){
  if(RP.unsub) RP.unsub();
  RP.unsub = Backend.subscribeParticipants(RP.runId, res=>{
    RP.participants = (res&&res.participants)||[];
    renderRpRoster();
  });
}

function renderRpRoster(){
  const n=RP.participants.length;
  const el=document.getElementById("rp-roster");
  document.getElementById("rp-count").textContent = n+" joined";
  el.innerHTML = RP.participants.slice().sort(bySurname)
    .map(p=>'<span class="chip">'+escapeHtml(displayName(p.surname,p.firstName))+'</span>').join("") ||
    '<p class="sub">'+t("rp.waiting_students_join", 'Waiting for students to join…')+'</p>';
  document.getElementById("rp-deal-btn").disabled = n<2;
  if(RP.meta && RP.meta.round>0) renderRpGroups();
}

/* ---------- teacher: dealing, swapping, reshuffling ---------- */

async function rpDeal(){
  const sc=rpScenarioAt(RP.scenarios, (RP.meta&&RP.meta.scenarioIndex)||0);
  const { groups, observers } = rpAllocate(RP.participants, sc);
  await rpPushMeta({ groups:groups, observers:observers, status:"active",
                     round:((RP.meta&&RP.meta.round)||0)+1,
                     startedAt:(RP.meta&&RP.meta.startedAt)||Date.now() });
  document.getElementById("rp-lobby").style.display="none";
  document.getElementById("rp-stage").style.display="block";
}

/* Same pairs, parts exchanged. The second run of a scenario is where the fluency gain is,
   and it almost never happens on paper because re-dealing cards is a faff. */
async function rpSwapRoles(){
  if(!RP.meta || !RP.meta.round){ return; }
  await rpPushMeta({ groups: rpRotateRoles(metaMap(RP.meta,"groups")), round: RP.meta.round+1 });
}

/* New partners: a fresh audience for the same material. */
async function rpNewPartners(){
  const sc=rpScenarioAt(RP.scenarios, (RP.meta&&RP.meta.scenarioIndex)||0);
  const { groups, observers } = rpAllocate(RP.participants, sc);
  await rpPushMeta({ groups:groups, observers:observers, round:((RP.meta&&RP.meta.round)||0)+1 });
}

async function rpPickScenario(){
  const i=parseInt(document.getElementById("rp-scenario-select").value,10)||0;
  // A different scenario may have a different number of roles, so the groups are re-dealt.
  const sc=rpScenarioAt(RP.scenarios, i);
  const { groups, observers } = rpAllocate(RP.participants, sc);
  await rpPushMeta({ scenarioIndex:i, groups:groups, observers:observers,
                     round:((RP.meta&&RP.meta.round)||0)+1 });
}

async function rpPushMeta(changes){
  const meta=Object.assign({}, RP.meta||{}, changes);
  try{ await Backend.updateMeta(RP.runId, meta); }
  catch(e){ alert(t("rp.couldn_t_update_role_play", "Couldn't update the role play: ")+e.message); return; }
  RP.meta=meta;
  renderRpGroups();
}

function renderRpGroups(){
  const meta=RP.meta||{};
  const sc=rpScenarioAt(RP.scenarios, meta.scenarioIndex||0);
  const groups=metaMap(meta,"groups"), observers=metaMap(meta,"observers");
  const nums=rpGroupNumbers(groups);

  const head=document.getElementById("rp-stage-title");
  if(head) head.textContent=(sc&&sc.title)||"Scenario";
  const sit=document.getElementById("rp-stage-situation");
  if(sit) sit.textContent=(sc&&sc.situation)||"";
  const rd=document.getElementById("rp-round");
  if(rd) rd.textContent="Round "+(meta.round||1);

  const html=nums.map(g=>{
    const rows=rpGroupMembers(groups, g).map(m=>
      '<div class="rp-member"><b>'+escapeHtml(rpRoleLabel(sc,m.r))+'</b> '+
      escapeHtml(m.name)+'</div>').join("");
    return '<div class="rp-group"><div class="rp-group-no">Group '+g+'</div>'+rows+'</div>';
  }).join("");

  const obs=Object.keys(observers).map(id=>escapeHtml(observers[id]||"?"));
  const obsHtml = obs.length
    ? '<div class="rp-group rp-group-obs"><div class="rp-group-no">'+t("rp.listening_task", 'Listening task')+'</div><div class="rp-member">'+
      obs.join("<br>")+'</div></div>' : "";

  const box=document.getElementById("rp-groups");
  if(box) box.innerHTML = (html+obsHtml) || '<p class="sub">'+t("rp.nobody_joined_yet", 'Nobody has joined yet.')+'</p>';
}

/* The projector view: the shared situation and who is with whom, big enough to read from
   the back. The private briefs are never on this screen. */
function rpToggleProject(){
  RP.projecting=!RP.projecting;
  const el=document.getElementById("rp-projection");
  if(!el) return;
  if(RP.projecting){
    const meta=RP.meta||{};
    const sc=rpScenarioAt(RP.scenarios, meta.scenarioIndex||0);
    const groups=metaMap(meta,"groups");
    document.getElementById("rp-proj-title").textContent=(sc&&sc.title)||"Role play";
    document.getElementById("rp-proj-situation").textContent=(sc&&sc.situation)||"";
    document.getElementById("rp-proj-groups").innerHTML=rpGroupNumbers(groups).map(g=>{
      const names=rpGroupMembers(groups, g).map(m=>escapeHtml(m.name)).join(" &middot; ");
      return '<div class="rp-proj-group"><span class="rp-proj-no">'+g+'</span> '+names+'</div>';
    }).join("");
    el.style.display="flex";
  } else el.style.display="none";
}

async function rpEnd(){
  if(!confirm(t("rp.end_role_play_nothing_marked_nothing", "End the role play?\n\nNothing is marked and nothing is kept — the cards disappear from every phone."))) return;
  try{
    await Backend.updateMeta(RP.runId, Object.assign({}, RP.meta||{}, { status:"ended" }));
    // Role play produces no results, and the group lists name students. Like a poll, the run
    // is removed rather than archived.
    await Backend.deleteRun(RP.runId);
  }catch(e){ console.warn(e); }
  if(RP.unsub){ RP.unsub(); RP.unsub=null; }
  RP.projecting=false;
  const el=document.getElementById("rp-projection"); if(el) el.style.display="none";
  teacherHome();
}

function rpLeave(){
  if(RP.unsub){ RP.unsub(); RP.unsub=null; }
  teacherHome();
}

/* ---------- student: the card ---------- */

async function rpStudentStart(session, surname, firstName){
  RSTU={ runId:session.runId, meta:session.meta, scenarios:session.questions||[],
         unsub:null, wakeLock:null, hidden:false };
  try{ await Backend.joinSession(RSTU.runId, STUDENT.id, surname, firstName, true); }catch(e){ console.warn(e); }
  const badge=document.getElementById("rp-card-name");
  if(badge){ badge.textContent=displayName(surname,firstName); badge.style.display="inline-block"; }
  showScreen("screen-rp-card");
  rpKeepAwake();
  rpStudentWatch();
}

function rpStudentWatch(){
  if(RSTU.unsub) RSTU.unsub();
  RSTU.unsub = Backend.subscribeMeta(RSTU.runId, res=>{
    if(!res || !res.meta) return;
    RSTU.meta=res.meta;
    if(res.meta.status==="ended"){ rpStudentEnd(); return; }
    renderRpCard();
  });
}

/* A phone held at arm's length while you talk is not a sheet of paper: the screen sleeps,
   and looking at it competes with looking at your partner. So the screen is held awake
   while a card is open, and one tap puts the card away so the phone can go face down. */
async function rpKeepAwake(){
  try{
    if(navigator.wakeLock && navigator.wakeLock.request){
      RSTU.wakeLock = await navigator.wakeLock.request("screen");
      RSTU.wakeLock.addEventListener("release", ()=>{ RSTU.wakeLock=null; });
    }
  }catch(e){ /* unsupported, or refused: the card still works, the screen just dims */ }
}
function rpReleaseAwake(){
  try{ if(RSTU.wakeLock) RSTU.wakeLock.release(); }catch(e){}
  RSTU.wakeLock=null;
}
function rpToggleCard(){
  RSTU.hidden=!RSTU.hidden;
  const body=document.getElementById("rp-card-body");
  const btn=document.getElementById("rp-card-toggle");
  if(body) body.style.display = RSTU.hidden ? "none" : "block";
  if(btn) btn.textContent = RSTU.hidden ? "Show my card" : "Hide my card";
  const hint=document.getElementById("rp-card-hidden-hint");
  if(hint) hint.style.display = RSTU.hidden ? "block" : "none";
}

function renderRpCard(){
  const meta=RSTU.meta||{};
  const sc=rpScenarioAt(RSTU.scenarios, meta.scenarioIndex||0);
  const groups=metaMap(meta,"groups"), observers=metaMap(meta,"observers");
  const mine=groups[STUDENT.id];
  const waiting=document.getElementById("rp-card-waiting");
  const card=document.getElementById("rp-card-main");

  if(meta.status!=="active" || (!mine && !observers[STUDENT.id])){
    if(waiting) waiting.style.display="block";
    if(card) card.style.display="none";
    return;
  }
  if(waiting) waiting.style.display="none";
  if(card) card.style.display="block";

  document.getElementById("rp-card-scenario").textContent=(sc&&sc.title)||"Role play";
  document.getElementById("rp-card-situation").textContent=(sc&&sc.situation)||"";

  // The listening task: a noticing job, never a judgement of the people speaking.
  if(!mine){
    document.getElementById("rp-card-role").textContent=t("rp.listening", "Listening");
    document.getElementById("rp-card-group").textContent="";
    document.getElementById("rp-card-brief").textContent=
      t("rp.sit_group_listen_write_down_three", "Sit with a group and listen. Write down three useful phrases you hear — expressions you could use yourself next time.");
    document.getElementById("rp-card-secret").style.display="none";
    document.getElementById("rp-card-useful").style.display="none";
    document.getElementById("rp-card-partners").textContent="";
    return;
  }

  const role=((sc&&sc.roles)||[])[mine.r]||{};
  document.getElementById("rp-card-role").textContent=role.label||("Role "+(mine.r+1));
  document.getElementById("rp-card-group").textContent="Group "+mine.g;
  document.getElementById("rp-card-brief").textContent=role.brief||"";

  const sec=document.getElementById("rp-card-secret");
  if(role.secret){ sec.style.display="block"; document.getElementById("rp-card-secret-text").textContent=role.secret; }
  else sec.style.display="none";

  const use=document.getElementById("rp-card-useful");
  if(role.useful){ use.style.display="block"; document.getElementById("rp-card-useful-text").textContent=role.useful; }
  else use.style.display="none";

  // Who you are looking for in the room, and what they are playing.
  const others=rpGroupMembers(groups, mine.g).filter(m=>m.studentId!==STUDENT.id);
  document.getElementById("rp-card-partners").textContent =
    others.length ? ("With "+others.map(m=>m.name+" ("+rpRoleLabel(sc,m.r)+")").join(", ")) : "Waiting for a partner…";
}

function rpStudentEnd(){
  if(RSTU.unsub){ RSTU.unsub(); RSTU.unsub=null; }
  rpReleaseAwake();
  showScreen("screen-rp-done");
}

/* The screen wake request is dropped whenever the tab is hidden, so it has to be asked for
   again when the student comes back — otherwise the phone sleeps mid-conversation. */
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState==="visible" && RSTU.runId && !RSTU.wakeLock) rpKeepAwake();
});

/* A teacher who closes the tab mid-activity gets the room back, rather than 25 students
   holding cards nobody is driving. */
async function rpRejoin(summary, run){
  RP = { sessionCode: run.code || summary.code, runId: summary.runId,
         scenarios: run.questions||[], name: (run.meta&&run.meta.title)||"Role play",
         school: (run.meta&&run.meta.school)||"", sets:[], participants:[],
         unsub:null, projecting:false, meta: run.meta };
  document.getElementById("rp-live-code").textContent=RP.sessionCode;
  document.getElementById("rp-title").textContent=RP.name;
  document.getElementById("rp-join-code").textContent=RP.sessionCode;
  const dealt = (run.meta && run.meta.round) > 0;
  document.getElementById("rp-lobby").style.display = dealt ? "none" : "block";
  document.getElementById("rp-stage").style.display = dealt ? "block" : "none";
  rpFillScenarioSelect();
  showScreen("screen-rp-live");
  rpRenderQR();
  rpWatchParticipants();
  if(dealt) renderRpGroups();
}

/* ---------- the contract ---------- */
registerActivity("roleplay", {
  join: rpStudentStart,
  teacher: rpCreateSession,
  score: null,          // nothing is marked, and nothing is kept
  finish: rpEnd,
  rejoin: rpRejoin,
  label: "Role play",
  keeps: false   // nothing is archived: the records name students and hold no marks
});
