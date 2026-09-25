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
  setupCode.textContent=t("test.code_is", "Code \u00b7 {code}", {code:code}); setupCode.style.display="inline-block";
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
    schoolSel.innerHTML = '<option value="">'+t("poll.select_school", '— select a school —')+'</option>';
    (ss.schools||[]).forEach(n=>{ const o=document.createElement("option"); o.value=n; o.textContent=n; schoolSel.appendChild(o); });
    document.getElementById("teacher-quiz-select").innerHTML = '<option value="">'+t("poll.select_school_first", '— select a school first —')+'</option>';
  }catch(e){ console.warn(e); }
}

function teacherQuizPicked(){ TEACHER.questions=[]; teacherResetStep2(); }

function filterTeacherQuizzes(){
  const school = document.getElementById("teacher-school-select").value;
  const qSel = document.getElementById("teacher-quiz-select");
  TEACHER.questions = []; TEACHER.school = school;
  teacherResetStep2();
  qSel.innerHTML = '<option value="">'+t("test.select_quiz", '— select a quiz —')+'</option>';
  if(!school) return;
  // Only quizzes. This used to exclude polls by name, which let every later kind through —
  // role plays turned up in the Launch Test list. Name what belongs, not what does not.
  TEACHER_QUIZZES.filter(q=>q.kind==="quiz" && (q.schools||[]).includes(school)).sort((a,b)=>a.name.localeCompare(b.name)).forEach(q=>{
    const o=document.createElement("option"); o.value=q.key;
    o.textContent = q.name + " (" + t("poll.n_questions", "{count} {questions}", { count:q.count, questions: plural(q.count, t("poll.question", "question"), t("poll.questions", "questions")) }) + ")";
    qSel.appendChild(o);
  });
}

async function loadQuizForTeacher(){
  const key = document.getElementById("teacher-quiz-select").value;
  const status = document.getElementById("teacher-quiz-status");
  if(!key){ alert(t("test.pick_school_quiz_first", "Pick a school and a quiz first.")); return; }
  try{
    const quiz = await Backend.getQuiz(key);
    if(!quiz){ alert(t("test.quiz_could_found", "That quiz could not be found.")); TEACHER.questions=[]; return; }
    TEACHER.questions = (quiz.questions||[]).map(q=>Object.assign({},q,{id:q.id||"q_"+uid(6)}));
    // The run is tagged with the school the teacher selected (a quiz may serve several schools).
    TEACHER.school = document.getElementById("teacher-school-select").value || quizSchools(quiz)[0] || "";
    status.textContent = t("test.selected_n_questions", "\u2713 Selected \u2014 {count} {questions}. Set up below.", { count:TEACHER.questions.length, questions: plural(TEACHER.questions.length, t("poll.question", "question"), t("poll.questions", "questions")) });
    status.style.display = "flex";
    document.getElementById("teacher-select-quiz-btn").style.display = "none";
    document.getElementById("setup-step2").style.display = "block";
    applyPerQuestionTimerLock();
  }catch(e){ alert(t("poll.load_failed", "Load failed: ")+e.message); }
}


