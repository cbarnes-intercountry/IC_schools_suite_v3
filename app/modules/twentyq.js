/* ============================================================================
   Classroom Exam App — modules/twentyq.js
   Part of index.html's script, new in v3.11. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Twenty Questions: one phone holds a secret; the partner has twenty yes/no questions to find it.

   The second game, and the one that made the platform pay for itself twice. Describe It trains
   circumlocution — say it another way. This trains the thing a French speaker loses first and
   most expensively: the QUESTION. Auxiliary inversion, "Is it…?" / "Does it…?" / "Can you…?" /
   "Have you…?", twenty times a round, without a single gap-fill.

   The mechanic that does the teaching is the third button. The holder answers Yes or No — and
   each of those costs the asker one of their twenty. But "What colour is it?" is not a yes/no
   question, so it gets the third button, and that one does NOT count. The asker learns, in the
   only currency the game has, that a well-formed question is worth something. Nobody corrects
   anybody; the rule does it.

   The count lives on the holder's phone and the asker cannot see it, because a student may read
   only their own record — the same rule that stops anyone scoring a classmate. That is not a
   limitation worked around: it means the asker has to ASK how many they have left, in English,
   and the holder has to answer. Both of them end up talking to each other rather than reading a
   screen, which is the whole point of putting them in pairs.

   Nobody marks anybody. The holder taps "They got it" — a judgement about whether a word was
   said, not about a person — and the count is the pair's. Nothing is kept when the game ends. */

let TQ = { sessionCode:null, runId:null, subjects:[], name:"", sets:[], packLang:"en",
           areaSubjects:[], areaName:"", chosen:[],
           participants:[], unsub:null, meta:null, tick:null, projecting:false };

let TQSTU = { runId:null, meta:null, subjects:[], unsub:null, wakeLock:null,
              pos:0, hits:0, solved:0, asked:0, revealed:false, round:0, tick:null,
              pendingWrite:null, lastWrite:0, phase:null, lost:false };

/* How long a round runs. Far longer than Describe It's ninety seconds, and it has to be: a
   single subject takes two or three minutes of real questioning, and a round that only fits one
   card turns the whole activity into a series of starts. Five minutes is two or three subjects
   for a working pair, which is enough for the swap to feel like a second go rather than a retry. */
const TQ_ROUND_SECONDS = [180, 300, 480];
const TQ_DEFAULT_SECONDS = 300;

/* How hard the game is: how many questions the asker gets. Twenty is the name of the game and
   the default. Fifteen and ten are there because a class that has played it twice finds twenty
   generous, and because a short cap forces the good questions early — "Is it alive?" before
   "Is it a stapler?" — which is exactly the thinking the activity is for. */
const TQ_CAPS = [10, 15, 20];
const TQ_DEFAULT_CAP = 20;

/* The categories a subject can be. The asker is told this BEFORE the first question, which looks
   like a giveaway and is the opposite: without it the first six questions are spent establishing
   that we are not talking about an animal, and the narrowing — the part with the language in
   it — never starts. Kept as a closed list so a pack cannot invent one the screens cannot show. */
const TQ_CATEGORIES = ["Object", "Place", "Person", "Job", "Animal", "Activity"];

/* Batched writes, as in Describe It: a write per tap in a room of twelve pairs is a great many
   writes for a number nobody is reading that closely. */
const TQ_WRITE_MS = 2000;

/* Three sets, for the same reason Describe It has three. */
const TQ_MAX_SETS = 3;


/* ---------- pure helpers (no DOM, no database) ---------- */

/* The round machinery — the clock, the pair counts, the running totals, when a round is banked,
   and how a pack's sets are read — lives in core/rounds.js, shared with Describe It. What is
   here is what is Twenty Questions': its own menus, and what a card is. */
function tqRoundSeconds(meta){ return pickRoundLength(meta, TQ_ROUND_SECONDS, TQ_DEFAULT_SECONDS); }
function tqSecondsLeft(meta, now){ return roundSecondsLeft(meta, tqRoundSeconds(meta), now); }
function tqRoundIsRunning(meta){ return roundIsRunning(meta, tqRoundSeconds(meta)); }
function tqPhase(meta){ return roundPhase(meta, tqRoundSeconds(meta)); }

/* The question limit, validated the same way the round length is: a hand-edited run carrying a
   cap no menu offers would run a game the teacher cannot see the settings of. */
function tqCap(meta){
  const n=parseInt((meta||{}).cap,10);
  return TQ_CAPS.indexOf(n)>=0 ? n : TQ_DEFAULT_CAP;
}

/* A category the screens can actually show. A pack row that names something else is not an error
   worth refusing a whole area for — it just falls back to the least specific honest answer. */
function tqCategory(card){
  const c=String((card && card.category) || "").trim();
  const hit=TQ_CATEGORIES.find(k=>k.toLowerCase()===c.toLowerCase());
  return hit || "Object";
}

function tqCategoryLabel(card){
  const k=tqCategory(card);
  return t("tq.cat_"+k.toLowerCase(), k);
}

function tqHint(card){ return String((card && card.hint) || "").trim(); }

/* ---------- the fact card (v3.12) ----------

   Reported from a lesson, and it is the hardest problem this game has: a 19-year-old handed
   "Serge Gainsbourg" cannot answer "Is he alive?", let alone "Did he act in films?" — and it runs
   the other way too, with a teacher's set of current names.

   In Describe It the describer needs to know ONE WORD. Here the holder has to answer twenty
   arbitrary questions about a person, which needs a whole biography. Choosing gentler names does
   not fix that; it only moves which half of the room is stuck.

   So the card carries the facts. The holder reads them and converts them into spoken yes/no
   answers in real time, which is harder and more useful than reciting what they already knew —
   and the set can now hold anybody, in any decade, for any class.

   Facts are a plain list. They are the holder's, never the asker's. */
function tqFacts(card){
  const raw=(card && card.facts);
  const list = Array.isArray(raw) ? raw : String(raw||"").split(";");
  return list.map(f=>String(f||"").trim()).filter(Boolean);
}

function tqYear(v){
  const n=parseInt(v,10);
  return (n>=1 && n<=3000) ? n : 0;
}

/* Born and died are numbers rather than a line of prose, because "still alive" is the one fact on
   a card that expires on its own. Two numbers can be checked and corrected in one cell; a sentence
   has to be found and rewritten. Everything a person would read is computed from them here, so a
   card is never wrong about the arithmetic even when it is out of date about the world. */
function tqLifeLine(card, thisYear){
  const born=tqYear(card && card.born), died=tqYear(card && card.died);
  const now = tqYear(thisYear) || new Date().getFullYear();
  if(!born && !died) return "";
  if(died) return born
    ? t("tq.born_died_aged", "{born}\u2013{died} \u00b7 died aged {low} or {high}",
        { born:born, died:died, low:died-born-1, high:died-born })
    : t("tq.died_in", "died in {died}", { died:died });
  if(!born) return "";
  return t("tq.born_living", "born {born} \u00b7 living, {low} or {high}",
           { born:born, low:now-born-1, high:now-born });
}

