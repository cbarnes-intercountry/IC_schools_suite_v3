/* ============================================================================
   Classroom Exam App — modules/poll.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Live polls and word clouds. */

/* Reveal is tri-state, not a plain flag: results are revealed by default, the question's own
   "hide results until I press Reveal" setting flips that default, and the teacher's
   Reveal/Hide button overrides either of them. Without this, a live question could never be
   hidden again mid-discussion. */
function pollRevealState(meta, idx, q){
  const m=metaMap(meta,"revealed"), k=String(idx);
  if(Object.prototype.hasOwnProperty.call(m,k)) return !!m[k];
  return !(q && q.hideResults);
}


/* ============================================================================
   LIVE POLL — teacher side
   A poll run is an ordinary session (sessions/$runId + codeIndex + participants),
   tagged meta.kind="poll". That means it needs no new database path and therefore no
   change to the security rules. The teacher's meta writes are the single source of
   truth: which question is showing, whether it's locked, whether results are revealed,
   and which cloud words have been removed. Students only ever read meta and write
   their own vote. Nothing here is marked, and nothing survives Close Poll.
   ============================================================================ */
let POLL = { sessionCode:null, runId:null, questions:[], settings:{}, school:"", sets:[],
             participants:[], unsub:null, timerInt:null, projecting:false };


async function pollCreateSession(){
  if(!(await confirmNoOpenRun("poll"))) return;
  const code = genSessionCode();
  POLL = { sessionCode:code, runId:null, questions:[], settings:{}, school:"", sets:[],
           participants:[], unsub:null, timerInt:null, projecting:false };
  const c=document.getElementById("poll-setup-code");
  c.textContent=t("poll.code_is", "Code \u00b7 {code}", {code:code}); c.style.display="inline-block";
  pollResetStep2();
  await loadPollSetList();
  showScreen("screen-poll-setup");
}

async function loadPollSetList(){
  try{
    const [qs, ss] = await Promise.all([Backend.listQuizzes(), Backend.listSchools()]);
    POLL.sets = (qs.quizzes||[]).filter(q=>q.kind==="poll");
    const sel=document.getElementById("poll-school-select");
    sel.innerHTML = '<option value="">'+t("poll.select_school", '— select a school —')+'</option>';
    (ss.schools||[]).forEach(n=>{ const o=document.createElement("option"); o.value=n; o.textContent=n; sel.appendChild(o); });
    document.getElementById("poll-set-select").innerHTML = '<option value="">'+t("poll.select_school_first", '— select a school first —')+'</option>';
  }catch(e){ console.warn(e); }
}

function pollResetStep2(){
  const st=document.getElementById("poll-set-status");
  st.style.display="none"; st.textContent="";
  document.getElementById("poll-step2").style.display="none";
  document.getElementById("poll-select-btn").style.display="block";
}

function pollSetPicked(){ POLL.questions=[]; pollResetStep2(); }

function filterPollSets(){
  const school=document.getElementById("poll-school-select").value;
  const sel=document.getElementById("poll-set-select");
  POLL.questions=[]; POLL.school=school;
  pollResetStep2();
  sel.innerHTML='<option value="">'+t("poll.select_poll", '— select a poll —')+'</option>';
  const hint=document.getElementById("poll-none-hint");
  hint.style.display="none";
  if(!school) return;
  const mine=POLL.sets.filter(q=>(q.schools||[]).includes(school)).sort((a,b)=>a.name.localeCompare(b.name));
  if(mine.length===0){ hint.style.display="block"; return; }
  mine.forEach(q=>{
    const o=document.createElement("option"); o.value=q.key;
    o.textContent=q.name+" ("+t("poll.n_questions", "{count} {questions}", { count:q.count, questions: plural(q.count, t("poll.question", "question"), t("poll.questions", "questions")) })+")";
    sel.appendChild(o);
  });
}

async function loadPollSet(){
  const key=document.getElementById("poll-set-select").value;
  const status=document.getElementById("poll-set-status");
  if(!key){ alert(t("poll.pick_school_poll_first", "Pick a school and a poll first.")); return; }
  try{
    const set=await Backend.getQuiz(key);
    if(!set){ alert(t("poll.poll_could_found", "That poll could not be found.")); return; }
    const qs=(set.questions||[]).filter(q=>isPollType(q.type));
    if(qs.length===0){ alert(t("poll.set_no_poll_questions", "That set has no poll questions in it.")); return; }
    POLL.questions=qs.map(q=>Object.assign({},q,{id:q.id||"q_"+uid(6)}));
    POLL.name=set.name||t("poll.live_poll", "Live poll");
    POLL.school=document.getElementById("poll-school-select").value || quizSchools(set)[0] || "";
    status.textContent=t("poll.selected_n_questions", "\u2713 Selected \u2014 {count} {questions}.", { count:POLL.questions.length, questions: plural(POLL.questions.length, t("poll.question", "question"), t("poll.questions", "questions")) });
    status.style.display="flex";
    document.getElementById("poll-select-btn").style.display="none";
    document.getElementById("poll-step2").style.display="block";
  }catch(e){ alert(t("poll.load_failed", "Load failed: ")+e.message); }
}