/* ============ TEACHER: START / DASHBOARD (polling) ============ */
// Open the waiting room: session is created in "waiting" status so students who join
// wait in the lobby. The teacher starts the actual test with teacherBeginQuiz().
async function teacherStartTest(){
  if(TEACHER.questions.length===0){ alert(t("test.choose_quiz_dropdown_first", "Choose a quiz from the dropdown first.")); return; }
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
    // Every run says what it is. Until v3.4.1 a test left this out, because the student
    // router treated "no kind" as a test by default — see runKind() in core/registry.js.
    kind:"quiz",
    status:"waiting", currentIndex:0, startedAt:null
  };
  TEACHER.settings=settings;
  TEACHER.runId = TEACHER.sessionCode + "-" + Date.now().toString(36).toUpperCase();
  try{ await Backend.createSession(TEACHER.runId, TEACHER.sessionCode, settings, TEACHER.questions); }
  catch(e){ alert(t("test.couldn_t_open_waiting_room", "Couldn't open the waiting room: ")+e.message); return; }
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
  if(!confirm((n===0
    ? t("test.no_students_joined_yet", "No students have joined yet.")
    : t("test.n_students_connected", "{count} {students} connected.", { count:n, students: plural(n, t("poll.student", "student"), t("poll.students", "students")) }))
    + " " + t("test.start_for_everyone_now", "Start the test for everyone now?"))) return;
  TEACHER.settings.status="active";
  TEACHER.settings.currentIndex=0;
  TEACHER.settings.startedAt=Date.now();
  if(TEACHER.settings.teams){
    // Lock the draw. From here the map only ever grows, for students who join late.
    TEACHER.settings.teamCount=TEAM_DRAFT.count;
    TEACHER.settings.teamMap=topUpTeams(Object.assign({}, TEAM_DRAFT.map||{}), DASH_PARTICIPANTS, TEAM_DRAFT.count);
  }
  try{ await Backend.updateMeta(TEACHER.runId, TEACHER.settings); }
  catch(e){ alert(t("test.couldn_t_start_test", "Couldn't start test: ")+e.message); return; }
  showDashboardRunning();
  startTeacherCountdown();
}


/* Dresses the dashboard for a test that is under way. Split out of teacherBeginQuiz so that
   rejoining a session after closing the app rebuilds exactly the same controls, rather than a
   second, slightly different version of them that drifts out of step over time. */
function showDashboardRunning(){
  document.getElementById("dash-mode-note").textContent = TEACHER.settings.paced
    ? t("test.paced_mode_note", "Paced mode: use Next/Previous to move the whole class together.")
    : t("test.free_navigation_note", "Free navigation: students move at their own pace.");
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
  document.getElementById("dash-cd-limit").textContent=t("test.n_min", "{n} min", {n:mins});
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
  if(TEACHER.settings.paused) txt=t("test.clock_paused", "Clock paused \u2014 students\u2019 timers are frozen too.");
  else if(out) txt=t("test.time_is_up_auto_submitted", "Time is up \u2014 papers were auto-submitted. End the test to see the recap.");
  else if(low) txt=t("test.under_five_minutes", "Under 5 minutes remaining.");
  note.textContent=txt;
  note.style.color = out?"var(--magenta)":"var(--amber)";
  note.style.display = txt?"block":"none";
}

// Freeze / unfreeze every student's timers.
async function teacherTogglePause(){
  const paused = !TEACHER.settings.paused;
  TEACHER.settings.paused = paused;
  try{ await Backend.updateMeta(TEACHER.runId, TEACHER.settings); }
  catch(e){ TEACHER.settings.paused=!paused; alert(t("test.couldn_t", "Couldn't ")+(paused?"pause":"resume")+": "+e.message); return; }
  const btn=document.getElementById("dash-pause-btn");
  btn.textContent = paused ? t("test.resume_test", "\u25b6 Resume Test") : t("test.pause_timers", "\u23f8 Pause Timers");
  btn.className = paused ? "btn-primary" : "btn-secondary";
  document.getElementById("dash-pause-note").textContent = paused
    ? t("test.paused_note", "Test is paused \u2014 students see a waiting screen and their timers are frozen.")
    : t("test.pause_hint", "Freezes the overall and per-question timers for everyone. Students see a \u201cpaused\u201d screen and can\u2019t answer until you resume.");
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
    dashboardFeedOk();
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
  }, err => dashboardFeedFailed(err));
}

function stopDashboardPolling(){ if(DASH_UNSUB){ DASH_UNSUB(); DASH_UNSUB=null; } stopTeacherCountdown(); }

/* An empty room and an unreadable one look identical on a dashboard, and the difference decides
   whether a teacher starts the test. So the dashboard says which it is. */