/* Why two numbers and not one: years alone cannot give an exact age. Gainsbourg was born in April
   1928 and died in March 1991, so he died at 62 — subtracting the years says 63, and the card
   would be stating a wrong fact about a real person on every screen in the room. Storing full
   dates for two hundred people to fix an off-by-one is not worth it; saying "62 or 63" is exactly
   as precise as the data actually is, and a class can read it. */

/* Is this card one the holder can answer from the screen alone? Anything with facts on it is; a
   lanyard is not, and does not need to be. */
function tqHasCard(card){ return tqFacts(card).length > 0 || !!tqLifeLine(card); }

/* The starter frames on the asker's screen. Not a worksheet and not a drill: four shapes, there
   to be glanced at, covering the four auxiliaries that carry almost every yes/no question in
   English. A B2 pair will stop reading them after one round, which is the intention. */
function tqFrames(){
  return [
    t("tq.frame_is",   "Is it…?"),
    t("tq.frame_does", "Does it…?"),
    t("tq.frame_can",  "Can you…?"),
    t("tq.frame_have", "Have you…?")
  ];
}

function tqCardAt(subjects, order, pos){ return cardAt(subjects, order, pos); }
function tqSetsIn(subjects){ return setsIn(subjects); }
function tqSubjectsIn(subjects, set){ return itemsInSet(subjects, set); }
function tqSetNames(meta){ return chosenSetNames(meta, t("tq.whole_area", "The whole area")); }

/* The pair standings, with the holder named rather than the describer. */
function tqStandings(participants, pairs){
  return pairStandings(participants, pairs).map(g => Object.assign({}, g, { holder: g.lead }));
}


/* ---------- teacher: setting one up ---------- */

async function tqCreateSession(){
  /* Exactly the shape Describe It uses. The first version of this function called requireActive()
     and makeCode(), neither of which exists anywhere in the app — invented names that threw on the
     first line, so the button on the teacher's home screen did nothing at all. The whole suite
     passed, because nothing in it ever called the function the button is wired to. There is now a
     check that every handler named in the markup resolves to a real function. */
  if(!(await confirmNoOpenRun("game"))) return;
  const code = genSessionCode();
  TQ = { sessionCode:code, runId:null, subjects:[], name:"", sets:[], packLang:"en",
         areaSubjects:[], areaName:"", chosen:[],
         participants:[], unsub:null, meta:null, tick:null, projecting:false };
  const c=document.getElementById("tq-code");
  if(c){ c.textContent=t("tq.code_is", "Code \u00b7 {code}", {code:code}); c.style.display="inline-block"; }
  tqResetStep2();
  tqFillRoundLengths();
  tqFillCaps();
  await loadTwentyQSetList();
  tqRenderChosen();
  showScreen("screen-tq-setup");
}

function tqFillRoundLengths(){
  const sel=document.getElementById("tq-seconds-select");
  if(!sel) return;
  sel.innerHTML = TQ_ROUND_SECONDS.map(s=>
    '<option value="'+s+'"'+(s===TQ_DEFAULT_SECONDS?" selected":"")+'>'+
    escapeHtml(roundLengthLabel(s))+'</option>').join("");
}

function tqFillCaps(){
  const sel=document.getElementById("tq-cap-select");
  if(!sel) return;
  sel.innerHTML = TQ_CAPS.map(n=>
    '<option value="'+n+'"'+(n===TQ_DEFAULT_CAP?" selected":"")+'>'+
    escapeHtml(t("tq.n_questions", "{n} questions", {n:n}))+'</option>').join("");
}

function tqFillSets(){
  const sel=document.getElementById("tq-theme-select");
  if(!sel) return;
  const sets=tqSetsIn(TQ.areaSubjects);
  const box=document.getElementById("tq-theme-row");
  if(box) box.style.display = TQ.areaSubjects.length ? "block" : "none";
  sel.innerHTML = '<option value="">'+escapeHtml(sets.length
      ? t("tq.whole_area", "The whole area")
      : t("tq.area_has_no_sets", "— this area has no sets —"))+'</option>'
    + sets.map(th=>'<option value="'+escapeHtml(th)+'">'+escapeHtml(th)+' ('
      + tqSubjectsIn(TQ.areaSubjects, th).length + ')</option>').join("");
  tqSyncAddButton();
}

/* One function, called from both places that need it — the lesson Describe It learned in v3.9,
   when a mutation broke one of two identical copies and nothing failed. */
function tqSyncAddButton(){
  const add=document.getElementById("tq-add-set-btn");
  if(add) add.disabled = !TQ.areaSubjects.length || TQ.chosen.length>=TQ_MAX_SETS;
}

function tqResetStep2(){
  TQ.areaSubjects=[]; TQ.areaName="";
  const sel=document.getElementById("tq-set-select"); if(sel) sel.value="";
  const th=document.getElementById("tq-theme-row"); if(th) th.style.display="none";
  tqRenderChosen();
  tqDescribePack();
}

/* Filed by area, not by school — the same call as Describe It's word sets. "Animals" is the same
   set whoever is in the room, so making a teacher choose a school first protects nothing. */
async function loadTwentyQSetList(){
  try{
    const qs = await Backend.listQuizzes();
    TQ.sets = (qs.quizzes||[]).filter(q=>q.kind==="twentyq")
                              .sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));
    const sel=document.getElementById("tq-set-select");
    sel.innerHTML = '<option value="">'+escapeHtml(TQ.sets.length
      ? t("tq.select_an_area", "— select an area —")
      : t("tq.no_areas_yet", "— no subject sets yet: add one in Admin —"))+'</option>';
    TQ.sets.forEach(a=>{ const o=document.createElement("option"); o.value=a.key;
      o.textContent=a.name+" ("+t("tq.n_subjects", "{count} {subjects}",
        { count:a.count, subjects: plural(a.count, t("tq.subject", "subject"), t("tq.subjects", "subjects")) })+")";
      sel.appendChild(o); });
  }catch(e){ console.warn(e); }
}

async function tqSetPicked(){
  const key=document.getElementById("tq-set-select").value;
  if(!key){ tqResetStep2(); return; }
  let rec=null;
  try{ rec=await Backend.getQuiz(key); }catch(e){ alert(t("tq.couldn_t_load_area", "Couldn't load that area: ")+e.message); return; }
  if(!rec){ alert(t("tq.area_gone", "That area has gone.")); return; }
  TQ.areaSubjects=rec.questions||[];
  TQ.areaName=rec.name||t("tq.twenty_questions", "Twenty Questions");
  tqFillSets();
  tqDescribePack();
}

