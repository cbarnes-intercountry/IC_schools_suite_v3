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
   optional ones exist so that spare students join a group as further voices rather than
   standing about. 23 students and a two-role scenario is eleven pairs and one trio.

   UP TO SIX ROLES (v3.19), and up to six people in a group. It was three, and the third was
   the only one that could be optional — so the shape of a class was core-sized groups plus at
   most one spare each. With several optional roles a scenario declares a floor and a ceiling:
   "4 core + 2 optional" means groups of four that grow to six as spares are absorbed, and a
   class of 25 comes out as six fours and a five with nobody left over.

   The talking-time cost is real and belongs with the scenario, not the code: in a pair each
   student speaks about half the time, in a six under a fifth. A six-hander earns its place
   only when every role holds something the others need. */
function rpCoreRoles(sc){ return ((sc&&sc.roles)||[]).filter(r=>!r.optional); }

/* Every optional role, in the order the scenario declares them — the seats a group grows into.
   Was `.find`, which silently used the first and ignored the rest. */
function rpExtraRoles(sc){ return ((sc&&sc.roles)||[]).filter(r=>r.optional); }

/* The largest a group can get: every role filled. */
function rpMaxGroupSize(sc){
  return Math.min(RP_MAX_ROLES, Math.max(2, rpCoreRoles(sc).length) + rpExtraRoles(sc).length);
}

/* The allocation carries each student's name with it. A student's phone can read the run's
   meta but not the other participants, so without the name here nobody could be told who
   they are looking for in the room. */
function rpAllocate(participants, scenario){
  const roles = ((scenario&&scenario.roles)||[]).slice(0, RP_MAX_ROLES);
  /* Seat INDICES, not counts, for both kinds. A student's `r` is an index into the role list,
     so counting would only work while the optional roles happened to come last — which nothing
     enforces. Mark role 2 of four optional and a counting version hands a core student the
     optional seat and leaves a real role unplayed. */
  const coreSeats  = roles.map((r,i)=>r.optional ? -1 : i).filter(i=>i>=0);
  const extraSeats = roles.map((r,i)=>r.optional ? i : -1).filter(i=>i>=0);
  /* Two is the floor even for a malformed scenario: a "group" of one has nobody to talk to.
     A scenario with fewer than two core roles is refused at import and in the editor, so this
     only catches data that got in another way. */
  while(coreSeats.length < 2) coreSeats.push(coreSeats.length);
  const core = coreSeats.length;

  const named = {};
  (participants||[]).forEach(p=>{ named[p.studentId]=displayName(p.surname,p.firstName); });
  const ids = shuffle((participants||[]).map(p=>p.studentId));
  const groups = {}, observers = {};
  const full = Math.floor(ids.length / core);
  let i = 0;
  for(let g=1; g<=full; g++) for(let k=0; k<core; k++){ const id=ids[i++]; groups[id]={ g:g, r:coreSeats[k], n:named[id]||"" }; }

  /* Spares fill the optional seats a layer at a time: every group gains a fifth before any
     gains a sixth. Round-robin rather than filling one group to bursting, so group sizes stay
     within one of each other and no pair of students is left playing a six-hander alone. */
  for(let layer=0; layer<extraSeats.length && i<ids.length; layer++){
    for(let g=1; g<=full && i<ids.length; g++){
      const id=ids[i++];
      groups[id]={ g:g, r:extraSeats[layer], n:named[id]||"" };
    }
  }

  // Anyone still over gets a noticing task rather than a part. Never a marking task: no
  // student assesses another in this app.
  while(i < ids.length){ const id=ids[i++]; observers[id]=named[id]||"?"; }
  return { groups: groups, observers: observers };
}

/* Same partners, different parts. In a trio the parts cycle rather than swap; in a six they
   cycle too, so after five swaps everybody has played everything.

   Rotates the SEATS a group actually holds, rather than counting (r+1) modulo the group size.
   The arithmetic version assumed seats ran 0,1,2… with no gaps — true until roles could be
   marked optional anywhere in the list. A group holding roles 0, 1 and 4 would have had its
   role-1 student rotated into seat 2, which nobody is playing and which may not exist. */