function dashboardFeedOk(){
  const w=document.getElementById("dash-feed-warning");
  if(w) w.style.display="none";
}
function dashboardFeedFailed(err){
  DASH_PARTICIPANTS=[];
  renderDashboardList();
  const w=document.getElementById("dash-feed-warning");
  if(!w) return;
  w.textContent = t("test.dashboard_feed_failed",
    "This list cannot be read from the database, so it is not showing who has joined \u2014 the room may well not be empty. {why}",
    { why:(err&&err.message)||err||"" });
  w.style.display="block";
}


// Live progress for one student: how many answered, and how many of those are right/wrong.
// Scored against the teacher's own copy of the questions, so it also works mid-test.
function participantProgress(p, questions){
  const total=(questions||[]).length;
  const secs=acc=>acc?" · "+Math.round(acc)+"s":"";
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
    if(has){ answered++; if(row.isCorrect){ correct++; cls="ok"; what=t("test.sq_correct", "correct"); } else { cls="no"; what=t("test.sq_wrong", "wrong"); } }
    else if(at!==undefined && pos<at){ cls="seen"; what=t("test.sq_skipped", "skipped"); }
    else { cls=""; what=t("test.sq_not_reached", "not reached"); }
    if(pos===at) cls=(cls+" now").trim();
    return { cls, tip: t("test.sq_tip", "Q{n} \u00b7 {what}", {n:pos+1, what:what}) + secs(spent[pos])
                      + (pos===at ? t("test.sq_here_now", " \u00b7 here now") : "") };
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
  document.querySelectorAll("#dash-student-list .qtrack").forEach(acc=>{
    acc.style.transform="translateX("+(-QGRID_OFFSET*QCELL)+"px)";
  });
  const prev=document.getElementById("qnav-prev"), next=document.getElementById("qnav-next"),
        label=document.getElementById("qnav-label");
  if(prev) prev.disabled = QGRID_OFFSET<=0;
  if(next) next.disabled = QGRID_OFFSET>=max;
  if(label) label.textContent = total>vis
    ? t("test.q_range_of_total", "Q{from}\u2013{to} of {total}", {from:QGRID_OFFSET+1, to:Math.min(total, QGRID_OFFSET+vis), total:total})
    : t("test.questions_label", "Questions");
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
      const none=document.createElement("span"); none.className="qnone"; none.textContent=t("test.started", "Not started");
      qg.appendChild(none);
    }

    // One status pill: alerts outrank everything, then done / disconnected / in progress.
    const st=document.createElement("span");
    const pill=document.createElement("span");
    const waiting = (TEACHER.settings||{}).status==="waiting";
    if(alerts>0){ pill.className="pill alert"; pill.textContent=t("test.n_alerts_warn", "\u26a0 {count} {alerts}", { count:alerts, alerts: plural(alerts, t("test.alert", "alert"), t("test.alerts", "alerts")) }); }
    else if(p.result){ pill.className="pill done"; pill.textContent=t("test.done", "✓ Done"); }
    else if(stale){ pill.className="pill alert"; pill.textContent=t("test.dropped", "⚠ Dropped"); }
    else if(waiting){ pill.className="pill wait"; pill.textContent=t("test.waiting_room", "In waiting room"); }
    else { pill.className="pill live"; pill.innerHTML='<i></i>In test'; }
    st.appendChild(pill);

    const sc=document.createElement("span"); sc.className="sc";
    sc.textContent = p.result ? Math.round(p.result.percentage)+"%" : "—";
    if(!p.result) sc.style.color="var(--ink-soft)";

    const ac=document.createElement("span"); ac.className="ac";
    if(alerts>0){
      const btn=document.createElement("button"); btn.className="btn-outline btn-mini";
      btn.textContent=t("test.reset", "Reset"); btn.title=t("test.clear_alerts_title", "Clear these alerts \u2014 monitoring stays on");
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
  dB.textContent=t("test.n_done", "{count} done", {count:doneN}); dB.style.display=doneN?"inline-block":"none";
  aB.textContent=t("test.n_alerts", "{count} {alerts}", { count:alertN, alerts: plural(alertN, t("test.alert", "alert"), t("test.alerts", "alerts")) }); aB.style.display=alertN?"inline-block":"none";
}