/* ---------- the basket: up to three sets, from anywhere ---------- */

function tqChosenSubjects(){
  const out=[], seen={};
  TQ.chosen.forEach(c=>{
    (c.subjects||[]).forEach(sj=>{
      const k=String(sj.subject||"").trim().toLowerCase();
      if(!k || seen[k]) return;
      seen[k]=true;
      out.push(sj);
    });
  });
  return out;
}

function tqChosenLang(){
  const s0=tqChosenSubjects()[0];
  return (s0 && s0.lang) || "en";
}

function tqAddSet(){
  if(TQ.chosen.length>=TQ_MAX_SETS){
    alert(t("tq.three_sets_max",
      "Three sets is the most one session can hold. Remove one first.")); return;
  }
  const setName=(document.getElementById("tq-theme-select")||{}).value||"";
  const subjects=tqSubjectsIn(TQ.areaSubjects, setName);
  if(!subjects.length){ alert(t("tq.set_is_empty", "That set has no subjects in it.")); return; }
  const label=setName || TQ.areaName;
  if(TQ.chosen.some(c=>c.area===TQ.areaName && c.set===setName)){
    alert(t("tq.already_chosen", "“{name}” is already in this session.", {name:label})); return;
  }
  const lang=(subjects[0] && subjects[0].lang) || "en";
  if(TQ.chosen.length && lang !== tqChosenLang()){
    alert(t("tq.sets_mix_languages",
      "That set is written in a different language from the ones already chosen. One session is in one language."));
    return;
  }
  TQ.chosen.push({ area:TQ.areaName, set:setName, label:label, subjects:subjects.slice(), lang:lang });
  tqRenderChosen();
  tqDescribePack();
}

function tqRemoveSet(i){
  TQ.chosen.splice(i,1);
  tqRenderChosen();
  tqDescribePack();
}

function tqRenderChosen(){
  const box=document.getElementById("tq-chosen");
  if(box){
    box.innerHTML = TQ.chosen.length
      ? TQ.chosen.map((c,i)=>
          '<span class="chip di-chosen-chip">'+
            '<b>'+escapeHtml(c.label)+'</b> '+
            '<span class="sub">'+escapeHtml(c.area)+' · '+c.subjects.length+'</span>'+
            '<button class="di-chip-x" onclick="tqRemoveSet('+i+')" '+
              'title="'+escapeHtml(t("tq.ti.remove_set", "Take this set out of the session"))+'">×</button>'+
          '</span>').join("")
      : '<p class="sub">'+t("tq.nothing_chosen",
          "Nothing chosen yet. Pick an area, then a set, then Add — up to three, from any areas you like.")+'</p>';
  }
  const count=document.getElementById("tq-chosen-count");
  if(count) count.textContent = t("tq.n_of_max_sets", "{n} of {max}",
    { n:TQ.chosen.length, max:TQ_MAX_SETS });
  tqSyncAddButton();
}

/* What the class will actually meet, redrawn whenever the basket changes. The hint count is
   worth saying out loud: a set with no hints plays much harder, and a teacher who has imported
   a half-finished sheet should find that out here rather than from a stuck pair. */
function tqDescribePack(){
  const list=tqChosenSubjects();
  const noHint=list.filter(s=>!tqHint(s)).length;
  const dropped=TQ.chosen.reduce((n,c)=>n+c.subjects.length,0) - list.length;
  const el=document.getElementById("tq-summary");
  if(!el) return;
  el.textContent = list.length
    ? t("tq.setup_summary", "{count} {subjects} · pairs, one holding the secret",
        { count:list.length,
          subjects: plural(list.length, t("tq.subject", "subject"), t("tq.subjects", "subjects")) })
      + (dropped ? " · " + t("tq.n_duplicates_dropped",
          "{n} in more than one of these sets, counted once", {n:dropped}) : "")
      + (noHint ? " · " + t("tq.n_without_hints",
          "{n} with no hint, so a stuck pair has nothing to fall back on", {n:noHint}) : "")
    : "";
  const startBtn=document.getElementById("tq-start-btn");
  if(startBtn) startBtn.disabled = list.length===0;
}

async function tqStartSession(){
  const playing=tqChosenSubjects();
  if(!playing.length){ alert(t("tq.choose_a_set_first", "Choose at least one set first.")); return; }
  const secs=parseInt((document.getElementById("tq-seconds-select")||{}).value,10) || TQ_DEFAULT_SECONDS;
  const cap=parseInt((document.getElementById("tq-cap-select")||{}).value,10) || TQ_DEFAULT_CAP;
  const title=TQ.chosen.map(c=>c.label).join(" + ");
  const meta = {
    kind:"twentyq", status:"waiting", round:0,
    roundSeconds:secs, roundStartedAt:0, cap:cap,
    sets:TQ.chosen.map(c=>({ area:c.area, set:c.set, label:c.label })),
    title:title,
    lang:tqChosenLang(),
    anon: !!(document.getElementById("tq-anon")||{}).checked,
    teacherName:(TEACHER_USER&&TEACHER_USER.name)||"",
    teacherEmail:(TEACHER_USER&&TEACHER_USER.email)||"",
    pairs:{}, totals:{}, bankedRound:0, startedAt:null
  };
  TQ.runId = TQ.sessionCode+"-"+Date.now().toString(36).toUpperCase();
  /* Only the chosen sets go into the run. A student's phone can read the run, so a subject that
     is not being played has no business being on it — and here that matters more than it does in
     Describe It, because every row on the run is somebody's secret. */
  try{ await Backend.createSession(TQ.runId, TQ.sessionCode, meta, playing); }
  catch(e){ alert(t("tq.couldn_t_open_game", "Couldn't open the game: ")+e.message); return; }
  TQ.meta=meta;
  TQ.subjects=playing;
  TQ.name=title;
  tqShowLive();
  tqWatchParticipants();
}

/* ---------- teacher: the live room ---------- */

function tqShowLive(){
  document.getElementById("tq-live-code").textContent=TQ.sessionCode;
  document.getElementById("tq-title").textContent=TQ.name||t("tq.twenty_questions", "Twenty Questions");
  const th=document.getElementById("tq-live-theme");
  if(th){ th.textContent=tqSetNames(TQ.meta); th.style.display="inline-block"; }
  document.getElementById("tq-join-code").textContent=TQ.sessionCode;
  const dealt=(TQ.meta && TQ.meta.round)>0;
  document.getElementById("tq-lobby").style.display = dealt ? "none" : "block";
  document.getElementById("tq-stage").style.display = dealt ? "block" : "none";
  showScreen("screen-tq-live");
  tqRenderQR();
  tqFillLiveSeconds();
  tqFillLiveCap();
  if(dealt){ tqRenderStage(); tqStartTick(); }
}

