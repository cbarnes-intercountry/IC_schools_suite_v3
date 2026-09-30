/* ============================================================================
   Classroom Exam App — modules/partners.js
   Part of index.html's script, new in v3.13. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Word Partners: one phone shows a word and a hidden list of the words that go with it; the
   partner has to produce them out loud.

   The third game, and the third distinct competence. Describe It trains circumlocution — say it
   another way. Twenty Questions trains the question. This trains COLLOCATION, which is the single
   biggest thing separating B1 from B2 in business English and exactly what a French speaker gets
   wrong by translating: *do a decision, *strong traffic, *pass an exam meaning sit one.

   You cannot teach collocation by recognition. A student shown "meet / do / make — a deadline"
   picks the right one and has learned nothing, because the wrong answers were never live for them.
   They have to PRODUCE it, cold, from the noun alone — which is what this does and what a
   multiple-choice question cannot.

   The holder's screen is the answer key, and that is the whole asymmetry: the speaker has the noun
   and nothing else. Ticking a partner off is a judgement about a word, not about a person — the
   same shape as Describe It's "Got it" — and the count belongs to the pair.

   THE BUTTON THAT MATTERS is "That works too". A pack lists six partners for "a deadline"; English
   has more. A pair that produces "blow a deadline" and is told it is wrong has been taught
   something false by a checklist. So the holder can accept anything that works, it scores like any
   other, and the list stops pretending to be the language. */

let WP = { sessionCode:null, runId:null, cards:[], name:"", sets:[], packLang:"en",
           areaCards:[], areaName:"", chosen:[],
           participants:[], unsub:null, meta:null, tick:null, projecting:false };

let WPSTU = { runId:null, meta:null, cards:[], unsub:null, wakeLock:null,
              pos:0, hits:0, found:[], revealed:[], round:0, tick:null,
              pendingWrite:null, lastWrite:0, phase:null };

/* A card takes about a minute to work through properly. Ninety seconds is two cards for a quick
   pair and one for a careful one, which is the right shape for a first round; three minutes is
   where a confident class should end up. */
const WP_ROUND_SECONDS = [90, 120, 180];
const WP_DEFAULT_SECONDS = 120;

/* What kind of partner is wanted. Told to the speaker, because "words that go with traffic" is not
   a task and "adjectives that go with traffic" is. A closed list, so a pack cannot invent one the
   screens cannot phrase. */
const WP_PATTERNS = ["verb", "adjective", "noun", "adverb", "preposition"];
const WP_DEFAULT_PATTERN = "verb";

/* Four is the fewest that makes a card worth playing and eight is the most that fits a phone
   without scrolling while somebody is waiting for an answer. */
const WP_MIN_PARTNERS = 3;
const WP_MAX_PARTNERS = 8;

/* Three points for finding every partner on a card without being shown one.

   A pair that has four of six will always be tempted to move on to a fresh word, where the first
   two partners come easily. But the last two on a card are the ones worth having — they are the
   collocations nobody reaches for — so digging to the end has to be worth more than starting again.

   Unaided on purpose: a card finished with "Show one" is not a card they cleared. */
const WP_CLEAR_BONUS = 3;

const WP_WRITE_MS = 2000;
const WP_MAX_SETS = 3;


/* ---------- pure helpers (no DOM, no database) ---------- */

/* The clock, the pair counts, the running totals and how a pack's sets are read all live in
   core/rounds.js, shared with the other two games. What is here is what is this game's. */
function wpRoundSeconds(meta){ return pickRoundLength(meta, WP_ROUND_SECONDS, WP_DEFAULT_SECONDS); }
function wpSecondsLeft(meta, now){ return roundSecondsLeft(meta, wpRoundSeconds(meta), now); }
function wpRoundIsRunning(meta){ return roundIsRunning(meta, wpRoundSeconds(meta)); }
function wpPhase(meta){ return roundPhase(meta, wpRoundSeconds(meta)); }
function wpCardAt(cards, order, pos){ return cardAt(cards, order, pos); }
function wpSetsIn(cards){ return setsIn(cards); }
function wpCardsIn(cards, set){ return itemsInSet(cards, set); }
function wpSetNames(meta){ return chosenSetNames(meta, t("wp.whole_area", "The whole area")); }

function wpHead(card){ return String((card && card.head) || "").trim(); }

/* The partners, as a list however the pack stored them. Trimmed, blanks dropped, capped: a card
   with nine partners would scroll on a phone, and the ninth would never be reached anyway. */
function wpPartners(card){
  const raw=(card && card.partners);
  const list = Array.isArray(raw) ? raw : String(raw||"").split(";");
  return list.map(p=>String(p||"").trim()).filter(Boolean).slice(0, WP_MAX_PARTNERS);
}

function wpPattern(card){
  const p=String((card && card.pattern) || "").trim().toLowerCase();
  return WP_PATTERNS.indexOf(p)>=0 ? p : WP_DEFAULT_PATTERN;
}

/* "Verbs that go with a deadline". The task, in one line, on the speaker's screen. */
/* The pattern's own name, for the editor's dropdown. Written out rather than keyed off the stored
   value, same reason as wpPrompt. */
function wpPatternLabel(pattern){
  switch(String(pattern||"").toLowerCase()){
    case "adjective":   return t("wp.pattern_adjective", "Adjective");
    case "noun":        return t("wp.pattern_noun", "Noun");
    case "adverb":      return t("wp.pattern_adverb", "Adverb");
    case "preposition": return t("wp.pattern_preposition", "Preposition");
    default:            return t("wp.pattern_verb", "Verb");
  }
}

function wpPrompt(card){
  /* Written out rather than built from the pattern name. A computed key with a lookup table of
     English beside it puts the same string in two places and hides it from the extraction check,
     which is how a language ends up half translated. */
  switch(wpPattern(card)){
    case "adjective":   return t("wp.prompt_adjective", "Adjectives that go with");
    case "noun":        return t("wp.prompt_noun", "Nouns that go with");
    case "adverb":      return t("wp.prompt_adverb", "Adverbs that go with");
    case "preposition": return t("wp.prompt_preposition", "Prepositions that go with");
    default:            return t("wp.prompt_verb", "Verbs that go with");
  }
}