function rpRotateRoles(groups){
  const byGroup = {};
  Object.keys(groups||{}).forEach(id=>{ (byGroup[groups[id].g]=byGroup[groups[id].g]||[]).push(id); });
  const out = {};
  Object.keys(byGroup).forEach(key=>{
    const ids = byGroup[key].slice().sort((a,b)=>groups[a].r-groups[b].r);
    const seats = ids.map(id=>groups[id].r);
    /* Everyone moves along one seat, in seat order. The last student takes the first seat. */
    ids.forEach((id,k)=>{
      out[id]={ g:groups[id].g, r:seats[(k+1)%seats.length], n:groups[id].n||"" };
    });
  });
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
  return (roles[r] && roles[r].label) || t("rp.role_n", "Role {n}", {n:r+1});
}

function rpScenarioAt(list, i){ return (list||[])[i] || null; }

/* ---------- teacher: setting one up ---------- */

async function rpCreateSession(){
  if(!(await confirmNoOpenRun("role play"))) return;
  const code = genSessionCode();
  RP = { sessionCode:code, runId:null, scenarios:[], name:"", school:"", sets:[],
         participants:[], unsub:null, projecting:false };
  const c=document.getElementById("rp-setup-code");
  c.textContent=t("rp.code_is", "Code \u00b7 {code}", {code:code}); c.style.display="inline-block";
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
  sel.innerHTML = '<option value="">'+escapeHtml(mine.length
    ? t("rp.select_a_set", "\u2014 select a set \u2014")
    : t("rp.no_role_plays_for_school", "\u2014 no role plays for this school \u2014"))+'</option>';
  mine.forEach(s=>{ const o=document.createElement("option"); o.value=s.key;
    o.textContent=s.name+" ("+t("rp.n_scenarios", "{count} {scenarios}", { count:s.count, scenarios: plural(s.count, t("rp.scenario", "scenario"), t("rp.scenarios", "scenarios")) })+")"; sel.appendChild(o); });
  rpResetStep2();
}

async function rpSetPicked(){
  const key=document.getElementById("rp-set-select").value;
  if(!key){ rpResetStep2(); return; }
  let rec=null;
  try{ rec=await Backend.getQuiz(key); }catch(e){ alert(t("rp.couldn_t_load_set", "Couldn't load that set: ")+e.message); return; }
  if(!rec){ alert(t("rp.set_gone", "That set has gone.")); return; }
  RP.scenarios=rec.questions||[]; RP.name=rec.name||t("rp.role_play", "Role play");
  const first=rpScenarioAt(RP.scenarios,0);
  const core=Math.max(2, rpCoreRoles(first).length), extras=rpExtraRoles(first);
  const most=rpMaxGroupSize(first);
  /* A range when the scenario can grow, a single number when it cannot — "groups of 4 to 6"
     tells a teacher what to expect in the room before they deal. */
  const size = most>core
    ? t("rp.size_range", "{min} to {max}", { min:core, max:most })
    : String(core);
  document.getElementById("rp-summary").textContent =
    t("rp.setup_summary", "{count} {scenarios} \u00b7 groups of {size}",
      { count:RP.scenarios.length, size:size,
        scenarios: plural(RP.scenarios.length, t("rp.scenario", "scenario"), t("rp.scenarios", "scenarios")) })
    + " " + (extras.length
        ? t("rp.spares_join_as", "(spare students join groups as {roles})",
            { roles: extras.map(r=>r.label).filter(Boolean).join(", ") })
        : t("rp.spare_listens", "(a spare student gets a listening task)"));
  document.getElementById("rp-start-btn").disabled = RP.scenarios.length===0;
}

