/* ============================================================================
   Classroom Exam App — modules/bingo.js
   Loaded as a plain script in the order set by index.html; every file shares one
   global scope, so nothing is imported or exported.
   ============================================================================ */

/* VOCABULARY BINGO (v3.32).

   Nine words on a phone, drawn from a list of twenty or more. The teacher calls them one at a
   time; a student taps the ones they hold; a full card is claimed and checked. Nothing is
   kept.

   TWO VERSIONS, teacher's choice, and the difference is the only thing that matters about it:

     WEAK    the teacher calls the WORD and the student finds it on their card.
             Recognition. Ninety seconds of warm-up, and that is all it is.

     STRONG  the teacher calls a DEFINITION or a gapped sentence, and the student works out
             which of their nine words it describes. That is the exercise — and it is why
             tapping is allowed on any cell: if the app only accepted taps on words it had
             already called, the app would be doing the comprehension.

   Both run off the same list, so a short-answer set written for a test plays as either with
   nothing added to it: the answer goes on the card, the question is what gets read out.

   WHAT THE LIST LENGTH DOES. A full card on a 3x3 needs all nine of a student's words. With
   twenty in the list the first of twenty-five cards lands around call fifteen — four or five
   minutes. Twelve words and it is over before the room looks up. The list is the duration
   dial, which is why the setup screen says what it will cost in calls before you start. */

let BG = { sessionCode:null, runId:null, words:[], settings:{}, school:"", sets:[],
           participants:[], unsub:null, tick:null, projecting:false, name:"" };

const BG_DEFAULT_SEC = 12;     // between automatic calls, when the teacher wants timing
const BG_MIN_SEC = 4;
const BG_MAX_SEC = 60;

/* Which of the three ways the words are being called. One question, asked at launch rather
   than when the list was typed — see core/bingocard.js for why both clues are written. */
function bgMode(meta){ return bingoMode(meta); }
function bgShowCalled(meta){ return !!(meta && meta.showCalled); }

/* What to call each mode in a sentence, in the reader's language. A function rather than a
   table built at load time: a table would hold whatever language the page started in. */
function bgModeNoun(mode){
  if(mode==="definition") return t("bg.mode_definition_noun", "definition");
  if(mode==="gap")        return t("bg.mode_gap_noun", "gapped sentence");
  return t("bg.mode_word_noun", "word");
}
function bgTimed(meta){ return !!(meta && meta.timed); }

function bgCallSec(meta){
  const n = parseInt((meta||{}).callSec, 10) || BG_DEFAULT_SEC;
  return Math.max(BG_MIN_SEC, Math.min(BG_MAX_SEC, n));
}


/* ============================================================================
   TEACHER — setting one up
   ============================================================================ */
async function bgCreateSession(){
  if(!(await confirmNoOpenRun("bingo"))) return;
  const code = genSessionCode();
  BG = { sessionCode:code, runId:null, words:[], settings:{}, school:"", sets:[],
         participants:[], unsub:null, tick:null, projecting:false, name:"" };
  const c=document.getElementById("bg-setup-code");
  if(c){ c.textContent=t("lq.code_is", "Code · {code}", {code:code}); c.style.display="inline-block"; }
  bgResetStep2();
  await bgLoadSetList();
  showScreen("screen-bg-setup");
}

/* Bingo's OWN lists and nothing else.

   v3.32 offered every non-poll set in the library, which put a teacher's TESTS in the
   launcher — pick one and you were playing bingo with an exam. A word list is written in
   Admin → Word Lists · Bingo, and like every other game's pack it is filed by area
   rather than by school, so there is no school step here either. */
async function bgLoadSetList(){
  const sel=document.getElementById("bg-set-select");
  if(sel) sel.innerHTML = '<option value="">'+t("bg.select_list", "\u2014 select a word list \u2014")+'</option>';
  try{
    const qs = await Backend.listQuizzes();
    BG.sets = (qs.quizzes||[]).filter(q=>q.kind==="bingo").sort((a,b)=>a.name.localeCompare(b.name));
    const hint=document.getElementById("bg-none-hint");
    if(hint) hint.style.display = BG.sets.length ? "none" : "block";
    if(!sel) return;
    BG.sets.forEach(q=>{
      const o=document.createElement("option"); o.value=q.key;
      o.textContent=q.name+" ("+t("bg.n_words_paren", "{count} {words}",
        { count:q.count, words: plural(q.count, t("bg.word", "word"), t("bg.words", "words")) })+")";
      sel.appendChild(o);
    });
  }catch(e){ console.warn(e); }
}