/* Matching what a student says against the list. Case and surrounding space never matter; nothing
   else is forgiven, because the whole point is the word. A pack that writes "push back" and a
   student who says "push  back" are the same answer, so runs of space collapse. */
function wpNormalise(word){
  return String(word||"").trim().toLowerCase().replace(/\s+/g, " ");
}

/* There is deliberately NO "does this typed word match a partner" function here. The holder ticks a
   row; nothing in this game reads a word a student typed, because nothing in this game is typed —
   they say it out loud, which is the entire point. A matcher was written first and then found to be
   called by nothing but its own test, which is the shape of speculative code: it looks like
   coverage and is a second, untested way of deciding what counts. */

function wpCardIsDone(card, found){
  return wpPartners(card).length > 0 && ((found||[]).length >= wpPartners(card).length);
}

/* Cleared means every partner produced and none revealed. */
function wpCardIsCleared(card, found, revealed){
  return wpCardIsDone(card, found) && ((revealed||[]).length === 0);
}

function wpStandings(participants, pairs){
  return pairStandings(participants, pairs).map(g => Object.assign({}, g, { holder: g.lead }));
}


/* ---------- teacher: setting one up ---------- */

async function wpCreateSession(){
  if(!(await confirmNoOpenRun("game"))) return;
  const code = genSessionCode();
  WP = { sessionCode:code, runId:null, cards:[], name:"", sets:[], packLang:"en",
         areaCards:[], areaName:"", chosen:[],
         participants:[], unsub:null, meta:null, tick:null, projecting:false };
  const c=document.getElementById("wp-code");
  if(c){ c.textContent=t("wp.code_is", "Code · {code}", {code:code}); c.style.display="inline-block"; }
  wpResetStep2();
  wpFillRoundLengths();
  await loadPartnersSetList();
  wpRenderChosen();
  showScreen("screen-wp-setup");
}

function wpFillRoundLengths(){
  const sel=document.getElementById("wp-seconds-select");
  if(!sel) return;
  sel.innerHTML = WP_ROUND_SECONDS.map(s=>
    '<option value="'+s+'"'+(s===WP_DEFAULT_SECONDS?" selected":"")+'>'+
    escapeHtml(roundLengthLabel(s))+'</option>').join("");
}

function wpFillSets(){
  const sel=document.getElementById("wp-theme-select");
  if(!sel) return;
  const sets=wpSetsIn(WP.areaCards);
  const box=document.getElementById("wp-theme-row");
  if(box) box.style.display = WP.areaCards.length ? "block" : "none";
  sel.innerHTML = '<option value="">'+escapeHtml(sets.length
      ? t("wp.whole_area", "The whole area")
      : t("wp.area_has_no_sets", "— this area has no sets —"))+'</option>'
    + sets.map(th=>'<option value="'+escapeHtml(th)+'">'+escapeHtml(th)+' ('
      + wpCardsIn(WP.areaCards, th).length + ')</option>').join("");
  wpSyncAddButton();
}

function wpSyncAddButton(){
  const add=document.getElementById("wp-add-set-btn");
  if(add) add.disabled = !WP.areaCards.length || WP.chosen.length>=WP_MAX_SETS;
}

function wpResetStep2(){
  WP.areaCards=[]; WP.areaName="";
  const sel=document.getElementById("wp-set-select"); if(sel) sel.value="";
  const th=document.getElementById("wp-theme-row"); if(th) th.style.display="none";
  wpRenderChosen();
  wpDescribePack();
}

async function loadPartnersSetList(){
  try{
    const qs = await Backend.listQuizzes();
    WP.sets = (qs.quizzes||[]).filter(q=>q.kind==="partners")
                              .sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));
    const sel=document.getElementById("wp-set-select");
    sel.innerHTML = '<option value="">'+escapeHtml(WP.sets.length
      ? t("wp.select_an_area", "— select an area —")
      : t("wp.no_areas_yet", "— no partner sets yet: add one in Admin —"))+'</option>';
    WP.sets.forEach(a=>{ const o=document.createElement("option"); o.value=a.key;
      o.textContent=a.name+" ("+t("wp.n_cards", "{count} {cards}",
        { count:a.count, cards: plural(a.count, t("wp.card", "word"), t("wp.cards", "words")) })+")";
      sel.appendChild(o); });
  }catch(e){ console.warn(e); }
}

async function wpSetPicked(){
  const key=document.getElementById("wp-set-select").value;
  if(!key){ wpResetStep2(); return; }
  let rec=null;
  try{ rec=await Backend.getQuiz(key); }catch(e){ alert(t("wp.couldn_t_load_area", "Couldn't load that area: ")+e.message); return; }
  if(!rec){ alert(t("wp.area_gone", "That area has gone.")); return; }
  WP.areaCards=rec.questions||[];
  WP.areaName=rec.name||t("wp.word_partners", "Word Partners");
  wpFillSets();
  wpDescribePack();
}

/* ---------- the basket: up to three sets, from anywhere ---------- */

function wpChosenCards(){
  const out=[], seen={};
  WP.chosen.forEach(c=>{
    (c.cards||[]).forEach(cd=>{
      const k=wpNormalise(wpHead(cd));
      if(!k || seen[k]) return;
      seen[k]=true;
      out.push(cd);
    });
  });
  return out;
}

function wpChosenLang(){
  const c0=wpChosenCards()[0];
  return (c0 && c0.lang) || "en";
}

function wpAddSet(){
  if(WP.chosen.length>=WP_MAX_SETS){
    alert(t("wp.three_sets_max",
      "Three sets is the most one session can hold. Remove one first.")); return;
  }
  const setName=(document.getElementById("wp-theme-select")||{}).value||"";
  const cards=wpCardsIn(WP.areaCards, setName);
  if(!cards.length){ alert(t("wp.set_is_empty", "That set has no words in it.")); return; }
  const label=setName || WP.areaName;
  if(WP.chosen.some(c=>c.area===WP.areaName && c.set===setName)){
    alert(t("wp.already_chosen", "“{name}” is already in this session.", {name:label})); return;
  }
  const lang=(cards[0] && cards[0].lang) || "en";
  if(WP.chosen.length && lang !== wpChosenLang()){
    alert(t("wp.sets_mix_languages",
      "That set is written in a different language from the ones already chosen. One session is in one language."));
    return;
  }
  WP.chosen.push({ area:WP.areaName, set:setName, label:label, cards:cards.slice(), lang:lang });
  wpRenderChosen();
  wpDescribePack();
}

