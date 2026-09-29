/* ============================================================================
   Classroom Exam App — modules/describeit.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Describe It: one phone holds a term and the words you may not use; your partner has to say
   the term.

   The first game, and the clearest case of the platform earning its place. A phone in every
   hand buys exactly one thing paper cannot — information asymmetry — and here the asymmetry IS
   the game: the describer's screen is secret, and a screen is secret in a way a card passed
   across a desk never is.

   Pairs, not teams. One describes, one guesses, then they swap and the guesser has to produce
   the vocabulary they have just spent ninety seconds hearing.

   Nobody marks anybody. The describer taps Got it when the word is said — a judgement about a
   word, not about a person — and the count is the pair's, not either member's. Nothing is kept
   when the game ends. */

let DI = { sessionCode:null, runId:null, terms:[], name:"", sets:[], packLang:"en",
           participants:[], unsub:null, meta:null, tick:null, projecting:false };

let DSTU = { runId:null, meta:null, terms:[], unsub:null, wakeLock:null,
             pos:0, hits:0, fouls:0, round:0, tick:null, pendingWrite:null, lastWrite:0,
             buzzedAt:0 };

/* How long a round runs. Sixty seconds is the classic and it is too short for a class working
   in a second language — they spend it deciding how to start. Ninety is the default here. */
const DI_ROUND_SECONDS = [60, 90, 120, 180];
const DI_DEFAULT_SECONDS = 90;

/* How hard the game is: how many of a term's forbidden words the describer is actually held to.
   Every term is authored with four, and the teacher shows two, three or four of them. Four is a
   real constraint at B2; two is a warm-up. It is one control rather than four packs, and it can
   be turned up between rounds when a class finds the first one easy.

   Which ones: always the FIRST n as authored. The obvious words go first in the sheet, so
   turning the difficulty down removes the obscure ones rather than the ones that matter, and a
   teacher reading the sheet can see exactly what a class will be held to. */
const DI_DIFFICULTIES = [2, 3, 4];
const DI_DEFAULT_DIFFICULTY = 3;

/* A live score that updates on every tap would be one write per word per pair. Writes are
   batched to at most this often, plus one final write when the round ends, so a room of twelve
   pairs costs a few writes a second rather than a few dozen. */
const DI_WRITE_MS = 2000;

/* ---------- pure helpers (no DOM, no database) ---------- */

function diTermAt(terms, order, pos){
  const list=terms||[];
  if(!list.length) return null;
  const idx=(order&&order.length) ? order[pos % order.length] : (pos % list.length);
  return list[idx] || null;
}

/* What the describer may not say, at the difficulty the teacher chose. A term authored with
   fewer than four is legal — it is simply an easier item at the higher settings — so this never
   invents any and never pads the list out. */
function diForbidden(term, count){
  const raw=(term && term.forbidden) || [];
  const all=(Array.isArray(raw) ? raw : String(raw).split(",")).map(s=>String(s).trim()).filter(Boolean);
  const n=(count===undefined || count===null) ? all.length : Math.max(0, count|0);
  return all.slice(0, n);
}

function diDifficulty(meta){
  const n=meta && meta.forbiddenCount;
  return (DI_DIFFICULTIES.indexOf(n)>=0) ? n : DI_DEFAULT_DIFFICULTY;
}

/* A pack is ONE AREA — Business language, Jobs and sectors, General English — and the sets
   inside it are what a lesson picks: meetings, insurance, weather and seasons. Blank means the
   whole area.

   `theme` is still the field name in the data, because packs are already saved with it. The word
   on the screen is "set". */
function diThemes(terms){
  const seen=[];
  (terms||[]).forEach(tm=>{
    const th=String((tm && tm.theme) || "").trim();
    if(th && seen.indexOf(th)<0) seen.push(th);
  });
  return seen;
}

function diTermsIn(terms, theme){
  if(!theme) return (terms||[]).slice();
  return (terms||[]).filter(tm=>String((tm&&tm.theme)||"").trim()===theme);
}

/* The countdown, measured against the clock every device agrees on.

   `now` defaults to Backend.serverNow() rather than Date.now(): the round's start is written by
   the teacher's device and read by twenty-five others, and phone clocks are routinely a minute
   apart. Until v3.9 each device subtracted the teacher's start time from its own clock, so the
   teacher saw 40 seconds left while a student saw 12 and neither was wrong about its own
   arithmetic. Tests pass `now` explicitly. */
function diSecondsLeft(meta, now){
  const started=(meta && meta.roundStartedAt) || 0;
  const secs=(meta && meta.roundSeconds) || DI_DEFAULT_SECONDS;
  if(!started) return secs;
  const at = (now === undefined || now === null)
    ? ((typeof Backend !== "undefined" && Backend.serverNow) ? Backend.serverNow() : Date.now())
    : now;
  return Math.max(0, Math.ceil(secs - ((at - started) / 1000)));
}