function tqRenderQR(){
  const holder=document.getElementById("tq-qr-code"); if(!holder) return;
  holder.innerHTML="";
  const url=location.origin+location.pathname+"?join="+encodeURIComponent(TQ.sessionCode);
  try{ new QRCode(holder,{text:url,width:180,height:180}); }catch(e){ holder.textContent=url; }
  const el=document.getElementById("tq-join-url"); if(el) el.textContent=url;
}

function tqWatchParticipants(){
  if(TQ.unsub) TQ.unsub();
  TQ.unsub = Backend.subscribeParticipants(TQ.runId, res=>{
    TQ.participants=(res&&res.participants)||[];
    tqFeedOk();
    tqRenderRoster();
    if(TQ.meta && TQ.meta.round>0){ tqRenderStage(); tqRelayPositions().catch(e=>console.warn(e)); }
  }, err=>{ tqFeedFailed(err); });
}

function tqFeedOk(){
  const w=document.getElementById("tq-feed-warning");
  if(w) w.style.display="none";
}
function tqFeedFailed(err){
  const w=document.getElementById("tq-feed-warning");
  if(!w) return;
  w.style.display="block";
  w.textContent=t("tq.feed_failed",
    "The class list cannot be read ({reason}), so this may not be an empty room — it may be a room the app cannot see.",
    { reason:(err&&err.message)||t("tq.unknown_reason", "no reason given") });
}

function tqRenderRoster(){
  const n=TQ.participants.length;
  document.getElementById("tq-count").textContent=t("tq.n_joined", "{count} joined", {count:n});
  const el=document.getElementById("tq-roster");
  el.innerHTML = TQ.participants.slice().sort(bySurname)
    .map(p=>'<span class="chip">'+escapeHtml(displayName(p.surname,p.firstName))+'</span>').join("") ||
    '<p class="sub">'+t("tq.waiting_students_join", "Waiting for students to join…")+'</p>';
  const dealBtn=document.getElementById("tq-deal-btn");
  dealBtn.disabled = n<2;
  const odd=document.getElementById("tq-odd-note");
  if(odd){
    odd.style.display = (n>=3 && n%2===1) ? "block" : "none";
    /* The odd student out is a second ASKER, not a referee. Twenty Questions needs no referee —
       the holder answers, so there is nothing to arbitrate — and two askers confer, which turns
       out to be the strongest version of the game for a weaker pair. */
    odd.textContent = t("tq.odd_number_note",
      "{n} students — an odd one out, so one pair plays as a three with two asking. They confer, which is no bad thing.", {n:n});
  }
}

async function tqDeal(){
  const pairs=pairUp(TQ.participants);
  await tqPushMeta({ pairs:pairs, status:"active", round:1, roundStartedAt:0,
                     startedAt:(TQ.meta&&TQ.meta.startedAt)||Date.now() });
  document.getElementById("tq-lobby").style.display="none";
  document.getElementById("tq-stage").style.display="block";
  tqStartTick();
}

async function tqStartRound(){
  if(!TQ.meta || !TQ.meta.round){ return; }
  await tqResetScores();
  await tqPushMeta({ pos:{}, rhits:{}, roundStartedAt: Backend.serverNow() });
}

async function tqSwapRoles(){
  if(!TQ.meta || !TQ.meta.round){ return; }
  await tqResetScores();
  await tqPushMeta({ pairs: swapPairRoles(metaMap(TQ.meta,"pairs")),
                     round: TQ.meta.round+1, roundStartedAt: 0 });
}

async function tqNewPairs(){
  await tqResetScores();
  await tqPushMeta({ pairs: pairUp(TQ.participants),
                     round: ((TQ.meta&&TQ.meta.round)||0)+1, roundStartedAt: 0 });
}

async function tqResetScores(){
  TQ.participants = TQ.participants.map(p=>Object.assign({}, p, { progress:null }));
}

async function tqPushMeta(changes){
  const meta=Object.assign({}, TQ.meta||{}, changes);
  TQ.meta=meta;
  try{ await Backend.updateMeta(TQ.runId, meta); }
  catch(e){ alert(t("tq.couldn_t_update", "Couldn't update the game: ")+e.message); return; }
  tqRenderStage();
}

/* Both mid-session controls land on the NEXT round: shortening a clock, or taking questions away
   from a pair already running against them, changes the deal under people who are mid-game. */
async function tqSetSeconds(){
  const want=parseInt(document.getElementById("tq-live-seconds").value,10) || TQ_DEFAULT_SECONDS;
  if(!TQ.meta || want===tqRoundSeconds(TQ.meta)) return;
  await tqPushMeta({ roundSeconds: want });
}

function tqFillLiveSeconds(){
  const sel=document.getElementById("tq-live-seconds");
  if(!sel) return;
  const now=tqRoundSeconds(TQ.meta);
  sel.innerHTML = TQ_ROUND_SECONDS.map(n=>
    '<option value="'+n+'"'+(n===now?" selected":"")+'>'+
    escapeHtml(roundLengthLabel(n))+'</option>').join("");
}

async function tqSetCap(){
  const want=parseInt(document.getElementById("tq-live-cap").value,10) || TQ_DEFAULT_CAP;
  if(!TQ.meta || want===tqCap(TQ.meta)) return;
  await tqPushMeta({ cap: want });
}

function tqFillLiveCap(){
  const sel=document.getElementById("tq-live-cap");
  if(!sel) return;
  const now=tqCap(TQ.meta);
  sel.innerHTML = TQ_CAPS.map(n=>
    '<option value="'+n+'"'+(n===now?" selected":"")+'>'+
    escapeHtml(t("tq.n_questions", "{n} questions", {n:n}))+'</option>').join("");
}

function tqStartTick(){
  if(TQ.tick) clearInterval(TQ.tick);
  TQ.tick=setInterval(()=>{
    tqRenderClock();
    tqMaybeBankRound().catch(e=>console.warn(e));
  }, 500);
}

function tqStopTick(){ if(TQ.tick){ clearInterval(TQ.tick); TQ.tick=null; } }

/* The teacher relays the card position, because only the teacher may write meta. Written only when
   it has changed. */
async function tqRelayPositions(){
  const meta=TQ.meta;
  if(!meta || !meta.round || !meta.roundStartedAt) return;
  const now=pairPositions(TQ.participants, metaMap(meta,"pairs"));
  if(!positionsDiffer(metaMap(meta,"pos"), now)) return;
  await tqPushMeta({ pos: now });
}

async function tqMaybeBankRound(){
  const meta=TQ.meta;
  if(!roundIsDueToBank(meta, tqRoundSeconds(meta))) return;
  TQ.participants = TQ.participants || [];
  await tqPushMeta({ totals: bankPairScores(metaMap(meta,"totals"), TQ.participants, metaMap(meta,"pairs"), "speakers"),
                     rhits: pairRoundHits(TQ.participants, metaMap(meta,"pairs")),
                     bankedRound: meta.round });
}