function wpRemoveSet(i){
  WP.chosen.splice(i,1);
  wpRenderChosen();
  wpDescribePack();
}

function wpRenderChosen(){
  const box=document.getElementById("wp-chosen");
  if(box){
    box.innerHTML = WP.chosen.length
      ? WP.chosen.map((c,i)=>
          '<span class="chip di-chosen-chip">'+
            '<b>'+escapeHtml(c.label)+'</b> '+
            '<span class="sub">'+escapeHtml(c.area)+' · '+c.cards.length+'</span>'+
            '<button class="di-chip-x" onclick="wpRemoveSet('+i+')" '+
              'title="'+escapeHtml(t("wp.ti.remove_set", "Take this set out of the session"))+'">×</button>'+
          '</span>').join("")
      : '<p class="sub">'+t("wp.nothing_chosen",
          "Nothing chosen yet. Pick an area, then a set, then Add — up to three, from any areas you like.")+'</p>';
  }
  const count=document.getElementById("wp-chosen-count");
  if(count) count.textContent = t("wp.n_of_max_sets", "{n} of {max}",
    { n:WP.chosen.length, max:WP_MAX_SETS });
  wpSyncAddButton();
}

/* How many partners are actually on the table, which is what the round is scored out of — and the
   number a teacher wants before they start, because it is the difference between a set a pair can
   finish and one they cannot. */
function wpDescribePack(){
  const list=wpChosenCards();
  const total=list.reduce((n,c)=>n+wpPartners(c).length, 0);
  const thin=list.filter(c=>wpPartners(c).length < WP_MIN_PARTNERS).length;
  const dropped=WP.chosen.reduce((n,c)=>n+c.cards.length,0) - list.length;
  const el=document.getElementById("wp-summary");
  if(!el) return;
  el.textContent = list.length
    ? t("wp.setup_summary", "{count} {cards} · {total} partners to find in all",
        { count:list.length, total:total,
          cards: plural(list.length, t("wp.card", "word"), t("wp.cards", "words")) })
      + (dropped ? " · " + t("wp.n_duplicates_dropped",
          "{n} in more than one of these sets, counted once", {n:dropped}) : "")
      + (thin ? " · " + t("wp.n_thin",
          "{n} with fewer than {min} partners, so those go quickly", {n:thin, min:WP_MIN_PARTNERS}) : "")
    : "";
  const startBtn=document.getElementById("wp-start-btn");
  if(startBtn) startBtn.disabled = list.length===0;
}

async function wpStartSession(){
  const playing=wpChosenCards();
  if(!playing.length){ alert(t("wp.choose_a_set_first", "Choose at least one set first.")); return; }
  const secs=parseInt((document.getElementById("wp-seconds-select")||{}).value,10) || WP_DEFAULT_SECONDS;
  const title=WP.chosen.map(c=>c.label).join(" + ");
  const meta = {
    kind:"partners", status:"waiting", round:0,
    roundSeconds:secs, roundStartedAt:0,
    sets:WP.chosen.map(c=>({ area:c.area, set:c.set, label:c.label })),
    title:title,
    lang:wpChosenLang(),
    anon: !!(document.getElementById("wp-anon")||{}).checked,
    teacherName:(TEACHER_USER&&TEACHER_USER.name)||"",
    teacherEmail:(TEACHER_USER&&TEACHER_USER.email)||"",
    pairs:{}, totals:{}, bankedRound:0, startedAt:null
  };
  WP.runId = WP.sessionCode+"-"+Date.now().toString(36).toUpperCase();
  try{ await Backend.createSession(WP.runId, WP.sessionCode, meta, playing); }
  catch(e){ alert(t("wp.couldn_t_open_game", "Couldn't open the game: ")+e.message); return; }
  WP.meta=meta;
  WP.cards=playing;
  WP.name=title;
  wpShowLive();
  wpWatchParticipants();
}

/* ---------- teacher: the live room ---------- */

function wpShowLive(){
  document.getElementById("wp-live-code").textContent=WP.sessionCode;
  document.getElementById("wp-title").textContent=WP.name||t("wp.word_partners", "Word Partners");
  const th=document.getElementById("wp-live-theme");
  if(th){ th.textContent=wpSetNames(WP.meta); th.style.display="inline-block"; }
  document.getElementById("wp-join-code").textContent=WP.sessionCode;
  const dealt=(WP.meta && WP.meta.round)>0;
  document.getElementById("wp-lobby").style.display = dealt ? "none" : "block";
  document.getElementById("wp-stage").style.display = dealt ? "block" : "none";
  showScreen("screen-wp-live");
  wpRenderQR();
  wpFillLiveSeconds();
  if(dealt){ wpRenderStage(); wpStartTick(); }
}

function wpRenderQR(){
  const holder=document.getElementById("wp-qr-code"); if(!holder) return;
  holder.innerHTML="";
  const url=location.origin+location.pathname+"?join="+encodeURIComponent(WP.sessionCode);
  try{ new QRCode(holder,{text:url,width:180,height:180}); }catch(e){ holder.textContent=url; }
  const el=document.getElementById("wp-join-url"); if(el) el.textContent=url;
}

function wpWatchParticipants(){
  if(WP.unsub) WP.unsub();
  WP.unsub = Backend.subscribeParticipants(WP.runId, res=>{
    WP.participants=(res&&res.participants)||[];
    wpFeedOk();
    wpRenderRoster();
    if(WP.meta && WP.meta.round>0){ wpRenderStage(); wpRelayPositions().catch(e=>console.warn(e)); }
  }, err=>{ wpFeedFailed(err); });
}