function diRoundIsRunning(meta){
  return !!(meta && meta.status==="active" && meta.roundStartedAt && diSecondsLeft(meta) > 0);
}

/* The pair scores, highest first. A pair's count is whatever its describer recorded — the
   guesser writes nothing, which is also what keeps a student from ever recording a number
   against somebody else. */
function diStandings(participants, pairs){
  const byPair={};
  (participants||[]).forEach(p=>{
    const seat=(pairs||{})[p.studentId];
    if(!seat) return;
    const g=seat.g;
    if(!byPair[g]) byPair[g]={ g:g, hits:0, fouls:0, names:[], describer:"" };
    byPair[g].names.push(seat.n || displayName(p.surname, p.firstName));
    if(seat.r===0){
      byPair[g].describer = seat.n || displayName(p.surname, p.firstName);
      byPair[g].hits = Number((p.progress && p.progress.hits) || 0);
    }
    /* Fouls are written by whoever holds the rule — the referee in a three, the guesser in a
       pair — so they arrive on a different record from the hits and are added up here. */
    if(seat.r !== 0) byPair[g].fouls += Number((p.progress && p.progress.fouls) || 0);
  });
  const list=Object.keys(byPair).map(k=>byPair[k]);
  list.sort((a,b)=> b.hits-a.hits || a.g-b.g);
  return list;
}

/* ---------- teacher: setting one up ---------- */

async function diCreateSession(){
  if(!(await confirmNoOpenRun("game"))) return;
  const code = genSessionCode();
  DI = { sessionCode:code, runId:null, terms:[], name:"", sets:[], packLang:"en",
         participants:[], unsub:null, meta:null, tick:null, projecting:false };
  const c=document.getElementById("di-setup-code");
  c.textContent=t("di.code_is", "Code · {code}", {code:code}); c.style.display="inline-block";
  diResetStep2();
  diFillRoundLengths();
  diFillDifficulties();
  await loadDescribeItSetList();
  showScreen("screen-di-setup");
}

function diFillRoundLengths(){
  const sel=document.getElementById("di-seconds-select");
  if(!sel) return;
  sel.innerHTML = DI_ROUND_SECONDS.map(s=>
    '<option value="'+s+'"'+(s===DI_DEFAULT_SECONDS?" selected":"")+'>'+
    escapeHtml(t("di.n_seconds", "{n} seconds", {n:s}))+'</option>').join("");
}

function diFillDifficulties(){
  const sel=document.getElementById("di-difficulty-select");
  if(!sel) return;
  sel.innerHTML = DI_DIFFICULTIES.map(n=>
    '<option value="'+n+'"'+(n===DI_DEFAULT_DIFFICULTY?" selected":"")+'>'+
    escapeHtml(t("di.n_forbidden_words", "{n} forbidden words", {n:n}))+'</option>').join("");
}

/* The theme list comes from the pack, so it can only ever offer a theme the pack actually has —
   the same reason the pack list only offers packs the school has. With one theme there is
   nothing to choose, so the row stays out of the way. */
function diFillThemes(){
  const sel=document.getElementById("di-theme-select");
  if(!sel) return;
  const themes=diThemes(DI.terms);
  const box=document.getElementById("di-theme-row");
  if(box) box.style.display = themes.length>1 ? "block" : "none";
  sel.innerHTML = '<option value="">'+escapeHtml(t("di.all_sets", "All sets"))+'</option>'
    + themes.map(th=>'<option value="'+escapeHtml(th)+'">'+escapeHtml(th)+' ('
      + diTermsIn(DI.terms, th).length + ')</option>').join("");
}

function diResetStep2(){
  DI.terms=[]; DI.name="";
  const sel=document.getElementById("di-set-select"); if(sel) sel.value="";
  const th=document.getElementById("di-theme-row"); if(th) th.style.display="none";
  document.getElementById("di-summary").textContent="";
  document.getElementById("di-start-btn").disabled=true;
}

/* Word sets are not filed by school, unlike quizzes and role plays.

   A quiz belongs to a course: it is written for one cohort, assessed there, and picking another
   school's quiz by accident is a real mistake with real consequences. A word set is vocabulary —
   "weather and seasons" is the same set whoever is in the room — so making a teacher choose a
   school before they can reach one is a step that protects nothing. Every area is offered to
   everyone, sorted by name. */