function bgResetStep2(){
  const st=document.getElementById("bg-set-status");
  if(st){ st.style.display="none"; st.textContent=""; }
  const s2=document.getElementById("bg-step2"); if(s2) s2.style.display="none";
  const pick=document.getElementById("bg-select-btn"); if(pick) pick.style.display="block";
}

function bgSetPicked(){ BG.words=[]; bgResetStep2(); }

async function loadBgSet(){
  const key=document.getElementById("bg-set-select").value;
  const status=document.getElementById("bg-set-status");
  if(!key){ alert(t("bg.pick_list_first", "Pick a word list first.")); return; }
  try{
    const set=await Backend.getQuiz(key);
    if(!set){ alert(t("bg.list_could_found", "That word list could not be found.")); return; }
    const words=bingoWords(set.questions||[]);
    /* Refused rather than started. A list of twelve is a game that is over before half the
       room has looked up, and finding that out in front of a class is worse than being told
       now. The number is in the message because the fix is "add six more words", not
       "something is wrong". */
    if(words.length < BINGO_MIN_WORDS){
      alert(t("bg.list_too_short",
        "That list gives {count} usable {words}, and bingo needs at least {min}.\n\nA card is 9 words, and a list barely bigger than the card is over in a minute. Add more short-answer questions, or pick a longer list.",
        { count:words.length,
          words: plural(words.length, t("bg.word", "word"), t("bg.words", "words")),
          min: BINGO_MIN_WORDS }));
      return;
    }
    BG.words=words;
    BG.name=set.name||t("bg.word_list", "Word list");
    status.textContent=t("bg.selected_n",
      "✓ Selected — {count} {words}. {defs} have a definition, {gaps} a gapped sentence.",
      { count:words.length,
        words: plural(words.length, t("bg.word", "word"), t("bg.words", "words")),
        defs: bingoModeCount(words, "definition"),
        gaps: bingoModeCount(words, "gap") });
    status.style.display="flex";
    document.getElementById("bg-select-btn").style.display="none";
    document.getElementById("bg-step2").style.display="block";
    bgPaintEstimate();
  }catch(e){ alert(t("poll.load_failed", "Load failed: ")+e.message); }
}

/* How long this will take, said out loud before the lesson rather than discovered during it.
   The list length is the only dial there is, so the teacher should be able to see what they
   have chosen. */
function bgPaintEstimate(){
  const el=document.getElementById("bg-estimate");
  if(!el || !BG.words.length) return;
  const calls=bingoExpectedCalls(BG.words.length, 25, 120);
  const secs=bgCallSec(BG.settings)||BG_DEFAULT_SEC;
  el.textContent=t("bg.estimate",
    "About {calls} calls before the first full card in a class of 25 — roughly {mins} minutes at {secs}s a call.",
    { calls:calls, mins:Math.max(1, Math.round(calls*secs/60)), secs:secs });
}