function wpFeedOk(){
  const w=document.getElementById("wp-feed-warning");
  if(w) w.style.display="none";
}
function wpFeedFailed(err){
  const w=document.getElementById("wp-feed-warning");
  if(!w) return;
  w.style.display="block";
  w.textContent=t("wp.feed_failed",
    "The class list cannot be read ({reason}), so this may not be an empty room — it may be a room the app cannot see.",
    { reason:(err&&err.message)||t("wp.unknown_reason", "no reason given") });
}

function wpRenderRoster(){
  const n=WP.participants.length;
  document.getElementById("wp-count").textContent=t("wp.n_joined", "{count} joined", {count:n});
  const el=document.getElementById("wp-roster");
  el.innerHTML = WP.participants.slice().sort(bySurname)
    .map(p=>'<span class="chip">'+escapeHtml(displayName(p.surname,p.firstName))+'</span>').join("") ||
    '<p class="sub">'+t("wp.waiting_students_join", "Waiting for students to join…")+'</p>';
  const dealBtn=document.getElementById("wp-deal-btn");
  dealBtn.disabled = n<2;
  const odd=document.getElementById("wp-odd-note");
  if(odd){
    odd.style.display = (n>=3 && n%2===1) ? "block" : "none";
    /* The odd student out is a second speaker. Two people producing collocations against one
       checklist is the best version of this game for a weaker pair: they prompt each other, and
       the holder hears twice as much language. */
    odd.textContent = t("wp.odd_number_note",
      "{n} students — an odd one out, so one pair plays as a three with two speaking. They prompt each other, which is no bad thing.", {n:n});
  }
}

async function wpDeal(){
  const pairs=pairUp(WP.participants);
  await wpPushMeta({ pairs:pairs, status:"active", round:1, roundStartedAt:0,
                     startedAt:(WP.meta&&WP.meta.startedAt)||Date.now() });
  document.getElementById("wp-lobby").style.display="none";
  document.getElementById("wp-stage").style.display="block";
  wpStartTick();
}

async function wpStartRound(){
  if(!WP.meta || !WP.meta.round){ return; }
  await wpResetScores();
  await wpPushMeta({ pos:{}, rhits:{}, roundStartedAt: Backend.serverNow() });
}

async function wpSwapRoles(){
  if(!WP.meta || !WP.meta.round){ return; }
  await wpResetScores();
  await wpPushMeta({ pairs: swapPairRoles(metaMap(WP.meta,"pairs")),
                     round: WP.meta.round+1, roundStartedAt: 0 });
}

async function wpNewPairs(){
  await wpResetScores();
  await wpPushMeta({ pairs: pairUp(WP.participants),
                     round: ((WP.meta&&WP.meta.round)||0)+1, roundStartedAt: 0 });
}

async function wpResetScores(){
  WP.participants = WP.participants.map(p=>Object.assign({}, p, { progress:null }));
}

async function wpPushMeta(changes){
  const meta=Object.assign({}, WP.meta||{}, changes);
  WP.meta=meta;
  try{ await Backend.updateMeta(WP.runId, meta); }
  catch(e){ alert(t("wp.couldn_t_update", "Couldn't update the game: ")+e.message); return; }
  wpRenderStage();
}

async function wpSetSeconds(){
  const want=parseInt(document.getElementById("wp-live-seconds").value,10) || WP_DEFAULT_SECONDS;
  if(!WP.meta || want===wpRoundSeconds(WP.meta)) return;
  await wpPushMeta({ roundSeconds: want });
}

function wpFillLiveSeconds(){
  const sel=document.getElementById("wp-live-seconds");
  if(!sel) return;
  const now=wpRoundSeconds(WP.meta);
  sel.innerHTML = WP_ROUND_SECONDS.map(n=>
    '<option value="'+n+'"'+(n===now?" selected":"")+'>'+
    escapeHtml(roundLengthLabel(n))+'</option>').join("");
}

function wpStartTick(){
  if(WP.tick) clearInterval(WP.tick);
  WP.tick=setInterval(()=>{
    wpRenderClock();
    wpMaybeBankRound().catch(e=>console.warn(e));
  }, 500);
}

function wpStopTick(){ if(WP.tick){ clearInterval(WP.tick); WP.tick=null; } }

/* The teacher is the only party allowed to write meta, so the teacher is the only party who can
   tell the speaker which word their partner is on. Written only when it has actually changed;
   the subscription fires on every score write, and relaying regardless would be a database write
   per tap per pair. */
async function wpRelayPositions(){
  const meta=WP.meta;
  if(!meta || !meta.round || !meta.roundStartedAt) return;
  const now=pairPositions(WP.participants, metaMap(meta,"pairs"));
  if(!positionsDiffer(metaMap(meta,"pos"), now)) return;
  await wpPushMeta({ pos: now });
}

async function wpMaybeBankRound(){
  const meta=WP.meta;
  if(!roundIsDueToBank(meta, wpRoundSeconds(meta))) return;
  WP.participants = WP.participants || [];
  await wpPushMeta({ totals: bankPairScores(metaMap(meta,"totals"), WP.participants, metaMap(meta,"pairs"), "speakers"),
                     rhits: pairRoundHits(WP.participants, metaMap(meta,"pairs")),
                     bankedRound: meta.round });
}

function wpRenderClock(){
  const meta=WP.meta||{};
  const el=document.getElementById("wp-clock");
  if(el){
    if(!meta.roundStartedAt){ el.textContent="—"; el.className="di-clock"; }
    else {
      const left=wpSecondsLeft(meta);
      el.textContent = left>=60 ? Math.floor(left/60)+":"+String(left%60).padStart(2,"0") : left+"s";
      el.className = left<=15 ? "di-clock low" : "di-clock";
    }
  }
  const btn=document.getElementById("wp-start-round-btn");
  if(btn) btn.disabled = wpRoundIsRunning(meta);
  if(WP.projecting) wpRenderProjection();
}