async function loadDescribeItSetList(){
  try{
    const qs = await Backend.listQuizzes();
    DI.sets = (qs.quizzes||[]).filter(q=>q.kind==="describeit")
                              .sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));
    const sel=document.getElementById("di-set-select");
    sel.innerHTML = '<option value="">'+escapeHtml(DI.sets.length
      ? t("di.select_an_area", "\u2014 select an area \u2014")
      : t("di.no_areas_yet", "\u2014 no word sets yet: add one in Admin \u2014"))+'</option>';
    DI.sets.forEach(a=>{ const o=document.createElement("option"); o.value=a.key;
      o.textContent=a.name+" ("+t("di.n_terms", "{count} {terms}",
        { count:a.count, terms: plural(a.count, t("di.term", "term"), t("di.terms", "terms")) })+")";
      sel.appendChild(o); });
  }catch(e){ console.warn(e); }
}

async function diSetPicked(){
  const key=document.getElementById("di-set-select").value;
  if(!key){ diResetStep2(); return; }
  let rec=null;
  try{ rec=await Backend.getQuiz(key); }catch(e){ alert(t("di.couldn_t_load_area", "Couldn't load that area: ")+e.message); return; }
  if(!rec){ alert(t("di.area_gone", "That area has gone.")); return; }
  DI.terms=rec.questions||[]; DI.name=rec.name||t("di.describe_it", "Describe It");
  DI.packLang=(DI.terms[0] && DI.terms[0].lang) || "en";
  diFillThemes();
  diDescribePack();
  document.getElementById("di-start-btn").disabled = DI.terms.length===0;
}

/* Redrawn whenever the pack, the theme or the difficulty changes, because all three change what
   the class will actually meet. The count that matters is the one for THIS theme. */
function diDescribePack(){
  const theme=(document.getElementById("di-theme-select")||{}).value||"";
  const want=parseInt((document.getElementById("di-difficulty-select")||{}).value,10)||DI_DEFAULT_DIFFICULTY;
  const list=diTermsIn(DI.terms, theme);
  const thin=list.filter(tm=>diForbidden(tm).length < want).length;
  const el=document.getElementById("di-summary");
  if(!el) return;
  el.textContent =
    t("di.setup_summary", "{count} {terms} \u00b7 pairs, one describing",
      { count:list.length,
        terms: plural(list.length, t("di.term", "term"), t("di.terms", "terms")) })
    + (thin ? " \u00b7 " + t("di.n_thinner_than_setting",
        "{n} have fewer than {want} forbidden words, so those are easier", {n:thin, want:want}) : "");
  const startBtn=document.getElementById("di-start-btn");
  if(startBtn) startBtn.disabled = list.length===0;
}

async function diStartSession(){
  if(!DI.terms.length){ alert(t("di.choose_area_first", "Choose an area first.")); return; }
  const secs=parseInt((document.getElementById("di-seconds-select")||{}).value,10) || DI_DEFAULT_SECONDS;
  const want=parseInt((document.getElementById("di-difficulty-select")||{}).value,10) || DI_DEFAULT_DIFFICULTY;
  const theme=(document.getElementById("di-theme-select")||{}).value||"";
  const playing=diTermsIn(DI.terms, theme);
  if(!playing.length){ alert(t("di.set_is_empty", "That set has no terms in it.")); return; }
  const meta = {
    kind:"describeit", status:"waiting", round:0,
    roundSeconds:secs, roundStartedAt:0, forbiddenCount:want, theme:theme,
    title:DI.name||t("di.describe_it", "Describe It"),
    lang:DI.packLang||"en",
    teacherName:(TEACHER_USER&&TEACHER_USER.name)||"",
    teacherEmail:(TEACHER_USER&&TEACHER_USER.email)||"",
    pairs:{}, startedAt:null
  };
  DI.runId = DI.sessionCode+"-"+Date.now().toString(36).toUpperCase();
  /* Only the chosen theme's terms go into the run: a student's phone can read the run, so a
     term that is not being played has no business being on it. */
  try{ await Backend.createSession(DI.runId, DI.sessionCode, meta, playing); }
  catch(e){ alert(t("di.couldn_t_open_game", "Couldn't open the game: ")+e.message); return; }
  DI.meta=meta;
  DI.terms=playing;
  diShowLive();
  diWatchParticipants();
}

function diShowLive(){
  document.getElementById("di-live-code").textContent=DI.sessionCode;
  document.getElementById("di-title").textContent=DI.name||t("di.describe_it", "Describe It");
  document.getElementById("di-join-code").textContent=DI.sessionCode;
  const dealt=(DI.meta && DI.meta.round)>0;
  document.getElementById("di-lobby").style.display = dealt ? "none" : "block";
  document.getElementById("di-stage").style.display = dealt ? "block" : "none";
  showScreen("screen-di-live");
  diRenderQR();
  diFillLiveDifficulty();
  if(dealt){ diRenderStage(); diStartTick(); }
}

