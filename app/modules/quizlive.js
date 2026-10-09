/* ============================================================================
   Classroom Exam App — modules/quizlive.js
   Loaded as a plain script in the order set by index.html; every file shares one
   global scope, so nothing is imported or exported.
   ============================================================================ */

/* THE LIVE QUIZ (v3.30).

   A projected, teacher-paced game played for points. It is not a test and it is not a poll,
   and the differences are the whole design:

     - it is MARKED but never RECORDED. Points go on a board for the length of the lesson and
       the run is deleted when it ends. `keeps:false`, like a poll and a role play.
     - it is PACED BY THE TEACHER, so the question everybody is looking at is a fact about the
       run and not about any one phone. That fact lives in meta, which is the only thing both
       the projector and twenty-five phones can agree on.
     - it REWARDS SPEED, within limits that core/quizscore.js argues for at length.
     - students play under PSEUDONYMS by default. Nothing is kept, nobody needs identifying
       afterwards, and a projected board of real first names ranks a class by name in front of
       itself. First names remain a toggle for a teacher who wants them.
     - an opinion question or a word cloud may sit in the sequence. It scores nothing and is a pause for
       discussion, which is the reason for having a bank that will hold both kinds at once.

   WHAT THIS DOES NOT DO. The answers are in the session every joined student can read, exactly
   as they are for a test; a student with a developer console can read them. That is accepted
   here — nothing is kept and no mark follows anybody — and it is the reason the separate
   "answers off the phone" change is scoped to the test. */

let LQ = { sessionCode:null, runId:null, questions:[], settings:{}, school:"", sets:[],
           participants:[], unsub:null, tick:null, projecting:false, name:"", audioArmed:false };

/* The clock a question runs on. A question with its own limit uses it; everything else uses the
   set's default. Zero is not allowed here the way it is on a test: a live quiz with no clock
   never advances, and the score has nothing to be fast against. */
const LQ_DEFAULT_SEC = 20;
const LQ_MIN_SEC = 5;
const LQ_MAX_SEC = 120;

function lqLimitSec(q, settings){
  const own = Math.max(0, parseInt((q||{}).timeLimitSec, 10) || 0);
  const dflt = Math.max(LQ_MIN_SEC, parseInt((settings||{}).defaultSec, 10) || LQ_DEFAULT_SEC);
  const secs = own > 0 ? own : dflt;
  return Math.max(LQ_MIN_SEC, Math.min(LQ_MAX_SEC, secs));
}
function lqLimitMs(q, settings){ return lqLimitSec(q, settings) * 1000; }

/* When the clock on a question STARTS, which is not when the question appears.

   An audio question plays first and is then answered: the countdown starts when the clip
   finishes, or the room is scored on how long a recording is. The teacher's stage writes
   `startedAt` for the question once playback is done (or immediately when there is no audio),
   and every phone reads the same number — so a student whose phone loaded a second late is not
   quietly a second behind. */
function lqStartedAt(meta, pos){
  const m = metaMap(meta, "startedAt");
  const v = Number(m[String(pos)]);
  return v > 0 ? v : 0;
}

/* How long this student took. Measured against the shared start, with the server's clock, so
   two phones a minute apart do not score differently — the same reason core/backend.js keeps
   a clock offset at all. */
function lqElapsed(meta, pos, nowMs){
  const started = lqStartedAt(meta, pos);
  if(!started) return 0;
  return Math.max(0, (nowMs || Backend.serverNow()) - started);
}

/* Is this item one the room is scored on? Asked of core, so the teacher's board, the student's
   card and the final standings cannot disagree about whether a word cloud was a question. */
function lqIsScored(q){ return qzScored(q); }

/* Marking, which is core/answers.js's ruling and not this file's. A live quiz is strict in
   exactly the way a test is: capitals and accents count, a number must be written the way the
   language writes numbers. A game that quietly accepted "Risk" for "risk" would teach the
   opposite of the test the same class sits later. */
function lqMark(q, given){
  if(!q || given===undefined || given===null || given==="") return false;
  if(q.type==="mcq" || q.type==="tf") return given === q.correct;
  if(q.type==="text")    return matchTextAnswer(given, q.correct, q.caseSensitive);
  if(q.type==="numeric") return markNumeric(given, q.correct, q.tolerance, answerLang(q));
  if(q.type==="order"){
    const corr = q.correct || q.items || [];
    return Array.isArray(given) && given.length===corr.length && given.every((v,i)=>v===corr[i]);
  }
  return false;
}


/* ============================================================================
   TEACHER — setting one up
   ============================================================================ */
async function lqCreateSession(){
  if(!(await confirmNoOpenRun("livequiz"))) return;
  const code = genSessionCode();
  LQ = { sessionCode:code, runId:null, questions:[], settings:{}, school:"", sets:[],
         participants:[], unsub:null, tick:null, projecting:false, name:"", audioArmed:false };
  const c=document.getElementById("lq-setup-code");
  if(c){ c.textContent=t("lq.code_is", "Code · {code}", {code:code}); c.style.display="inline-block"; }
  lqResetStep2();
  await lqLoadSetList();
  showScreen("screen-lq-setup");
}