async function bgStartSession(){
  if(BG.words.length < BINGO_MIN_WORDS){ alert(t("bg.choose_list_first", "Choose a word list first.")); return; }
  const mode = (document.getElementById("bg-mode")||{}).value || "word";
  /* A game played on definitions needs definitions. A word without one still plays — it falls
     back to its other clue, then to itself — but the teacher should know how many before the
     class does, not while reading one out. */
  if(mode!=="word"){
    const have=bingoModeCount(BG.words, mode);
    const without=BG.words.length-have;
    if(without && !confirm(t("bg.some_without_clues",
      "{count} of these {words} have no {kind} written for them. Those fall back to the other clue, or to the word itself.\n\nStart anyway?",
      { count:without, words: plural(BG.words.length, t("bg.word", "word"), t("bg.words", "words")),
        kind: bgModeNoun(mode) }))) return;
  }
  BG.settings={
    kind:"bingo", status:"waiting", title:BG.name||t("bg.word_list", "Word list"),
    school:BG.school||"",
    callMode: mode,
    showCalled: !!(document.getElementById("bg-show-called")||{}).checked,
    timed: !!(document.getElementById("bg-timed")||{}).checked,
    callSec: Math.max(BG_MIN_SEC, Math.min(BG_MAX_SEC,
      parseInt((document.getElementById("bg-call-sec")||{}).value, 10) || BG_DEFAULT_SEC)),
    /* The order is drawn ONCE and stored, so every phone and the projector agree about what
       has been called — and so a teacher who closes the tab and rejoins carries on down the
       same list instead of starting a new sequence over a half-marked room. */
    order: bingoCallOrder(BG.words.length),
    callIdx: 0, calledAt: 0, winners: [],
    teacherName:(TEACHER_USER&&TEACHER_USER.name)||"",
    teacherEmail:(TEACHER_USER&&TEACHER_USER.email)||""
  };
  BG.runId = BG.sessionCode+"-"+Date.now().toString(36).toUpperCase();
  /* The words ride in the questions slot, which is what every student already reads. The card
     is nine INDEXES into this list, worked out on the phone — see core/bingocard.js. */
  try{ await Backend.createSession(BG.runId, BG.sessionCode, BG.settings, BG.words); }
  catch(e){ alert(t("bg.couldn_t_open", "Couldn't open the game: ")+e.message); return; }
  document.getElementById("bg-live-code").textContent=BG.sessionCode;
  document.getElementById("bg-join-code").textContent=BG.sessionCode;
  document.getElementById("bg-title").textContent=BG.name||"";
  bgShowPanel("lobby");
  showScreen("screen-bg-live");
  bgRenderQR();
  bgWatchParticipants();
}

function bgShowPanel(which){
  const lobby=document.getElementById("bg-lobby"), stage=document.getElementById("bg-stage");
  if(lobby) lobby.classList.toggle("on", which==="lobby");
  if(stage) stage.classList.toggle("on", which==="stage");
}

function bgJoinUrl(){ return location.origin+location.pathname+"?join="+encodeURIComponent(BG.sessionCode); }

function bgRenderQR(){
  const box=document.getElementById("bg-qr");
  if(!box) return;
  box.innerHTML="";
  if(typeof QRCode==="undefined"){ box.innerHTML='<p class="sub">'+t("poll.qr_needs_internet_students_type_code", 'QR needs internet — students can type the code.')+'</p>'; return; }
  try{ new QRCode(box,{ text:bgJoinUrl(), width:190, height:190, correctLevel:QRCode.CorrectLevel.M }); }
  catch(e){ box.innerHTML='<p class="sub">'+t("poll.qr_unavailable_students_type_code", 'QR unavailable — students can type the code.')+'</p>'; }
}

function copyBgJoinLink(){
  const url=bgJoinUrl();
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(()=>alert(t("poll.join_link_copied", "Join link copied:\n")+url),()=>prompt(t("poll.copy_this_link", "Copy this link:"),url));
  else prompt(t("poll.copy_this_link", "Copy this link:"),url);
}


/* ============================================================================
   THE ROOM
   ============================================================================ */
function bgWatchParticipants(){
  if(BG.unsub){ BG.unsub(); BG.unsub=null; }
  BG.unsub=Backend.subscribeParticipants(BG.runId, r=>{
    BG.participants=r.participants||[];
    bgRenderLobby();
    if(BG.settings.status==="active"){
      bgRenderStage();
      /* A claim arrives as a write to the student's own record, which is what this
         subscription already delivers — so the ruling happens the moment the claim lands,
         with no polling and nothing for the teacher to press. */
      bgCheckClaims();
    }
  });
}

function bgRenderLobby(){
  const n=BG.participants.length;
  const c=document.getElementById("bg-lobby-count"); if(c) c.textContent=n;
  const l=document.getElementById("bg-lobby-count-label");
  if(l) l.textContent=plural(n, t("poll.student_connected", "student connected"), t("poll.students_connected", "students connected"));
  const box=document.getElementById("bg-lobby-roster");
  if(box) box.innerHTML=lobbyRoster(BG.participants, "bgRemove");
}

async function bgRemove(studentId){
  await removeFromLobby(BG.runId, BG.participants, studentId,
    { round: BG.settings.status==="waiting" ? 0 : 1 });
}