function diRenderQR(){
  const holder=document.getElementById("di-qr-code"); if(!holder) return;
  holder.innerHTML="";
  const url=location.origin+location.pathname+"?join="+encodeURIComponent(DI.sessionCode);
  try{ new QRCode(holder,{text:url,width:180,height:180}); }catch(e){ holder.textContent=url; }
  const el=document.getElementById("di-join-url"); if(el) el.textContent=url;
}

function diWatchParticipants(){
  if(DI.unsub) DI.unsub();
  DI.unsub = Backend.subscribeParticipants(DI.runId, res=>{
    DI.participants=(res&&res.participants)||[];
    diFeedOk();
    diRenderRoster();
    if(DI.meta && DI.meta.round>0) diRenderStage();
  }, err=>{ diFeedFailed(err); });
}

/* A refused read looks exactly like an empty room, which is the failure v3.5 went to some
   trouble to stop being silent. The same treatment here. */
function diFeedOk(){
  const w=document.getElementById("di-feed-warning");
  if(w) w.style.display="none";
}
function diFeedFailed(err){
  const w=document.getElementById("di-feed-warning");
  if(!w) return;
  w.style.display="block";
  w.textContent=t("di.feed_failed",
    "The class list cannot be read ({reason}), so this may not be an empty room — it may be a room the app cannot see.",
    { reason:(err&&err.message)||t("di.unknown_reason", "no reason given") });
}

function diRenderRoster(){
  const n=DI.participants.length;
  document.getElementById("di-count").textContent=t("di.n_joined", "{count} joined", {count:n});
  const el=document.getElementById("di-roster");
  el.innerHTML = DI.participants.slice().sort(bySurname)
    .map(p=>'<span class="chip">'+escapeHtml(displayName(p.surname,p.firstName))+'</span>').join("") ||
    '<p class="sub">'+t("di.waiting_students_join", "Waiting for students to join…")+'</p>';
  const dealBtn=document.getElementById("di-deal-btn");
  dealBtn.disabled = n<2;
  const odd=document.getElementById("di-odd-note");
  if(odd){
    odd.style.display = (n>=3 && n%2===1) ? "block" : "none";
    odd.textContent = t("di.odd_number_note",
      "{n} students — an odd one out, so one pair plays as a three with two guessing.", {n:n});
  }
}

/* ---------- teacher: running it ---------- */

async function diDeal(){
  const pairs=pairUp(DI.participants);
  await diPushMeta({ pairs:pairs, status:"active", round:1, roundStartedAt:0,
                     startedAt:(DI.meta&&DI.meta.startedAt)||Date.now() });
  document.getElementById("di-lobby").style.display="none";
  document.getElementById("di-stage").style.display="block";
  diStartTick();
}

async function diStartRound(){
  if(!DI.meta || !DI.meta.round){ return; }
  await diResetScores();
  // The shared clock, not this laptop's: every phone subtracts this from the same number.
  await diPushMeta({ roundStartedAt: Backend.serverNow() });
}

/* Swapping roles starts a fresh round: new describer, new order of terms, counts back to zero.
   The previous round's numbers stay on the teacher's screen until the new round's first tap,
   which is long enough to read them out. */
async function diSwapRoles(){
  if(!DI.meta || !DI.meta.round){ return; }
  await diResetScores();
  await diPushMeta({ pairs: swapPairRoles(metaMap(DI.meta,"pairs")),
                     round: DI.meta.round+1, roundStartedAt: 0 });
}

async function diNewPairs(){
  await diResetScores();
  await diPushMeta({ pairs: pairUp(DI.participants),
                     round: ((DI.meta&&DI.meta.round)||0)+1, roundStartedAt: 0 });
}

/* The counts live on the participant records, which only their own owner may write — so the
   teacher cannot zero them. Each phone clears its own when it sees a new round number; this is
   the local half of that, so the teacher's screen does not show last round's numbers against
   this round's describers. */
async function diResetScores(){
  DI.participants = DI.participants.map(p=>Object.assign({}, p, { progress:null }));
}

async function diPushMeta(changes){
  const meta=Object.assign({}, DI.meta||{}, changes);
  try{ await Backend.updateMeta(DI.runId, meta); }
  catch(e){ alert(t("di.couldn_t_update_game", "Couldn't update the game: ")+e.message); return; }
  DI.meta=meta;
  diRenderStage();
}

/* Turning the screw between rounds. The commonest thing a teacher finds out in round one is
   that the setting was wrong, and re-launching the whole game to fix it is the kind of friction
   that means it never gets fixed. It takes effect on the next round rather than mid-round, so
   nobody's clock changes under them. */
async function diSetDifficulty(){
  const want=parseInt(document.getElementById("di-live-difficulty").value,10) || DI_DEFAULT_DIFFICULTY;
  if(!DI.meta || want===diDifficulty(DI.meta)) return;
  await diPushMeta({ forbiddenCount: want });
}