function wpRenderStage(){
  const meta=WP.meta||{};
  const pairs=metaMap(meta,"pairs");
  const badge=document.getElementById("wp-round");
  if(badge) badge.textContent=t("wp.round_n", "Round {n}", {n:meta.round||1});
  const th=document.getElementById("wp-live-theme");
  if(th){ th.textContent=wpSetNames(meta); th.style.display="inline-block"; }
  wpFillLiveSeconds();
  wpRenderClock();

  const over = !!meta.roundStartedAt && !wpRoundIsRunning(meta);
  const scores=document.getElementById("wp-scores");
  if(scores) scores.style.display = over ? "block" : "none";
  if(over) wpRenderScores();

  const box=document.getElementById("wp-pairs");
  if(!box) return;
  const rows=wpStandings(WP.participants, pairs);
  box.innerHTML = rows.length
    ? rows.map(g=>'<div class="di-score-row">'+
        '<span class="di-pair-no">'+g.g+'</span>'+
        '<span class="di-score-who">'+escapeHtml(g.names.join(" · "))+
          '<small class="hint"> — '+escapeHtml(t("wp.holding", "{who} has the list", {who:g.holder||"?"}))+'</small></span>'+
        '<span class="di-score-n mono">'+g.hits+'</span></div>').join("")
    : '<p class="sub">'+t("wp.no_pairs_yet", "No pairs yet.")+'</p>';
}

function wpRenderScores(){
  const meta=WP.meta||{};
  const pairs=metaMap(meta,"pairs");
  const banked=(meta.bankedRound||0) >= meta.round;

  const head=document.getElementById("wp-scores-round");
  if(head) head.textContent=t("wp.round_n", "Round {n}", {n:meta.round||1});

  const thisRound=document.getElementById("wp-scores-round-list");
  if(thisRound){
    const rows=wpStandings(WP.participants, pairs);
    thisRound.innerHTML = rows.length
      ? rows.map((g,i)=>'<div class="di-score-row'+(i===0&&g.hits>0?" di-score-top":"")+'">'+
          '<span class="di-pair-no">'+g.g+'</span>'+
          '<span class="di-score-who">'+escapeHtml(g.names.join(" · "))+'</span>'+
          '<span class="di-score-n mono">'+g.hits+'</span></div>').join("")
      : '<p class="sub">'+t("wp.nobody_scored_yet", "Nothing recorded for this round.")+'</p>';
  }

  const totals=document.getElementById("wp-scores-total-list");
  if(totals){
    const rows=roundLeaderboard(metaMap(meta,"totals"), WP.participants, pairs);
    totals.innerHTML = rows.map((r,i)=>'<div class="di-score-row'+(i===0&&r.total>0?" di-score-top":"")+'">'+
      '<span class="di-pair-no">'+(i+1)+'</span>'+
      '<span class="di-score-who">'+escapeHtml(r.name)+'</span>'+
      '<span class="di-score-n mono">'+r.total+'</span></div>').join("");
  }
  const note=document.getElementById("wp-scores-note");
  if(note) note.textContent = banked
    ? t("wp.totals_include_this_round", "Running totals, this round included. Both partners get the pair’s score.")
    : t("wp.totals_counting", "Counting this round in…");
}

function wpToggleProject(){
  WP.projecting=!WP.projecting;
  const el=document.getElementById("wp-projection");
  if(el) el.style.display = WP.projecting ? "block" : "none";
  if(WP.projecting) wpRenderProjection();
}

function wpRenderProjection(){
  const meta=WP.meta||{};
  const pairs=metaMap(meta,"pairs");
  const ttl=document.getElementById("wp-proj-title");
  if(ttl) ttl.textContent=WP.name||wpSetNames(meta)||t("wp.word_partners", "Word Partners");
  const cl=document.getElementById("wp-proj-clock");
  if(cl){
    const left=wpSecondsLeft(meta);
    cl.textContent = meta.roundStartedAt
      ? (left>=60 ? Math.floor(left/60)+":"+String(left%60).padStart(2,"0") : left+"s")
      : t("wp.ready", "Ready");
  }
  const box=document.getElementById("wp-proj-pairs");
  if(box) box.innerHTML = wpStandings(WP.participants, pairs).map(g=>
    '<div class="di-proj-pair"><span class="di-proj-no">'+g.g+'</span> '+
    escapeHtml(g.names.join(" · "))+' <b class="mono">'+g.hits+'</b></div>').join("");
}

/* Ending the game now has two steps: look at the scores, then clear it. The delete is the same
   delete it always was — it happens when the teacher closes the leaderboard rather than instead
   of showing one. Nothing is kept either way. */
async function wpEnd(){
  wpStopTick();
  /* The students are told the game is over HERE, not when the teacher closes the leaderboard.
     Before this the two were the same call, and splitting them left every phone in the room
     counting down a round nobody was playing while the teacher read the scores. */
  await wpSignalEnd();
  await showFinalScores({
    runId: WP.runId,
    meta: WP.meta,
    participants: WP.participants,
    title: WP.name || t("wp.word_partners", "Word Partners"),
    onFinish: wpReallyEnd
  });
}

async function wpSignalEnd(){
  try{
    WP.meta = Object.assign({}, WP.meta||{},
      finalMetaPatch(WP.meta, WP.participants, "speakers"));
    await Backend.updateMeta(WP.runId, WP.meta);
  }catch(e){ console.warn(e); }
}

async function wpReallyEnd(){
  try{
    await wpSignalEnd();
    await Backend.deleteRun(WP.runId);
  }catch(e){ console.warn(e); }
  wpCleanup();
  teacherHome();
}

function wpLeave(){ wpCleanup(); teacherHome(); }

function wpCleanup(){
  if(WP.unsub){ WP.unsub(); WP.unsub=null; }
  wpStopTick();
  WP.projecting=false;
  const el=document.getElementById("wp-projection"); if(el) el.style.display="none";
}


/* ---------- student: the two screens ---------- */

async function wpStudentStart(session, surname, firstName){
  WPSTU={ runId:session.runId, meta:session.meta, cards:session.questions||[],
          unsub:null, wakeLock:null, pos:0, hits:0, found:[], revealed:[], extra:0, round:0,
          tick:null, pendingWrite:null, lastWrite:0, phase:null };
  try{ await Backend.joinSession(WPSTU.runId, STUDENT.id, surname, firstName, true); }
  catch(e){
    alert(t("wp.join_refused",
      "You are not in the game: the database refused to record you ({reason}).\n\nTell your teacher — nothing you do would count.",
      { reason:(e&&e.message)||t("wp.unknown_reason", "no reason given") }));
    return;
  }
  const badge=document.getElementById("wp-card-name");
  if(badge){ badge.textContent=displayName(surname,firstName); badge.style.display="inline-block"; }
  showScreen("screen-wp-card");
  wpKeepAwake();
  wpStudentWatch();
  wpStudentTick();
}