function tqRenderClock(){
  const meta=TQ.meta||{};
  const el=document.getElementById("tq-clock");
  if(el){
    if(!meta.roundStartedAt){ el.textContent="—"; el.className="di-clock"; }
    else {
      const left=tqSecondsLeft(meta);
      el.textContent = left>=60 ? Math.floor(left/60)+":"+String(left%60).padStart(2,"0") : left+"s";
      el.className = left<=15 ? "di-clock low" : "di-clock";
    }
  }
  const btn=document.getElementById("tq-start-round-btn");
  if(btn) btn.disabled = tqRoundIsRunning(meta);
  if(TQ.projecting) tqRenderProjection();
}

function tqRenderStage(){
  const meta=TQ.meta||{};
  const pairs=metaMap(meta,"pairs");
  const badge=document.getElementById("tq-round");
  if(badge) badge.textContent=t("tq.round_n", "Round {n}", {n:meta.round||1});
  const th=document.getElementById("tq-live-theme");
  if(th){ th.textContent=tqSetNames(meta); th.style.display="inline-block"; }
  tqFillLiveSeconds();
  tqFillLiveCap();
  tqRenderClock();

  const over = !!meta.roundStartedAt && !tqRoundIsRunning(meta);
  const scores=document.getElementById("tq-scores");
  if(scores) scores.style.display = over ? "block" : "none";
  if(over) tqRenderScores();

  const box=document.getElementById("tq-pairs");
  if(!box) return;
  const rows=tqStandings(TQ.participants, pairs);
  box.innerHTML = rows.length
    ? rows.map(g=>'<div class="di-score-row">'+
        '<span class="di-pair-no">'+g.g+'</span>'+
        '<span class="di-score-who">'+escapeHtml(g.names.join(" · "))+
          '<small class="hint"> — '+escapeHtml(t("tq.holding", "{who} is holding", {who:g.holder||"?"}))+'</small></span>'+
        '<span class="di-score-n mono">'+g.hits+'</span></div>').join("")
    : '<p class="sub">'+t("tq.no_pairs_yet", "No pairs yet.")+'</p>';
}

function tqRenderScores(){
  const meta=TQ.meta||{};
  const pairs=metaMap(meta,"pairs");
  const banked=(meta.bankedRound||0) >= meta.round;

  const head=document.getElementById("tq-scores-round");
  if(head) head.textContent=t("tq.round_n", "Round {n}", {n:meta.round||1});

  const thisRound=document.getElementById("tq-scores-round-list");
  if(thisRound){
    const rows=tqStandings(TQ.participants, pairs);
    thisRound.innerHTML = rows.length
      ? rows.map((g,i)=>'<div class="di-score-row'+(i===0&&g.hits>0?" di-score-top":"")+'">'+
          '<span class="di-pair-no">'+g.g+'</span>'+
          '<span class="di-score-who">'+escapeHtml(g.names.join(" · "))+'</span>'+
          '<span class="di-score-n mono">'+g.hits+'</span></div>').join("")
      : '<p class="sub">'+t("tq.nobody_scored_yet", "Nothing recorded for this round.")+'</p>';
  }

  const totals=document.getElementById("tq-scores-total-list");
  if(totals){
    const rows=roundLeaderboard(metaMap(meta,"totals"), TQ.participants, pairs);
    totals.innerHTML = rows.map((r,i)=>'<div class="di-score-row'+(i===0&&r.total>0?" di-score-top":"")+'">'+
      '<span class="di-pair-no">'+(i+1)+'</span>'+
      '<span class="di-score-who">'+escapeHtml(r.name)+'</span>'+
      '<span class="di-score-n mono">'+r.total+'</span></div>').join("");
  }
  const note=document.getElementById("tq-scores-note");
  if(note) note.textContent = banked
    ? t("tq.totals_include_this_round", "Running totals, this round included. Both partners get the pair’s score.")
    : t("tq.totals_counting", "Counting this round in…");
}

function tqToggleProject(){
  TQ.projecting=!TQ.projecting;
  const el=document.getElementById("tq-projection");
  if(el) el.style.display = TQ.projecting ? "block" : "none";
  if(TQ.projecting) tqRenderProjection();
}

function tqRenderProjection(){
  const meta=TQ.meta||{};
  const pairs=metaMap(meta,"pairs");
  const ttl=document.getElementById("tq-proj-title");
  if(ttl) ttl.textContent=TQ.name||tqSetNames(meta)||t("tq.twenty_questions", "Twenty Questions");
  const cl=document.getElementById("tq-proj-clock");
  if(cl){
    const left=tqSecondsLeft(meta);
    cl.textContent = meta.roundStartedAt
      ? (left>=60 ? Math.floor(left/60)+":"+String(left%60).padStart(2,"0") : left+"s")
      : t("tq.ready", "Ready");
  }
  const box=document.getElementById("tq-proj-pairs");
  if(box) box.innerHTML = tqStandings(TQ.participants, pairs).map(g=>
    '<div class="di-proj-pair"><span class="di-proj-no">'+g.g+'</span> '+
    escapeHtml(g.names.join(" · "))+' <b class="mono">'+g.hits+'</b></div>').join("");
}

/* Ending the game now has two steps: look at the scores, then clear it. The delete is the same
   delete it always was — it happens when the teacher closes the leaderboard rather than instead
   of showing one. Nothing is kept either way. */
async function tqEnd(){
  tqStopTick();
  /* The students are told the game is over HERE, not when the teacher closes the leaderboard.
     Before this the two were the same call, and splitting them left every phone in the room
     counting down a round nobody was playing while the teacher read the scores. */
  await tqSignalEnd();
  await showFinalScores({
    runId: TQ.runId,
    meta: TQ.meta,
    participants: TQ.participants,
    title: TQ.name || t("tq.twenty_questions", "Twenty Questions"),
    onFinish: tqReallyEnd
  });
}

async function tqSignalEnd(){
  try{
    TQ.meta = Object.assign({}, TQ.meta||{},
      finalMetaPatch(TQ.meta, TQ.participants, "speakers"));
    await Backend.updateMeta(TQ.runId, TQ.meta);
  }catch(e){ console.warn(e); }
}

async function tqReallyEnd(){
  try{
    await tqSignalEnd();
    await Backend.deleteRun(TQ.runId);
  }catch(e){ console.warn(e); }
  tqCleanup();
  teacherHome();
}

function tqLeave(){ tqCleanup(); teacherHome(); }

function tqCleanup(){
  if(TQ.unsub){ TQ.unsub(); TQ.unsub=null; }
  tqStopTick();
  TQ.projecting=false;
  const el=document.getElementById("tq-projection"); if(el) el.style.display="none";
}