async function lqLoadSetList(){
  try{
    const [qs, ss] = await Promise.all([Backend.listQuizzes(), Backend.listSchools()]);
    LQ.sets = (qs.quizzes||[]).filter(q=>q.kind==="livequiz");
    const sel=document.getElementById("lq-school-select");
    sel.innerHTML = '<option value="">'+t("lq.select_school", '— select a school —')+'</option>';
    (ss.schools||[]).forEach(n=>{ const o=document.createElement("option"); o.value=n; o.textContent=n; sel.appendChild(o); });
    document.getElementById("lq-set-select").innerHTML =
      '<option value="">'+t("lq.select_school_first", '— select a school first —')+'</option>';
  }catch(e){ console.warn(e); }
}

function lqResetStep2(){
  const st=document.getElementById("lq-set-status");
  if(st){ st.style.display="none"; st.textContent=""; }
  const s2=document.getElementById("lq-step2"); if(s2) s2.style.display="none";
  /* Not named `b`: a handle of that name has its textContent written further down this file,
     and the clobber guard reads the two as one element. */
  const pick=document.getElementById("lq-select-btn"); if(pick) pick.style.display="block";
}

function lqSetPicked(){ LQ.questions=[]; lqResetStep2(); }

function filterLqSets(){
  const school=document.getElementById("lq-school-select").value;
  const sel=document.getElementById("lq-set-select");
  LQ.questions=[]; LQ.school=school;
  lqResetStep2();
  sel.innerHTML='<option value="">'+t("lq.select_quiz", '— select a quiz game —')+'</option>';
  const hint=document.getElementById("lq-none-hint");
  if(hint) hint.style.display="none";
  if(!school) return;
  const mine=LQ.sets.filter(q=>(q.schools||[]).includes(school)).sort((a,b)=>a.name.localeCompare(b.name));
  if(mine.length===0){ if(hint) hint.style.display="block"; return; }
  mine.forEach(q=>{
    const o=document.createElement("option"); o.value=q.key;
    o.textContent=q.name+" ("+t("poll.n_questions", "{count} {questions}",
      { count:q.count, questions: plural(q.count, t("poll.question", "question"), t("poll.questions", "questions")) })+")";
    sel.appendChild(o);
  });
}

async function loadLqSet(){
  const key=document.getElementById("lq-set-select").value;
  const status=document.getElementById("lq-set-status");
  if(!key){ alert(t("lq.pick_school_quiz_first", "Pick a school and a quiz game first.")); return; }
  try{
    const set=await Backend.getQuiz(key);
    if(!set){ alert(t("lq.quiz_could_found", "That quiz game could not be found.")); return; }
    const qs=(set.questions||[]);
    if(qs.length===0){ alert(t("lq.set_empty", "That quiz game has no questions in it.")); return; }
    LQ.questions=qs.map(q=>Object.assign({},q,{id:q.id||"q_"+uid(6)}));
    LQ.name=set.name||t("lq.quiz_game", "Quiz game");
    LQ.school=document.getElementById("lq-school-select").value || quizSchools(set)[0] || "";
    const scored=LQ.questions.filter(lqIsScored).length;
    status.textContent=t("lq.selected_n", "✓ Selected — {count} {questions}, {scored} scored.",
      { count:LQ.questions.length,
        questions: plural(LQ.questions.length, t("poll.question", "question"), t("poll.questions", "questions")),
        scored:scored });
    status.style.display="flex";
    document.getElementById("lq-select-btn").style.display="none";
    document.getElementById("lq-step2").style.display="block";
  }catch(e){ alert(t("poll.load_failed", "Load failed: ")+e.message); }
}

/* Open it. Created in "waiting" so the room fills and the teams form before anything starts. */
async function lqStartSession(){
  if(LQ.questions.length===0){ alert(t("lq.choose_set_first", "Choose a quiz game first.")); return; }
  const teams = !!(document.getElementById("lq-teams")||{}).checked;
  const naming = (document.getElementById("lq-naming")||{}).value || "pseudonym";
  const autoplay = !!(document.getElementById("lq-autoplay")||{}).checked;
  const defaultSec = Math.max(LQ_MIN_SEC, Math.min(LQ_MAX_SEC,
    parseInt((document.getElementById("lq-default-sec")||{}).value, 10) || LQ_DEFAULT_SEC));
  LQ.settings={
    kind:"livequiz", status:"waiting", title:LQ.name||t("lq.quiz_game", "Quiz game"),
    school:LQ.school||"", naming:naming, teams:teams, teamCount:4, teamMap:{},
    autoplay:autoplay, defaultSec:defaultSec,
    pos:0, startedAt:{}, locked:{}, revealed:{},
    teacherName:(TEACHER_USER&&TEACHER_USER.name)||"",
    teacherEmail:(TEACHER_USER&&TEACHER_USER.email)||""
  };
  LQ.runId = LQ.sessionCode+"-"+Date.now().toString(36).toUpperCase();
  try{ await Backend.createSession(LQ.runId, LQ.sessionCode, LQ.settings, LQ.questions); }
  catch(e){ alert(t("lq.couldn_t_open", "Couldn't open the quiz: ")+e.message); return; }
  document.getElementById("lq-live-code").textContent=LQ.sessionCode;
  document.getElementById("lq-join-code").textContent=LQ.sessionCode;
  document.getElementById("lq-title").textContent=LQ.name||"";
  lqShowPanel("lobby");
  showScreen("screen-lq-live");
  lqRenderQR();
  lqWatchParticipants();
}

/* Which of the two panels the live screen is showing.

   A CLASS, not an inline style. `stage.style.display="block"` is an inline declaration, and it
   beats the projection stylesheet's `display:flex` — so on a projector the stage stayed a block
   and `justify-content:center` never applied, leaving the question in the top third of a 1080px
   board with half the screen empty under it. Toggling a class lets the projection rules win. */
