/* ============================================================================
   Classroom Exam App — core/rounds.js
   Part of index.html's script, split out in v3.11. Loaded as a plain script in
   the order set by index.html; every file shares one global scope, so nothing
   is imported or exported.
   ============================================================================ */

/* A timed round played in pairs, and the score it leaves behind.

   Describe It had all of this to itself until v3.11. Twenty Questions needs the same shape — the
   class starts together, a clock runs, each pair records a count, the counts add up across rounds
   and partner swaps — and rule 2 says a module may not call another module. So it moves here.

   What is deliberately NOT here: what a pair is doing during the round. That is the game. This
   file knows that a round has a start, a length and an end, that a pair has a count, and that a
   student has a total. It has never heard of a forbidden word or a yes/no question, and it should
   not learn.

   Every function takes the round length rather than reading a constant, because the two games
   want different menus: Describe It is 30/60/90 seconds, Twenty Questions is minutes. Each module
   validates its own choice against its own list and passes the number in. */


/* ---------- the clock ----------

   Every device adds the offset Firebase publishes at `.info/serverTimeOffset` before comparing,
   which is what `Backend.serverNow()` is for. Phone clocks in a classroom are routinely a minute
   apart: until v3.8.1 each device subtracted the teacher's start time from its own clock, so the
   teacher saw 40 seconds left while a student saw 12 and neither was wrong about its own
   arithmetic. Tests pass `now` explicitly. */
function roundSecondsLeft(meta, secs, now){
  const started=(meta && meta.roundStartedAt) || 0;
  if(!started) return secs;
  const at = (now === undefined || now === null)
    ? ((typeof Backend !== "undefined" && Backend.serverNow) ? Backend.serverNow() : Date.now())
    : now;
  return Math.max(0, Math.ceil(secs - ((at - started) / 1000)));
}

function roundIsRunning(meta, secs){
  return !!(meta && meta.status==="active" && meta.roundStartedAt && roundSecondsLeft(meta, secs) > 0);
}

/* The four states a card can be in, named once.

   This exists because of the v3.10 freeze. The card renderer drew the clock, the clock routine
   noticed the round had ended and called the renderer back, and the two went round two thousand
   frames deep until the browser gave up — leaving a student stuck on whatever was on screen. The
   cure was to separate "what state am I in" from "draw it": a tick compares the phase it last
   drew against this one, and only a CHANGE is worth a redraw. Nothing in here may draw. */
function roundPhase(meta, secs){
  if(!meta || meta.status!=="active") return "off";
  if(!meta.roundStartedAt) return "ready";
  return roundIsRunning(meta, secs) ? "running" : "over";
}

/* A length the teacher can actually have chosen, or the default. Validated on the way OUT rather
   than trusted from the record: a hand-edited run carrying roundSeconds:45 would otherwise run a
   clock no menu offers and show the teacher a select with nothing selected. */
function pickRoundLength(meta, allowed, dflt){
  const n=parseInt((meta||{}).roundSeconds,10);
  return (allowed||[]).indexOf(n)>=0 ? n : dflt;
}

/* A length as a person would say it. 90 is "90 seconds"; 300 is "5 minutes", not "300 seconds". */
function roundLengthLabel(secs){
  const n=Number(secs)||0;
  if(n>=60 && n%60===0){
    const m=n/60;
    return t("rounds.n_minutes", "{n} {minutes}", { n:m, minutes: plural(m, t("rounds.minute", "minute"), t("rounds.minutes", "minutes")) });
  }
  return t("rounds.n_seconds", "{n} seconds", { n:n });
}


/* ---------- the score ----------

   A pair's count is whatever the student in seat 0 recorded. Only that seat writes one, which is
   also what keeps a student from ever recording a number against somebody else — the standing
   rule that students do not score their peers. */
function pairStandings(participants, pairs){
  const byPair={};
  (participants||[]).forEach(p=>{
    const seat=(pairs||{})[p.studentId];
    if(!seat) return;
    const g=seat.g;
    if(!byPair[g]) byPair[g]={ g:g, hits:0, names:[], ids:[], speakers:[], lead:"" };
    byPair[g].names.push(seat.n || displayName(p.surname, p.firstName));
    byPair[g].ids.push(p.studentId);
    if(seat.r!==0) byPair[g].speakers.push(p.studentId);
    if(seat.r===0){
      byPair[g].lead = seat.n || displayName(p.surname, p.firstName);
      byPair[g].hits = Number((p.progress && p.progress.hits) || 0);
    }
  });
  const list=Object.keys(byPair).map(k=>byPair[k]);
  list.sort((a,b)=> b.hits-a.hits || a.g-b.g);
  return list;
}