async function rpStartSession(){
  if(!RP.scenarios.length){ alert(t("rp.choose_set_scenarios_first", "Choose a set of scenarios first.")); return; }
  const meta = {
    kind:"roleplay", status:"waiting", scenarioIndex:0, round:0,
    title:RP.name||t("rp.role_play", "Role play"), school:RP.school||"",
    teacherName:(TEACHER_USER&&TEACHER_USER.name)||"",
    teacherEmail:(TEACHER_USER&&TEACHER_USER.email)||"",
    groups:{}, observers:{}, startedAt:null
  };
  RP.runId = RP.sessionCode+"-"+Date.now().toString(36).toUpperCase();
  try{ await Backend.createSession(RP.runId, RP.sessionCode, meta, RP.scenarios); }
  catch(e){ alert(t("rp.couldn_t_open_role_play", "Couldn't open the role play: ")+e.message); return; }
  RP.meta=meta;
  document.getElementById("rp-live-code").textContent=RP.sessionCode;
  document.getElementById("rp-title").textContent=RP.name||t("rp.role_play", "Role play");
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
    '<option value="'+i+'">'+escapeHtml((i+1)+". "+(sc.title||t("rp.untitled", "Untitled")))+'</option>').join("");
  sel.value = String((RP.meta&&RP.meta.scenarioIndex)||0);
}

function rpRenderQR(){
  const holder=document.getElementById("rp-qr-code"); if(!holder) return;
  holder.innerHTML="";
  const url=location.origin+location.pathname+"?join="+encodeURIComponent(RP.sessionCode);
  try{ new QRCode(holder,{text:url,width:180,height:180}); }catch(e){ holder.textContent=url; }
  const el=document.getElementById("rp-join-url"); if(el) el.textContent=url;
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
  document.getElementById("rp-count").textContent = t("rp.n_joined", "{count} joined", {count:n});
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
  if(head) head.textContent=(sc&&sc.title)||t("rp.scenario_heading", "Scenario");
  const sit=document.getElementById("rp-stage-situation");
  if(sit) sit.textContent=(sc&&sc.situation)||"";
  const rd=document.getElementById("rp-round");
  if(rd) rd.textContent=t("rp.round_n", "Round {n}", {n:meta.round||1});

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
    document.getElementById("rp-proj-title").textContent=(sc&&sc.title)||t("rp.role_play", "Role play");
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
  if(btn) btn.textContent = RSTU.hidden ? t("rp.show_my_card", "Show my card") : t("rp.hide_my_card", "Hide my card");
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

  document.getElementById("rp-card-scenario").textContent=(sc&&sc.title)||t("rp.role_play", "Role play");
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
  document.getElementById("rp-card-role").textContent=role.label||t("rp.role_n", "Role {n}", {n:mine.r+1});
  document.getElementById("rp-card-group").textContent=t("rp.group_n", "Group {n}", {n:mine.g});
  document.getElementById("rp-card-brief").textContent=role.brief||"";

  const sec=document.getElementById("rp-card-secret");
  if(role.secret){ sec.style.display="block"; document.getElementById("rp-card-secret-text").textContent=role.secret; }
  else sec.style.display="none";

  const use=document.getElementById("rp-card-useful");
  if(role.useful){ use.style.display="block"; document.getElementById("rp-card-useful-text").textContent=role.useful; }
  else use.style.display="none";

  /* Who you are looking for in the room, and what they are playing.

     A LIST, one per line, since v3.19. As a sentence it was fine for the one other person in a
     pair; at five others it became a run-on paragraph that a student has to read through to
     find the name they are hunting for across a noisy room. The role is what they are looking
     for, so it sits under the name rather than in brackets after it. */
  const others=rpGroupMembers(groups, mine.g).filter(m=>m.studentId!==STUDENT.id);
  const box=document.getElementById("rp-card-partners");
  if(!others.length){
    box.textContent=t("rp.waiting_for_a_partner", "Waiting for a partner\u2026");
  }else{
    box.innerHTML='<span class="rp-with-label">'+escapeHtml(t("rp.in_your_group", "In your group"))+'</span>'+
      '<ul class="rp-with">'+others.map(m=>
        '<li><span class="rp-with-name">'+escapeHtml(m.name)+'</span>'+
        '<span class="rp-with-role">'+escapeHtml(rpRoleLabel(sc, m.r))+'</span></li>').join("")+'</ul>';
  }
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
         scenarios: run.questions||[], name: (run.meta&&run.meta.title)||t("rp.role_play", "Role play"),
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
  /* First names. A role play is dealt into groups and the parts are read out; a teacher
     cannot put "Amber Falcon" and "Silent Otter" at the same table without reading both
     phones, which is the v3.17 finding that removed pseudonyms from the paired games. */
  nameMode: () => "first",
  label: "Role play",
  keeps: false   // nothing is archived: the records name students and hold no marks
});