function diFillLiveDifficulty(){
  const sel=document.getElementById("di-live-difficulty");
  if(!sel) return;
  const now=diDifficulty(DI.meta);
  sel.innerHTML = DI_DIFFICULTIES.map(n=>
    '<option value="'+n+'"'+(n===now?" selected":"")+'>'+
    escapeHtml(t("di.n_forbidden_words", "{n} forbidden words", {n:n}))+'</option>').join("");
}

function diStartTick(){
  if(DI.tick) clearInterval(DI.tick);
  DI.tick=setInterval(()=>{ diRenderClock(); }, 500);
}
function diStopTick(){ if(DI.tick){ clearInterval(DI.tick); DI.tick=null; } }

function diRenderClock(){
  const el=document.getElementById("di-clock");
  if(!el || !DI.meta) return;
  const meta=DI.meta;
  if(!meta.roundStartedAt){
    el.textContent=t("di.not_started", "—");
    el.className="di-clock";
  } else {
    const left=diSecondsLeft(meta);
    el.textContent=left+"s";
    el.className = left<=10 ? "di-clock low" : "di-clock";
  }
  const start=document.getElementById("di-start-round-btn");
  if(start){
    const running=diRoundIsRunning(meta);
    start.disabled=running;
    start.textContent = running
      ? t("di.running", "Running…")
      : (meta.roundStartedAt ? t("di.run_again", "Run it again") : t("di.start_round", "Start the round"));
  }
}

function diRenderStage(){
  const meta=DI.meta||{};
  const pairs=metaMap(meta,"pairs");
  const rd=document.getElementById("di-round");
  if(rd) rd.textContent=t("di.round_n", "Round {n}", {n:meta.round||1});
  const th=document.getElementById("di-live-theme");
  if(th){
    th.textContent = meta.theme || t("di.all_sets", "All sets");
    th.style.display = "inline-block";
  }
  diFillLiveDifficulty();
  diRenderClock();

  const standings=diStandings(DI.participants, pairs);
  const box=document.getElementById("di-pairs");
  if(!box) return;
  box.innerHTML = standings.length ? standings.map((g,i)=>{
    const others=pairMembers(pairs,g.g).filter(m=>m.r!==0).map(m=>escapeHtml(m.name)).join(" &middot; ");
    return '<div class="di-pair'+(i===0&&g.hits>0?" di-pair-top":"")+'">'+
      '<span class="di-pair-no">'+g.g+'</span>'+
      '<span class="di-pair-who"><b>'+escapeHtml(g.describer||"?")+'</b> '+
        '<span class="sub">'+t("di.describing_to", "describing to")+' '+(others||"?")+'</span></span>'+
      '<span class="di-pair-score mono">'+g.hits+
        (g.fouls ? '<span class="di-pair-fouls" title="'+escapeHtml(t("di.ti.fouls", "forbidden words said"))+'">'+
                   escapeHtml(t("di.n_fouls", "{n} fouls", {n:g.fouls}))+'</span>' : '')+
      '</span></div>';
  }).join("") : '<p class="sub">'+t("di.nobody_paired_yet", "Nobody has been paired yet.")+'</p>';
}

/* The projector view: the pairs and the clock, big enough to read from the back. The terms are
   never on this screen — putting them up would end the game. */
function diToggleProject(){
  DI.projecting=!DI.projecting;
  const el=document.getElementById("di-projection");
  if(!el) return;
  if(!DI.projecting){ el.style.display="none"; return; }
  diRenderProjection();
  el.style.display="flex";
}

function diRenderProjection(){
  const meta=DI.meta||{};
  const pairs=metaMap(meta,"pairs");
  const ttl=document.getElementById("di-proj-title");
  if(ttl) ttl.textContent=DI.name||t("di.describe_it", "Describe It");
  const cl=document.getElementById("di-proj-clock");
  if(cl) cl.textContent = meta.roundStartedAt ? diSecondsLeft(meta)+"s" : t("di.ready", "Ready");
  const box=document.getElementById("di-proj-pairs");
  if(box) box.innerHTML = diStandings(DI.participants, pairs).map(g=>
    '<div class="di-proj-pair"><span class="di-proj-no">'+g.g+'</span> '+
    escapeHtml(g.names.join(" · "))+' <b class="mono">'+g.hits+'</b></div>').join("");
}

async function diEnd(){
  if(!confirm(t("di.end_game_nothing_kept",
    "End the game?\n\nNothing is marked and nothing is kept — the terms disappear from every phone."))) return;
  try{
    await Backend.updateMeta(DI.runId, Object.assign({}, DI.meta||{}, { status:"ended" }));
    // Like a poll and a role play: the records name students and hold no marks, so the run goes.
    await Backend.deleteRun(DI.runId);
  }catch(e){ console.warn(e); }
  diCleanup();
  teacherHome();
}