// Open the poll: created in "waiting" so students gather before the first question shows.
async function pollStartSession(){
  if(POLL.questions.length===0){ alert(t("poll.choose_poll_set_first", "Choose a poll set first.")); return; }
  const anonymous=document.getElementById("poll-anon").checked;
  POLL.settings={
    kind:"poll", anonymous, status:"waiting", currentIndex:0,
    school:POLL.school||"", title:POLL.name||t("poll.live_poll", "Live poll"),
    teacherName:(TEACHER_USER&&TEACHER_USER.name)||"",
    teacherEmail:(TEACHER_USER&&TEACHER_USER.email)||"",
    locked:{}, revealed:{}, deadlines:{}, removed:{}, startedAt:null
  };
  POLL.runId = POLL.sessionCode+"-"+Date.now().toString(36).toUpperCase();
  try{ await Backend.createSession(POLL.runId, POLL.sessionCode, POLL.settings, POLL.questions); }
  catch(e){ alert(t("poll.couldn_t_open_poll", "Couldn't open the poll: ")+e.message); return; }
  document.getElementById("poll-live-code").textContent=POLL.sessionCode;
  document.getElementById("poll-live-mode").textContent=anonymous?t("poll.anonymous", "Anonymous"):t("poll.named", "Named");
  document.getElementById("poll-title").textContent=POLL.name||t("poll.live_poll", "Live poll");
  document.getElementById("poll-title-meta").textContent=
    t("poll.n_questions", "{count} {questions}", { count:POLL.questions.length, questions: plural(POLL.questions.length, t("poll.question", "question"), t("poll.questions", "questions")) })
    + (POLL.school ? " \u00b7 "+POLL.school : "");
  document.getElementById("poll-join-code").textContent=POLL.sessionCode;
  document.getElementById("poll-lobby").style.display="block";
  document.getElementById("poll-stage").style.display="none";
  document.getElementById("poll-controls").style.display="none";
  showScreen("screen-poll-live");
  renderPollQR();
  pollWatchParticipants();
}

function pollJoinUrl(){ return location.origin+location.pathname+"?join="+encodeURIComponent(POLL.sessionCode); }

function copyPollJoinLink(){
  const url=pollJoinUrl();
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(()=>alert(t("poll.join_link_copied", "Join link copied:\n")+url),()=>prompt(t("poll.copy_this_link", "Copy this link:"),url));
  else prompt(t("poll.copy_this_link", "Copy this link:"),url);
}

function renderPollQR(){
  const box=document.getElementById("poll-qr");
  box.innerHTML="";
  if(typeof QRCode==="undefined"){ box.innerHTML='<p class="sub">'+t("poll.qr_needs_internet_students_type_code", 'QR needs internet — students can type the code.')+'</p>'; return; }
  try{ new QRCode(box,{ text:pollJoinUrl(), width:190, height:190, correctLevel:QRCode.CorrectLevel.M }); }
  catch(e){ box.innerHTML='<p class="sub">'+t("poll.qr_unavailable_students_type_code", 'QR unavailable — students can type the code.')+'</p>'; }
}

function pollWatchParticipants(){
  if(POLL.unsub){ POLL.unsub(); POLL.unsub=null; }
  POLL.unsub=Backend.subscribeParticipants(POLL.runId, r=>{
    POLL.participants=r.participants||[];
    const n=POLL.participants.length;
    const lc=document.getElementById("poll-lobby-count");
    if(lc) lc.textContent = n;
    const ll=document.getElementById("poll-lobby-count-label");
    if(ll) ll.textContent = plural(n, t("poll.student_connected", "student connected"), t("poll.students_connected", "students connected"));
    renderPollStage();
  });
}

async function pollBegin(){
  const n=POLL.participants.length;
  if(!confirm((n===0
    ? t("poll.nobody_joined_yet", "Nobody has joined yet.")
    : t("poll.n_students_connected", "{count} {students} connected.", { count:n, students: plural(n, t("poll.student", "student"), t("poll.students", "students")) }))
    + " " + t("poll.start_the_poll_now", "Start the poll now?"))) return;
  POLL.settings.status="active";
  POLL.settings.currentIndex=0;
  POLL.settings.startedAt=Date.now();
  pollArmDeadline(0);
  try{ await Backend.updateMeta(POLL.runId, POLL.settings); }catch(e){ alert(t("poll.couldn_t_start", "Couldn't start: ")+e.message); return; }
  document.getElementById("poll-lobby").style.display="none";
  document.getElementById("poll-stage").style.display="block";
  document.getElementById("poll-controls").style.display="block";
  pollStartTimerTick();
  renderPollStage();
}