function wpStudentWatch(){
  if(WPSTU.unsub) WPSTU.unsub();
  WPSTU.unsub = Backend.subscribeMeta(WPSTU.runId, res=>{
    if(!res || !res.meta) return;
    const before=WPSTU.meta||{};
    WPSTU.meta=res.meta;
    if(res.meta.status==="ended"){ wpStudentEnd(); return; }
    if((res.meta.round||0) !== (WPSTU.round||0)){
      WPSTU.round=res.meta.round||0; WPSTU.pos=0; WPSTU.hits=0; wpResetCard();
    }
    if((res.meta.roundStartedAt||0) !== (before.roundStartedAt||0) && res.meta.roundStartedAt){
      WPSTU.pos=0; WPSTU.hits=0; wpResetCard();
    }
    wpRenderCard();
  });
}

function wpStudentTick(){
  if(WPSTU.tick) clearInterval(WPSTU.tick);
  WPSTU.tick=setInterval(()=>{ wpCardTick(); }, 400);
}

async function wpKeepAwake(){
  try{
    if(navigator.wakeLock && navigator.wakeLock.request){
      WPSTU.wakeLock = await navigator.wakeLock.request("screen");
      WPSTU.wakeLock.addEventListener("release", ()=>{ WPSTU.wakeLock=null; });
    }
  }catch(e){ /* unsupported or refused: the game still works, the screen just dims */ }
}
function wpReleaseAwake(){
  try{ if(WPSTU.wakeLock) WPSTU.wakeLock.release(); }catch(e){}
  WPSTU.wakeLock=null;
}

function wpMySeat(){
  const pairs=metaMap(WPSTU.meta,"pairs");
  return pairs[STUDENT.id] || null;
}

function wpMyOrder(){
  const seat=wpMySeat();
  if(!seat) return [];
  return termOrderFor((WPSTU.cards||[]).length, seat.g, (WPSTU.meta&&WPSTU.meta.round)||1);
}

/* Seat 0's own number; everyone else's comes back through the teacher (see core/rounds.js). */
function wpMyPos(){ return seatPosition(WPSTU.meta, wpMySeat(), WPSTU.pos); }

function wpMyCard(){ return wpCardAt(WPSTU.cards, wpMyOrder(), wpMyPos()); }

function wpResetCard(){
  WPSTU.found=[]; WPSTU.revealed=[]; WPSTU.extra=0;
}

/* ---------- the card ----------

   Same shape as the other two, and for the same reason: in v3.10 a renderer and a clock called
   each other at the bell until the stack ran out and a student's screen froze. The clock paints
   digits; the tick decides when a change of PHASE is worth a redraw; nothing that draws may call
   the tick back. */
function wpPaintClock(){
  const el=document.getElementById("wp-card-clock");
  if(!el) return;
  const meta=WPSTU.meta||{};
  if(!wpRoundIsRunning(meta)){ el.textContent=""; el.className="di-clock"; return; }
  const left=wpSecondsLeft(meta);
  el.textContent = left>=60 ? Math.floor(left/60)+":"+String(left%60).padStart(2,"0") : left+"s";
  el.className = left<=15 ? "di-clock low" : "di-clock";
}

function wpCardTick(){
  const phase=wpPhase(WPSTU.meta);
  if(phase !== WPSTU.phase){ wpRenderCard(); return; }
  wpPaintClock();
}

function wpRenderCard(){
  const meta=WPSTU.meta||{};
  const seat=wpMySeat();
  const waiting=document.getElementById("wp-card-waiting");
  const main=document.getElementById("wp-card-main");

  if(meta.status!=="active" || !seat){
    if(waiting) waiting.style.display="block";
    if(main) main.style.display="none";
    WPSTU.phase = wpPhase(meta);
    return;
  }
  if(waiting) waiting.style.display="none";
  if(main) main.style.display="block";

  const others=pairMembers(metaMap(meta,"pairs"), seat.g)
    .filter(m=>m.studentId!==STUDENT.id).map(m=>m.name);
  document.getElementById("wp-card-pair").textContent=t("wp.pair_n", "Pair {n}", {n:seat.g});
  document.getElementById("wp-card-partner").textContent = others.length
    ? t("wp.with_partner", "With {who}", { who: others.join(", ") })
    : t("wp.waiting_for_a_partner", "Waiting for a partner…");

  /* Seat 0 holds the list. Everyone else in the pair speaks — including the odd student out in a
     three, who is a second speaker rather than a referee. */
  const holding = (seat.r===0);
  document.getElementById("wp-holder-view").style.display = holding ? "block" : "none";
  document.getElementById("wp-speaker-view").style.display  = holding ? "none" : "block";
  document.getElementById("wp-card-role").textContent = holding
    ? t("wp.you_have_the_list", "You have the list")
    : t("wp.you_say_them", "You say them");

  if(holding) wpRenderHolder();
  else wpRenderSpeaker();
  WPSTU.phase = wpPhase(meta);
  wpPaintClock();
}

