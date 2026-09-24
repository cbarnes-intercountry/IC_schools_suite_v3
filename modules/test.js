/* ============================================================================
   Classroom Exam App — modules/test.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* The self-marking test: teacher side and student side. */

async function teacherCreateSession(){
  if(!(await confirmNoOpenRun("test"))) return;
  const code = genSessionCode();
  TEACHER.sessionCode = code;
  TEACHER.runId = null;
  TEACHER.questions = [];   // teacher chooses a quiz from the library each time
  document.getElementById("dash-session-code").textContent = code;
  const setupCode=document.getElementById("setup-session-code");
  setupCode.textContent="Code · "+code; setupCode.style.display="inline-block";
  // Reset to "no limit" for every new session — browsers otherwise restore the last value typed.
  document.getElementById("opt-time-limit").value = 0;
  applyPerQuestionTimerLock();
  teacherResetStep2();
  await loadTeacherQuizList();
  showScreen("screen-teacher-setup");
}

// Teacher: load schools + all quizzes, populate the School dropdown. Quiz dropdown fills after a school is chosen.
let TEACHER_QUIZZES = [];

async function loadTeacherQuizList(){
  try{
    const [qs, ss] = await Promise.all([Backend.listQuizzes(), Backend.listSchools()]);
    TEACHER_QUIZZES = qs.quizzes || [];
    const schoolSel = document.getElementById("teacher-school-select");
    schoolSel.innerHTML = '<option value="">— select a school —</option>';
    (ss.schools||[]).forEach(n=>{ const o=document.createElement("option"); o.value=n; o.textContent=n; schoolSel.appendChild(o); });
    document.getElementById("teacher-quiz-select").innerHTML = '<option value="">— select a school first —</option>';
  }catch(e){ console.warn(e); }
}

function teacherQuizPicked(){ TEACHER.questions=[]; teacherResetStep2(); }

function filterTeacherQuizzes(){
  const school = document.getElementById("teacher-school-select").value;
  const qSel = document.getElementById("teacher-quiz-select");
  TEACHER.questions = []; TEACHER.school = school;
  teacherResetStep2();
  qSel.innerHTML = '<option value="">— select a quiz —</option>';
  if(!school) return;
  // Only quizzes. This used to exclude polls by name, which let every later kind through —
  // role plays turned up in the Launch Test list. Name what belongs, not what does not.
  TEACHER_QUIZZES.filter(q=>q.kind==="quiz" && (q.schools||[]).includes(school)).sort((a,b)=>a.name.localeCompare(b.name)).forEach(q=>{
    const o=document.createElement("option"); o.value=q.key;
    o.textContent = q.name + " (" + q.count + " question" + (q.count===1?"":"s") + ")";
    qSel.appendChild(o);
  });
}

async function loadQuizForTeacher(){
  const key = document.getElementById("teacher-quiz-select").value;
  const status = document.getElementById("teacher-quiz-status");
  if(!key){ alert("Pick a school and a quiz first."); return; }
  try{
    const quiz = await Backend.getQuiz(key);
    if(!quiz){ alert("That quiz could not be found."); TEACHER.questions=[]; return; }
    TEACHER.questions = (quiz.questions||[]).map(q=>Object.assign({},q,{id:q.id||"q_"+uid(6)}));
    // The run is tagged with the school the teacher selected (a quiz may serve several schools).
    TEACHER.school = document.getElementById("teacher-school-select").value || quizSchools(quiz)[0] || "";
    status.textContent = "\u2713 Selected — " + TEACHER.questions.length + " question" + (TEACHER.questions.length===1?"":"s") + ". Set up below.";
    status.style.display = "flex";
    document.getElementById("teacher-select-quiz-btn").style.display = "none";
    document.getElementById("setup-step2").style.display = "block";
    applyPerQuestionTimerLock();
  }catch(e){ alert("Load failed: "+e.message); }
}


/* ============ TEACHER: START / DASHBOARD (polling) ============ */
// Open the waiting room: session is created in "waiting" status so students who join
// wait in the lobby. The teacher starts the actual test with teacherBeginQuiz().
async function teacherStartTest(){
  if(TEACHER.questions.length===0){ alert("Choose a quiz from the dropdown first."); return; }
  const settings={
    paced:document.getElementById("opt-paced").checked,
    teams:document.getElementById("opt-teams").checked,
    teamCount:0, teamMap:{},   // filled in when the test actually starts
    randomizeQuestions:document.getElementById("opt-rand-q").checked,
    randomizeAnswers:document.getElementById("opt-rand-a").checked,
    security:document.getElementById("opt-security").checked,
    timeLimitMin:parseFloat(document.getElementById("opt-time-limit").value)||0,
    school: TEACHER.school || "",
    // Audit trail: who ran this test (from their teacher account).
    teacherName: (TEACHER_USER && TEACHER_USER.name) || "",
    teacherEmail: (TEACHER_USER && TEACHER_USER.email) || "",
    status:"waiting", currentIndex:0, startedAt:null
  };
  TEACHER.settings=settings;
  TEACHER.runId = TEACHER.sessionCode + "-" + Date.now().toString(36).toUpperCase();
  try{ await Backend.createSession(TEACHER.runId, TEACHER.sessionCode, settings, TEACHER.questions); }
  catch(e){ alert("Couldn't open the waiting room: "+e.message); return; }
  document.getElementById("dash-lobby").style.display="block";
  document.getElementById("dash-running").style.display="none";
  TEAM_DRAFT={ count:2, map:{} };
  document.getElementById("dash-teams-box").style.display = settings.teams ? "block" : "none";
  renderTeamPreview();
  showScreen("screen-teacher-dashboard");
  renderJoinQR();
  startDashboardPolling();
}

// Start the test for everyone in the waiting room.
async function teacherBeginQuiz(){
  const n=DASH_PARTICIPANTS.length;
  if(!confirm((n===0?"No students have joined yet. ":n+" student(s) connected. ")+"Start the test for everyone now?")) return;
  TEACHER.settings.status="active";
  TEACHER.settings.currentIndex=0;
  TEACHER.settings.startedAt=Date.now();
  if(TEACHER.settings.teams){
    // Lock the draw. From here the map only ever grows, for students who join late.
    TEACHER.settings.teamCount=TEAM_DRAFT.count;
    TEACHER.settings.teamMap=topUpTeams(Object.assign({}, TEAM_DRAFT.map||{}), DASH_PARTICIPANTS, TEAM_DRAFT.count);
  }
  try{ await Backend.updateMeta(TEACHER.runId, TEACHER.settings); }
  catch(e){ alert("Couldn't start test: "+e.message); return; }
  showDashboardRunning();
  startTeacherCountdown();
}


/* Dresses the dashboard for a test that is under way. Split out of teacherBeginQuiz so that
   rejoining a session after closing the app rebuilds exactly the same controls, rather than a
   second, slightly different version of them that drifts out of step over time. */