function diLeave(){ diCleanup(); teacherHome(); }

function diCleanup(){
  if(DI.unsub){ DI.unsub(); DI.unsub=null; }
  diStopTick();
  DI.projecting=false;
  const el=document.getElementById("di-projection"); if(el) el.style.display="none";
}

/* ---------- student: the secret screen ---------- */

async function diStudentStart(session, surname, firstName){
  DSTU={ runId:session.runId, meta:session.meta, terms:session.questions||[],
         unsub:null, wakeLock:null, pos:0, hits:0, fouls:0, round:0, tick:null,
         pendingWrite:null, lastWrite:0, buzzedAt:0 };
  try{ await Backend.joinSession(DSTU.runId, STUDENT.id, surname, firstName, true); }
  catch(e){
    alert(t("di.join_refused",
      "You are not in the game: the database refused to record you ({reason}).\n\nTell your teacher — nothing you do would count.",
      { reason:(e&&e.message)||t("di.unknown_reason", "no reason given") }));
    return;
  }
  const badge=document.getElementById("di-card-name");
  if(badge){ badge.textContent=displayName(surname,firstName); badge.style.display="inline-block"; }
  showScreen("screen-di-card");
  diKeepAwake();
  diStudentWatch();
  diStudentTick();
}

function diStudentWatch(){
  if(DSTU.unsub) DSTU.unsub();
  DSTU.unsub = Backend.subscribeMeta(DSTU.runId, res=>{
    if(!res || !res.meta) return;
    const before=DSTU.meta||{};
    DSTU.meta=res.meta;
    if(res.meta.status==="ended"){ diStudentEnd(); return; }
    // A new round means a new deal: fresh terms, count back to zero.
    if((res.meta.round||0) !== (DSTU.round||0)){
      DSTU.round=res.meta.round||0; DSTU.pos=0; DSTU.hits=0; DSTU.fouls=0;
    }
    if((res.meta.roundStartedAt||0) !== (before.roundStartedAt||0) && res.meta.roundStartedAt){
      DSTU.pos=0; DSTU.hits=0; DSTU.fouls=0;
    }
    diRenderCard();
  });
}

function diStudentTick(){
  if(DSTU.tick) clearInterval(DSTU.tick);
  DSTU.tick=setInterval(()=>{ diRenderCardClock(); }, 400);
}

async function diKeepAwake(){
  try{
    if(navigator.wakeLock && navigator.wakeLock.request){
      DSTU.wakeLock = await navigator.wakeLock.request("screen");
      DSTU.wakeLock.addEventListener("release", ()=>{ DSTU.wakeLock=null; });
    }
  }catch(e){ /* unsupported or refused: the game still works, the screen just dims */ }
}
function diReleaseAwake(){
  try{ if(DSTU.wakeLock) DSTU.wakeLock.release(); }catch(e){}
  DSTU.wakeLock=null;
}

function diMySeat(){
  const pairs=metaMap(DSTU.meta,"pairs");
  return pairs[STUDENT.id] || null;
}

function diMyOrder(){
  const seat=diMySeat();
  if(!seat) return [];
  return termOrderFor((DSTU.terms||[]).length, seat.g, (DSTU.meta&&DSTU.meta.round)||1);
}

function diRenderCardClock(){
  const el=document.getElementById("di-card-clock");
  if(!el) return;
  const meta=DSTU.meta||{};
  if(!diRoundIsRunning(meta)){
    el.textContent="";
    if(meta.roundStartedAt && meta.status==="active") diRenderCard();  // the round has just run out
    return;
  }
  const left=diSecondsLeft(meta);
  el.textContent=left+"s";
  el.className = left<=10 ? "di-clock low" : "di-clock";
}

function diRenderCard(){
  const meta=DSTU.meta||{};
  const seat=diMySeat();
  const waiting=document.getElementById("di-card-waiting");
  const main=document.getElementById("di-card-main");

  if(meta.status!=="active" || !seat){
    if(waiting) waiting.style.display="block";
    if(main) main.style.display="none";
    return;
  }
  if(waiting) waiting.style.display="none";
  if(main) main.style.display="block";

  const others=pairMembers(metaMap(meta,"pairs"), seat.g)
    .filter(m=>m.studentId!==STUDENT.id).map(m=>m.name);
  document.getElementById("di-card-pair").textContent=t("di.pair_n", "Pair {n}", {n:seat.g});
  document.getElementById("di-card-partner").textContent = others.length
    ? t("di.with_partner", "With {who}", { who: others.join(", ") })
    : t("di.waiting_for_a_partner", "Waiting for a partner…");

  /* Three seats now, not two. The referee holds the forbidden words and the foul button; with
     only two people that job falls to the guesser, because a describer policing themselves marks
     no fouls at all. */
  const describing = (seat.r===0);
  const refereeing = (seat.r === pairRefereeRole(metaMap(meta,"pairs"), seat.g));
  document.getElementById("di-describer-view").style.display = describing ? "block" : "none";
  document.getElementById("di-referee-view").style.display  = (!describing && refereeing) ? "block" : "none";
  document.getElementById("di-guesser-view").style.display  = (!describing && !refereeing) ? "block" : "none";
  document.getElementById("di-card-role").textContent = describing
    ? t("di.you_describe", "You describe")
    : (refereeing && seat.r===2 ? t("di.you_referee", "You referee")
                                : t("di.you_guess", "You guess"));

  if(describing) diRenderDescriber();
  else if(refereeing) diRenderReferee();
  else diRenderGuesser();
  diRenderCardClock();
}