// A question with a time limit gets a wall-clock deadline the first time it is shown.
// Re-showing an earlier question does NOT restart its clock.
function pollArmDeadline(idx){
  const q=POLL.questions[idx];
  if(!q || !q.timeLimitSec || q.timeLimitSec<=0) return;
  POLL.settings.deadlines=POLL.settings.deadlines||{};
  if(!POLL.settings.deadlines[String(idx)]) POLL.settings.deadlines[String(idx)]=Date.now()+q.timeLimitSec*1000;
}

async function pollAdvance(dir){
  let idx=(POLL.settings.currentIndex||0)+dir;
  idx=Math.max(0, Math.min(POLL.questions.length-1, idx));
  if(idx===POLL.settings.currentIndex) return;
  POLL.settings.currentIndex=idx;
  pollArmDeadline(idx);
  try{ await Backend.updateMeta(POLL.runId, POLL.settings); }catch(e){ console.warn(e); }
  renderPollStage();
}

async function pollToggleLock(){
  const i=String(POLL.settings.currentIndex||0);
  POLL.settings.locked=POLL.settings.locked||{};
  if(POLL.settings.locked[i]) delete POLL.settings.locked[i]; else POLL.settings.locked[i]=true;
  try{ await Backend.updateMeta(POLL.runId, POLL.settings); }catch(e){ console.warn(e); }
  renderPollStage();
}

async function pollToggleReveal(){
  const idx=POLL.settings.currentIndex||0;
  // Write the new state explicitly (true OR false) rather than deleting the key, so it can
  // override a question that was built with "show results live" turned on.
  POLL.settings.revealed=POLL.settings.revealed||{};
  POLL.settings.revealed[String(idx)] = !pollRevealState(POLL.settings, idx, POLL.questions[idx]);
  try{ await Backend.updateMeta(POLL.runId, POLL.settings); }catch(e){ console.warn(e); }
  renderPollStage();
}

// Word removal is recorded in meta, so it sticks for every viewer and can't be undone
// by a late vote for the same word.
async function pollRemoveWord(word){
  if(!confirm(t("poll.remove_word_confirm", "Remove \u201c{word}\u201d from the cloud?\n\nThis cannot be undone for this poll.", {word:word}))) return;
  const i=String(POLL.settings.currentIndex||0);
  POLL.settings.removed=POLL.settings.removed||{};
  const list=(POLL.settings.removed[i]||[]).slice();
  if(list.indexOf(word)<0) list.push(word);
  POLL.settings.removed[i]=list;
  try{ await Backend.updateMeta(POLL.runId, POLL.settings); }catch(e){ console.warn(e); }
  renderPollStage();
}

/* ---- tally ---- */
// Everything the stage shows is derived from the participants snapshot, so the teacher's
// view and the projection can never drift apart.
function pollVotesFor(idx){
  const out=[];
  POLL.participants.forEach(p=>{
    const v=p.progress && p.progress.votes && p.progress.votes[String(idx)];
    if(v!==undefined && v!==null && v!=="") out.push(v);
  });
  return out;
}

function pollTallyChoice(q, votes){
  const counts={}; (q.options||[]).forEach(o=>counts[o]=0);
  votes.forEach(v=>{ if(counts[v]!==undefined) counts[v]++; });
  return counts;
}

function pollTallyCloud(votes, removed){
  const gone={}; (removed||[]).forEach(w=>gone[w]=true);
  const counts={};
  votes.forEach(v=>{
    const words=Array.isArray(v)?v:[v];
    words.forEach(w=>{ const n=normWord(w); if(!n||gone[n]) return; counts[n]=(counts[n]||0)+1; });
  });
  return counts;
}