/* ---------- student: the secret screen ---------- */

async function tqStudentStart(session, surname, firstName){
  TQSTU={ runId:session.runId, meta:session.meta, subjects:session.questions||[],
          unsub:null, wakeLock:null, pos:0, hits:0, solved:0, asked:0, revealed:false, round:0,
          tick:null, pendingWrite:null, lastWrite:0, phase:null, lost:false };
  try{ await Backend.joinSession(TQSTU.runId, STUDENT.id, surname, firstName, true); }
  catch(e){
    alert(t("tq.join_refused",
      "You are not in the game: the database refused to record you ({reason}).\n\nTell your teacher — nothing you do would count.",
      { reason:(e&&e.message)||t("tq.unknown_reason", "no reason given") }));
    return;
  }
  const badge=document.getElementById("tq-card-name");
  if(badge){ badge.textContent=displayName(surname,firstName); badge.style.display="inline-block"; }
  showScreen("screen-tq-card");
  tqKeepAwake();
  tqStudentWatch();
  tqStudentTick();
}

function tqStudentWatch(){
  if(TQSTU.unsub) TQSTU.unsub();
  TQSTU.unsub = Backend.subscribeMeta(TQSTU.runId, res=>{
    if(!res || !res.meta) return;
    const before=TQSTU.meta||{};
    TQSTU.meta=res.meta;
    if(res.meta.status==="ended"){ tqStudentEnd(); return; }
    if((res.meta.round||0) !== (TQSTU.round||0)){
      TQSTU.round=res.meta.round||0; tqResetCard(); TQSTU.pos=0; TQSTU.hits=0; TQSTU.solved=0;
    }
    if((res.meta.roundStartedAt||0) !== (before.roundStartedAt||0) && res.meta.roundStartedAt){
      TQSTU.pos=0; TQSTU.hits=0; TQSTU.solved=0; tqResetCard();
    }
    tqRenderCard();
  });
}

function tqStudentTick(){
  if(TQSTU.tick) clearInterval(TQSTU.tick);
  TQSTU.tick=setInterval(()=>{ tqCardTick(); }, 400);
}

async function tqKeepAwake(){
  try{
    if(navigator.wakeLock && navigator.wakeLock.request){
      TQSTU.wakeLock = await navigator.wakeLock.request("screen");
      TQSTU.wakeLock.addEventListener("release", ()=>{ TQSTU.wakeLock=null; });
    }
  }catch(e){ /* unsupported or refused: the game still works, the screen just dims */ }
}
function tqReleaseAwake(){
  try{ if(TQSTU.wakeLock) TQSTU.wakeLock.release(); }catch(e){}
  TQSTU.wakeLock=null;
}

function tqMySeat(){
  const pairs=metaMap(TQSTU.meta,"pairs");
  return pairs[STUDENT.id] || null;
}

function tqMyOrder(){
  const seat=tqMySeat();
  if(!seat) return [];
  return termOrderFor((TQSTU.subjects||[]).length, seat.g, (TQSTU.meta&&TQSTU.meta.round)||1);
}

/* Seat 0's own number; the asker's comes back through the teacher (see core/rounds.js). Without
   this the asker's category badge stayed on the first subject's category for the whole round —
   invisible while a set is all one category, and wrong the moment it is not. */
function tqMyPos(){ return seatPosition(TQSTU.meta, tqMySeat(), TQSTU.pos); }

function tqMyCard(){
  return tqCardAt(TQSTU.subjects, tqMyOrder(), tqMyPos());
}

/* A fresh card: questions back to zero, the hint hidden again, not yet lost. */
function tqResetCard(){
  TQSTU.asked=0; TQSTU.revealed=false; TQSTU.lost=false;
}

function tqQuestionsLeft(){
  return Math.max(0, tqCap(TQSTU.meta) - TQSTU.asked);
}

/* ---------- the card: drawing it, and only when it changed ----------

   The same shape as Describe It's, and for the same reason: in v3.10 the renderer and the clock
   called each other at the bell until the stack ran out and the screen froze. The clock paints
   digits; the tick decides when a change of PHASE is worth a redraw; nothing that draws may call
   the tick back. */
function tqPaintClock(){
  const el=document.getElementById("tq-card-clock");
  if(!el) return;
  const meta=TQSTU.meta||{};
  if(!tqRoundIsRunning(meta)){ el.textContent=""; el.className="di-clock"; return; }
  const left=tqSecondsLeft(meta);
  el.textContent = left>=60 ? Math.floor(left/60)+":"+String(left%60).padStart(2,"0") : left+"s";
  el.className = left<=15 ? "di-clock low" : "di-clock";
}

function tqCardTick(){
  const phase=tqPhase(TQSTU.meta);
  if(phase !== TQSTU.phase){ tqRenderCard(); return; }
  tqPaintClock();
}

function tqRenderCard(){
  const meta=TQSTU.meta||{};
  const seat=tqMySeat();
  const waiting=document.getElementById("tq-card-waiting");
  const main=document.getElementById("tq-card-main");

  if(meta.status!=="active" || !seat){
    if(waiting) waiting.style.display="block";
    if(main) main.style.display="none";
    TQSTU.phase = tqPhase(meta);
    return;
  }
  if(waiting) waiting.style.display="none";
  if(main) main.style.display="block";

  const others=pairMembers(metaMap(meta,"pairs"), seat.g)
    .filter(m=>m.studentId!==STUDENT.id).map(m=>m.name);
  document.getElementById("tq-card-pair").textContent=t("tq.pair_n", "Pair {n}", {n:seat.g});
  document.getElementById("tq-card-partner").textContent = others.length
    ? t("tq.with_partner", "With {who}", { who: others.join(", ") })
    : t("tq.waiting_for_a_partner", "Waiting for a partner…");

  /* Seat 0 holds the secret and answers. Everyone else in the pair asks — including the odd
     student out in a three, who is a second asker rather than a referee. */
  const holding = (seat.r===0);
  document.getElementById("tq-holder-view").style.display = holding ? "block" : "none";
  document.getElementById("tq-asker-view").style.display  = holding ? "none" : "block";
  document.getElementById("tq-card-role").textContent = holding
    ? t("tq.you_hold", "You hold the secret")
    : t("tq.you_ask", "You ask");

  if(holding) tqRenderHolder();
  else tqRenderAsker();
  TQSTU.phase = tqPhase(meta);
  tqPaintClock();
}