function wpRenderHolder(){
  const meta=WPSTU.meta||{};
  const running=wpRoundIsRunning(meta);
  const ready=document.getElementById("wp-holder-ready");
  const play=document.getElementById("wp-holder-play");
  const over=document.getElementById("wp-holder-over");

  if(!meta.roundStartedAt){
    ready.style.display="block"; play.style.display="none"; over.style.display="none";
    return;
  }
  if(!running){
    ready.style.display="none"; play.style.display="none"; over.style.display="block";
    document.getElementById("wp-final-score").textContent=String(WPSTU.hits);
    /* The marker sees the count they recorded and is told plainly whose it is. Under individual
       scoring this number does not move their own total, and a marker who thinks it does will
       finish the lesson believing the leaderboard is broken. */
    document.getElementById("wp-final-line").textContent = t("wp.round_over_for_partner",
      "{n} {partners} in {length} — that goes to {who}.",
      { n:WPSTU.hits, length:roundLengthLabel(wpRoundSeconds(meta)),
        who: wpSpeakerNames() || t("wp.your_partner", "your partner"),
        partners: plural(WPSTU.hits, t("wp.partner", "partner"), t("wp.partners", "partners")) });
    wpShowMyTotal();
    wpFlushScore(true);
    return;
  }

  ready.style.display="none"; play.style.display="block"; over.style.display="none";
  const card=wpMyCard();
  const partners=wpPartners(card);

  document.getElementById("wp-head").textContent = card ? wpHead(card) : "";
  document.getElementById("wp-pattern").textContent = card ? wpPrompt(card) : "";

  /* The checklist. Tapping one marks it said; a revealed one is shown struck through and does not
     score, so a stuck pair can move on without the card quietly being worth the same as one they
     actually produced. */
  /* Every partner, readable, from the moment the card appears.
   
     The first version hid the unfound ones behind dots, on the reasoning that the holder "cannot
     read the answer off their own screen before it is said". That is backwards, and it made the
     game unplayable: the holder is not guessing, they are JUDGING — and a judge holding an answer
     key they cannot read has no way to know which row to tap when their partner says "file a
     claim". The only way to play it was to tap rows until one turned green.
   
     Reported by Chris, twice. The first time he said the answers "would need to be visible to one
     screen so that he can tick off the answers" and was told they were. They were not. */
  const list=document.getElementById("wp-list");
  if(list){
    list.innerHTML = partners.map((p,i)=>{
      const got=WPSTU.found.indexOf(i)>=0;
      const given=WPSTU.revealed.indexOf(i)>=0;
      const cls = got ? "wp-p wp-p-got" : (given ? "wp-p wp-p-shown" : "wp-p");
      return '<button class="'+cls+'" onclick="wpTick('+i+')" '+
             'title="'+escapeHtml(t("wp.ti.tick", "They said it"))+'">'+
             '<span class="wp-p-word">'+escapeHtml(p)+'</span>'+
             '<span class="wp-p-mark">'+(got ? "✓" : (given ? "–" : ""))+'</span></button>';
    }).join("");
  }

  /* Counts what they PRODUCED, not what is visible. Including the revealed ones read as progress
     — a holder glancing at "3 of 6" would think the pair had three, when one of them was handed to
     them and scored nothing. The revealed rows are struck through on the same screen, so nothing
     is hidden by leaving them out of the number. */
  const done=wpCardIsDone(card, WPSTU.found);
  const count=document.getElementById("wp-progress");
  if(count) count.textContent = t("wp.n_of_n_found", "{found} of {total}",
    { found:WPSTU.found.length, total:partners.length });
  const doneBox=document.getElementById("wp-all-found");
  if(doneBox){
    doneBox.style.display = done ? "block" : "none";
    doneBox.textContent = t("wp.all_found_bonus",
      "All of them, unaided — {n} extra. Next word.", {n:WP_CLEAR_BONUS});
  }
  document.getElementById("wp-hits").textContent=String(WPSTU.hits);
}

function wpRenderSpeaker(){
  const meta=WPSTU.meta||{};
  const running=wpRoundIsRunning(meta);
  const ready=document.getElementById("wp-speaker-ready");
  const play=document.getElementById("wp-speaker-play");
  const over=document.getElementById("wp-speaker-over");
  if(!meta.roundStartedAt){
    ready.style.display="block"; play.style.display="none"; over.style.display="none";
    return;
  }
  if(!running){
    ready.style.display="none"; play.style.display="none"; over.style.display="block";
    /* The score is the speaker's, but every tap that made it happened on the other phone, so it
       arrives with the teacher's banking write a few seconds after the bell. Until it lands the
       screen says so rather than showing a zero the student would read as their score. */
    const n=seatRoundHits(meta, wpMySeat());
    const landed=Object.prototype.hasOwnProperty.call(metaMap(meta,"rhits"), String((wpMySeat()||{}).g));
    const score=document.getElementById("wp-speaker-score");
    const line=document.getElementById("wp-speaker-final-line");
    if(score) score.textContent = landed ? String(n) : "—";
    if(line) line.textContent = landed
      ? t("wp.round_over_line", "{n} {partners} in {length}.",
          { n:n, length:roundLengthLabel(wpRoundSeconds(meta)),
            partners: plural(n, t("wp.partner", "partner"), t("wp.partners", "partners")) })
      : t("wp_card.speaker_waiting", "Counting up…");
    wpShowMyTotal();
    return;
  }
  ready.style.display="none"; play.style.display="block"; over.style.display="none";

  /* The speaker gets the word, the kind of partner wanted, and how many there are — and nothing
     else. The number is not the answer and it gives the task a shape; the words themselves are the
     whole game and stay on the other phone. */
  const card=wpMyCard();
  const head=document.getElementById("wp-speaker-head");
  if(head) head.textContent = card ? wpHead(card) : "";
  const pat=document.getElementById("wp-speaker-pattern");
  if(pat) pat.textContent = card ? wpPrompt(card) : "";
  const n=document.getElementById("wp-speaker-count");
  if(n){
    const total=wpPartners(card).length;
    n.textContent = t("wp.n_to_find", "{n} to find", {n:total});
  }
}

/* Both over-screens carry a running total. The speaker's copy existed in the page from the start
   and nothing ever wrote to it, so the student whose score it now is was the one student who could
   not see it. */
function wpSpeakerNames(){
  const seat=wpMySeat();
  if(!seat) return "";
  return pairMembers(metaMap(WPSTU.meta,"pairs"), seat.g)
    .filter(m=>m.studentId!==STUDENT.id).map(m=>m.name).join(", ");
}

function wpShowMyTotal(){
  const totals=metaMap(WPSTU.meta,"totals");
  const mine=Number(totals[STUDENT.id]);
  const text=t("wp.your_running_total", "Your running total: {n}", {n:mine});
  ["wp-my-total","wp-my-total-speaker"].forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;
    if(!mine && mine!==0){ el.style.display="none"; return; }
    el.style.display="block";
    el.textContent=text;
  });
}

/* ---------- the holder's buttons ---------- */