/* ---- the stage (also the projection view) ---- */
function renderPollStage(){
  if(!POLL.runId || POLL.settings.status!=="active") return;
  const idx=POLL.settings.currentIndex||0;
  const q=POLL.questions[idx];
  if(!q) return;
  const locked=metaFlag(POLL.settings,"locked",idx);
  const revealed=pollRevealState(POLL.settings, idx, q);
  const votes=pollVotesFor(idx);
  const joined=POLL.participants.length;

  document.getElementById("poll-qpos").textContent="Q "+(idx+1)+" / "+POLL.questions.length;
  document.getElementById("poll-current-q").textContent="Q "+(idx+1)+" / "+POLL.questions.length;
  document.getElementById("poll-question").textContent=q.text||"";
  paintQuestionMedia(q, "poll-img", "poll-audio-wrap");
  const stateBadge=document.getElementById("poll-state-badge");
  stateBadge.textContent=locked?t("poll.locked", "Locked"):t("poll.open", "Open");
  stateBadge.className="badge"+(locked?" demo":" live");
  document.getElementById("poll-count-big").textContent = votes.length;
  document.getElementById("poll-response-count").textContent =
    joined
      ? t("poll.of_n_voted", "of {joined} voted", {joined:joined})
      : (q.type==="cloud"
          ? t("poll.words_in", "words in")
          : plural(votes.length, t("poll.response", "response"), t("poll.responses", "responses")));
  document.getElementById("poll-proj-qpos").textContent=t("poll.q_x_of_y", "Q {n} / {total}", {n:idx+1, total:POLL.questions.length});
  document.getElementById("poll-proj-lock").textContent = locked ? t("poll.unlock", "\ud83d\udd13 Unlock") : t("poll.lock", "\ud83d\udd12 Lock");
  document.getElementById("poll-lock-btn").textContent = locked ? t("poll.unlock_question", "\ud83d\udd13 Unlock Question") : t("poll.lock_question", "\ud83d\udd12 Lock Question");
  document.getElementById("poll-reveal-btn").textContent = revealed ? t("poll.hide_results", "Hide Results") : t("poll.reveal_results", "Reveal Results");
  // The projected bar mirrors the desk controls. It stays usable even when the question is
  // set to show results live, so results can still be hidden again mid-discussion.
  const pr=document.getElementById("poll-proj-reveal");
  pr.textContent = revealed ? t("poll.hide", "Hide") : t("poll.reveal", "Reveal");
  pr.className = revealed ? "btn-outline" : "btn-secondary";

  const box=document.getElementById("poll-results");
  if(!revealed){
    box.innerHTML='<div class="poll-hidden-note">'+t("poll.voting_open_results_hidden", "Voting is open \u2014 results hidden.")+'<br><span class="poll-count">'+
      escapeHtml(t("poll.n_of_m_voted", "{votes} of {joined} voted", {votes:votes.length, joined:joined||0}))+'</span></div>';
  } else if(q.type==="cloud"){
    box.innerHTML='<div class="cloud" id="poll-cloud"></div>';
    renderPollCloud(pollTallyCloud(votes, metaMap(POLL.settings,"removed")[String(idx)]));
  } else {
    renderPollBars(box, pollTallyChoice(q, votes), votes.length);
  }
  renderPollRoster();
}

function renderPollBars(box, counts, total){
  const entries=Object.keys(counts).map(k=>[k,counts[k]]);
  const max=Math.max(1, ...entries.map(e=>e[1]));
  const series=["--c1","--c2","--c3","--c4","--c5","--c6","--c7","--c8"];
  box.innerHTML="";
  const ranked=entries.slice().sort((a,b)=>b[1]-a[1]);
  entries.forEach(([label,n],i)=>{
    const pct= total>0 ? Math.round(n*100/total) : 0;
    const row=document.createElement("div");
    row.className="bar-row"+(n>0&&n===max?" top":"");
    const rank=document.createElement("span"); rank.className="bar-rank";
    rank.textContent=(ranked.findIndex(e=>e[0]===label)+1);
    const body=document.createElement("div"); body.className="bar-body";
    const l=document.createElement("div"); l.className="bar-label"; l.textContent=label;
    const track=document.createElement("div"); track.className="bar-track";
    const fill=document.createElement("div"); fill.className="bar-fill";
    fill.style.background="var("+series[i%series.length]+")";
    fill.style.width=(total>0?Math.round(n*100/max):0)+"%";
    const p=document.createElement("span"); p.className="bar-pct"; p.textContent=pct+"%";
    if(pct>=14){ fill.appendChild(p); track.appendChild(fill); }
    else { track.appendChild(fill); p.className="bar-pct out"; track.appendChild(p); }
    const cnt=document.createElement("span"); cnt.className="bar-n"; cnt.textContent="("+n+")";
    track.appendChild(cnt);
    body.appendChild(l); body.appendChild(track);
    row.appendChild(rank); row.appendChild(body);
    box.appendChild(row);
  });
}

function renderPollCloud(counts){
  const box=document.getElementById("poll-cloud");
  if(!box) return;
  const entries=Object.keys(counts).map(k=>[k,counts[k]]).sort((a,b)=>b[1]-a[1]);
  box.innerHTML="";
  if(entries.length===0){ box.innerHTML='<p class="cloud-empty">'+t("poll.no_words_yet", 'No words yet.')+'</p>'; return; }
  const max=entries[0][1];
  entries.forEach(([word,n],i)=>{
    const b=document.createElement("button");
    b.className="cloud-word";
    b.textContent=word;
    b.style.color="var(--c"+((i%8)+1)+")";
    // Size by frequency, floor high enough that a single mention is still readable.
    const scale=1+1.9*(max>1?(n-1)/(max-1):0);
    b.style.fontSize=(POLL.projecting?2.1:1.15)*scale+"rem";
    b.title=t("poll.n_mentions_click_remove", "{count} {mentions} \u2014 click to remove", { count:n, mentions: plural(n, t("poll.mention", "mention"), t("poll.mentions", "mentions")) });
    b.onclick=()=>pollRemoveWord(word);
    box.appendChild(b);
  });
}