// Teacher clears a student's alerts (e.g. an accidental tab-switch), keeping monitoring live.
async function resetCheatFor(studentId){
  const p=DASH_PARTICIPANTS.find(x=>x.studentId===studentId); if(!p) return;
  if(!confirm(t("test.clear_students_alerts", "Clear {who}\u2019s cheat alerts?\n\nMonitoring stays on, so any new alert will still appear.", {who:displayName(p.surname,p.firstName)}))) return;
  const total=rawCheatAlerts(p).length;
  try{ await Backend.resetCheat(TEACHER.runId, studentId, total); }
  catch(e){ alert(t("test.reset_failed", "Reset failed: ")+e.message); return; }
  p.cheatBaseline=total; renderDashboardList();  // reflect immediately (live listener will confirm)
}

async function teacherEndTest(){
  if(!confirm(t("test.end_test_all_students_now", "End the test for all students now?"))) return;
  TEACHER.settings.status="ended";
  try{ await Backend.updateMeta(TEACHER.runId, TEACHER.settings); }catch(e){ console.warn(e); }
  document.getElementById("recap-code").textContent=TEACHER.sessionCode;
  setTimeout(showTeacherRecap, 3000);
}

function teacherLeaveDashboard(){ stopDashboardPolling(); showScreen("screen-role"); }