function showDashboardRunning(){
  document.getElementById("dash-mode-note").textContent = TEACHER.settings.paced
    ? "Paced mode: use Next/Previous to move the whole class together."
    : "Free navigation: students move at their own pace.";
  document.getElementById("dash-pace-controls").style.display = TEACHER.settings.paced?"flex":"none";
  // Offer the pause control only when there is actually a timer to freeze.
  const hasTimers = (TEACHER.settings.timeLimitMin>0) || TEACHER.questions.some(q=>(q.timeLimitSec||0)>0);
  document.getElementById("dash-pause-btn").style.display = hasTimers?"block":"none";
  document.getElementById("dash-pause-note").style.display = hasTimers?"block":"none";
  document.getElementById("dash-lobby").style.display="none";
  document.getElementById("dash-running").style.display="block";
}


/* Rebuild the dashboard for a run reopened from the Rejoin button. Only active runs are ever
   offered, but the waiting branch is kept so the function stays honest if that changes. */
function restoreDashboardForState(){
  if((TEACHER.settings||{}).status==="active"){
    showDashboardRunning();
    startTeacherCountdown();
  } else {
    document.getElementById("dash-lobby").style.display="block";
    document.getElementById("dash-running").style.display="none";
    renderJoinQR();
  }
}


/* ---- Teacher-side countdown (open navigation only — in paced mode the teacher drives the clock) ---- */
let TEACHER_CD={ interval:null, remainSec:0, totalSec:0 };

function startTeacherCountdown(){
  stopTeacherCountdown();
  const box=document.getElementById("dash-countdown");
  const mins=Number(TEACHER.settings.timeLimitMin)||0;
  if(TEACHER.settings.paced || mins<=0){ box.style.display="none"; return; }
  TEACHER_CD.totalSec=mins*60; TEACHER_CD.remainSec=mins*60;
  document.getElementById("dash-cd-limit").textContent=mins+" min";
  box.style.display="block";
  renderTeacherCountdown();
  TEACHER_CD.interval=setInterval(()=>{
    if(TEACHER.settings.paused){ renderTeacherCountdown(); return; }   // frozen with the students' timers
    if(TEACHER_CD.remainSec>0) TEACHER_CD.remainSec--;
    renderTeacherCountdown();
  },1000);
}

function stopTeacherCountdown(){ if(TEACHER_CD.interval){ clearInterval(TEACHER_CD.interval); TEACHER_CD.interval=null; } }

function renderTeacherCountdown(){
  const box=document.getElementById("dash-countdown"); if(!box) return;
  const left=TEACHER_CD.remainSec, low=left>0&&left<=300, out=left<=0;
  box.className="countdown"+(out?" out":(low?" low":""));
  document.getElementById("dash-cd-clock").textContent=fmtTime(left);
  document.getElementById("dash-cd-bar").style.width=(TEACHER_CD.totalSec?Math.max(0,Math.min(100,left/TEACHER_CD.totalSec*100)):0)+"%";
  const note=document.getElementById("dash-cd-note");
  let txt="";
  if(TEACHER.settings.paused) txt="Clock paused — students' timers are frozen too.";
  else if(out) txt="Time is up — papers were auto-submitted. End the test to see the recap.";
  else if(low) txt="Under 5 minutes remaining.";
  note.textContent=txt;
  note.style.color = out?"var(--magenta)":"var(--amber)";
  note.style.display = txt?"block":"none";
}

// Freeze / unfreeze every student's timers.
async function teacherTogglePause(){
  const paused = !TEACHER.settings.paused;
  TEACHER.settings.paused = paused;
  try{ await Backend.updateMeta(TEACHER.runId, TEACHER.settings); }
  catch(e){ TEACHER.settings.paused=!paused; alert("Couldn't "+(paused?"pause":"resume")+": "+e.message); return; }
  const btn=document.getElementById("dash-pause-btn");
  btn.innerHTML = paused ? "&#9654; Resume Test" : "&#9208; Pause Timers";
  btn.className = paused ? "btn-primary" : "btn-secondary";
  document.getElementById("dash-pause-note").textContent = paused
    ? "Test is paused — students see a waiting screen and their timers are frozen."
    : "Freezes the overall and per-question timers for everyone. Students see a \"paused\" screen and can't answer until you resume.";
}

async function pacedAdvance(dir){
  let idx=(TEACHER.settings.currentIndex||0)+dir;
  idx=Math.max(0,Math.min(TEACHER.questions.length-1,idx));
  TEACHER.settings.currentIndex=idx;
  document.getElementById("dash-current-q").textContent="Q "+(idx+1)+" / "+TEACHER.questions.length;
  try{ await Backend.updateMeta(TEACHER.runId, TEACHER.settings); }catch(e){ console.warn(e); }
}


let DASH_UNSUB=null, DASH_PARTICIPANTS=[];

function startDashboardPolling(){
  stopDashboardPolling();
  DASH_UNSUB=Backend.subscribeParticipants(TEACHER.runId, r=>{
    DASH_PARTICIPANTS=r.participants||[];
    // Keep the draft allocation in step with the lobby while students are still arriving.
    const lobbyOpen = !TEACHER.settings || TEACHER.settings.status!=="active";
    if(lobbyOpen && document.getElementById("opt-teams") && document.getElementById("opt-teams").checked){
      TEAM_DRAFT.map=topUpTeams(TEAM_DRAFT.map||{}, DASH_PARTICIPANTS, TEAM_DRAFT.count);
      renderTeamPreview();
    } else if(teamsEnabled() && TEACHER.settings.status==="active"){
      // Running: a student who joins late still needs a team, and it has to reach the database.
      const before=JSON.stringify(TEACHER.settings.teamMap||{});
      TEACHER.settings.teamMap=topUpTeams(Object.assign({}, TEACHER.settings.teamMap||{}), DASH_PARTICIPANTS, TEACHER.settings.teamCount||2);
      if(JSON.stringify(TEACHER.settings.teamMap)!==before){
        Backend.updateMeta(TEACHER.runId, TEACHER.settings).catch(e=>console.warn(e));
      }
    }
    renderDashboardList();
  });
}

function stopDashboardPolling(){ if(DASH_UNSUB){ DASH_UNSUB(); DASH_UNSUB=null; } stopTeacherCountdown(); }