function renderPollRoster(){
  const hint=document.getElementById("poll-roster-hint");
  const list=document.getElementById("poll-roster");
  if(POLL.settings.anonymous){
    hint.textContent=t("poll.anonymous_poll_see_how_many_voted", "Anonymous poll — you can see how many have voted, not who.");
    list.innerHTML="";
    return;
  }
  const idx=POLL.settings.currentIndex||0;
  const voted=[], waiting=[];
  POLL.participants.slice().sort(bySurname).forEach(p=>{
    const v=p.progress && p.progress.votes && p.progress.votes[String(idx)];
    (v!==undefined&&v!==null&&v!=="" ? voted : waiting).push(displayName(p.surname,p.firstName));
  });
  hint.textContent=t("poll.still_vote_question", "Still to vote on this question:");
  list.innerHTML = waiting.length===0
    ? '<p class="sub" style="margin:0;">'+t("poll.everyone_connected_voted", 'Everyone connected has voted.')+'</p>'
    : '<p class="sub" style="margin:0;">'+waiting.map(escapeHtml).join(" &middot; ")+'</p>';
}

/* ---- per-question timer ---- */
function pollStartTimerTick(){
  pollStopTimerTick();
  POLL.timerInt=setInterval(pollTickTimer, 500);
  pollTickTimer();
}

function pollStopTimerTick(){ if(POLL.timerInt){ clearInterval(POLL.timerInt); POLL.timerInt=null; } }

async function pollTickTimer(){
  const idx=POLL.settings.currentIndex||0;
  const pill=document.getElementById("poll-timer");
  const dl=metaMap(POLL.settings,"deadlines")[String(idx)];
  if(!dl || metaFlag(POLL.settings,"locked",idx)){ pill.style.display="none"; return; }
  const left=Math.max(0, Math.round((dl-Date.now())/1000));
  pill.style.display="inline-block";
  pill.textContent="⏱ "+fmtTime(left);
  pill.className="badge"+(left<=5?" demo":"");
  if(left<=0){
    // Time's up: lock it once, for everyone.
    POLL.settings.locked=POLL.settings.locked||{};
    if(!POLL.settings.locked[String(idx)]){
      POLL.settings.locked[String(idx)]=true;
      try{ await Backend.updateMeta(POLL.runId, POLL.settings); }catch(e){ console.warn(e); }
      renderPollStage();
    }
  }
}

/* ---- projection mode ---- */
function pollToggleProject(on){
  POLL.projecting=!!on;
  document.body.classList.toggle("projecting", POLL.projecting);
  if(POLL.projecting){ try{ requestFS(document.documentElement); }catch(e){} }
  else if(inFullscreen()){ try{ document.exitFullscreen&&document.exitFullscreen(); }catch(e){} }
  renderPollStage();
}

document.addEventListener("keydown", e=>{
  if(e.key==="Escape" && POLL.projecting){ pollToggleProject(false); return; }
  // Arrow keys drive the poll from a presenter remote, but only while the poll is on screen.
  const live=document.getElementById("screen-poll-live");
  if(!live || !live.classList.contains("active") || POLL.settings.status!=="active") return;
  if(e.key==="ArrowRight"||e.key==="PageDown"){ e.preventDefault(); pollAdvance(1); }
  else if(e.key==="ArrowLeft"||e.key==="PageUp"){ e.preventDefault(); pollAdvance(-1); }
});

/* ---- close ---- */
// Deliberately destructive: poll responses are never kept. Deleting the run also frees
// the join code and leaves no named opinion data behind.
async function pollClose(){
  if(!confirm(t("poll.close_poll_students_released_every_response", "Close this poll?\n\nStudents are released and every response is deleted from the database. You'll get a debrief on screen for the discussion, but once you leave it the results are gone for good."))) return;
  pollStopTimerTick();
  if(POLL.unsub){ POLL.unsub(); POLL.unsub=null; }
  // Snapshot what we already have in memory. The debrief is rendered from this, so the
  // database can be purged immediately — the results live only in this tab, until you leave.
  const snapshot = (POLL.participants||[]).slice();
  const questions = (POLL.questions||[]).slice();
  const removed = metaMap(POLL.settings,"removed");
  const runId = POLL.runId;
  try{
    POLL.settings.status="ended";
    await Backend.updateMeta(runId, POLL.settings);   // tells students it's over
  }catch(e){ console.warn(e); }
  // Give the students' listeners a moment to see "ended" before the node disappears.
  setTimeout(()=>{ Backend.deleteRun(runId).catch(e=>console.warn(e)); }, 1500);
  renderPollDebrief(questions, snapshot, removed);
  showScreen("screen-poll-debrief");
}

// Leaving the debrief is the point of no return: drop the snapshot as well as the run.
function pollDebriefDone(){
  if(POLL.projecting) pollToggleProject(false);
  POLL.runId=null; POLL.sessionCode=null; POLL.participants=[]; POLL.questions=[]; POLL.settings={};
  document.getElementById("poll-debrief-body").innerHTML="";
  teacherHome();
}