function lqShowPanel(which){
  const lobby=document.getElementById("lq-lobby"), stage=document.getElementById("lq-stage");
  if(lobby) lobby.classList.toggle("on", which==="lobby");
  if(stage) stage.classList.toggle("on", which==="stage");
}

function lqJoinUrl(){ return location.origin+location.pathname+"?join="+encodeURIComponent(LQ.sessionCode); }

function lqRenderQR(){
  const box=document.getElementById("lq-qr");
  if(!box) return;
  box.innerHTML="";
  if(typeof QRCode==="undefined"){ box.innerHTML='<p class="sub">'+t("poll.qr_needs_internet_students_type_code", 'QR needs internet — students can type the code.')+'</p>'; return; }
  try{ new QRCode(box,{ text:lqJoinUrl(), width:190, height:190, correctLevel:QRCode.CorrectLevel.M }); }
  catch(e){ box.innerHTML='<p class="sub">'+t("poll.qr_unavailable_students_type_code", 'QR unavailable — students can type the code.')+'</p>'; }
}

function copyLqJoinLink(){
  const url=lqJoinUrl();
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(()=>alert(t("poll.join_link_copied", "Join link copied:\n")+url),()=>prompt(t("poll.copy_this_link", "Copy this link:"),url));
  else prompt(t("poll.copy_this_link", "Copy this link:"),url);
}


/* ============================================================================
   THE WAITING ROOM — projected, so a class can see itself arrive
   ============================================================================ */
function lqWatchParticipants(){
  if(LQ.unsub){ LQ.unsub(); LQ.unsub=null; }
  LQ.unsub=Backend.subscribeParticipants(LQ.runId, async r=>{
    LQ.participants=r.participants||[];
    /* Teams fill as the room does, so the projected waiting room is always showing the teams
       that would play if the quiz started now — rather than a list of names that rearranges
       itself the moment the teacher presses Start. topUpTeams only ADDS, so a student already
       placed is never moved by somebody else arriving. */
    if(LQ.settings.teams && LQ.settings.status==="waiting"){
      const before=JSON.stringify(LQ.settings.teamMap||{});
      LQ.settings.teamMap=topUpTeams(LQ.settings.teamMap||{}, LQ.participants, LQ.settings.teamCount);
      if(JSON.stringify(LQ.settings.teamMap)!==before){
        try{ await Backend.updateMeta(LQ.runId, LQ.settings); }catch(e){ console.warn(e); }
      }
    }
    lqRenderLobby();
    if(LQ.settings.status==="active") lqRenderStage();
  });
}

function lqRenderLobby(){
  const n=LQ.participants.length;
  const c=document.getElementById("lq-lobby-count"); if(c) c.textContent=n;
  const l=document.getElementById("lq-lobby-count-label");
  if(l) l.textContent=plural(n, t("poll.student_connected", "student connected"), t("poll.students_connected", "students connected"));

  const box=document.getElementById("lq-lobby-roster");
  if(!box) return;
  if(!LQ.settings.teams){
    box.innerHTML=lobbyRoster(LQ.participants, "lqRemove");
    return;
  }
  /* By team, because that is what the room is looking for: a student scanning a projected list
     wants to know which side they are on, not where they come alphabetically. */
  const map=LQ.settings.teamMap||{};
  const byTeam={};
  LQ.participants.forEach(p=>{ const tm=map[p.studentId]||t("lq.unplaced", "Not yet placed"); (byTeam[tm]=byTeam[tm]||[]).push(p); });
  box.innerHTML=Object.keys(byTeam).sort().map(tm=>
    '<h3 class="lq-team-head">'+escapeHtml(tm)+" · "+byTeam[tm].length+'</h3>'+
    lobbyRoster(byTeam[tm], "lqRemove")).join("");
}

async function lqRemove(studentId){
  /* Before the start only — the same rule as every other game, and for the same reason: once
     the teams are playing, removing somebody changes a denominator mid-quiz. */
  const ok = await removeFromLobby(LQ.runId, LQ.participants, studentId,
    { round: LQ.settings.status==="waiting" ? 0 : 1 });
  if(ok && LQ.settings.teamMap){ delete LQ.settings.teamMap[studentId];
    try{ await Backend.updateMeta(LQ.runId, LQ.settings); }catch(e){ console.warn(e); } }
}

function lqNudgeTeams(delta){
  if(LQ.settings.status!=="waiting") return;
  LQ.settings.teamCount=Math.max(2, Math.min(MAX_TEAMS, (LQ.settings.teamCount||4)+delta));
  LQ.settings.teamMap=allocateTeams(LQ.participants, LQ.settings.teamCount);
  Backend.updateMeta(LQ.runId, LQ.settings).catch(e=>console.warn(e));
  lqRenderLobby();
}

function lqReshuffleTeams(){
  if(LQ.settings.status!=="waiting") return;
  LQ.settings.teamMap=allocateTeams(LQ.participants, LQ.settings.teamCount||4);
  Backend.updateMeta(LQ.runId, LQ.settings).catch(e=>console.warn(e));
  lqRenderLobby();
}


/* ============================================================================
   RUNNING IT
   ============================================================================ */