// Live progress for one student: how many answered, and how many of those are right/wrong.
// Scored against the teacher's own copy of the questions, so it also works mid-test.
function participantProgress(p, questions){
  const total=(questions||[]).length;
  const secs=t=>t?" · "+Math.round(t)+"s":"";
  if(p.result){
    const rows=p.result.answers||[];
    const correct=rows.filter(a=>a.isCorrect).length;
    // Cells carry their own tooltip so hovering a square tells you which question it was.
    const cells=rows.map((a,i)=>({ cls:a.isCorrect?"ok":"no",
      tip:"Q"+(i+1)+" · "+(a.isCorrect?"correct":"wrong")+secs(a.timeSpentSec) }));
    return { answered:rows.length, total:total||rows.length, correct, wrong:rows.length-correct, done:true, cells };
  }
  if(!p.progress) return { answered:0, total, correct:0, wrong:0, done:false, cells:[] };
  const order=p.progress.order||[], answers=p.progress.answers||{}, spent=p.progress.timeSpent||{};
  const at=p.progress.currentPos;
  let answered=0, correct=0;
  const scored=scoreAnswers(questions||[], order, answers, {});
  const cells=scored.answerRows.map((row,pos)=>{
    const given=answers[pos];
    const has = given!==undefined && given!=="" && !(Array.isArray(given) && given.length===0);
    let cls, what;
    if(has){ answered++; if(row.isCorrect){ correct++; cls="ok"; what="correct"; } else { cls="no"; what="wrong"; } }
    else if(at!==undefined && pos<at){ cls="seen"; what="skipped"; }
    else { cls=""; what="not reached"; }
    if(pos===at) cls=(cls+" now").trim();
    return { cls, tip:"Q"+(pos+1)+" · "+what+secs(spent[pos])+(pos===at?" · here now":"") };
  });
  return { answered, total:total||order.length, correct, wrong:answered-correct, done:false, cells };
}


/* The question strip scrolls as one: all rows share an offset so the columns stay aligned. */
let QGRID_OFFSET=0;

const QCELL=18;
 // 15px square + 3px gap
function qGridVisible(){
  const track=document.querySelector("#dash-student-list .qgrid");
  return track ? Math.max(1, Math.floor((track.clientWidth+3)/QCELL)) : 10;
}

function qGridMax(){
  const total=(TEACHER.questions||[]).length;
  return Math.max(0, total - qGridVisible());
}

function shiftQGrid(dir){
  QGRID_OFFSET=Math.min(qGridMax(), Math.max(0, QGRID_OFFSET + dir*Math.max(1, qGridVisible()-1)));
  applyQGrid();
}

function applyQGrid(){
  const total=(TEACHER.questions||[]).length, vis=qGridVisible(), max=qGridMax();
  if(QGRID_OFFSET>max) QGRID_OFFSET=max;
  document.querySelectorAll("#dash-student-list .qtrack").forEach(t=>{
    t.style.transform="translateX("+(-QGRID_OFFSET*QCELL)+"px)";
  });
  const prev=document.getElementById("qnav-prev"), next=document.getElementById("qnav-next"),
        label=document.getElementById("qnav-label");
  if(prev) prev.disabled = QGRID_OFFSET<=0;
  if(next) next.disabled = QGRID_OFFSET>=max;
  if(label) label.textContent = total>vis
    ? "Q"+(QGRID_OFFSET+1)+"–"+Math.min(total, QGRID_OFFSET+vis)+" of "+total
    : "Questions";
}


function renderDashboardList(){
  document.getElementById("dash-student-count").textContent = DASH_PARTICIPANTS.length;
  const list=document.getElementById("dash-student-list"); list.innerHTML="";
  const now=Date.now();
  // Flagged students float to the top (most alerts first); everyone else stays alphabetical.
  DASH_PARTICIPANTS.slice().sort((a,b)=>{
    const aa=effectiveCheatCount(a), ab=effectiveCheatCount(b);
    if((aa>0)!==(ab>0)) return aa>0?-1:1;
    if(aa!==ab) return ab-aa;
    return bySurname(a,b);
  }).forEach((p,i)=>{
    const alerts=effectiveCheatCount(p);
    const stale = !p.result && p.lastSeen && (now-p.lastSeen>30000);
    const div=document.createElement("div"); div.className="dash-row"+(alerts>0?" flagged":"");

    const rk=document.createElement("span"); rk.className="rk"; rk.textContent=i+1;

    const who=document.createElement("span"); who.className="who";
    const av=document.createElement("span"); av.className="avatar";
    av.textContent=((p.surname||"?")[0]+(p.firstName||"?")[0]).toUpperCase();
    const prog=participantProgress(p, TEACHER.questions);
    const nm=document.createElement("span"); nm.style.cssText="min-width:0;overflow:hidden;";
    // In team mode the team is shown under the name, so the teacher can see at a glance
    // whether one team is quietly doing nothing while another races ahead.
    const teamOf = teamsEnabled()
      ? ((TEACHER.settings.teamMap||{})[p.studentId]||"")
      : ((document.getElementById("opt-teams")||{}).checked ? (TEAM_DRAFT.map||{})[p.studentId]||"" : "");
    nm.innerHTML='<b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
      +escapeHtml(displayName(p.surname,p.firstName))+'</b>'
      +(teamOf?'<small class="hint">'+escapeHtml(teamOf)+'</small>':'');
    nm.title=displayName(p.surname,p.firstName);
    who.appendChild(av); who.appendChild(nm);

    // One square per question: green right, magenta wrong, outlined where they are now.
    const qg=document.createElement("span"); qg.className="qgrid";
    if(prog.cells && prog.cells.length){
      const track=document.createElement("span"); track.className="qtrack";
      prog.cells.forEach(c=>{
        const sq=document.createElement("i");
        if(c.cls) sq.className=c.cls;
        sq.title=c.tip;
        track.appendChild(sq);
      });
      qg.appendChild(track);
    } else {
      const none=document.createElement("span"); none.className="qnone"; none.textContent="Not started";
      qg.appendChild(none);
    }

    // One status pill: alerts outrank everything, then done / disconnected / in progress.
    const st=document.createElement("span");
    const pill=document.createElement("span");
    const waiting = (TEACHER.settings||{}).status==="waiting";
    if(alerts>0){ pill.className="pill alert"; pill.textContent="⚠ "+alerts+" alert"+(alerts===1?"":"s"); }
    else if(p.result){ pill.className="pill done"; pill.textContent="✓ Done"; }
    else if(stale){ pill.className="pill alert"; pill.textContent="⚠ Dropped"; }
    else if(waiting){ pill.className="pill wait"; pill.textContent="In waiting room"; }
    else { pill.className="pill live"; pill.innerHTML='<i></i>In test'; }
    st.appendChild(pill);

    const sc=document.createElement("span"); sc.className="sc";
    sc.textContent = p.result ? Math.round(p.result.percentage)+"%" : "—";
    if(!p.result) sc.style.color="var(--ink-soft)";

    const ac=document.createElement("span"); ac.className="ac";
    if(alerts>0){
      const btn=document.createElement("button"); btn.className="btn-outline btn-mini";
      btn.textContent="Reset"; btn.title="Clear these alerts — monitoring stays on";
      btn.onclick=()=>resetCheatFor(p.studentId);
      ac.appendChild(btn);
    }else{
      const dash=document.createElement("span"); dash.className="sc"; dash.style.color="var(--ink-soft)"; dash.textContent="—";
      ac.appendChild(dash);
    }

    div.appendChild(rk); div.appendChild(who); div.appendChild(qg); div.appendChild(st); div.appendChild(sc); div.appendChild(ac);
    list.appendChild(div);
  });
  applyQGrid();
  // Header tallies
  const doneN=DASH_PARTICIPANTS.filter(p=>p.result).length;
  const alertN=DASH_PARTICIPANTS.filter(p=>effectiveCheatCount(p)>0).length;
  const dB=document.getElementById("dash-done-badge"), aB=document.getElementById("dash-alert-badge");
  dB.textContent=doneN+" done"; dB.style.display=doneN?"inline-block":"none";
  aB.textContent=alertN+" alert"+(alertN===1?"":"s"); aB.style.display=alertN?"inline-block":"none";
}