function tqRenderHolder(){
  const meta=TQSTU.meta||{};
  const running=tqRoundIsRunning(meta);
  const ready=document.getElementById("tq-holder-ready");
  const play=document.getElementById("tq-holder-play");
  const over=document.getElementById("tq-holder-over");

  if(!meta.roundStartedAt){
    ready.style.display="block"; play.style.display="none"; over.style.display="none";
    return;
  }
  if(!running){
    ready.style.display="none"; play.style.display="none"; over.style.display="block";
    document.getElementById("tq-final-score").textContent=String(TQSTU.hits);
    /* The holder sees the count they recorded and is told plainly whose it is. Under individual
       scoring this number does not move their own total, and a holder who thinks it does will
       finish the lesson believing the leaderboard is broken. */
    document.getElementById("tq-final-line").textContent = t("tq.round_over_for_partner",
      "{solved} {subjects} in {length} — that goes to {who}.",
      { solved:(TQSTU.solved||0), length:roundLengthLabel(tqRoundSeconds(meta)),
        who: tqAskerNames() || t("tq.your_partner", "your partner"),
        subjects: plural((TQSTU.solved||0), t("tq.subject", "subject"), t("tq.subjects", "subjects")) });
    tqShowMyTotal();
    tqFlushScore(true);
    return;
  }

  ready.style.display="none"; play.style.display="block"; over.style.display="none";
  const card=tqMyCard();
  const lost=TQSTU.lost;

  document.getElementById("tq-secret").textContent = card ? (card.subject||"") : "";
  document.getElementById("tq-secret-cat").textContent = card ? tqCategoryLabel(card) : "";

  /* The facts, and the years turned into a sentence. Shown for the whole card, not saved for the
     end: the holder needs them to answer, not to reveal. */
  const life=tqLifeLine(card);
  const lifeEl=document.getElementById("tq-life");
  if(lifeEl){ lifeEl.textContent=life; lifeEl.style.display = life ? "block" : "none"; }
  const facts=tqFacts(card);
  const factsBox=document.getElementById("tq-facts-box");
  const factsList=document.getElementById("tq-facts");
  if(factsBox) factsBox.style.display = facts.length ? "block" : "none";
  if(factsList) factsList.innerHTML = facts.map(f=>'<li>'+escapeHtml(f)+'</li>').join("");

  /* The counter, and what it is counting towards. Only this screen has it: the asker cannot read
     this record, so if they want to know how many they have left they have to ask — in English,
     out loud, which is one more question than they would otherwise have formed. */
  const left=tqQuestionsLeft();
  const count=document.getElementById("tq-asked");
  if(count) count.textContent = t("tq.n_of_cap", "{asked} of {cap}",
    { asked:TQSTU.asked, cap:tqCap(meta) });
  const leftEl=document.getElementById("tq-left");
  if(leftEl){
    leftEl.textContent = t("tq.n_left", "{n} left", {n:left});
    leftEl.className = left<=3 ? "di-clock low" : "di-clock";
  }
  /* What it is worth if they get it now. The number falling with every answer is the clearest
     statement of the rule there is, and it is on the screen of the person who can say it out loud. */
  const worth=document.getElementById("tq-worth");
  if(worth) worth.textContent = lost
    ? t("tq.worth_nothing", "worth nothing now")
    : t("tq.worth_n", "worth {n} if they get it now", {n:tqCardValue()});

  // Out of questions: the card is lost, and the only way on is the next one.
  const answers=document.getElementById("tq-answer-row");
  const outOf=document.getElementById("tq-out-of");
  if(answers) answers.style.display = lost ? "none" : "flex";
  if(outOf) outOf.style.display = lost ? "block" : "none";
  /* A card with facts on it turns running out into a short listening task rather than a dead end:
     the holder reads the card aloud and the asker says who it was. They get no point either way,
     so nothing is at stake — which is exactly when a class will listen to a paragraph of English
     they did not have to fight for. */
  const outLine=document.getElementById("tq-outof-line");
  if(outLine) outLine.textContent = tqHasCard(card)
    ? t("tq.out_read_it_out",
        "Read the card out to them \u2014 the years and every line \u2014 and then say who it was. No point for this one either way.")
    : t("tq.out_tell_them",
        "Tell them what it was, and move on \u2014 no point for this one.");
  const gotBtn=document.getElementById("tq-got-btn");
  if(gotBtn) gotBtn.disabled = lost;

  const hintBtn=document.getElementById("tq-hint-btn");
  const hintBox=document.getElementById("tq-hint");
  const hint=tqHint(card);
  if(hintBtn) hintBtn.style.display = (hint && !TQSTU.revealed) ? "inline-block" : "none";
  if(hintBox){
    hintBox.style.display = (hint && TQSTU.revealed) ? "block" : "none";
    hintBox.textContent = hint;
  }
  document.getElementById("tq-hits").textContent=String(TQSTU.hits);
}

function tqRenderAsker(){
  const meta=TQSTU.meta||{};
  const running=tqRoundIsRunning(meta);
  const ready=document.getElementById("tq-asker-ready");
  const play=document.getElementById("tq-asker-play");
  const over=document.getElementById("tq-asker-over");
  if(!meta.roundStartedAt){
    ready.style.display="block"; play.style.display="none"; over.style.display="none";
    return;
  }
  if(!running){
    ready.style.display="none"; play.style.display="none"; over.style.display="block";
    /* The score is the asker's, but every tap that made it happened on the other phone, so it
       arrives with the teacher's banking write a few seconds after the bell. Until it lands the
       screen says so rather than showing a zero the student would read as their score. */
    const n=seatRoundHits(meta, tqMySeat());
    const landed=Object.prototype.hasOwnProperty.call(metaMap(meta,"rhits"), String((tqMySeat()||{}).g));
    const score=document.getElementById("tq-asker-score");
    const line=document.getElementById("tq-asker-final-line");
    if(score) score.textContent = landed ? String(n) : "—";
    if(line) line.textContent = landed
      ? t("tq.asker_over_line", "{n} points in {length}.",
          { n:n, length:roundLengthLabel(tqRoundSeconds(meta)) })
      : t("tq_card.asker_waiting", "Counting up…");
    tqShowMyTotal();
    return;
  }
  ready.style.display="none"; play.style.display="block"; over.style.display="none";

  /* The asker's screen deliberately holds almost nothing live. They should be looking at their
     partner, not at a phone: the category to start from, four shapes to build a question out of,
     and that is all. */
  const card=tqMyCard();
  const cat=document.getElementById("tq-asker-cat");
  if(cat) cat.textContent = card ? tqCategoryLabel(card) : "";
  const frames=document.getElementById("tq-frames");
  if(frames) frames.innerHTML = tqFrames().map(f=>'<span class="tq-frame">'+escapeHtml(f)+'</span>').join("");
}

/* Both over-screens carry a running total. The asker's copy existed in the page from the start
   and nothing ever wrote to it, so the student whose score it now is was the one student who could
   not see it. */
function tqAskerNames(){
  const seat=tqMySeat();
  if(!seat) return "";
  return pairMembers(metaMap(TQSTU.meta,"pairs"), seat.g)
    .filter(m=>m.studentId!==STUDENT.id).map(m=>m.name).join(", ");
}