async function lqBegin(){
  const n=LQ.participants.length;
  if(!confirm((n===0 ? t("lq.nobody_joined", "Nobody has joined yet.")
                     : t("poll.n_students_connected", "{count} {students} connected.",
                         { count:n, students: plural(n, t("poll.student", "student"), t("poll.students", "students")) }))
     + " " + t("lq.start_now", "Start the quiz now?"))) return;
  /* The first tap of the lesson, and the one that lets this page play sound at all. Browsers
     only allow audio that follows a gesture, and in autoplay the eighth question has no gesture
     behind it — so the element is unlocked here, once, and reused for every clip after. */
  lqArmAudio();
  LQ.settings.status="active";
  LQ.settings.pos=0;
  await lqShow(0);
  lqShowPanel("stage");
  lqStartTick();
}

/* Put question `pos` on the board and start its clock — unless it has audio, in which case the
   clock waits for the clip to finish. */
async function lqShow(pos){
  LQ.settings.pos=pos;
  const q=LQ.questions[pos];
  LQ.settings.startedAt=LQ.settings.startedAt||{};
  LQ.settings.locked=LQ.settings.locked||{};
  LQ.settings.revealed=LQ.settings.revealed||{};
  const hasAudio = !!(q && q.audio);
  if(!hasAudio && !LQ.settings.startedAt[String(pos)]) LQ.settings.startedAt[String(pos)]=Backend.serverNow();
  try{ await Backend.updateMeta(LQ.runId, LQ.settings); }catch(e){ console.warn(e); }
  lqRenderStage();
  if(hasAudio) lqPlayAudio(q, pos);
}

/* The clock starts when the clip ends. Started here rather than on a timer of the clip's
   length, because a clip that fails to load must not leave the room waiting for a countdown
   that never begins. */
async function lqAudioDone(pos){
  if(LQ.settings.startedAt[String(pos)]) return;
  LQ.settings.startedAt[String(pos)]=Backend.serverNow();
  try{ await Backend.updateMeta(LQ.runId, LQ.settings); }catch(e){ console.warn(e); }
  lqRenderStage();
}

async function lqAdvance(dir){
  let pos=(LQ.settings.pos||0)+dir;
  pos=Math.max(0, Math.min(LQ.questions.length-1, pos));
  if(pos===LQ.settings.pos) return;
  await lqShow(pos);
}

async function lqLock(){
  const k=String(LQ.settings.pos||0);
  LQ.settings.locked[k]=true;
  LQ.settings.revealed[k]=true;
  try{ await Backend.updateMeta(LQ.runId, LQ.settings); }catch(e){ console.warn(e); }
  lqRenderStage();
}

function lqStartTick(){ lqStopTick(); LQ.tick=setInterval(lqTick, 250); lqTick(); }
function lqStopTick(){ if(LQ.tick){ clearInterval(LQ.tick); LQ.tick=null; } }

async function lqTick(){
  if(!LQ.runId || LQ.settings.status!=="active") return;
  const pos=LQ.settings.pos||0, k=String(pos);
  const q=LQ.questions[pos];
  const started=lqStartedAt(LQ.settings, pos);
  const pill=document.getElementById("lq-timer");
  if(!started){
    if(pill){ pill.style.display="inline-block"; pill.textContent=t("lq.listen", "🔊 Listening"); pill.className="badge"; }
    return;
  }
  const left=Math.max(0, Math.round((lqLimitMs(q, LQ.settings) - (Backend.serverNow()-started))/1000));
  if(pill){
    pill.style.display="inline-block";
    pill.textContent="⏱ "+fmtTime(left);
    pill.className="badge"+(left<=5?" demo":"");
  }
  if(left<=0 && !LQ.settings.locked[k]){
    await lqLock();
    /* Autoplay moves on after a pause long enough to read the answer and see who got it. */
    if(LQ.settings.autoplay) setTimeout(()=>{ if(LQ.settings.autoplay && LQ.settings.status==="active") lqNextOrEnd(); }, 4000);
  }
}

function lqNextOrEnd(){
  const pos=LQ.settings.pos||0;
  if(pos >= LQ.questions.length-1) lqEnd(); else lqAdvance(1);
}

/* Everyone in, early. A question nobody is still thinking about is dead air, and the teacher
   should not have to watch the clock to notice. */
function lqAllAnswered(pos){
  if(LQ.participants.length===0) return false;
  return LQ.participants.every(p=>{
    const a=((p.progress&&p.progress.qz)||{})[String(pos)];
    return a!==undefined && a!==null;
  });
}


/* ============================================================================
   THE STAGE — what the room is looking at
   ============================================================================ */