// Teacher clears a student's alerts (e.g. an accidental tab-switch), keeping monitoring live.
async function resetCheatFor(studentId){
  const p=DASH_PARTICIPANTS.find(x=>x.studentId===studentId); if(!p) return;
  if(!confirm("Clear "+displayName(p.surname,p.firstName)+"'s cheat alerts?\n\nMonitoring stays on, so any new alert will still appear.")) return;
  const total=rawCheatAlerts(p).length;
  try{ await Backend.resetCheat(TEACHER.runId, studentId, total); }
  catch(e){ alert("Reset failed: "+e.message); return; }
  p.cheatBaseline=total; renderDashboardList();  // reflect immediately (live listener will confirm)
}

async function teacherEndTest(){
  if(!confirm("End the test for all students now?")) return;
  TEACHER.settings.status="ended";
  try{ await Backend.updateMeta(TEACHER.runId, TEACHER.settings); }catch(e){ console.warn(e); }
  document.getElementById("recap-code").textContent=TEACHER.sessionCode;
  setTimeout(showTeacherRecap, 3000);
}

function teacherLeaveDashboard(){ stopDashboardPolling(); showScreen("screen-role"); }

async function showTeacherRecap(){
  stopDashboardPolling();
  let participants=[];
  try{ const r=await Backend.listParticipants(TEACHER.runId); participants=r.participants||[]; }catch(e){ console.warn(e); }
  RECAP_ROWS=buildEffectiveResults(participants, TEACHER.questions, TEACHER.settings);
  let alertTotal=0, pctSum=0, scored=0;
  RECAP_ROWS.forEach(r=>{ alertTotal+=(r.cheatAlerts||[]).length; pctSum+=r.percentage; scored++; });
  document.getElementById("recap-count").textContent=RECAP_ROWS.length;
  document.getElementById("recap-avg").textContent=scored?Math.round(pctSum/scored)+"%":"—";
  document.getElementById("recap-alerts").textContent=alertTotal;
  RECAP_SORT={ key:"pct", dir:-1 };
  renderRecapTable();
  renderTeamLeaderboard();
  showScreen("screen-teacher-recap");
}


/* ---- Recap table: click any column head to sort (second click reverses) ---- */
let RECAP_ROWS=[], RECAP_SORT={ key:"pct", dir:-1 };

function recapSortBy(key){
  // Names read best A→Z first; scores and alerts read best highest-first.
  if(RECAP_SORT.key===key) RECAP_SORT.dir=-RECAP_SORT.dir;
  else RECAP_SORT={ key, dir: key==="name" ? 1 : -1 };
  renderRecapTable();
}

function renderRecapTable(){
  const list=document.getElementById("recap-list"); if(!list) return;
  const k=RECAP_SORT.key, dir=RECAP_SORT.dir;
  const val=r=>{
    if(k==="name") return null;
    if(k==="score") return r.totalPossible ? r.score/r.totalPossible : 0;
    if(k==="alerts") return (r.cheatAlerts||[]).length;
    return r.percentage;
  };
  const rows=RECAP_ROWS.slice().sort((a,b)=>{
    if(k==="name") return dir*bySurname(a,b);
    const d=val(a)-val(b);
    return d!==0 ? dir*d : bySurname(a,b);
  });
  list.innerHTML="";
  rows.forEach((r,i)=>{
    const alerts=(r.cheatAlerts||[]).length, pass=r.percentage>=50, done=r.status==="Submitted";
    const div=document.createElement("div"); div.className="recap-row";
    div.innerHTML='<span class="rk">'+(i+1)+'</span>'
      +'<span class="nm" title="'+escapeHtml(displayName(r.surname,r.firstName))+'">'+escapeHtml(displayName(r.surname,r.firstName))+'</span>'
      +'<span class="mk '+(pass?"pass":"fail")+'">'+r.score+'/'+r.totalPossible+'</span>'
      +'<span class="pc">'+Math.round(r.percentage)+'%</span>'
      +'<span class="al'+(alerts>0?" has":"")+'">'+(alerts>0?alerts:"—")+'</span>'
      +(done?"":'<span class="rk" style="grid-column:2/-1;color:var(--amber);font-weight:700;">'+escapeHtml(r.status||"Incomplete")+'</span>');
    list.appendChild(div);
  });
  // Head state: the active column shows a caret pointing the way it's sorted.
  [["name","sort-name"],["score","sort-score"],["pct","sort-pct"],["alerts","sort-alerts"]].forEach(([key,id])=>{
    const btn=document.getElementById(id); if(!btn) return;
    btn.classList.toggle("on", key===k);
    const caret=btn.querySelector("b"); if(caret) caret.innerHTML = (key===k && dir===1) ? "&#9650;" : "&#9660;";
  });
}

function startNewTestFromRecap(){
  TEACHER={ sessionCode:null, runId:null, questions:[], settings:{} };
  showScreen("screen-teacher-login");
}


/* Merge submitted results + progress fallback for disconnected students. Returns an array. */
function buildEffectiveResults(participants, questions, meta){
  const teamMap=(meta && meta.teamMap) || (TEACHER.settings && TEACHER.settings.teamMap) || {};
  const tag=(p,r)=>{ const t=teamMap[p.studentId]; if(t) r.team=t; return r; };
  return participants.map(p=>{
    const base=p.cheatBaseline||0;  // teacher-cleared alerts are dropped from reports too
    if(p.result){
      const r=Object.assign({status:"Submitted", surname:p.surname, firstName:p.firstName}, p.result);
      r.cheatAlerts=(p.result.cheatAlerts||[]).slice(base);
      return tag(p,r);
    }
    if(p.progress){
      const scored=scoreAnswers(questions, p.progress.order||[], p.progress.answers||{}, p.progress.timeSpent||{});
      return tag(p, { surname:p.surname, firstName:p.firstName, status:"Incomplete (disconnected)",
        score:scored.score, totalPossible:scored.totalPossible, percentage:scored.percentage,
        answers:scored.answerRows, cheatAlerts:(p.progress.cheatAlerts||[]).slice(base), finishedAt:p.lastSeen });
    }
    return tag(p, { surname:p.surname, firstName:p.firstName, status:"Joined (no answers)",
      score:0, totalPossible:0, percentage:0, answers:[], cheatAlerts:[], finishedAt:p.lastSeen });
  });
}




/* The join screen asks for the code first and only then, if the session actually needs one,
   for a name. An anonymous poll never shows the name boxes at all. */
function askForName(msg){
  const box=document.getElementById("join-names");
  const first=!box || box.style.display!=="block";
  if(box) box.style.display="block";
  document.getElementById("join-status").textContent = msg || "";
  document.getElementById("join-btn").textContent = "Join";
  if(first){ const s=document.getElementById("s-surname"); if(s&&s.focus) try{ s.focus(); }catch(e){} }
}