/* The referee's screen: the words, and one big button.

   It deliberately does NOT show the term. A referee who knows the answer starts helping, and in
   a pair the guesser holding this screen is already being given more than they should have. */
function diRenderReferee(){
  const meta=DSTU.meta||{};
  const seat=diMySeat();
  const running=diRoundIsRunning(meta);
  const guessing=(seat && seat.r===1);
  document.getElementById("di-referee-line").textContent = running
    ? (guessing
        ? t("di.referee_and_guesser", "Guess the word \u2014 and if they say one of these, press the button.")
        : t("di.referee_running", "Listen. If they say one of these, press the button."))
    : (meta.roundStartedAt
        ? t("di.referee_over", "Round over. Wait for your teacher.")
        : t("di.referee_ready", "These are the words your partner may not say. Wait for the round to start."));

  const list=diForbidden(diTermAt(DSTU.terms, diMyOrder(), DSTU.pos), diDifficulty(meta));
  const box=document.getElementById("di-referee-forbidden");
  box.innerHTML = running
    ? (list.length
        ? list.map(w=>'<span class="di-forbid">'+escapeHtml(w)+'</span>').join("")
        : '<span class="sub">'+t("di.no_forbidden_words", "No forbidden words for this one \u2014 anything but the term itself.")+'</span>')
    : "";
  document.getElementById("di-buzz-btn").disabled = !running;
  document.getElementById("di-fouls").textContent = String(DSTU.fouls);
}

function diRenderDescriber(){
  const meta=DSTU.meta||{};
  const running=diRoundIsRunning(meta);
  const ready=document.getElementById("di-describer-ready");
  const play=document.getElementById("di-describer-play");
  const over=document.getElementById("di-describer-over");

  if(!meta.roundStartedAt){
    ready.style.display="block"; play.style.display="none"; over.style.display="none";
    return;
  }
  if(!running){
    ready.style.display="none"; play.style.display="none"; over.style.display="block";
    document.getElementById("di-final-score").textContent=String(DSTU.hits);
    document.getElementById("di-final-line").textContent = t("di.round_over_line",
      "{n} {words} in {secs} seconds.",
      { n:DSTU.hits, secs:meta.roundSeconds||DI_DEFAULT_SECONDS,
        words: plural(DSTU.hits, t("di.word", "word"), t("di.words", "words")) });
    diFlushScore(true);
    return;
  }

  ready.style.display="none"; play.style.display="block"; over.style.display="none";
  const term=diTermAt(DSTU.terms, diMyOrder(), DSTU.pos);
  document.getElementById("di-term").textContent = term ? (term.term||"") : "";
  const list=diForbidden(term, diDifficulty(meta));
  const box=document.getElementById("di-forbidden");
  box.innerHTML = list.length
    ? list.map(w=>'<span class="di-forbid">'+escapeHtml(w)+'</span>').join("")
    : '<span class="sub">'+t("di.no_forbidden_words", "No forbidden words for this one — anything but the term itself.")+'</span>';
  document.getElementById("di-hits").textContent=String(DSTU.hits);
}

function diRenderGuesser(){
  const meta=DSTU.meta||{};
  const running=diRoundIsRunning(meta);
  document.getElementById("di-guesser-line").textContent = running
    ? t("di.guesser_running", "Listen and say the word. Don’t look at their screen.")
    : (meta.roundStartedAt
        ? t("di.guesser_over", "Round over. Wait for your teacher.")
        : t("di.guesser_ready", "Your partner has the words. Wait for the teacher to start the round."));
}

/* The foul button.

   What it does and does not do: it counts, it flashes, and it buzzes the phone. It does NOT
   reach across to the describer's screen and skip the word — a student's phone may only write
   its own record and may not read its partner's, so a cross-device signal would have to be
   relayed by the teacher's browser, and that is two network hops in a game measured in seconds.
   The pair are sitting a metre apart: the referee presses the button and says so, which is what
   happens in the room anyway, and the describer moves on with Pass. The app's job here is to
   keep the count honest, not to carry a shout.

   Deliberately no lockout beyond half a second of debounce: a describer who says three forbidden
   words in one sentence has committed three fouls. */