/* The running total, per STUDENT rather than per pair.

   A pair is not a stable thing across a lesson — Swap roles keeps the two together, New pairs
   does not — so a cumulative score has to belong to a person.

   `credit` decides WHOSE it is, because the seat that produces language is not the same seat in
   every game:

     "speakers"  everyone in the pair except seat 0. In Word Partners and Twenty Questions seat 0
                 holds the list or the answer and marks; the others are the ones producing English.
                 The count is theirs alone, and the marker earns on the swap.
     "both"      the whole pair, which is what Describe It does: there seat 0 IS the describer, so
                 the producing seat is already the one the count is recorded against.

   Seat 0 still records the number either way — that is what keeps a student from ever writing a
   score against a peer. The teacher's browser is what moves it onto the right name, because a
   student's phone may read only its own record and so could never add up anybody else's. */
function bankPairScores(totals, participants, pairs, credit){
  const out=Object.assign({}, totals||{});
  pairStandings(participants, pairs).forEach(g=>{
    const earners = credit==="speakers" ? (g.speakers||[]) : (g.ids||[]);
    earners.forEach(id=>{ out[id]=(Number(out[id])||0)+Number(g.hits||0); });
  });
  return out;
}

/* The round's count per pair, for relaying to the seat that earned it.

   The speaker's phone records nothing — every tap happens on the other one — so without this the
   student the score belongs to is the one student who cannot see it. It rides along with the
   banking write rather than being pushed live, so the number reaches them at the bell and not
   during the round, where it would be one more thing to look at instead of their partner. */
function pairRoundHits(participants, pairs){
  const out={};
  pairStandings(participants, pairs).forEach(g=>{ out[g.g]=Number(g.hits||0); });
  return out;
}

/* Only the seats that did not do the marking ever ask this — the marker has the number on their
   own phone already. So there is no own-count branch here, unlike seatPosition, where the holder
   genuinely is the one who knows. */
function seatRoundHits(meta, seat){
  if(!seat) return 0;
  const relayed=metaMap(meta, "rhits");
  return Number(relayed[seat.g])||0;
}

/* Everyone who has played, best first, with the name they joined under. The name written into the
   seat wins, exactly as it does in pairStandings: the two lists sit one above the other on the
   same screen, so a student named one way in the round and another way in the total reads as two
   different people. */
function roundLeaderboard(totals, participants, pairs){
  const named={};
  (participants||[]).forEach(p=>{ named[p.studentId]=displayName(p.surname,p.firstName); });
  Object.keys(metaMap({pairs:pairs},"pairs")).forEach(id=>{
    const seatName=pairs[id]&&pairs[id].n;
    named[id]=seatName || named[id] || "?";
  });
  const rows=Object.keys(named).map(id=>({ id:id, name:named[id], total:Number((totals||{})[id])||0 }));
  rows.sort((a,b)=> b.total-a.total || a.name.localeCompare(b.name));
  return rows;
}

/* Three seconds after the bell, not at it: a pair's last taps are still in flight when the clock
   hits zero, and banking on the stroke loses them. */
const ROUND_BANK_DELAY_MS = 3000;

/* Is this round finished, settled, and not already counted?

   The caller's tick runs twice a second, so without the bankedRound guard a thirty-second gap
   between rounds would add every score sixty times. There is deliberately no separate "is it
   still running?" check: a round that is running has not reached its bell, so `overFor` is
   negative and the delay below already turns it away. A second check that can never be the one to
   fire is a line the tests cannot hold to account. */
function roundIsDueToBank(meta, secs, now){
  if(!meta || !meta.round || !meta.roundStartedAt) return false;
  if((meta.bankedRound||0) >= meta.round) return false;
  const at = (now === undefined || now === null)
    ? ((typeof Backend !== "undefined" && Backend.serverNow) ? Backend.serverNow() : Date.now())
    : now;
  return (at - (meta.roundStartedAt + secs*1000)) >= ROUND_BANK_DELAY_MS;
}