async function studentJoin(){
  const code=document.getElementById("s-session-code").value.trim().toUpperCase();
  let surname=document.getElementById("s-surname").value.trim();
  let firstName=document.getElementById("s-firstname").value.trim();
  if(!code){ document.getElementById("join-status").textContent="Enter the session code your teacher is showing."; return; }
  document.getElementById("join-status").textContent="";
  // A name is required for tests and named polls, but an anonymous poll needs only the code —
  // so the session is resolved first and the name checked afterwards (see below).
  STUDENT.sessionCode=code; STUDENT.surname=surname; STUDENT.firstName=firstName; STUDENT.name=displayName(surname,firstName);
  // Identity: when live, use the Firebase sign-in uid so the security rules can allow a student
  // to write ONLY their own record. Firebase persists the anonymous account in this browser, so a
  // refresh or brief disconnect returns the same uid and the same attempt. Demo mode falls back
  // to a locally stored id.
  await Backend._ready();
  STUDENT.id = Backend.uid() || localStorage.getItem("examFB_id_"+code) || ("s_"+uid(8));
  localStorage.setItem("examFB_id_"+code, STUDENT.id);
  let session;
  try{ session=await Backend.getActiveSession(code); }catch(e){ alert("Couldn't reach the session: "+e.message); return; }
  if(!session||!session.meta||!session.runId){ alert("Session not found. Check the code with your teacher."); return; }
  STUDENT.runId=session.runId; STUDENT.meta=session.meta;

  // ---- Any registered activity: poll, role play, whatever comes next ----
  // The router asks the registry rather than naming activities one at a time, so a new
  // module does not mean editing this function. A test is the default path below.
  const act = activity(session.meta.kind);
  if(act && act.join){
    const what = (act.label||"session").toLowerCase();
    if(session.meta.status==="ended"){ alert("That "+what+" has finished."); return; }
    if(act.anonymous && act.anonymous(session.meta)){
      // Nothing identifying is stored, and the name boxes are never shown.
      surname=""; firstName=""; STUDENT.surname=""; STUDENT.firstName=""; STUDENT.name="";
    } else if(!act.requiresName || act.requiresName(session.meta)){
      if(!surname || !firstName){ askForName("This "+what+" needs your name."); return; }
    }
    await act.join(session, surname, firstName);
    return;
  }

  if(!surname||!firstName){ askForName("Enter your surname and first name to join this test."); return; }
  const questions=session.questions||[];
  STUDENT.order = STUDENT.meta.randomizeQuestions ? shuffle(questions.map((_,i)=>i)) : questions.map((_,i)=>i);
  STUDENT.questions = questions.map(q=> (q.type==="mcq"&&STUDENT.meta.randomizeAnswers) ? Object.assign({},q,{options:shuffle(q.options)}) : q);

  // --- Reconnect: is there an earlier attempt for this student on this run? ---
  let prior=null;
  try{ prior=await Backend.getParticipant(STUDENT.runId, STUDENT.id); }catch(e){ console.warn(e); }
  STUDENT.resuming=false;
  if(prior && prior.result){
    // Already submitted — show their result rather than letting them sit through it again.
    fillFeedbackPanel(prior.result);
    STUDENT.finished=true;
    showScreen("screen-student-feedback");
    return;
  }
  if(prior && prior.progress && prior.progress.started){
    const p=prior.progress;
    // Restore their exact attempt: same question order, answers, timings and alerts.
    if(Array.isArray(p.order) && p.order.length) STUDENT.order=p.order;
    STUDENT.answers=p.answers||{};
    STUDENT.timeSpent=p.timeSpent||{};
    STUDENT.cheatAlerts=p.cheatAlerts||[];
    STUDENT.qLocked=p.qLocked||{};
    STUDENT.qDeadlines=p.qDeadlines||{};
    STUDENT.deadline=p.deadline||null;
    STUDENT.resumePos=Math.min(p.currentPos||0, STUDENT.order.length-1);
    // Any per-question timer that ran out while they were away is now locked.
    const nowMs=Date.now();
    Object.keys(STUDENT.qDeadlines).forEach(k=>{ if(STUDENT.qDeadlines[k] && STUDENT.qDeadlines[k]<=nowMs) STUDENT.qLocked[k]=true; });
    STUDENT.resuming=true;
  }
  try{ await Backend.joinSession(STUDENT.runId, STUDENT.id, surname, firstName, true); }catch(e){ console.warn(e); }
  document.getElementById("wait-name").textContent=STUDENT.name;
  document.getElementById("wait-code").textContent=code;
  showScreen("screen-student-waiting");
  startStudentStatusPolling();
}


let STU_UNSUB=null;

function startStudentStatusPolling(){
  stopStudentStatusPolling();
  // Live listener on the session meta: reveals the Start button when the teacher begins,
  // follows paced navigation, and ends the test the moment the teacher does.
  STU_UNSUB=Backend.subscribeMeta(STUDENT.runId, session=>{
    if(!session||!session.meta) return;
    const meta=session.meta; STUDENT.meta=meta; STUDENT.paced=meta.paced;
    const startBtn=document.getElementById("wait-start-btn");
    const startHint=document.getElementById("wait-start-hint");
    const waitStatus=document.getElementById("wait-status");
    if(meta.status==="waiting" && !STUDENT.testStarted){
      if(startBtn) startBtn.style.display="none";
      if(startHint) startHint.style.display="none";
      if(waitStatus) waitStatus.textContent="Waiting for your teacher to start the test…";
    }
    // Teacher has started: drop the student straight into the test. There is no tap to make
    // here any more — the teacher's launch is the only start signal. Full screen is the one
    // thing a tap used to buy us (browsers only grant it from a real gesture), so when
    // monitoring is on and the automatic request is refused, the existing full-screen overlay
    // is raised and their tap on it does the job instead. See startStudentTest().
    if(meta.status==="active" && !STUDENT.testStarted){
      showStudentTeam(meta);
      const resuming=!!STUDENT.resuming;
      if(waitStatus) waitStatus.textContent = resuming
        ? "You were disconnected — picking up where you left off…"
        : "Your teacher has started the test. Opening it now…";
      if(startBtn) startBtn.style.display="none";
      if(startHint) startHint.style.display="none";
      studentBeginTest();
    }
    // Missed the start entirely (joined after it already ended).
    if(meta.status==="ended" && !STUDENT.testStarted && !STUDENT.finished){
      if(startBtn) startBtn.style.display="none";
      if(startHint) startHint.style.display="none";
      if(waitStatus) waitStatus.textContent="This test has already ended. Please check with your teacher.";
    }
    // End the test for students who are taking it.
    if(meta.status==="ended" && STUDENT.testStarted && !STUDENT.finished){ studentSubmitTest(true); }
    // Teacher pause/resume of the timers.
    if(STUDENT.testStarted && !STUDENT.finished) applyPauseState(!!meta.paused);
    // Follow paced navigation once the student is actually in the test (ignored while paused).
    if(meta.status==="active" && meta.paced && STUDENT.testStarted && !STUDENT.isPaused){
      const idx=meta.currentIndex||0; if(idx!==STUDENT.currentPos) goToQuestion(idx);
    }
  });
}