async function bgBegin(){
  const n=BG.participants.length;
  if(!confirm((n===0 ? t("lq.nobody_joined", "Nobody has joined yet.")
                     : t("poll.n_students_connected", "{count} {students} connected.",
                         { count:n, students: plural(n, t("poll.student", "student"), t("poll.students", "students")) }))
     + " " + t("bg.start_now", "Start bingo now?"))) return;
  BG.settings.status="active";
  BG.settings.callIdx=0;
  await bgCall();                    // the first word goes out with the start
  bgShowPanel("stage");
  bgStartTick();
}

/* Call the next word. One function for both the button and the timer, because "the teacher
   pressed it" and "the clock came round" must put exactly the same thing on the board. */
async function bgCall(){
  if(BG.settings.callIdx >= (BG.settings.order||[]).length) return;
  BG.settings.callIdx = (BG.settings.callIdx||0) + 1;
  BG.settings.calledAt = Backend.serverNow();
  try{ await Backend.updateMeta(BG.runId, BG.settings); }catch(e){ console.warn(e); }
  bgRenderStage();
}

function bgStartTick(){ bgStopTick(); BG.tick=setInterval(bgTick, 250); bgTick(); }
function bgStopTick(){ if(BG.tick){ clearInterval(BG.tick); BG.tick=null; } }

async function bgTick(){
  if(!BG.runId || BG.settings.status!=="active") return;
  const pill=document.getElementById("bg-timer");
  /* Timing is a TOGGLE, not the mode. Off, the teacher calls each word when the room is
     ready — which is what you want with a class that is reading definitions. On, it keeps a
     warm-up moving. Neither changes the game, only who decides when the next word comes. */
  if(!bgTimed(BG.settings)){ if(pill) pill.style.display="none"; return; }
  const left=Math.max(0, Math.round((bgCallSec(BG.settings)*1000 - (Backend.serverNow()-(BG.settings.calledAt||0)))/1000));
  if(pill){
    pill.style.display="inline-block";
    pill.textContent="⏱ "+left;
    pill.className="badge"+(left<=3?" demo":"");
  }
  if(left<=0 && BG.settings.callIdx < (BG.settings.order||[]).length) await bgCall();
}


/* ============================================================================
   THE STAGE
   ============================================================================ */
function bgRenderStage(){
  if(!BG.runId || BG.settings.status!=="active") return;
  const order=BG.settings.order||[], idx=BG.settings.callIdx||0;
  const cur=idx>0 ? BG.words[order[idx-1]] : null;

  const pos=document.getElementById("bg-callno");
  if(pos) pos.textContent=t("bg.call_x_of_y", "Call {n} / {total}", {n:idx, total:order.length});

  const big=document.getElementById("bg-call-big");
  if(big) big.textContent = cur ? bingoCallText(cur, bgMode(BG.settings)) : "";
  /* When a clue is being read, the word itself is held back on a second line the teacher can
     reveal — so a room that is stuck gets the answer from the front rather than from the
     student next to them. */
  const word=document.getElementById("bg-call-word");
  if(word){
    /* Held back only when the clue being read is not the word itself — otherwise the board
       would blur the very thing it has just called out. */
    const hide = bgMode(BG.settings)!=="word" && cur &&
                 bingoCallText(cur, bgMode(BG.settings)) !== cur.word;
    word.textContent = cur ? cur.word : "";
    word.classList.toggle("hidden-word", !!hide && !BG.showWord);
    word.style.display = cur ? "block" : "none";
  }
  const revealBtn=document.getElementById("bg-reveal-btn");
  if(revealBtn) revealBtn.style.display =
    (bgMode(BG.settings)!=="word" && cur && bingoCallText(cur, bgMode(BG.settings)) !== cur.word) ? "" : "none";

  /* The called list: a toggle, because it changes the game. Shown, a student who missed a
     word can catch up and the exercise becomes reading a list; hidden, they had to be
     listening. Warm-up on, exercise off. */
  const hist=document.getElementById("bg-called");
  if(hist){
    if(bgShowCalled(BG.settings)){
      /* PREVIOUS calls, not including the one on the wall. The first version listed every
         call including the current one, which printed "underwriter" in the history strip
         while its definition was still up with the word itself blurred out — the whole
         game answered by its own catch-up list. The history is what has been and
         gone; the current call is the thing above it. */
      const past=bingoCalled(order, Math.max(0, idx-1));
      hist.style.display="block";
      hist.innerHTML=past.length
        ? past.map(w=>'<span class="bg-chip">'+escapeHtml(BG.words[w].word)+'</span>').join("")
        : '<span class="sub">'+escapeHtml(t("bg.nothing_called_yet", "Nothing called yet."))+'</span>';
    } else { hist.style.display="none"; hist.innerHTML=""; }
  }

  const left=document.getElementById("bg-left");
  if(left) left.textContent=t("bg.n_left", "{n} left", { n: order.length - idx });

  bgRenderWinners();

  const callBtn=document.getElementById("bg-call-btn");
  if(callBtn){
    const done = idx >= order.length;
    callBtn.disabled = done;
    callBtn.textContent = done ? t("bg.list_finished", "List finished")
                               : t("bg.call_next", "Call the next word");
  }
}