/* ---- debrief ----
   Built entirely from the in-memory snapshot taken at Close, so it needs nothing from the
   database and keeps the promise that no poll responses are retained. */
function renderPollDebrief(questions, participants, removed){
  const body=document.getElementById("poll-debrief-body");
  const voters={};
  participants.forEach(p=>{
    const v=(p.progress&&p.progress.votes)||{};
    Object.keys(v).forEach(k=>{ voters[k]=voters[k]||[]; voters[k].push(v[k]); });
  });
  const sub=document.getElementById("poll-debrief-sub"); if(sub) sub.textContent="";
  document.getElementById("poll-debrief-note").textContent =
    t("poll.these_results_exist_only_screen_they", "These results exist only on this screen. They were deleted from the database when you closed the poll, so screenshot anything you want to keep before pressing Done.");
  body.innerHTML="";
  if(questions.length===0){ body.innerHTML='<p class="sub">'+t("poll.nothing_show", 'Nothing to show.')+'</p>'; return; }

  const SERIES=["--c1","--c2","--c3","--c4","--c5","--c6","--c7","--c8"];
  const list=document.createElement("div"); list.className="debrief-list";

  questions.forEach((q,idx)=>{
    const votes=voters[String(idx)]||[];
    const row=document.createElement("div"); row.className="debrief-row";

    // --- collapsed head: number, question, a one-line preview of the shape of the answer ---
    const head=document.createElement("button"); head.className="debrief-head"; head.type="button";
    const n=document.createElement("span"); n.className="n"; n.textContent=idx+1;
    const qt=document.createElement("span"); qt.className="qt"; qt.textContent=q.text||"";

    const peek=document.createElement("span");
    if(votes.length===0){
      peek.className="debrief-peek";
      peek.innerHTML='<em style="font-style:normal;font-size:.78rem;font-family:\'Space Mono\',monospace;color:var(--ink-soft);">'+t("poll.no_responses", 'No responses')+'</em>';
    } else if(q.type==="cloud"){
      const counts=pollTallyCloud(votes, removed[String(idx)]);
      const top=Object.keys(counts).map(k=>[k,counts[k]]).sort((a,b)=>b[1]-a[1]);
      peek.className="debrief-peek";
      top.slice(0,2).forEach(([w],i)=>{
        const em=document.createElement("em");
        em.style.cssText="font-style:normal;font-size:"+(i?".84rem":"1rem")+";color:var("+SERIES[i]+");";
        em.textContent=w; peek.appendChild(em);
      });
      if(top.length>2){
        const more=document.createElement("em");
        more.style.cssText="font-style:normal;font-size:.74rem;color:var(--ink-soft);";
        more.textContent="+"+(top.length-2); peek.appendChild(more);
      }
    } else {
      const counts=pollTallyChoice(q, votes);
      peek.className="debrief-strip";
      Object.keys(counts).forEach((label,i)=>{
        const seg=document.createElement("i");
        seg.style.width=(votes.length?Math.round(counts[label]*100/votes.length):0)+"%";
        seg.style.background="var("+SERIES[i%SERIES.length]+")";
        seg.title=label+" · "+counts[label];
        peek.appendChild(seg);
      });
    }

    const sign=document.createElement("span"); sign.className="sign"; sign.textContent="+";
    head.appendChild(n); head.appendChild(qt); head.appendChild(peek); head.appendChild(sign);

    // --- the detail, built once and revealed on click ---
    const det=document.createElement("div"); det.className="debrief-detail"; det.style.display="none";
    if(votes.length===0){
      det.innerHTML='<p class="sub" style="margin:0;">'+t("poll.no_responses_2", 'No responses.')+'</p>';
    } else if(q.type==="cloud"){
      const counts=pollTallyCloud(votes, removed[String(idx)]);
      const entries=Object.keys(counts).map(k=>[k,counts[k]]).sort((a,b)=>b[1]-a[1]);
      if(entries.length===0){ det.innerHTML='<p class="sub" style="margin:0;">'+t("poll.no_words", 'No words.')+'</p>'; }
      else {
        const max=entries[0][1];
        const cl=document.createElement("div"); cl.className="cloud";
        entries.forEach(([word,cnt],i)=>{
          const sp=document.createElement("span");
          sp.className="cloud-word"; sp.style.cursor="default";
          sp.textContent=word;
          sp.title=t("poll.n_mentions", "{count} {mentions}", { count:cnt, mentions: plural(cnt, t("poll.mention", "mention"), t("poll.mentions", "mentions")) });
          sp.style.color="var("+SERIES[i%SERIES.length]+")";
          // em, not rem, so the whole cloud scales with the container in projection mode
          sp.style.fontSize=(1+1.4*(max>1?(cnt-1)/(max-1):0))+"em";
          cl.appendChild(sp);
        });
        det.appendChild(cl);
      }
    } else {
      renderPollBars(det, pollTallyChoice(q, votes), votes.length);
    }

    // One question open at a time: the class discusses them one by one.
    head.onclick=function(){
      const wasOpen = det.style.display!=="none";
      list.querySelectorAll(".debrief-detail").forEach(d=>{ d.style.display="none"; });
      list.querySelectorAll(".debrief-row").forEach(r=>{ r.classList.remove("open"); });
      list.querySelectorAll(".debrief-head .sign").forEach(s=>{ s.textContent="+"; });
      if(!wasOpen){ det.style.display="block"; row.classList.add("open"); sign.textContent="\u2212"; }
    };

    row.appendChild(head); row.appendChild(det);
    list.appendChild(row);
  });
  body.appendChild(list);   // everything starts collapsed
}