function lqRenderStage(){
  if(!LQ.runId || LQ.settings.status!=="active") return;
  const pos=LQ.settings.pos||0, k=String(pos);
  const q=LQ.questions[pos];
  if(!q) return;
  const locked=!!(LQ.settings.locked||{})[k];
  const revealed=!!(LQ.settings.revealed||{})[k];

  const where=t("poll.q_x_of_y", "Q {n} / {total}", {n:pos+1, total:LQ.questions.length});
  const qpos=document.getElementById("lq-qpos"); if(qpos) qpos.textContent=where;
  const pjp=document.getElementById("lq-proj-qpos"); if(pjp) pjp.textContent=where;
  const txt=document.getElementById("lq-question"); if(txt) txt.textContent=q.text||"";

  lqPaintStageMedia(q);

  const inCount=LQ.participants.filter(p=>((p.progress&&p.progress.qz)||{})[k]!==undefined).length;
  const cnt=document.getElementById("lq-in-count"); if(cnt) cnt.textContent=inCount;
  const tot=document.getElementById("lq-in-total"); if(tot) tot.textContent=LQ.participants.length;

  const body=document.getElementById("lq-options");
  if(body){
    body.innerHTML="";
    /* The question AND its answers on the board as well as on the phone. A board that shows
       only the stem makes the phone the thing everyone reads, and the room stops being a room. */
    /* Built as markup rather than by setting className, because a bare class name in a string
       is indistinguishable from a sentence nobody translated — and the check that finds
       untranslated sentences is worth more than the convenience of assigning a class. */
    if(q.type==="order"){
      body.innerHTML=(q.items||[]).map(it=>'<div class="lq-opt">'+escapeHtml(it)+'</div>').join("");
    } else if(q.type==="text" || q.type==="numeric"){
      body.innerHTML='<div class="lq-opt" data-typed="1">'+
        escapeHtml(revealed ? lqAnswerText(q) : t("lq.type_your_answer", "Type your answer"))+'</div>';
    } else {
      body.innerHTML=(q.options||[]).map(opt=>
        '<div class="lq-opt" data-right="'+((revealed && lqIsScored(q) && opt===q.correct) ? "1" : "0")+'">'+
        escapeHtml(opt)+'</div>').join("");
    }
  }

  const ans=document.getElementById("lq-answer");
  if(ans){
    ans.style.display = (revealed && lqIsScored(q)) ? "block" : "none";
    if(revealed && lqIsScored(q)) ans.textContent=t("lq.answer_is", "Answer: {answer}", {answer:lqAnswerText(q)});
  }
  const note=document.getElementById("lq-unscored");
  if(note) note.style.display = lqIsScored(q) ? "none" : "block";

  const lockBtn=document.getElementById("lq-lock-btn");
  if(lockBtn) lockBtn.textContent = locked ? t("lq.locked", "Locked") : t("lq.lock_now", "Lock & reveal");

  lqRenderBoard();
}

function lqAnswerText(q){
  if(!q) return "";
  if(q.type==="text") return (Array.isArray(q.correct)?q.correct:[q.correct]).join(" / ");
  if(q.type==="order") return (q.correct||q.items||[]).join(" → ");
  return String(q.correct===undefined||q.correct===null ? "" : q.correct);
}

/* The running board, beside the question. Teams when there are teams, otherwise the top few
   players — the whole class on a projector ranks twenty-five people by name in front of each
   other, which is the thing v3.15 decided against. */
function lqRenderBoard(){
  const box=document.getElementById("lq-board");
  if(!box) return;
  const rows=lqStandingsNow();
  const show=LQ.settings.teams ? rows : rows.slice(0, FINAL_PODIUM);
  box.innerHTML = show.length
    ? show.map(r=>'<div class="lq-board-row'+(r.place===1?" top":"")+'">'+
        '<span class="lq-board-place">'+r.place+'</span>'+
        '<span class="lq-board-who">'+escapeHtml(r.name)+'</span>'+
        '<span class="lq-board-pts mono">'+r.score+'</span></div>').join("")
    : '<p class="sub">'+t("lq.no_points_yet", "No points yet.")+'</p>';
}

function lqStandingsNow(){
  return qzStandings(LQ.questions, LQ.participants, {
    teamOf: LQ.settings.teams ? (LQ.settings.teamMap||{}) : null,
    mark: lqMark,
    limitOf: q=>lqLimitMs(q, LQ.settings)
  });
}


/* ============================================================================
   MEDIA ON THE STAGE
   ============================================================================ */
/* Pictures go everywhere; sound and video stay on the projector.

   Not a stylistic choice. Twenty-five phones streaming the same clip over school wifi is the
   single most likely way a lesson falls over, and an embedded video on a personal phone sets
   that provider's cookies on a device the school does not own. One speaker at the front is
   also simply how a listening exercise works. */
function lqPaintStageMedia(q){
  const img=document.getElementById("lq-img");
  if(img){
    if(q && q.image){ img.src=q.image; img.style.display="block"; }
    else { img.removeAttribute("src"); img.style.display="none"; }
    paintImageCredit(q, img);
  }
  const vid=document.getElementById("lq-video");
  if(vid){
    const src=lqVideoEmbed(q && q.video);
    if(src){ if(vid.getAttribute("src")!==src) vid.setAttribute("src", src); vid.style.display="block"; }
    else { vid.removeAttribute("src"); vid.style.display="none"; }
  }
  lqPreloadNext();
}

/* A video URL turned into something safe to frame, or nothing.

   An allowlist rather than "put the URL in an iframe": an arbitrary address framed inside a
   page a teacher is signed into is a hole, and a question is authored once and played for
   years. YouTube goes through the no-cookie host, which is the difference between showing a
   class a clip and handing a tracker to a room. */
function lqVideoEmbed(url){
  const u=String(url||"").trim();
  if(!u) return "";
  let m=/^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{6,})/.exec(u);
  if(m) return "https://www.youtube-nocookie.com/embed/"+m[1];
  m=/^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{6,})/.exec(u);
  if(m) return "https://www.youtube-nocookie.com/embed/"+m[1];
  m=/^https?:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{6,})/.exec(u);
  if(m) return "https://www.youtube-nocookie.com/embed/"+m[1];
  m=/^https?:\/\/(?:www\.)?vimeo\.com\/(\d{4,})/.exec(u);
  if(m) return "https://player.vimeo.com/video/"+m[1];
  m=/^https?:\/\/player\.vimeo\.com\/video\/(\d{4,})/.exec(u);
  if(m) return "https://player.vimeo.com/video/"+m[1];
  return "";                       // anything else is not framed at all
}