function bgRevealWord(){ BG.showWord=true; bgRenderStage(); }

/* Who has a verified full card, in the order they claimed. Written by the teacher's device
   after it has checked the claim — a student's own record cannot be the thing that declares
   them the winner. */
function bgRenderWinners(){
  const box=document.getElementById("bg-winners");
  if(!box) return;
  const w=BG.settings.winners||[];
  box.innerHTML = w.length
    ? w.map((n,i)=>'<div class="lq-board-row'+(i===0?" top":"")+'">'+
        '<span class="lq-board-place">'+(i+1)+'</span>'+
        '<span class="lq-board-who">'+escapeHtml(n)+'</span></div>').join("")
    : '<p class="sub">'+t("bg.no_full_cards_yet", "No full cards yet.")+'</p>';
}

/* A claim arrives as a flag on the student's own record, and is CHECKED HERE — on the
   teacher's device, against the calls the teacher made. The student's phone has already told
   them whether it looks complete; this is the ruling that counts, and it is the same reason
   the test recomputes a mark rather than trusting a submitted score (v3.20a). */
async function bgCheckClaims(){
  if(!BG.runId || BG.settings.status!=="active") return;
  const order=BG.settings.order||[], called=bingoCalled(order, BG.settings.callIdx||0);
  const winners=(BG.settings.winners||[]).slice();
  let changed=false;
  BG.participants.forEach(p=>{
    const pr=(p.progress)||{};
    if(!pr.claim) return;
    const name=p.firstName||p.surname||"?";
    if(winners.indexOf(name)>=0) return;
    const card=bingoCard(BG.words, BG.runId, p.studentId);
    const v=bingoVerify(card, pr.marks||[], called);
    if(v.valid){ winners.push(name); changed=true; }
  });
  if(changed){
    BG.settings.winners=winners;
    try{ await Backend.updateMeta(BG.runId, BG.settings); }catch(e){ console.warn(e); }
    bgRenderWinners();
  }
}

async function bgEnd(){
  if(!confirm(t("bg.end_confirm", "End the game?\n\nNothing is kept — the cards and the calls go with it."))) return;
  bgStopTick();
  BG.settings.status="ended";
  BG.settings.endedAt=Backend.serverNow();
  try{ await Backend.updateMeta(BG.runId, BG.settings); }catch(e){ console.warn(e); }
  setTimeout(()=>{ Backend.deleteRun(BG.runId).catch(e=>console.warn(e)); }, 2500);
  if(BG.unsub){ BG.unsub(); BG.unsub=null; }
  const ttl=document.getElementById("bg-final-title");
  if(ttl) ttl.textContent=BG.name||t("bg.bingo", "Bingo");
  const list=document.getElementById("bg-final-list");
  const w=BG.settings.winners||[];
  if(list) list.innerHTML = w.length
    ? w.map((n,i)=>'<div class="lq-board-row'+(i===0?" top":"")+'">'+
        '<span class="lq-board-place">'+(i+1)+'</span>'+
        '<span class="lq-board-who">'+escapeHtml(n)+'</span></div>').join("")
    : '<p class="sub">'+t("bg.nobody_filled_card", "Nobody filled a card.")+'</p>';
  showScreen("screen-bg-final");
}

function bgDone(){
  if(BG.projecting) bgToggleProject(false);
  BG.runId=null; BG.sessionCode=null; BG.participants=[]; BG.words=[]; BG.settings={};
  teacherHome();
}