/* ============================================================================
   LIVE POLL — student side
   Follows the teacher's meta in real time: which question is showing, whether it is
   locked, and when the poll ends. One vote per question, locked once sent. No
   fullscreen, no cheat monitoring, nothing kept after the teacher closes the poll.
   ============================================================================ */
let PSTU = { runId:null, code:null, questions:[], votes:{}, meta:{}, unsub:null, timerInt:null, draft:[] };


async function pollStudentStart(session, surname, firstName){
  PSTU={ runId:session.runId, code:STUDENT.sessionCode, questions:session.questions||[],
         votes:{}, meta:session.meta, unsub:null, timerInt:null, draft:[] };
  // Reconnect: a student who refreshes gets their earlier votes back, so they can't vote twice.
  try{
    const prior=await Backend.getParticipant(PSTU.runId, STUDENT.id);
    if(prior && prior.progress && prior.progress.votes) PSTU.votes=prior.progress.votes;
  }catch(e){ console.warn(e); }
  try{ await Backend.joinSession(PSTU.runId, STUDENT.id, surname, firstName, true); }catch(e){ console.warn(e); }
  const badge=document.getElementById("pv-name");
  if(session.meta.anonymous){ badge.style.display="none"; }
  else { badge.textContent=displayName(surname,firstName); badge.style.display="inline-block"; }
  showScreen("screen-poll-vote");
  pollStudentWatch();
  pollStudentTick();
  PSTU.timerInt=setInterval(pollStudentTick, 500);
}

function pollStudentWatch(){
  if(PSTU.unsub){ PSTU.unsub(); PSTU.unsub=null; }
  PSTU.unsub=Backend.subscribeMeta(PSTU.runId, s=>{
    if(!s||!s.meta) return;
    const prevIdx = PSTU.meta.currentIndex;
    PSTU.meta=s.meta;
    if(s.meta.status==="ended"){ pollStudentEnd(); return; }
    // Teacher moved the room to another question — clear any half-typed cloud words.
    if(s.meta.currentIndex!==prevIdx) PSTU.draft=[];
    renderPollStudent();
  });
}

function pollStudentEnd(){
  if(PSTU.unsub){ PSTU.unsub(); PSTU.unsub=null; }
  if(PSTU.timerInt){ clearInterval(PSTU.timerInt); PSTU.timerInt=null; }
  paintQuestionMedia(null, "pv-img", "pv-audio-wrap");
  // A closed poll gets its own screen: the question card has nothing left to say.
  const answered=Object.keys(PSTU.votes||{}).length, total=(PSTU.questions||[]).length;
  document.getElementById("pd-count").textContent=t("poll.n_of_m", "{answered} of {total}", {answered:answered, total:total});
  showScreen("screen-poll-done");
}

function pollStudentTick(){
  const pill=document.getElementById("pv-timer");
  const idx=PSTU.meta.currentIndex||0;
  const dl=metaMap(PSTU.meta,"deadlines")[String(idx)];
  if(!dl || PSTU.meta.status!=="active" || metaFlag(PSTU.meta,"locked",idx)){ pill.style.display="none"; return; }
  const left=Math.max(0, Math.round((dl-Date.now())/1000));
  pill.style.display="inline-block";
  pill.textContent="⏱ "+fmtTime(left);
  pill.className="badge"+(left<=5?" demo":"");
  if(left<=0) renderPollStudent();   // locally locked the moment it runs out
}

// A question is closed to this student if: the teacher locked it, its timer ran out,
// or they have already voted on it.
function pollQClosed(idx){
  if(metaFlag(PSTU.meta,"locked",idx)) return "locked";
  const dl=metaMap(PSTU.meta,"deadlines")[String(idx)];
  if(dl && Date.now()>=dl) return "expired";
  if(PSTU.votes[String(idx)]!==undefined) return "voted";
  return "";
}