/* One audio element for the whole quiz, unlocked by the teacher's first tap. A new element per
   question would need a fresh gesture each time, which autoplay cannot provide. */
function lqArmAudio(){
  const a=document.getElementById("lq-audio");
  if(!a || LQ.audioArmed) return;
  try{ a.muted=true; const p=a.play(); if(p&&p.catch) p.catch(()=>{}); a.pause(); a.muted=false; }catch(e){}
  LQ.audioArmed=true;
}

function lqPlayAudio(q, pos){
  const a=document.getElementById("lq-audio");
  /* A clip that cannot be played MUST NOT HOLD THE ROOM. Every failure here — no element, a
     browser that refuses the play, a file that 404s, a play() this environment does not
     implement at all — lands on the same line: start the clock and show the question. The
     alternative is twenty-five phones sitting on "Listening" forever while the teacher has
     no control that gets them off it. */
  if(!a || typeof a.play !== "function"){ lqAudioDone(pos); return; }
  const plays=Math.max(1, Math.min(2, parseInt(q.audioPlays,10) || 1));
  let done=0;
  a.onended=()=>{ done++; if(done>=plays){ a.onended=null; lqAudioDone(pos); }
                  else { a.currentTime=0; try{ const r=a.play(); if(r&&r.catch) r.catch(()=>{}); }catch(e){} } };
  a.onerror=()=>{ a.onerror=null; lqAudioDone(pos); };
  a.src=q.audio;
  try{
    const p=a.play();
    if(p&&p.catch) p.catch(()=>lqAudioDone(pos));
  }catch(e){ lqAudioDone(pos); }
}

/* Fetch the NEXT question's picture while this one is being answered. Without it every
   question begins with a visible stall, and with a countdown running that stall costs the
   class points. */
function lqPreloadNext(){
  const next=LQ.questions[(LQ.settings.pos||0)+1];
  if(!next || !next.image) return;
  const img=new Image();
  img.src=next.image;
}


/* ============================================================================
   ENDING IT
   ============================================================================ */
async function lqEnd(){
  if(!confirm(t("lq.end_confirm", "End the quiz and show the final board?\n\nNothing is kept — once you leave the board the game is gone."))) return;
  lqStopTick();
  const rows=lqStandingsNow();
  LQ.settings.status="ended";
  LQ.settings.endedAt=Backend.serverNow();
  LQ.settings.final=rows.map(r=>({ name:r.name, score:r.score, place:r.place }));
  try{ await Backend.updateMeta(LQ.runId, LQ.settings); }catch(e){ console.warn(e); }
  setTimeout(()=>{ Backend.deleteRun(LQ.runId).catch(e=>console.warn(e)); }, 2500);
  if(LQ.unsub){ LQ.unsub(); LQ.unsub=null; }
  lqRenderFinal(rows);
  showScreen("screen-lq-final");
}

function lqRenderFinal(rows){
  const ttl=document.getElementById("lq-final-title");
  if(ttl) ttl.textContent=LQ.name||t("lq.quiz_game", "Quiz game");
  const list=document.getElementById("lq-final-list");
  if(list){
    list.innerHTML = rows.length
      ? rows.map(r=>'<div class="lq-board-row'+(r.place===1?" top":"")+'">'+
          '<span class="lq-board-place">'+r.place+'</span>'+
          '<span class="lq-board-who">'+escapeHtml(r.name)+'</span>'+
          '<span class="lq-board-pts mono">'+r.score+'</span></div>').join("")
      : '<p class="sub">'+t("lq.no_points_yet", "No points yet.")+'</p>';
  }
}

function lqDone(){
  if(LQ.projecting) lqToggleProject(false);
  LQ.runId=null; LQ.sessionCode=null; LQ.participants=[]; LQ.questions=[]; LQ.settings={};
  teacherHome();
}

function lqToggleProject(on){
  LQ.projecting=!!on;
  document.body.classList.toggle("projecting", LQ.projecting);
  if(LQ.projecting){ try{ requestFS(document.documentElement); }catch(e){} }
  else if(inFullscreen()){ try{ document.exitFullscreen&&document.exitFullscreen(); }catch(e){} }
  lqRenderStage();
}


/* ============================================================================
   STUDENT
   ============================================================================ */
let LQSTU = { runId:null, questions:[], answers:{}, meta:{}, unsub:null, tick:null, removeWatch:null };

async function lqStudentStart(session, surname, firstName){
  LQSTU={ runId:session.runId, questions:session.questions||[], answers:{}, meta:session.meta,
          unsub:null, tick:null, removeWatch:null };
  try{
    const prior=await Backend.getParticipant(LQSTU.runId, STUDENT.id);
    if(prior && prior.progress && prior.progress.qz) LQSTU.answers=prior.progress.qz;
  }catch(e){ console.warn(e); }
  try{ await Backend.joinSession(LQSTU.runId, STUDENT.id, surname, firstName, true); }catch(e){ console.warn(e); }
  const badge=document.getElementById("lqs-name");
  if(badge){ badge.textContent=firstName||""; badge.style.display="inline-block"; }
  showScreen("screen-lq-play");
  /* The waiting room lets a teacher remove somebody — the v3.18 rule, and this game uses it to
     fix the teams before the first question. A removed phone says so instead of sitting on a
     waiting screen forever, and the code still works, so rejoining is one tap. */
  LQSTU.removeWatch = watchForRemoval(LQSTU.runId, STUDENT.id, ()=>{ lqStudentStop(); showRemovedScreen(); });
  lqStudentWatch();
  LQSTU.tick=setInterval(lqStudentTick, 250);
  lqStudentTick();
}