/* ---------- sets of cards ----------

   A pack is an area; the items inside it carry a `theme`, which the screens call a set, and a
   lesson plays one to three of them. Both games store their packs the same way and both need the
   same three questions answered — which sets are in here, which items are in this set, and which
   card comes next — so the answers live here rather than twice.

   `cardAt` takes an order rather than reading one, because the order is per pair and per round:
   two pairs meeting the same card at the same moment can hear each other. */
function setsIn(items){
  const seen=[];
  (items||[]).forEach(it=>{
    const th=String((it && it.theme) || "").trim();
    if(th && seen.indexOf(th)<0) seen.push(th);
  });
  return seen;
}

function itemsInSet(items, set){
  if(!set) return (items||[]).slice();
  return (items||[]).filter(it=>String((it&&it.theme)||"").trim()===set);
}

function cardAt(items, order, pos){
  const list=items||[];
  if(!list.length) return null;
  const idx=(order&&order.length) ? order[pos % order.length] : (pos % list.length);
  return list[idx] || null;
}

/* What the teacher chose, as a line of text. Falls back to the single `theme` a run started
   before v3.9 carries, which is the same reason runKind() exists: an old run is not rewritten. */
function chosenSetNames(meta, wholeAreaLabel){
  const sets=(meta && meta.sets) || null;
  if(Array.isArray(sets) && sets.length) return sets.map(x=>x.label || x.set || x.area).join(" + ");
  return (meta && meta.theme) || wholeAreaLabel;
}


/* ---------- which card a pair is on (v3.14) ----------

   Reported from a lesson: in Word Partners the speaker's screen stayed on the first word all round.
   The same defect was in Twenty Questions, where the asker's category badge never moved — invisible
   only because most sets are a single category.

   The cause is the shape of the security model rather than a slip. Only seat 0 advances the card,
   and it advances a number held on that phone. The other phone in the pair cannot read it: a
   student may read their own participant record and nobody else's, which is the rule that stops
   anyone scoring a classmate and is not moving.

   So the position goes the long way round. Seat 0 writes it into its own record; the teacher's
   browser is already subscribed to every record and is the only party allowed to write meta, so it
   copies the positions into meta; the other phones are already subscribed to meta and read it from
   there. Two hops, both on subscriptions that already existed, and no rules change.

   The cost, stated plainly: the teacher's browser is now load-bearing for the speaker's screen. If
   the teacher closes the tab mid-round, speakers stop advancing — they were already relying on it
   to bank the scores, so this widens an existing dependency rather than creating one. */
function pairPositions(participants, pairs){
  const out={};
  (participants||[]).forEach(p=>{
    const seat=(pairs||{})[p.studentId];
    if(!seat || seat.r!==0) return;
    out[seat.g]=Number((p.progress && p.progress.pos) || 0);
  });
  return out;
}

/* Cheap enough to run twice a second, and it has to be: relaying on every tick regardless would be
   a database write per beat per room. */
function positionsDiffer(a, b){
  const A=a||{}, B=b||{};
  const keys=Object.keys(A).concat(Object.keys(B));
  for(let i=0;i<keys.length;i++){
    if(Number(A[keys[i]]||0) !== Number(B[keys[i]]||0)) return true;
  }
  return false;
}

/* Seat 0 draws from its own number, which moves the instant it taps. Everyone else draws from the
   relayed one, which is a second or so behind — fine for a card that lasts a minute, and far better
   than a card that never changes at all. */
function seatPosition(meta, seat, ownPos){
  if(!seat) return 0;
  if(seat.r===0) return Number(ownPos)||0;
  const relayed=metaMap(meta, "pos");
  return Number(relayed[seat.g])||0;
}


/* ---------- the final leaderboard (v3.15) ----------

   One screen, shared by every game that keeps a running total, shown when the teacher ends the
   game and BEFORE the run is deleted. Nothing is kept: it is the last thing anybody sees, not a
   record. Close it and the run goes exactly as it did before.

   How much of it the class sees is the whole design. The teacher's screen lists everybody, because
   the useful information is the distribution — who scored nothing all session is the thing worth
   noticing. The projector shows the top few only: a class of 24 seeing exactly where they came
   teaches the bottom third where they came, and they stop trying. Celebratory at the front,
   diagnostic in your hand. */
