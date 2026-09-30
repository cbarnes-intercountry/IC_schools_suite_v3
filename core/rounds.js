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
    if(!byPair[g]) byPair[g]={ g:g, hits:0, names:[], ids:[], lead:"" };
    byPair[g].names.push(seat.n || displayName(p.surname, p.firstName));
    byPair[g].ids.push(p.studentId);
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
   does not — so a cumulative score has to belong to a person. Both members of a pair get the
   round's score: the one who was not leading did half the work, and scoring only the lead would
   make every other round feel like time off.

   Kept in the run's meta and written by the teacher, because a student's phone may read only its
   own record and so could never add up anybody else's. */
function bankPairScores(totals, participants, pairs){
  const out=Object.assign({}, totals||{});
  pairStandings(participants, pairs).forEach(g=>{
    (g.ids||[]).forEach(id=>{ out[id]=(Number(out[id])||0)+Number(g.hits||0); });
  });
  return out;
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