/* Tapping a partner marks it said. Tapping it again is not an undo: a mis-tap costs a point and
   an undo would cost an argument, and the number is a pair's own count in a game nobody marks. */
function wpTick(i){
  const seat=wpMySeat();
  if(!seat || seat.r!==0) return;
  if(!wpRoundIsRunning(WPSTU.meta)) return;
  const card=wpMyCard();
  if(i<0 || i>=wpPartners(card).length) return;
  if(WPSTU.found.indexOf(i)>=0) return;
  /* A revealed partner cannot then be claimed. It is already on the screen in front of them. */
  if(WPSTU.revealed.indexOf(i)>=0) return;
  WPSTU.found.push(i);
  WPSTU.hits++;
  /* The bonus lands the moment the last one goes in, so the pair hear it while the card is still
     in front of them. It can only fire once: found never shrinks, and a tap on a row already found
     returns above. */
  const cleared=wpCardIsCleared(card, WPSTU.found, WPSTU.revealed);
  if(cleared) WPSTU.hits += WP_CLEAR_BONUS;
  wpFlushScore(cleared);
  wpRenderHolder();
}

/* The button that keeps the list honest.

   A pack lists six partners for "a deadline"; English has more. A pair that produces "blow a
   deadline" and is told it is wrong has been taught something false BY A CHECKLIST, which is the
   worst way to learn it. So the holder can accept anything that works. It scores like any other,
   nothing is recorded about which pair accepted what, and the debrief question — "what else did
   you find?" — is a spoken one. */
function wpAlsoWorks(){
  const seat=wpMySeat();
  if(!seat || seat.r!==0) return;
  if(!wpRoundIsRunning(WPSTU.meta)) return;
  WPSTU.extra=(WPSTU.extra||0)+1;
  WPSTU.hits++;
  const btn=document.getElementById("wp-also-btn");
  if(btn){ btn.classList.add("tq-flash"); setTimeout(()=>btn.classList.remove("tq-flash"), 200); }
  wpFlushScore(false);
  wpRenderHolder();
}

/* Hand one over. The holder can read the whole list — so this is not "show it to me", it is "I am
   giving them this one", and the point of pressing it rather than just reading a word out is that
   the app then knows not to score it and not to count the card as cleared. The escape hatch for a
   stuck pair, recorded honestly. */
function wpRevealOne(){
  const seat=wpMySeat();
  if(!seat || seat.r!==0) return;
  const card=wpMyCard();
  const n=wpPartners(card).length;
  for(let i=0;i<n;i++){
    if(WPSTU.found.indexOf(i)<0 && WPSTU.revealed.indexOf(i)<0){
      WPSTU.revealed.push(i);
      wpRenderHolder();
      return;
    }
  }
}

function wpNextCard(){
  const seat=wpMySeat();
  if(!seat || seat.r!==0) return;
  WPSTU.pos++;
  wpResetCard();
  /* Forced, and not because the score moved — it did not. Moving on IS the event the other phone
     is waiting for, and the throttle would hold it back two seconds on a card that has already
     changed in front of them. */
  wpFlushScore(true);
  wpRenderHolder();
}

function wpFlushScore(force){
  const seat=wpMySeat();
  if(!seat) return;
  /* Only the holder writes. The speakers' phones record nothing at all, so no student ever writes
     a number about another student — the same guard both other games use. */
  if(seat.r!==0) return;
  const mine = { hits:WPSTU.hits, pos:WPSTU.pos, round:(WPSTU.meta&&WPSTU.meta.round)||1 };
  const now=Date.now();
  if(!force && (now - WPSTU.lastWrite) < WP_WRITE_MS){
    if(WPSTU.pendingWrite) return;
    WPSTU.pendingWrite=setTimeout(()=>{ WPSTU.pendingWrite=null; wpFlushScore(true); },
                                  WP_WRITE_MS - (now - WPSTU.lastWrite));
    return;
  }
  if(WPSTU.pendingWrite){ clearTimeout(WPSTU.pendingWrite); WPSTU.pendingWrite=null; }
  WPSTU.lastWrite=now;
  Backend.saveProgress(WPSTU.runId, STUDENT.id, STUDENT.surname, STUDENT.firstName, mine)
    .catch(e=>{
      const w=document.getElementById("wp-card-warning");
      if(w){ w.style.display="block";
             w.textContent=t("wp.score_not_saved",
               "Your count is not reaching your teacher’s screen ({reason}). Keep playing and tell them the number.",
               { reason:(e&&e.message)||t("wp.unknown_reason", "no reason given") }); }
    });
}

function wpStudentEnd(){
  if(WPSTU.unsub){ WPSTU.unsub(); WPSTU.unsub=null; }
  if(WPSTU.tick){ clearInterval(WPSTU.tick); WPSTU.tick=null; }
  if(WPSTU.pendingWrite){ clearTimeout(WPSTU.pendingWrite); WPSTU.pendingWrite=null; }
  wpReleaseAwake();
  /* Their own result, built on their own phone out of the meta they already had. */
  renderStudentScores(WPSTU.meta, STUDENT.id, (WPSTU.meta&&WPSTU.meta.name) || t("wp.word_partners", "Word Partners"));
}

document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState==="visible" && WPSTU.runId && !WPSTU.wakeLock) wpKeepAwake();
});

async function wpRejoin(summary, run){
  WP = { sessionCode: run.code || summary.code, runId: summary.runId,
         cards: run.questions||[], name: (run.meta&&run.meta.title)||t("wp.word_partners", "Word Partners"),
         sets:[], chosen:[], areaCards:[], areaName:"", packLang:(run.meta&&run.meta.lang)||"en",
         participants:[], unsub:null, meta: run.meta, tick:null, projecting:false };
  wpShowLive();
  wpWatchParticipants();
}

/* ---------- the contract ---------- */
registerActivity("partners", {
  join: wpStudentStart,
  teacher: wpCreateSession,
  score: null,          // the count is a pair's, lives for one round, and is never marked
  finish: wpEnd,
  rejoin: wpRejoin,
  anonymous: meta => runIsAnonymous(meta),   // no name is asked for, and none is stored

  label: "Word Partners",
  keeps: false          // nothing is archived: the records name students and hold no marks
});