function stopStudentStatusPolling(){ if(STU_UNSUB){ STU_UNSUB(); STU_UNSUB=null; } }

// Fired automatically when the teacher launches. Kept as a named function (rather than inlined)
// because the reconnect path calls it too.
function studentBeginTest(){
  if(STUDENT.testStarted) return;
  STUDENT.testStarted=true;
  startStudentTest();
}


// Fill the results panel from a submitted result (used on submit and on reconnect).
function fillFeedbackPanel(result){
  const rows=(result&&result.answers)||[];
  const correct=rows.filter(r=>r.isCorrect).length;
  const totalSec=Math.round(rows.reduce((t,r)=>t+(r.timeSpentSec||0),0));
  document.getElementById("fb-name").textContent=STUDENT.firstName||STUDENT.name;
  document.getElementById("fb-score").textContent=(result.score||0)+" / "+(result.totalPossible||0)+" pts";
  document.getElementById("fb-percentage").textContent=Math.round(result.percentage||0)+"%";
  document.getElementById("fb-correct").textContent=correct;
  document.getElementById("fb-missed").textContent=rows.length-correct;
  document.getElementById("fb-time").textContent=Math.floor(totalSec/60)+":"+String(totalSec%60).padStart(2,"0");
}


function startStudentTest(){
  // A fresh start clears the per-question timing state; a resume keeps what was restored.
  if(!STUDENT.resuming){ STUDENT.qDeadlines={}; STUDENT.qLocked={}; }
  if(STUDENT.meta.security){
    enableSecurityMonitoring();
    // The test now opens without a tap, so the automatic full-screen request has no user
    // gesture behind it and most browsers will refuse it. Give it a moment to land; if it
    // hasn't, raise the same overlay used when a student leaves full screen mid-test — their
    // tap on that is a valid gesture. Skipped on iOS, which has no web full screen at all.
    if(_fsSupported) setTimeout(()=>{
      if(!STUDENT.finished && STUDENT.testStarted && !inFullscreen()) showFSOverlay();
    }, 700);
  }
  if(STUDENT.meta.timeLimitMin>0){
    document.getElementById("test-timer").style.display="inline-block";
    // On a resume, keep the original deadline so a disconnect can't buy extra time.
    if(!(STUDENT.resuming && STUDENT.deadline)) STUDENT.deadline=Date.now()+STUDENT.meta.timeLimitMin*60000;
    if(STUDENT.deadline<=Date.now()){ studentSubmitTest(true); return; }   // ran out while away
    STUDENT.timerInterval=setInterval(updateOverallTimer,500);
  }
  document.getElementById("q-palette-wrap").style.display=STUDENT.paced?"none":"block";
  document.getElementById("q-paced-nav").style.display=STUDENT.paced?"block":"none";
  goToQuestion(STUDENT.resuming ? (STUDENT.resumePos||0) : 0);
  STUDENT.resuming=false;
  showScreen("screen-student-test");
  // Autosave progress to SharePoint periodically so a disconnect doesn't lose work.
  STUDENT.checkpointInterval=setInterval(()=>{
    if(STUDENT.questionStartTs!==null){
      const elapsed=(Date.now()-STUDENT.questionStartTs)/1000;
      STUDENT.timeSpent[STUDENT.currentPos]=(STUDENT.timeSpent[STUDENT.currentPos]||0)+elapsed;
      STUDENT.questionStartTs=Date.now();
    }
    syncProgress(true);
  }, 20000);
}

function updateOverallTimer(){
  const remain=Math.max(0,(STUDENT.deadline-Date.now())/1000);
  document.getElementById("test-timer").textContent=fmtTime(remain);
  if(remain<=0){ clearInterval(STUDENT.timerInterval); studentSubmitTest(true); }
}

function goToQuestion(pos){
  // Can't navigate to a question whose per-question timer has already expired.
  if(STUDENT.qLocked && STUDENT.qLocked[pos] && pos!==STUDENT.currentPos){ return; }
  if(STUDENT.questionStartTs!==null){
    const elapsed=(Date.now()-STUDENT.questionStartTs)/1000;
    STUDENT.timeSpent[STUDENT.currentPos]=(STUDENT.timeSpent[STUDENT.currentPos]||0)+elapsed;
  }
  clearQuestionTimer();
  STUDENT.currentPos=pos; STUDENT.questionStartTs=Date.now();
  renderCurrentQuestion();
}

function clearQuestionTimer(){ if(STUDENT.qTimerInterval){ clearInterval(STUDENT.qTimerInterval); STUDENT.qTimerInterval=null; } }


/* ---- Teacher-controlled pause: freeze both timers and block answering ---- */
function applyPauseState(paused){
  if(paused && !STUDENT.isPaused) pauseStudent();
  else if(!paused && STUDENT.isPaused) resumeStudent();
}

function pauseStudent(){
  STUDENT.isPaused=true;
  // Bank the time spent so far on this question, then stop counting.
  if(STUDENT.questionStartTs!==null){
    STUDENT.timeSpent[STUDENT.currentPos]=(STUDENT.timeSpent[STUDENT.currentPos]||0)+(Date.now()-STUDENT.questionStartTs)/1000;
    STUDENT.questionStartTs=null;
  }
  // Remember what was left on each timer, then stop them.
  STUDENT._pausedOverallMs = STUDENT.deadline ? Math.max(0, STUDENT.deadline-Date.now()) : null;
  const qd = STUDENT.qDeadlines && STUDENT.qDeadlines[STUDENT.currentPos];
  STUDENT._pausedQuestionMs = qd ? Math.max(0, qd-Date.now()) : null;
  if(STUDENT.timerInterval){ clearInterval(STUDENT.timerInterval); STUDENT.timerInterval=null; }
  clearQuestionTimer();
  const o=document.getElementById("pause-overlay"); if(o) o.style.display="flex";
  STUDENT._suppressCheat=true;          // don't log alerts while they're waiting
  syncProgress(true);                   // save answers at the moment of pause
}

function resumeStudent(){
  STUDENT.isPaused=false;
  const o=document.getElementById("pause-overlay"); if(o) o.style.display="none";
  STUDENT._suppressCheat=false;
  STUDENT.questionStartTs=Date.now();
  // Restore each timer with exactly the time that was left.
  if(STUDENT._pausedOverallMs!==null && STUDENT._pausedOverallMs!==undefined){
    STUDENT.deadline = Date.now()+STUDENT._pausedOverallMs;
    STUDENT.timerInterval = setInterval(updateOverallTimer,500);
    STUDENT._pausedOverallMs=null;
  }
  if(STUDENT._pausedQuestionMs!==null && STUDENT._pausedQuestionMs!==undefined){
    STUDENT.qDeadlines[STUDENT.currentPos] = Date.now()+STUDENT._pausedQuestionMs;
    STUDENT._pausedQuestionMs=null;
  }
  // Re-baseline the viewport (screen may have shifted) and restart the question countdown.
  _vpBaseH=vpH(); _vpBaseW=vpW(); _splitFlagged=false;
  renderCurrentQuestion();
}