function renderPollStudent(){
  const body=document.getElementById("pv-body");
  const status=document.getElementById("pv-status");
  if(PSTU.meta.status==="waiting"){
    document.getElementById("pv-qpos").textContent=t("poll.waiting", "Waiting");
    document.getElementById("pv-question").textContent=t("poll.re_waiting_teacher_start", "You're in. Waiting for your teacher to start…");
    paintQuestionMedia(null, "pv-img", "pv-audio-wrap");
    body.innerHTML=""; status.textContent=t("poll.keep_page_open", "Keep this page open.");
    return;
  }
  const idx=PSTU.meta.currentIndex||0;
  const q=PSTU.questions[idx];
  if(!q) return;
  document.getElementById("pv-qpos").textContent="Q "+(idx+1)+" / "+PSTU.questions.length;
  document.getElementById("pv-question").textContent=q.text||"";
  paintQuestionMedia(q, "pv-img", "pv-audio-wrap");
  const closed=pollQClosed(idx);
  body.innerHTML="";

  if(closed==="voted"){
    const mine=PSTU.votes[String(idx)];
    const shown=Array.isArray(mine)?mine.join(", "):mine;
    body.innerHTML='<div class="vote-done">Vote recorded'+(shown?': <b>'+escapeHtml(String(shown))+'</b>':'')+'</div>';
    status.textContent=t("poll.wait_next_question", "Wait for the next question.");
    return;
  }
  if(closed==="locked"||closed==="expired"){
    body.innerHTML='<div class="vote-locked">'+escapeHtml(
      (closed==="expired" ? t("poll.times_up", "Time\u2019s up") : t("poll.voting_closed", "Voting closed"))
      + " " + t("poll.cant_answer_this_one", "\u2014 you can\u2019t answer this one."))+'</div>';
    status.textContent=t("poll.wait_next_question", "Wait for the next question.");
    return;
  }

  if(q.type==="cloud"){
    const max=Math.max(1, Math.min(3, q.maxWords||1));
    const rows=[];
    for(let i=0;i<max;i++){
      rows.push('<input type="text" id="pv-word-'+i+'" placeholder="'+escapeHtml(i===0?t("poll.your_word", "Your word"):t("poll.another_word_optional", "Another word (optional)"))+'" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="28" style="margin-bottom:8px;">');
    }
    body.innerHTML=rows.join("")+
      '<button class="btn-primary" style="width:100%;" onclick="pollSubmitCloud()">'+t("poll.send", 'Send')+'</button>';
    status.textContent = max===1
      ? t("poll.one_word", "One word.")
      : t("poll.up_to_n_words", "Up to {max} words \u2014 one per box.", {max:max});
  } else {
    (q.options||[]).forEach(opt=>{
      const b=document.createElement("button");
      b.className="btn-outline vote-opt";
      b.textContent=opt;
      b.onclick=()=>pollSubmitChoice(opt);
      body.appendChild(b);
    });
    status.textContent=t("poll.tap_answer_t_change_afterwards", "Tap your answer. You can't change it afterwards.");
  }
}

async function pollSubmitChoice(opt){
  const idx=PSTU.meta.currentIndex||0;
  if(pollQClosed(idx)) { renderPollStudent(); return; }
  // No confirmation: a poll should feel like one tap. The button copy warns it is final.
  PSTU.votes[String(idx)]=opt;
  await pollSaveVotes();
  renderPollStudent();
}

async function pollSubmitCloud(){
  const idx=PSTU.meta.currentIndex||0;
  if(pollQClosed(idx)) { renderPollStudent(); return; }
  const q=PSTU.questions[idx];
  const max=Math.max(1, Math.min(3, q.maxWords||1));
  const words=[];
  for(let i=0;i<max;i++){
    const el=document.getElementById("pv-word-"+i);
    const n=normWord(el?el.value:"");
    if(n && words.indexOf(n)<0) words.push(n);
  }
  if(words.length===0){ alert(t("poll.type_least_one_word", "Type at least one word.")); return; }
  PSTU.votes[String(idx)]=words;
  await pollSaveVotes();
  renderPollStudent();
}

function pollSaveVotes(){
  return Backend.saveProgress(PSTU.runId, STUDENT.id, STUDENT.surname||"", STUDENT.firstName||"", { votes:PSTU.votes })
    .catch(e=>{ console.warn(e); alert(t("poll.couldn_t_send_answer_check_connection", "Couldn't send your answer — check your connection and try again.")); });
}

/* ---------- the contract ---------- */
/* Registered in v3.1 so the student router and the rejoin banner stop naming activities
   one by one. A poll scores nothing, and an anonymous one does not even want a name. */
registerActivity("poll", {
  join: pollStudentStart,
  teacher: pollCreateSession,
  score: null,
  finish: pollClose,
  rejoin: rejoinPollRun,
  requiresName: meta => !(meta && meta.anonymous),
  anonymous: meta => !!(meta && meta.anonymous),
  label: "Poll",
  keeps: false   // nothing is archived: the records name students and hold no marks
});