function diBuzz(){
  if(!diRoundIsRunning(DSTU.meta)) return;
  const now=Date.now();
  if(now - (DSTU.buzzedAt||0) < 500) return;   // one press, not a stutter
  DSTU.buzzedAt=now;
  DSTU.fouls++;
  const flash=document.getElementById("di-buzz-flash");
  if(flash){
    flash.style.display="flex";
    setTimeout(()=>{ flash.style.display="none"; }, 900);
  }
  try{ if(navigator.vibrate) navigator.vibrate([120, 60, 120]); }catch(e){}
  const n=document.getElementById("di-fouls");
  if(n) n.textContent=String(DSTU.fouls);
  diFlushScore(false);
}

/* The describer's two taps. "Got it" is a judgement about a word — did the partner say it —
   not about the partner, which is what keeps this inside the rule that no student ever scores
   another. "Pass" costs nothing but the seconds it takes. */
function diGotIt(){
  if(!diRoundIsRunning(DSTU.meta)) return;
  DSTU.hits++; DSTU.pos++;
  diRenderDescriber();
  diFlushScore(false);
}
function diPass(){
  if(!diRoundIsRunning(DSTU.meta)) return;
  DSTU.pos++;
  diRenderDescriber();
}

/* One write every couple of seconds at most, plus one at the end of the round. The teacher's
   screen updating a beat late costs nothing; a write per tap in a room of twelve pairs is a
   great many writes for a number nobody is reading that closely. */
function diFlushScore(force){
  const seat=diMySeat();
  if(!seat) return;
  /* The describer writes hits; the referee writes fouls. Nobody writes a number about anybody
     else: each record holds only what its own owner tapped, which is the same guard that keeps
     a guesser from putting a score on the board. */
  const mine = (seat.r===0)
    ? { hits:DSTU.hits, round:(DSTU.meta&&DSTU.meta.round)||1 }
    : (seat.r === pairRefereeRole(metaMap(DSTU.meta,"pairs"), seat.g)
        ? { fouls:DSTU.fouls, round:(DSTU.meta&&DSTU.meta.round)||1 }
        : null);
  if(!mine) return;
  const now=Date.now();
  if(!force && (now - DSTU.lastWrite) < DI_WRITE_MS){
    if(DSTU.pendingWrite) return;
    DSTU.pendingWrite=setTimeout(()=>{ DSTU.pendingWrite=null; diFlushScore(true); },
                                 DI_WRITE_MS - (now - DSTU.lastWrite));
    return;
  }
  if(DSTU.pendingWrite){ clearTimeout(DSTU.pendingWrite); DSTU.pendingWrite=null; }
  DSTU.lastWrite=now;
  Backend.saveProgress(DSTU.runId, STUDENT.id, STUDENT.surname, STUDENT.firstName, mine)
    .catch(e=>{
      const w=document.getElementById("di-card-warning");
      if(w){ w.style.display="block";
             w.textContent=t("di.score_not_saved",
               "Your count is not reaching your teacher’s screen ({reason}). Keep playing and tell them the number.",
               { reason:(e&&e.message)||t("di.unknown_reason", "no reason given") }); }
    });
}

function diStudentEnd(){
  if(DSTU.unsub){ DSTU.unsub(); DSTU.unsub=null; }
  if(DSTU.tick){ clearInterval(DSTU.tick); DSTU.tick=null; }
  if(DSTU.pendingWrite){ clearTimeout(DSTU.pendingWrite); DSTU.pendingWrite=null; }
  diReleaseAwake();
  showScreen("screen-di-done");
}

document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState==="visible" && DSTU.runId && !DSTU.wakeLock) diKeepAwake();
});

/* A teacher who closes the tab mid-game gets the room back. */
async function diRejoin(summary, run){
  DI = { sessionCode: run.code || summary.code, runId: summary.runId,
         terms: run.questions||[], name: (run.meta&&run.meta.title)||t("di.describe_it", "Describe It"),
         sets:[], packLang:(run.meta&&run.meta.lang)||"en",
         participants:[], unsub:null, meta: run.meta, tick:null, projecting:false };
  diShowLive();
  diWatchParticipants();
}

/* ---------- the contract ---------- */
registerActivity("describeit", {
  join: diStudentStart,
  teacher: diCreateSession,
  score: null,          // the count is a pair's, lives for one round, and is never marked
  finish: diEnd,
  rejoin: diRejoin,
  label: "Describe It",
  keeps: false          // nothing is archived: the records name students and hold no marks
});