function lqStudentWatch(){
  if(LQSTU.unsub){ LQSTU.unsub(); LQSTU.unsub=null; }
  LQSTU.unsub=Backend.subscribeMeta(LQSTU.runId, s=>{
    if(!s||!s.meta) return;
    LQSTU.meta=s.meta;
    if(s.meta.status==="ended"){ lqStudentEnd(); return; }
    lqRenderStudent();
  });
}

/* Every listener this phone opened, closed. Called both by the end of the quiz and by being
   removed from the room, because a phone that keeps listening to a run it has left is how a
   removed student ends up watching the game they were taken out of. */
function lqStudentStop(){
  if(LQSTU.unsub){ LQSTU.unsub(); LQSTU.unsub=null; }
  if(LQSTU.tick){ clearInterval(LQSTU.tick); LQSTU.tick=null; }
  if(LQSTU.removeWatch){ LQSTU.removeWatch(); LQSTU.removeWatch=null; }
}

function lqStudentEnd(){
  lqStudentStop();
  const mine=(LQSTU.meta.final||[]).filter(r=>r.name===(STUDENT.firstName||""))[0];
  const box=document.getElementById("lqs-final");
  if(box){
    box.innerHTML = mine
      ? '<div class="lqs-place">'+ordinal(mine.place)+'</div><div class="lqs-pts mono">'+mine.score+'</div>'
      : '<p class="sub">'+t("lq.thanks_for_playing", "Thanks for playing.")+'</p>';
  }
  showScreen("screen-lq-done");
}

function lqStudentTick(){
  const pill=document.getElementById("lqs-timer");
  if(!pill) return;
  const pos=LQSTU.meta.pos||0;
  const started=lqStartedAt(LQSTU.meta, pos);
  if(LQSTU.meta.status!=="active" || !started){ pill.style.display="none"; return; }
  const q=LQSTU.questions[pos];
  const left=Math.max(0, Math.round((lqLimitMs(q, LQSTU.meta) - lqElapsed(LQSTU.meta, pos))/1000));
  pill.style.display="inline-block";
  pill.textContent="⏱ "+fmtTime(left);
  pill.className="badge"+(left<=5?" demo":"");
  if(left<=0) lqRenderStudent();
}

/* Which of the five states this phone is in for question `pos`.

   ANSWERED IS CHECKED FIRST, and that order is the whole point: a student who answered and is
   then locked out by the clock must see their own verdict and their points, not the "Time's
   up" card meant for somebody who sent nothing. Asking about the lock first showed the room's
   state where the student's own belonged. */
function lqStudentClosed(pos){
  if(LQSTU.answers[String(pos)]!==undefined) return "answered";
  if(!lqStartedAt(LQSTU.meta, pos)) return "waiting";
  if(metaFlag(LQSTU.meta,"locked",pos)) return "locked";
  const q=LQSTU.questions[pos];
  if(lqElapsed(LQSTU.meta, pos) >= lqLimitMs(q, LQSTU.meta)) return "expired";
  return "";
}