const FINAL_PODIUM = 5;

function finalStandings(totals, participants, pairs){
  /* Two students can draw the same pseudonym; on a list they are told apart with a numeral. In a
     pair it never matters, because there is only one other person to address. */
  return dedupeNames(roundLeaderboard(totals, participants, pairs),
                     r => r.name,
                     (r, n) => Object.assign({}, r, { name:n }));
}

/* Ranks, with ties sharing a place: two students on nine are both second, and the next is fourth.
   The alternative reads as a bug to anybody who has watched a sport. */
function rankStandings(rows){
  let place=0, seen=0, last=null;
  return (rows||[]).map(r=>{
    seen++;
    if(last===null || r.total!==last){ place=seen; last=r.total; }
    return Object.assign({}, r, { rank:place });
  });
}

function renderFinalLeaderboard(rows, opts){
  const o=opts||{};
  const ranked=rankStandings(rows);
  const ttl=document.getElementById("final-title");
  if(ttl) ttl.textContent=o.title||"";
  const sub=document.getElementById("final-sub");
  if(sub) sub.textContent = o.anon
    ? t("final.played_anonymously", "Played anonymously — these are the names the app gave out, and nobody can look up who is who.")
    : t("final.nothing_kept", "Nothing is marked and nothing is kept. Close this and the game is gone.");

  const list=document.getElementById("final-list");
  if(list){
    list.innerHTML = ranked.length
      ? ranked.map(r=>'<div class="di-score-row'+(r.rank===1&&r.total>0?" di-score-top":"")+'">'+
          '<span class="di-pair-no">'+r.rank+'</span>'+
          '<span class="di-score-who">'+escapeHtml(r.name)+'</span>'+
          '<span class="di-score-n mono">'+r.total+'</span></div>').join("")
      : '<p class="sub">'+t("final.nobody_scored", "Nobody scored — there is nothing to show.")+'</p>';
  }
  const count=document.getElementById("final-count");
  if(count) count.textContent = t("final.n_players", "{n} {players}",
    { n:ranked.length, players: plural(ranked.length, t("final.player", "player"), t("final.players", "players")) });
  return ranked;
}

/* The projector: the top few and nothing else. */
function renderFinalProjection(rows, title){
  const ranked=rankStandings(rows).filter(r=>r.total>0).slice(0, FINAL_PODIUM);
  const ttl=document.getElementById("final-proj-title");
  if(ttl) ttl.textContent=title||"";
  const box=document.getElementById("final-proj-list");
  if(box) box.innerHTML = ranked.length
    ? ranked.map(r=>'<div class="final-proj-row"><span class="final-proj-rank">'+r.rank+'</span> '+
      escapeHtml(r.name)+' <b class="mono">'+r.total+'</b></div>').join("")
    : '<p class="rp-proj-hint">'+t("final.nobody_scored", "Nobody scored — there is nothing to show.")+'</p>';
  return ranked;
}


/* The last round, banked into meta rather than only into the teacher's screen.

   `roundIsDueToBank` waits for the bell and a settling delay, which is right while a game is
   running and wrong at the end of one: a teacher who ends mid-round would otherwise lose the round
   the class had just played. It has to go into META and not just into a local variable, because
   the students now read their own result off the same record — a total the teacher alone holds is
   a total half the room cannot see. */
function finalMetaPatch(meta, participants, credit){
  const m=meta||{};
  const patch={ status:"ended" };
  if(m.round && m.roundStartedAt && (m.bankedRound||0) < m.round){
    patch.totals=bankPairScores(metaMap(m,"totals"), participants||[], metaMap(m,"pairs"), credit);
    patch.rhits=pairRoundHits(participants||[], metaMap(m,"pairs"));
    patch.bankedRound=m.round;
  }
  return patch;
}

/* ---------- what the student sees ----------

   A student's phone may read the run's meta but not other students' records, which is exactly
   enough: the totals and the seat names both live in meta, so the whole board can be built on
   their own device with nothing relayed and nothing new exposed.

   They get their own line and the same top five that goes on the projector. The full list stays
   with the teacher: a glance at a board on the wall and a ranked list of twenty-five named
   classmates sitting on twenty-five phones are not the same thing. */