function bgToggleProject(on){
  BG.projecting=!!on;
  document.body.classList.toggle("projecting", BG.projecting);
  if(BG.projecting){ try{ requestFS(document.documentElement); }catch(e){} }
  else if(inFullscreen()){ try{ document.exitFullscreen&&document.exitFullscreen(); }catch(e){} }
  bgRenderStage();
}


/* ============================================================================
   STUDENT
   ============================================================================ */
let BGSTU = { runId:null, words:[], card:[], marks:[], meta:{}, claimed:false,
              unsub:null, removeWatch:null };

async function bgStudentStart(session, surname, firstName){
  BGSTU={ runId:session.runId, words:session.questions||[], card:[], marks:[], meta:session.meta,
          claimed:false, unsub:null, removeWatch:null };
  /* The card is DERIVED, not stored — so a reload gives back the card they were playing
     rather than a fresh one with the words they still needed. */
  BGSTU.card=bingoCard(BGSTU.words, BGSTU.runId, STUDENT.id);
  try{
    const prior=await Backend.getParticipant(BGSTU.runId, STUDENT.id);
    if(prior && prior.progress){
      if(Array.isArray(prior.progress.marks)) BGSTU.marks=prior.progress.marks;
      BGSTU.claimed=!!prior.progress.claim;
    }
  }catch(e){ console.warn(e); }
  try{ await Backend.joinSession(BGSTU.runId, STUDENT.id, surname, firstName, true); }catch(e){ console.warn(e); }
  const badge=document.getElementById("bgs-name");
  if(badge){ badge.textContent=firstName||""; badge.style.display="inline-block"; }
  showScreen("screen-bg-play");
  BGSTU.removeWatch = watchForRemoval(BGSTU.runId, STUDENT.id, ()=>{ bgStudentStop(); showRemovedScreen(); });
  bgStudentWatch();
  bgRenderStudent();
}

function bgStudentWatch(){
  if(BGSTU.unsub){ BGSTU.unsub(); BGSTU.unsub=null; }
  BGSTU.unsub=Backend.subscribeMeta(BGSTU.runId, s=>{
    if(!s||!s.meta) return;
    BGSTU.meta=s.meta;
    if(s.meta.status==="ended"){ bgStudentEnd(); return; }
    bgRenderStudent();
  });
}

function bgStudentStop(){
  if(BGSTU.unsub){ BGSTU.unsub(); BGSTU.unsub=null; }
  if(BGSTU.removeWatch){ BGSTU.removeWatch(); BGSTU.removeWatch=null; }
}

function bgStudentEnd(){
  bgStudentStop();
  const won=(BGSTU.meta.winners||[]).indexOf(STUDENT.firstName||"")>=0;
  const box=document.getElementById("bgs-final");
  if(box) box.innerHTML = won
    ? '<div class="lqs-place">'+escapeHtml(t("bg.you_filled_your_card", "You filled your card"))+'</div>'
    : '<p class="sub">'+escapeHtml(t("lq.thanks_for_playing", "Thanks for playing."))+'</p>';
  showScreen("screen-bg-done");
}

function bgRenderStudent(){
  const grid=document.getElementById("bgs-grid");
  const status=document.getElementById("bgs-status");
  if(!grid) return;

  if(BGSTU.meta.status==="waiting"){
    grid.innerHTML="";
    const head=document.getElementById("bgs-head");
    if(head) head.textContent=t("bg.youre_in", "You're in. Here is your card — wait for the first word.");
  } else {
    const head=document.getElementById("bgs-head");
    if(head) head.textContent=t("bg.your_card", "Your card");
  }

  /* The grid. Nine buttons, big enough for a thumb, and a tap is allowed on ANY of them: in
     a clue-called game working out which word the clue describes IS the exercise, and
     an app that only accepted taps on words it had already called would be doing it for
     them. The optimistic tap is checked when the card is claimed. */
  grid.innerHTML=BGSTU.card.map((ix,cell)=>{
    const w=BGSTU.words[ix];
    const marked=BGSTU.marks.indexOf(ix)>=0;
    return '<button class="bg-cell" data-marked="'+(marked?"1":"0")+'" '+
      'onclick="bgTap('+cell+')">'+escapeHtml((w&&w.word)||"")+'</button>';
  }).join("");

  const n=BGSTU.marks.length;
  const claim=document.getElementById("bgs-claim");
  if(claim){
    const full=n>=BINGO_CELLS;
    claim.style.display = (BGSTU.meta.status==="active") ? "" : "none";
    claim.disabled = !full || BGSTU.claimed;
    claim.textContent = BGSTU.claimed ? t("bg.claimed", "Claimed")
                      : full ? t("bg.call_bingo", "Call bingo!")
                      : t("bg.n_of_9", "{n} of 9", { n:n });
  }
  if(status){
    status.textContent = BGSTU.claimed
      ? t("bg.checking", "Checking your card…")
      : (BGSTU.meta.status==="waiting" ? t("poll.keep_page_open", "Keep this page open.") : "");
  }
}