async function showTeacherRecap(){
  stopDashboardPolling();
  let participants=[], readFailed=null;
  try{ const r=await Backend.listParticipants(TEACHER.runId); participants=r.participants||[]; }
  catch(e){ console.warn(e); readFailed=e; }
  /* An empty results table is a claim: nobody sat this test. If the read was refused we cannot
     make that claim, and saying so is the difference between "nobody turned up" and "the marks
     are there and you cannot see them" — one of which needs the teacher to do something. */
  const warn=document.getElementById("recap-warning");
  if(warn){
    if(readFailed){
      warn.textContent=t("test.recap_read_failed",
        "The results could not be read from the database, so this table is empty for that reason \u2014 not because nobody sat the test. Nothing has been deleted. {why}",
        { why:(readFailed&&readFailed.message)||readFailed||"" });
      warn.style.display="block";
    } else warn.style.display="none";
  }
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
      +(done?"":'<span class="rk" style="grid-column:2/-1;color:var(--amber);font-weight:700;">'+escapeHtml(r.status||t("test.status_incomplete", "Incomplete"))+'</span>');
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
  const tag=(p,r)=>{ const acc=teamMap[p.studentId]; if(acc) r.team=acc; return r; };
  return participants.map(p=>{
    const base=p.cheatBaseline||0;  // teacher-cleared alerts are dropped from reports too
    if(p.result){
      const r=Object.assign({status:"Submitted", surname:p.surname, firstName:p.firstName}, p.result);
      r.cheatAlerts=(p.result.cheatAlerts||[]).slice(base);
      return tag(p,r);
    }
    if(p.progress){
      const scored=scoreAnswers(questions, p.progress.order||[], p.progress.answers||{}, p.progress.timeSpent||{});
      return tag(p, { surname:p.surname, firstName:p.firstName, status:t("test.status_incomplete_disconnected", "Incomplete (disconnected)"),
        score:scored.score, totalPossible:scored.totalPossible, percentage:scored.percentage,
        answers:scored.answerRows, cheatAlerts:(p.progress.cheatAlerts||[]).slice(base), finishedAt:p.lastSeen });
    }
    return tag(p, { surname:p.surname, firstName:p.firstName, status:t("test.status_joined_no_answers", "Joined (no answers)"),
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
  document.getElementById("join-btn").textContent = t("test.join", "Join");
  if(first){ const s=document.getElementById("s-surname"); if(s&&s.focus) try{ s.focus(); }catch(e){} }
}

async function studentJoin(){
  const code=document.getElementById("s-session-code").value.trim().toUpperCase();
  let surname=document.getElementById("s-surname").value.trim();
  let firstName=document.getElementById("s-firstname").value.trim();
  if(!code){ document.getElementById("join-status").textContent=t("test.enter_session_code_teacher_showing", "Enter the session code your teacher is showing."); return; }
  document.getElementById("join-status").textContent="";
  // A name is required for tests and named polls, but an anonymous poll needs only the code —
  // so the session is resolved first and the name checked afterwards (see below).
  STUDENT.sessionCode=code; STUDENT.surname=surname; STUDENT.firstName=firstName; STUDENT.name=displayName(surname,firstName);
  // Identity: when live, use the Firebase sign-in uid so the security rules can allow a student
  // to write ONLY their own record. Firebase persists the anonymous account in this browser, so a
  // refresh or brief disconnect returns the same uid and the same attempt. Demo mode falls back
  // to a locally stored id.
  await Backend._ready();
  /* Which identity the student writes under.

     Normally the anonymous Firebase account: the rules let a student write only the record
     whose key matches their own uid, so the uid IS the identity.

     The exception is the teacher's own machine. A browser profile holds one Firebase account,
     so once a teacher has signed in, every tab in that profile is that teacher — including one
     joining as a student. Using their uid would file the teacher as a member of their own
     class, and their second attempt would overwrite the first. A signed-in teacher is allowed
     by the rules to write any participant key, so they get a local one instead, which is also
     what lets one machine hold several test attempts. */
  const signedInTeacher = !!(typeof TEACHER_USER !== "undefined" && TEACHER_USER && TEACHER_USER.uid);
  STUDENT.id = (signedInTeacher ? null : Backend.uid())
            || localStorage.getItem("examFB_id_"+code)
            || ("s_"+uid(8));
  localStorage.setItem("examFB_id_"+code, STUDENT.id);
  let session;
  try{ session=await Backend.getActiveSession(code); }catch(e){ alert(t("test.couldn_t_reach_session", "Couldn't reach the session: ")+e.message); return; }
  if(!session||!session.meta||!session.runId){ alert(t("test.session_found_check_code_teacher", "Session not found. Check the code with your teacher.")); return; }
  STUDENT.runId=session.runId; STUDENT.meta=session.meta;

  // ---- Any registered activity: poll, role play, whatever comes next ----
  // The router asks the registry rather than naming activities one at a time, so a new
  // module does not mean editing this function. A test is the default path below.
  const kind = runKind(session.meta);
  const act = activity(kind);
  if(act && act.join){
    const what = activityLabel(kind).toLowerCase();
    if(session.meta.status==="ended"){ alert(t("test.that_has_finished", "That {what} has finished.", {what:what})); return; }
    if(act.anonymous && act.anonymous(session.meta)){
      // Nothing identifying is stored, and the name boxes are never shown.
      surname=""; firstName=""; STUDENT.surname=""; STUDENT.firstName=""; STUDENT.name="";
    } else if(!act.requiresName || act.requiresName(session.meta)){
      if(!surname || !firstName){ askForName(t("test.this_needs_your_name", "This {what} needs your name.", {what:what})); return; }
    }
    await act.join(session, surname, firstName);
    return;
  }

  // Unreachable in practice: "quiz" is registered at the bottom of this file, so the branch
  // above handles it. Kept as a named failure rather than a silent fall-through, because a
  // session whose kind nothing claims is a data problem, not a student problem.
  alert(t("test.session_kind_app_does_recognise_please", "This session is a kind the app does not recognise. Please check with your teacher."));
}

/* A student joining a test. Registered as the "quiz" activity, so the router above reaches it
   the same way it reaches a poll or a role play. */
async function testStudentJoin(session, surname, firstName){
  const code = STUDENT.sessionCode;
  if(session.meta.status==="ended"){ alert(t("test.test_already_ended_please_check_teacher", "That test has already ended. Please check with your teacher.")); return; }
  if(!surname||!firstName){ askForName(t("test.enter_your_name_to_join", "Enter your surname and first name to join this test.")); return; }
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
  /* Joining is the one write that has to succeed before the student is told they are in.
     It used to be swallowed: the waiting room appeared either way, so a refused write left a
     student sitting quietly in front of a screen that said "waiting for your teacher" while
     the teacher's dashboard showed an empty room. Neither of them could see the problem. */
  try{
    await Backend.joinSession(STUDENT.runId, STUDENT.id, surname, firstName, true);
  }catch(e){
    console.warn(e);
    alert(t("test.join_write_failed",
      "You are not in the room yet \u2014 the database refused to record you.\n\n{why}\n\nTell your teacher, and try the code again.",
      { why:(e&&e.message)||e }));
    return;
  }
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
      if(waitStatus) waitStatus.textContent=t("test.waiting_teacher_start_test", "Waiting for your teacher to start the test…");
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
        ? t("test.reconnected_picking_up", "You were disconnected \u2014 picking up where you left off\u2026")
        : t("test.teacher_started_opening", "Your teacher has started the test. Opening it now\u2026");
      if(startBtn) startBtn.style.display="none";
      if(startHint) startHint.style.display="none";
      studentBeginTest();
    }
    // Missed the start entirely (joined after it already ended).
    if(meta.status==="ended" && !STUDENT.testStarted && !STUDENT.finished){
      if(startBtn) startBtn.style.display="none";
      if(startHint) startHint.style.display="none";
      if(waitStatus) waitStatus.textContent=t("test.test_already_ended_please_check_teacher_2", "This test has already ended. Please check with your teacher.");
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
  const totalSec=Math.round(rows.reduce((acc,r)=>acc+(r.timeSpentSec||0),0));
  document.getElementById("fb-name").textContent=STUDENT.firstName||STUDENT.name;
  document.getElementById("fb-score").textContent=t("test.score_out_of", "{score} / {total} pts", {score:result.score||0, total:result.totalPossible||0});
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
  document.getElementById("test-progress").textContent=t("test.question_x_of_y", "Question {n} of {total}", {n:pos+1, total:STUDENT.order.length});
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
    // NO_KEYBOARD_HELP is not decoration: with autocapitalise on, a student who does not
    // know that nationalities take a capital types "french" and the phone hands them the
    // mark. See core/answers.js.
    area.innerHTML='<input type="text" id="free-answer" '+NO_KEYBOARD_HELP+dis+' value="'+escapeHtml(existing||"")+'" oninput="STUDENT.answers[STUDENT.currentPos]=this.value; refreshPalette(); syncProgress();">';
  } else if(q.type==="numeric"){
    // Deliberately not type="number": that lets the browser normalise or discard what was
    // typed before marking sees it, and whether 3,5 survives depends on the phone's locale.
    // We take the raw string and judge it ourselves. inputmode keeps the numeric keypad.
    area.innerHTML='<input type="text" inputmode="decimal" id="free-answer" '+NO_KEYBOARD_HELP+dis+' value="'+escapeHtml(existing||"")+'" oninput="STUDENT.answers[STUDENT.currentPos]=this.value; refreshPalette(); syncProgress();">';
  } else if(q.type==="order"){
    renderOrderArea(pos, q, locked);
  }
  if(locked){ const note=document.createElement("p"); note.className="sub"; note.style.color="var(--danger)"; note.textContent=t("test.time_s_up_question_s_locked", "Time's up on this question — it's locked."); area.appendChild(note); }
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
  const hint=document.createElement("small"); hint.className="hint"; hint.textContent=t("test.drag_rows_use_put_them_correct", "Drag the rows (or use ▲▼) to put them in the correct order.");
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
    b.title=t("test.question_n", "Question {n}", {n:i+1}) + (answered ? t("test.dot_answered", " \u00b7 answered") : "");
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
    next.textContent = last ? t("test.last_question", "Last question") : t("test.next_question", "Next question \u2192");
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
    // Both of these live in core/answers.js, because the Excel import has to agree with
    // marking about what a number is. See that file before loosening anything here.
    else if(q.type==="text"){ isCorrect=matchTextAnswer(given, q.correct, q.caseSensitive); }
    else if(q.type==="numeric"){ isCorrect=markNumeric(given, q.correct, q.tolerance, answerLang(q)); }
    else if(q.type==="order"){ const corr=q.correct||q.items||[]; isCorrect=Array.isArray(given)&&given.length===corr.length&&given.every((v,idx)=>v===corr[idx]); }
    const pointsAwarded=isCorrect?(q.points||0):0; score+=pointsAwarded;
    return { questionIndex:qIndex, answer:given===undefined?"":given, isCorrect, pointsAwarded, timeSpentSec:(timeSpent&&timeSpent[pos])||0 };
  });
  const percentage=totalPossible>0?(score/totalPossible*100):0;
  return { answerRows, score, totalPossible, percentage };
}

// Confirmation before a student submits manually (auto-submit on time-up/teacher-end skips this).
function studentConfirmSubmit(){
  if(STUDENT.isPaused){ alert(t("test.test_paused_teacher_please_wait", "The test is paused by your teacher. Please wait.")); return; }
  const total=STUDENT.order.length;
  const answered=STUDENT.order.filter((_,i)=>STUDENT.answers[i]!==undefined && STUDENT.answers[i]!=="").length;
  const unanswered=total-answered;
  let msg=t("test.submit_confirm", "Submit your test now? You won\u2019t be able to change your answers afterwards.");
  if(unanswered>0) msg=t("test.n_of_m_unanswered", "{count} of {total} {questions} are still unanswered.",
    { count:unanswered, total:total, questions: plural(unanswered, t("poll.question", "question"), t("poll.questions", "questions")) })+"\n\n"+msg;
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
  const totalSec=Math.round(answerRows.reduce((acc,r)=>acc+(r.timeSpentSec||0),0));
  document.getElementById("fb-name").textContent=STUDENT.firstName||STUDENT.name;
  document.getElementById("fb-score").textContent=t("test.score_out_of", "{score} / {total} pts", {score:score, total:totalPossible});
  document.getElementById("fb-percentage").textContent=Math.round(percentage)+"%";
  document.getElementById("fb-correct").textContent=correct;
  document.getElementById("fb-missed").textContent=answerRows.length-correct;
  document.getElementById("fb-time").textContent=Math.floor(totalSec/60)+":"+String(totalSec%60).padStart(2,"0");
  showScreen("screen-student-feedback");
}


/* Picking a test back up after the teacher left the dashboard. The run's own record is the
   source of truth — questions, settings and pace all come back from the database, not from
   whatever this browser last remembered. Moved here from core/session.js in v3.3: it was the
   core's default branch, which is precisely what a registered activity is for. */
function testRejoin(s, run){
  TEACHER.sessionCode = run.code || s.code;
  TEACHER.runId = s.runId;
  TEACHER.questions = run.questions || [];
  TEACHER.settings = run.meta;
  TEACHER.school = run.meta.school || "";
  const dashCode=document.getElementById("dash-session-code");
  if(dashCode) dashCode.textContent = TEACHER.sessionCode;
  showScreen("screen-teacher-dashboard");
  restoreDashboardForState();
  startDashboardPolling();
}

/* The test, registered like everything else. It was the default path until v3.3, which meant
   the contract was true of every activity except the one it was designed around. `keeps:true`
   because a finished test is archived: it holds marks, and the marks are the point. */
registerActivity("quiz", {
  join: testStudentJoin,
  teacher: teacherCreateSession,
  score: scoreAnswers,
  finish: teacherEndTest,
  rejoin: testRejoin,
  label: "Test",
  keeps: true
});