function myStanding(rows, myId){
  const ranked=rankStandings(rows);
  let mine=null;
  ranked.forEach(r=>{ if(r.id===myId) mine=r; });
  return mine ? { rank:mine.rank, total:mine.total, of:ranked.length } : null;
}

function renderStudentScores(meta, myId, title){
  const rows=finalStandings(metaMap(meta,"totals"), [], metaMap(meta,"pairs"));
  const mine=myStanding(rows, myId);

  const game=document.getElementById("stu-final-game");
  if(game) game.textContent=title||"";

  const box=document.getElementById("stu-final-mine");
  if(box) box.style.display = mine ? "block" : "none";
  if(mine){
    const n=document.getElementById("stu-final-score");
    if(n) n.textContent=String(mine.total);
    const line=document.getElementById("stu-final-rank");
    if(line) line.textContent=t("stu_final.you_finished", "You finished {rank} of {of}",
      { rank: ordinal(mine.rank), of: mine.of });
  }

  const top=rankStandings(rows).filter(r=>r.total>0).slice(0, FINAL_PODIUM);
  const board=document.getElementById("stu-final-board");
  if(board) board.style.display = top.length ? "block" : "none";
  const list=document.getElementById("stu-final-list");
  /* The teacher's row style, not the projector's: the projection is sized for a wall at the back
     of a room, and those rows wrap a name like "MOREAU, Léa" across three lines on a phone. */
  if(list) list.innerHTML = top.map(r=>
    '<div class="'+(r.id===myId ? "di-score-row di-score-me" : "di-score-row")+'">'+
    '<span class="di-pair-no">'+r.rank+'</span>'+
    '<span class="di-score-who">'+escapeHtml(r.name)+'</span>'+
    '<span class="di-score-n mono">'+r.total+'</span></div>').join("");

  showScreen("screen-student-scores");
  return { mine:mine, top:top };
}

/* 1st, 2nd, 3rd — and in French, 1er, 2e. Left to the strings file rather than built from the
   number here, because the rule is not the same in the two languages. */
function ordinal(n){
  const num=Number(n)||0;
  const teen = num%100>=11 && num%100<=13;
  const last = teen ? 0 : num%10;
  if(last===1) return t("ordinal.st", "{n}st", { n:num });
  if(last===2) return t("ordinal.nd", "{n}nd", { n:num });
  if(last===3) return t("ordinal.rd", "{n}rd", { n:num });
  return t("ordinal.th", "{n}th", { n:num });
}

/* What the End button does now: bank whatever the last round earned, show the standings, and hold
   the run open until the teacher closes the screen. The delete is the same delete it always was —
   it just happens after they have looked, rather than instead of. */
let FINAL = { runId:null, meta:null, participants:[], rows:[], projecting:false, onFinish:null };

async function showFinalScores(opts){
  FINAL = { runId:opts.runId, meta:opts.meta, participants:opts.participants||[],
            rows:[], projecting:false, onFinish:opts.onFinish };
  /* Bank the round in progress first, whatever the clock says. `roundIsDueToBank` waits for the
     bell and a settling delay, which is right while a game is running and wrong at the end of one:
     a teacher who ends the game mid-round would otherwise see a leaderboard missing the round the
     class had just played. */
  const meta=opts.meta||{};
  FINAL.rows=finalStandings(metaMap(meta,"totals"), FINAL.participants, metaMap(meta,"pairs"));
  renderFinalLeaderboard(FINAL.rows, { title:opts.title, anon:runIsAnonymous(meta) });
  showScreen("screen-final-scores");
}

function toggleFinalProjection(){
  FINAL.projecting=!FINAL.projecting;
  const el=document.getElementById("final-projection");
  if(el) el.style.display = FINAL.projecting ? "block" : "none";
  if(FINAL.projecting) renderFinalProjection(FINAL.rows, document.getElementById("final-title").textContent);
}

async function finishAfterScores(){
  const done=FINAL.onFinish;
  FINAL.projecting=false;
  const el=document.getElementById("final-projection"); if(el) el.style.display="none";
  FINAL = { runId:null, meta:null, participants:[], rows:[], projecting:false, onFinish:null };
  if(done) await done();
}