function tqShowMyTotal(){
  const totals=metaMap(TQSTU.meta,"totals");
  const mine=Number(totals[STUDENT.id]);
  const text=t("tq.your_running_total", "Your running total: {n}", {n:mine});
  ["tq-my-total","tq-my-total-asker"].forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;
    if(!mine && mine!==0){ el.style.display="none"; return; }
    el.style.display="block";
    el.textContent=text;
  });
}

/* ---------- the three buttons ----------

   Yes and No cost a question. "Not a yes/no question" does not — and that asymmetry is the only
   grammar teaching in the game. It is a rule, not a correction: nobody is told they are wrong,
   the question simply buys nothing. */
function tqAnswer(yes){
  if(TQSTU.lost) return;
  const seat=tqMySeat();
  if(!seat || seat.r!==0) return;
  if(!tqRoundIsRunning(TQSTU.meta)) return;
  TQSTU.asked++;
  const flash=document.getElementById(yes ? "tq-yes-btn" : "tq-no-btn");
  if(flash){ flash.classList.add("tq-flash"); setTimeout(()=>flash.classList.remove("tq-flash"), 180); }
  if(TQSTU.asked >= tqCap(TQSTU.meta)) TQSTU.lost=true;
  tqRenderHolder();
}

/* The third button. No count, no record, nothing written: it exists so that a malformed question
   has a visible consequence that is not a person telling another person they are wrong. */
function tqNotYesNo(){
  if(TQSTU.lost) return;
  const seat=tqMySeat();
  if(!seat || seat.r!==0) return;
  const btn=document.getElementById("tq-notyn-btn");
  if(btn){ btn.classList.add("tq-flash"); setTimeout(()=>btn.classList.remove("tq-flash"), 300); }
  try{ if(navigator.vibrate) navigator.vibrate(40); }catch(e){}
}

function tqRevealHint(){
  TQSTU.revealed=true;
  tqRenderHolder();
}

/* A solved subject is worth the questions they did NOT use.

   Six questions out of twenty scores fourteen; nineteen scores one; running out scores nothing.
   One flat point per solve rewarded a wild guess exactly as much as a narrowing question, which is
   the whole skill this game exists to train — and a pair can work this number out in their head,
   which matters when they are arguing about it.

   No separate bonus for speed. The round clock is already the time term: a quicker pair reaches
   more subjects and scores more for it. Paying twice for the same thing would push a class towards
   blurting, which is the opposite of forming a careful question. */
function tqCardValue(){
  return tqQuestionsLeft();
}

function tqGotIt(){
  const seat=tqMySeat();
  if(!seat || seat.r!==0) return;
  if(TQSTU.lost) return;
  if(!tqRoundIsRunning(TQSTU.meta)) return;
  TQSTU.hits += tqCardValue();
  TQSTU.solved = (TQSTU.solved||0) + 1;
  TQSTU.pos++;
  tqResetCard();
  /* Forced rather than throttled: a solve both scores and changes the card, and the card is what
     the asker's screen is waiting for. */
  tqFlushScore(true);
  tqRenderHolder();
}

/* Give up, or out of questions. Either way the card goes and the count does not move — which is
   the Taboo rule Describe It settled on in v3.10, arrived at here from the other direction. */
function tqNextCard(){
  const seat=tqMySeat();
  if(!seat || seat.r!==0) return;
  TQSTU.pos++;
  tqResetCard();
  /* Forced: moving on is not a score change, and it is exactly the event the asker's screen is
     waiting for. */
  tqFlushScore(true);
  tqRenderHolder();
}

function tqFlushScore(force){
  const seat=tqMySeat();
  if(!seat) return;
  /* Only the holder writes. The askers' phones record nothing at all, so no student ever writes
     a number about another student — the same guard Describe It uses. */
  if(seat.r!==0) return;
  const mine = { hits:TQSTU.hits, pos:TQSTU.pos, round:(TQSTU.meta&&TQSTU.meta.round)||1 };
  const now=Date.now();
  if(!force && (now - TQSTU.lastWrite) < TQ_WRITE_MS){
    if(TQSTU.pendingWrite) return;
    TQSTU.pendingWrite=setTimeout(()=>{ TQSTU.pendingWrite=null; tqFlushScore(true); },
                                  TQ_WRITE_MS - (now - TQSTU.lastWrite));
    return;
  }
  if(TQSTU.pendingWrite){ clearTimeout(TQSTU.pendingWrite); TQSTU.pendingWrite=null; }
  TQSTU.lastWrite=now;
  Backend.saveProgress(TQSTU.runId, STUDENT.id, STUDENT.surname, STUDENT.firstName, mine)
    .catch(e=>{
      const w=document.getElementById("tq-card-warning");
      if(w){ w.style.display="block";
             w.textContent=t("tq.score_not_saved",
               "Your count is not reaching your teacher’s screen ({reason}). Keep playing and tell them the number.",
               { reason:(e&&e.message)||t("tq.unknown_reason", "no reason given") }); }
    });
}

function tqStudentEnd(){
  if(TQSTU.unsub){ TQSTU.unsub(); TQSTU.unsub=null; }
  if(TQSTU.tick){ clearInterval(TQSTU.tick); TQSTU.tick=null; }
  if(TQSTU.pendingWrite){ clearTimeout(TQSTU.pendingWrite); TQSTU.pendingWrite=null; }
  tqReleaseAwake();
  /* Their own result, built on their own phone out of the meta they already had. */
  renderStudentScores(TQSTU.meta, STUDENT.id, (TQSTU.meta&&TQSTU.meta.name) || t("tq.twenty_questions", "Twenty Questions"));
}

document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState==="visible" && TQSTU.runId && !TQSTU.wakeLock) tqKeepAwake();
});

async function tqRejoin(summary, run){
  TQ = { sessionCode: run.code || summary.code, runId: summary.runId,
         subjects: run.questions||[], name: (run.meta&&run.meta.title)||t("tq.twenty_questions", "Twenty Questions"),
         sets:[], chosen:[], areaSubjects:[], areaName:"", packLang:(run.meta&&run.meta.lang)||"en",
         participants:[], unsub:null, meta: run.meta, tick:null, projecting:false };
  tqShowLive();
  tqWatchParticipants();
}

/* ---------- the contract ---------- */
registerActivity("twentyq", {
  join: tqStudentStart,
  teacher: tqCreateSession,
  score: null,          // the count is a pair's, lives for one round, and is never marked
  finish: tqEnd,
  rejoin: tqRejoin,
  anonymous: meta => runIsAnonymous(meta),   // no name is asked for, and none is stored

  label: "Twenty Questions",
  keeps: false          // nothing is archived: the records name students and hold no marks
});