let _syncTimer=null, _syncPending=false;

function syncProgress(immediate){
  if(STUDENT.finished||!STUDENT.sessionCode) return;
  const doIt=async()=>{ _syncPending=false;
    try{ await Backend.saveProgress(STUDENT.runId, STUDENT.id, STUDENT.surname, STUDENT.firstName,
      { order:STUDENT.order, answers:STUDENT.answers, timeSpent:STUDENT.timeSpent, cheatAlerts:STUDENT.cheatAlerts,
        // Resume state: lets a student who drops out rejoin exactly where they were.
        started:!!STUDENT.testStarted, currentPos:STUDENT.currentPos,
        qLocked:STUDENT.qLocked||{}, qDeadlines:STUDENT.qDeadlines||{},
        deadline:STUDENT.deadline||null, lastUpdate:Date.now() });
    }catch(e){ console.warn(e); } };
  if(immediate){ doIt(); return; }
  // Debounce answer-driven saves to limit flow runs.
  if(_syncPending) return;
  _syncPending=true;
  clearTimeout(_syncTimer);
  _syncTimer=setTimeout(doIt, 4000);
}

function renderCurrentQuestion(){
  const pos=STUDENT.currentPos;
  const q=STUDENT.questions[STUDENT.order[pos]];
  const locked=!!(STUDENT.qLocked&&STUDENT.qLocked[pos]);
  document.getElementById("test-progress").textContent="Question "+(pos+1)+" of "+STUDENT.order.length;
  document.getElementById("q-text-display").textContent=q.text;
  // Replay the slide-in so each question feels like a new card.
  const qcard=document.getElementById("q-text-display").parentElement;
  qcard.classList.remove("q-enter"); void qcard.offsetWidth; qcard.classList.add("q-enter");
  const img=document.getElementById("q-img-display");
  if(q.image){ img.src=q.image; img.style.display="block"; } else img.style.display="none";
  const aw=document.getElementById("q-audio-wrap");
  if(aw) aw.innerHTML = q.audio ? '<audio controls preload="metadata" src="'+escapeHtml(q.audio)+'"></audio>' : "";
  const area=document.getElementById("q-answer-area");
  const existing=STUDENT.answers[pos];
  const dis=locked?" disabled":"";
  if(q.type==="mcq"){
    area.innerHTML=q.options.map(opt=>'<button type="button" class="option-btn '+(existing===opt?"selected":"")+'"'+dis+' onclick="selectAnswer('+JSON.stringify(opt).replace(/"/g,"&quot;")+', this)">'+escapeHtml(opt)+'</button>').join("");
  } else if(q.type==="tf"){
    area.innerHTML=["True","False"].map(opt=>'<button type="button" class="option-btn '+(existing===opt?"selected":"")+'"'+dis+' onclick="selectAnswer(\''+opt+'\', this)">'+opt+'</button>').join("");
  } else if(q.type==="text"){
    area.innerHTML='<input type="text" id="free-answer"'+dis+' value="'+escapeHtml(existing||"")+'" oninput="STUDENT.answers[STUDENT.currentPos]=this.value; refreshPalette(); syncProgress();">';
  } else if(q.type==="numeric"){
    area.innerHTML='<input type="number" step="any" id="free-answer"'+dis+' value="'+escapeHtml(existing||"")+'" oninput="STUDENT.answers[STUDENT.currentPos]=this.value; refreshPalette(); syncProgress();">';
  } else if(q.type==="order"){
    renderOrderArea(pos, q, locked);
  }
  if(locked){ const note=document.createElement("p"); note.className="sub"; note.style.color="var(--danger)"; note.textContent="Time's up on this question — it's locked."; area.appendChild(note); }
  setupQuestionTimer(pos, q, locked);
  renderPalette();
}

// Drag-to-order rendering (SortableJS with ▲▼ button fallback).
function renderOrderArea(pos, q, locked){
  const area=document.getElementById("q-answer-area");
  let arrangement=Array.isArray(STUDENT.answers[pos]) ? STUDENT.answers[pos] : shuffle((q.items||[]).slice());
  STUDENT.answers[pos]=arrangement; // counts as attempted + persists arrangement
  const list=document.createElement("div"); list.className="order-list"; list.id="order-sortable";
  arrangement.forEach((val,idx)=>{
    const row=document.createElement("div"); row.className="order-item"; row.setAttribute("data-val", val);
    const grip=document.createElement("span"); grip.className="grip"; grip.textContent="⋮⋮";
    const txt=document.createElement("span"); txt.className="ord-text"; txt.textContent=val;
    const btns=document.createElement("span"); btns.className="ord-btns";
    const up=document.createElement("button"); up.type="button"; up.textContent="▲"; up.onclick=()=>moveOrderItem(pos,idx,-1);
    const dn=document.createElement("button"); dn.type="button"; dn.textContent="▼"; dn.onclick=()=>moveOrderItem(pos,idx,1);
    btns.appendChild(up); btns.appendChild(dn);
    row.appendChild(grip); row.appendChild(txt); if(!locked) row.appendChild(btns);
    list.appendChild(row);
  });
  area.innerHTML="";
  const hint=document.createElement("small"); hint.className="hint"; hint.textContent="Drag the rows (or use ▲▼) to put them in the correct order.";
  area.appendChild(hint); area.appendChild(list);
  if(!locked && typeof Sortable!=="undefined"){
    if(STUDENT._sortable){ try{ STUDENT._sortable.destroy(); }catch(e){} }
    STUDENT._sortable=Sortable.create(list,{ animation:150, handle:".order-item", onEnd:()=>readOrderFromDOM(pos) });
  }
}

function readOrderFromDOM(pos){
  const list=document.getElementById("order-sortable"); if(!list) return;
  STUDENT.answers[pos]=[...list.querySelectorAll(".order-item")].map(el=>el.getAttribute("data-val"));
  refreshPalette(); syncProgress();
}

function moveOrderItem(pos,idx,dir){
  const arr=STUDENT.answers[pos].slice(); const j=idx+dir;
  if(j<0||j>=arr.length) return;
  [arr[idx],arr[j]]=[arr[j],arr[idx]];
  STUDENT.answers[pos]=arr;
  const q=STUDENT.questions[STUDENT.order[pos]];
  renderOrderArea(pos, q, false);
  syncProgress();
}

// Per-question countdown: active only in student-paced (open) mode when the question has a limit.
function setupQuestionTimer(pos, q, locked){
  clearQuestionTimer();
  const pill=document.getElementById("q-timer");
  if(STUDENT.paced || !q.timeLimitSec || q.timeLimitSec<=0 || locked || STUDENT.isPaused){ pill.style.display = STUDENT.isPaused?pill.style.display:"none"; return; }
  if(!STUDENT.qDeadlines[pos]) STUDENT.qDeadlines[pos]=Date.now()+q.timeLimitSec*1000;
  pill.style.display="inline-block";
  const tick=()=>{
    const remain=Math.max(0,(STUDENT.qDeadlines[pos]-Date.now())/1000);
    pill.textContent="⏱ "+fmtTime(remain);
    if(remain<=0){ clearQuestionTimer(); STUDENT.qLocked[pos]=true;
      if(STUDENT.currentPos < STUDENT.order.length-1) goToQuestion(STUDENT.currentPos+1);
      else renderCurrentQuestion();
    }
  };
  tick();
  STUDENT.qTimerInterval=setInterval(tick,250);
}

function selectAnswer(val,btn){
  if(btn.disabled) return;
  STUDENT.answers[STUDENT.currentPos]=val;
  document.querySelectorAll("#q-answer-area .option-btn").forEach(b=>b.classList.remove("selected"));
  btn.classList.add("selected");
  refreshPalette(); syncProgress();
}

function renderPalette(){
  const wrap=document.getElementById("q-bar");
  if(!wrap) return;
  wrap.innerHTML="";
  const total=STUDENT.order.length;
  STUDENT.order.forEach((_,i)=>{
    const answered=STUDENT.answers[i]!==undefined && STUDENT.answers[i]!=="";
    const b=document.createElement("button"); b.type="button";
    const lockedCls=(STUDENT.qLocked&&STUDENT.qLocked[i])?"locked ":"";
    b.className=lockedCls+(answered?"answered ":"")+(i===STUDENT.currentPos?"current":"");
    b.title="Question "+(i+1)+(answered?" · answered":"");
    b.setAttribute("aria-label", b.title);
    b.appendChild(document.createElement("i"));
    b.onclick=()=>{ if(!STUDENT.paced) goToQuestion(i); };
    wrap.appendChild(b);
  });
  const prev=document.getElementById("q-prev"), next=document.getElementById("q-next");
  if(prev) prev.disabled = STUDENT.currentPos<=0;
  if(next){
    const last = STUDENT.currentPos>=total-1;
    next.disabled = last;
    next.textContent = last ? "Last question" : "Next question \u2192";
  }
}

function refreshPalette(){ renderPalette(); }


/* Scoring (shared by student submit + teacher fallback) */
function scoreAnswers(questions, order, answers, timeSpent){
  let score=0, totalPossible=0;
  const answerRows=order.map((qIndex,pos)=>{
    const q=questions[qIndex]||{};
    const given=answers?answers[pos]:undefined;
    let isCorrect=false; totalPossible+=(q.points||0);
    if(q.type==="mcq"||q.type==="tf"){ isCorrect=given!==undefined&&given===q.correct; }
    else if(q.type==="text"){
      const g=(given||"").trim();
      if(q.caseSensitive===false){ const norm=g.toLowerCase(); isCorrect=(q.correct||[]).some(c=>String(c).trim().toLowerCase()===norm); }
      else { isCorrect=(q.correct||[]).some(c=>String(c).trim()===g); }
    }
    else if(q.type==="numeric"){ if(given!==undefined&&given!=="") isCorrect=Math.abs(parseFloat(given)-q.correct)<=(q.tolerance||0); }
    else if(q.type==="order"){ const corr=q.correct||q.items||[]; isCorrect=Array.isArray(given)&&given.length===corr.length&&given.every((v,idx)=>v===corr[idx]); }
    const pointsAwarded=isCorrect?(q.points||0):0; score+=pointsAwarded;
    return { questionIndex:qIndex, answer:given===undefined?"":given, isCorrect, pointsAwarded, timeSpentSec:(timeSpent&&timeSpent[pos])||0 };
  });
  const percentage=totalPossible>0?(score/totalPossible*100):0;
  return { answerRows, score, totalPossible, percentage };
}

// Confirmation before a student submits manually (auto-submit on time-up/teacher-end skips this).
function studentConfirmSubmit(){
  if(STUDENT.isPaused){ alert("The test is paused by your teacher. Please wait."); return; }
  const total=STUDENT.order.length;
  const answered=STUDENT.order.filter((_,i)=>STUDENT.answers[i]!==undefined && STUDENT.answers[i]!=="").length;
  const unanswered=total-answered;
  let msg="Submit your test now? You won't be able to change your answers afterwards.";
  if(unanswered>0) msg=unanswered+" of "+total+" question(s) are still unanswered.\n\n"+msg;
  STUDENT._suppressCheat=true;               // the dialog blurs the window; don't log that as a cheat
  const go=confirm(msg);
  STUDENT._suppressCheat=false;
  if(go) studentSubmitTest(false);
}

async function studentSubmitTest(auto){
  if(STUDENT.finished) return;
  STUDENT.finished=true;
  stopStudentStatusPolling();
  if(!auto && document.fullscreenElement) document.exitFullscreen && document.exitFullscreen();
  if(STUDENT.timerInterval) clearInterval(STUDENT.timerInterval);
  if(STUDENT.checkpointInterval) clearInterval(STUDENT.checkpointInterval);
  clearQuestionTimer();
  if(_focusPoll){ clearInterval(_focusPoll); _focusPoll=null; }
  if(_vpTimer){ clearTimeout(_vpTimer); _vpTimer=null; }
  if(_fsGraceTimer){ clearTimeout(_fsGraceTimer); _fsGraceTimer=null; }
  hideFSOverlay();
  STUDENT.isPaused=false;
  const _po=document.getElementById("pause-overlay"); if(_po) _po.style.display="none";
  (window.visualViewport || window).removeEventListener("resize", onViewportResize);
  if(STUDENT.questionStartTs!==null){
    const elapsed=(Date.now()-STUDENT.questionStartTs)/1000;
    STUDENT.timeSpent[STUDENT.currentPos]=(STUDENT.timeSpent[STUDENT.currentPos]||0)+elapsed;
  }
  const {answerRows,score,totalPossible,percentage}=scoreAnswers(STUDENT.questions,STUDENT.order,STUDENT.answers,STUDENT.timeSpent);
  const result={ surname:STUDENT.surname, firstName:STUDENT.firstName, score, totalPossible, percentage, answers:answerRows, cheatAlerts:STUDENT.cheatAlerts, finishedAt:Date.now() };
  try{ await Backend.submitResult(STUDENT.runId, STUDENT.id, STUDENT.surname, STUDENT.firstName, result); }catch(e){ console.warn(e); }
  const correct=answerRows.filter(r=>r.isCorrect).length;
  const totalSec=Math.round(answerRows.reduce((t,r)=>t+(r.timeSpentSec||0),0));
  document.getElementById("fb-name").textContent=STUDENT.firstName||STUDENT.name;
  document.getElementById("fb-score").textContent=score+" / "+totalPossible+" pts";
  document.getElementById("fb-percentage").textContent=Math.round(percentage)+"%";
  document.getElementById("fb-correct").textContent=correct;
  document.getElementById("fb-missed").textContent=answerRows.length-correct;
  document.getElementById("fb-time").textContent=Math.floor(totalSec/60)+":"+String(totalSec%60).padStart(2,"0");
  showScreen("screen-student-feedback");
}