function lqRenderStudent(){
  const body=document.getElementById("lqs-body");
  const status=document.getElementById("lqs-status");
  const qt=document.getElementById("lqs-question");
  if(!body) return;

  if(LQSTU.meta.status==="waiting"){
    if(qt) qt.textContent=t("lq.youre_in", "You're in. Waiting for your teacher to start…");
    body.innerHTML=lqTeamLine();
    if(status) status.textContent=t("poll.keep_page_open", "Keep this page open.");
    return;
  }

  const pos=LQSTU.meta.pos||0;
  const q=LQSTU.questions[pos];
  if(!q) return;
  const qpos=document.getElementById("lqs-qpos");
  if(qpos) qpos.textContent=t("poll.q_x_of_y", "Q {n} / {total}", {n:pos+1, total:LQSTU.questions.length});
  /* The stem on the phone as well as the board. A phone that shows only buttons forces a
     student who cannot see the screen to guess, and in a room of twenty-five somebody always
     cannot see the screen. */
  if(qt) qt.textContent=q.text||"";

  const img=document.getElementById("lqs-img");
  if(img){
    if(q.image){ img.src=q.image; img.style.display="block"; }
    else { img.removeAttribute("src"); img.style.display="none"; }
  }

  const closed=lqStudentClosed(pos);
  body.innerHTML="";

  if(closed==="waiting"){
    /* Audio is playing at the front. Buttons would invite an answer to a question nobody has
       heard the end of yet. */
    body.innerHTML='<div class="vote-locked">'+escapeHtml(t("lq.listen_first", "Listen — you can answer when the clip finishes."))+'</div>';
    if(status) status.textContent="";
    return;
  }
  if(closed==="answered"){
    const a=LQSTU.answers[String(pos)];
    const shown=Array.isArray(a.v)?a.v.join(", "):a.v;
    const revealed=metaFlag(LQSTU.meta,"revealed",pos);
    const right=lqMark(q, a.v);
    const pts=lqIsScored(q) ? qzPoints(right, a.ms, lqLimitMs(q, LQSTU.meta)) : 0;
    /* The verdict rides on a data attribute rather than a conditional class name, for the
       same reason the roster's rejoin marker does: a loose " wrong" in a ternary is
       indistinguishable from a word nobody translated. */
    body.innerHTML='<div class="vote-done" data-verdict="'+
      ((revealed && lqIsScored(q)) ? (right?"1":"0") : "")+'">'+
      escapeHtml(t("lq.your_answer", "Your answer"))+(shown?': <b>'+escapeHtml(String(shown))+'</b>':'')+
      (revealed && lqIsScored(q)
        ? '<div class="vote-verdict">'+(right
            ? "✓ "+escapeHtml(t("lq.plus_points", "+{n}", {n:pts}))
            : escapeHtml(t("poll.answer_was", "The answer was {answer}", {answer:lqAnswerText(q)})))+'</div>'
        : "")+'</div>';
    if(status) status.textContent=t("poll.wait_next_question", "Wait for the next question.");
    return;
  }
  if(closed==="locked"||closed==="expired"){
    body.innerHTML='<div class="vote-locked">'+escapeHtml(t("poll.times_up", "Time’s up"))+'</div>'+
      (metaFlag(LQSTU.meta,"revealed",pos) && lqIsScored(q)
        ? '<div class="vote-verdict standalone">'+escapeHtml(t("poll.answer_was", "The answer was {answer}", {answer:lqAnswerText(q)}))+'</div>'
        : "");
    if(status) status.textContent=t("poll.wait_next_question", "Wait for the next question.");
    return;
  }

  if(q.type==="text" || q.type==="numeric"){
    body.innerHTML='<input type="text" id="lqs-typed" '+NO_KEYBOARD_HELP+' autocomplete="off">'+
      '<button class="btn-primary" style="width:100%;margin-top:8px;" onclick="lqSubmitTyped()">'+
      escapeHtml(t("poll.send", "Send"))+'</button>';
    if(status) status.textContent=t("lq.spelling_counts", "Spelling, capitals and accents count.");
    return;
  }
  if(q.type==="order"){
    body.innerHTML='<p class="sub">'+escapeHtml(t("lq.order_on_the_board", "Put them in order — tap in the right sequence."))+'</p>';
    const picked=[];
    (shuffle((q.items||[]).slice())).forEach(it=>{
      const b=document.createElement("button");
      b.className="btn-outline vote-opt"; b.textContent=it;
      b.onclick=()=>{ if(b.disabled) return; b.disabled=true; b.classList.add("picked");
        picked.push(it); if(picked.length===(q.items||[]).length) lqSubmit(picked); };
      body.appendChild(b);
    });
    if(status) status.textContent="";
    return;
  }
  (q.options||[]).forEach(opt=>{
    const b=document.createElement("button");
    b.className="btn-outline vote-opt"; b.textContent=opt;
    b.onclick=()=>lqSubmit(opt);
    body.appendChild(b);
  });
  if(status) status.textContent = lqIsScored(q)
    ? t("lq.faster_more_points", "The sooner you answer, the more it is worth.")
    : t("lq.not_scored", "This one is not scored — it is for the discussion.");
}

function lqTeamLine(){
  const team=(LQSTU.meta.teamMap||{})[STUDENT.id];
  return team ? '<div class="lqs-team">'+escapeHtml(t("lq.you_are_on", "You are on {team}", {team:team}))+'</div>' : "";
}

function lqSubmitTyped(){
  const el=document.getElementById("lqs-typed");
  lqSubmit(el ? el.value.trim() : "");
}

async function lqSubmit(value){
  const pos=LQSTU.meta.pos||0;
  if(lqStudentClosed(pos)){ lqRenderStudent(); return; }
  /* The elapsed time is measured here, on the way out, and never trusted from a phone for
     anything but this one question's points — which vanish with the run. */
  LQSTU.answers[String(pos)]={ v:value, ms:lqElapsed(LQSTU.meta, pos) };
  lqRenderStudent();
  try{
    await Backend.saveProgressFields(LQSTU.runId, STUDENT.id, STUDENT.surname||"", STUDENT.firstName||"",
      { ["qz/"+pos]: LQSTU.answers[String(pos)], lastUpdate:Date.now() });
  }catch(e){ console.warn(e); }
}


/* ---------- the contract ---------- */
registerActivity("livequiz", {
  join: lqStudentStart,
  teacher: lqCreateSession,
  score: null,          // marked for points on a board, never recorded
  finish: lqEnd,
  rejoin: lqRejoin,
  /* Pseudonyms by default. Nothing is kept and nobody needs identifying afterwards, and a
     projected board of real first names ranks a class by name in front of itself. */
  nameMode: meta => ((meta && meta.naming) === "first") ? "first" : "pseudonym",
  label: "Quiz game",
  keeps: false
});

function lqRejoin(s, run){
  LQ.sessionCode = run.code || s.code;
  LQ.runId = s.runId;
  LQ.questions = run.questions || [];
  LQ.settings = run.meta;
  LQ.name = (run.meta && run.meta.title) || t("lq.quiz_game", "Quiz game");
  LQ.school = (run.meta && run.meta.school) || "";
  document.getElementById("lq-live-code").textContent = LQ.sessionCode;
  document.getElementById("lq-join-code").textContent = LQ.sessionCode;
  document.getElementById("lq-title").textContent = LQ.name;
  const waiting = LQ.settings.status==="waiting";
  lqShowPanel(waiting ? "lobby" : "stage");
  showScreen("screen-lq-live");
  lqRenderQR();
  lqWatchParticipants();
  if(!waiting) lqStartTick();
}