function bgTap(cell){
  if(BGSTU.meta.status!=="active" || BGSTU.claimed) return;
  const ix=BGSTU.card[cell];
  if(ix===undefined) return;
  const at=BGSTU.marks.indexOf(ix);
  if(at>=0) BGSTU.marks.splice(at,1); else BGSTU.marks.push(ix);
  bgRenderStudent();
  Backend.saveProgressFields(BGSTU.runId, STUDENT.id, STUDENT.surname||"", STUDENT.firstName||"",
    { marks:BGSTU.marks.slice(), lastUpdate:Date.now() }).catch(e=>console.warn(e));
}

/* The claim. The phone checks first and says so — an honest mistake is caught here, privately,
   rather than by a teacher in front of the room. Only a card that looks right to the student's
   own device is sent on to be ruled on. */
async function bgClaim(){
  if(BGSTU.claimed) return;
  const called=bingoCalled(BGSTU.meta.order||[], BGSTU.meta.callIdx||0);
  const v=bingoVerify(BGSTU.card, BGSTU.marks, called);
  if(!v.full){ alert(t("bg.not_full_yet", "Your card is not full yet.")); return; }
  if(!v.valid){
    /* FALSE BINGO, auto-rejected. Named, not scolded: the point is that they learn which
       word they jumped on, and that the room never hears about it. */
    const words=v.wrong.map(i=>(BGSTU.words[i]||{}).word).filter(Boolean);
    alert(t("bg.false_bingo",
      "Not yet — {list} {hasnt} been called.\n\nUntick it and keep listening.",
      { list: words.join(", "),
        hasnt: plural(words.length, t("bg.hasnt", "hasn’t"), t("bg.havent", "haven’t")) }));
    return;
  }
  BGSTU.claimed=true;
  bgRenderStudent();
  try{
    await Backend.saveProgressFields(BGSTU.runId, STUDENT.id, STUDENT.surname||"", STUDENT.firstName||"",
      { marks:BGSTU.marks.slice(), claim:true, lastUpdate:Date.now() });
  }catch(e){ console.warn(e); }
}


/* ---------- the contract ---------- */
registerActivity("bingo", {
  join: bgStudentStart,
  teacher: bgCreateSession,
  score: null,          // a game: somebody fills a card, and nothing is written down
  finish: bgEnd,
  rejoin: bgRejoin,
  /* Pseudonyms, like the quiz: nothing is kept, nobody needs identifying afterwards, and the
     name only exists so a winner can be read out. */
  nameMode: meta => ((meta && meta.naming) === "first") ? "first" : "pseudonym",
  label: "Bingo",
  keeps: false
});

function bgRejoin(s, run){
  BG.sessionCode = run.code || s.code;
  BG.runId = s.runId;
  BG.words = run.questions || [];
  BG.settings = run.meta;
  BG.name = (run.meta && run.meta.title) || t("bg.bingo", "Bingo");
  BG.school = (run.meta && run.meta.school) || "";
  document.getElementById("bg-live-code").textContent = BG.sessionCode;
  document.getElementById("bg-join-code").textContent = BG.sessionCode;
  document.getElementById("bg-title").textContent = BG.name;
  const waiting = BG.settings.status==="waiting";
  bgShowPanel(waiting ? "lobby" : "stage");
  showScreen("screen-bg-live");
  bgRenderQR();
  bgWatchParticipants();
  if(!waiting) bgStartTick();
}
