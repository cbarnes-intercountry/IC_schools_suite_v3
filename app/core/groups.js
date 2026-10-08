/* ============================================================================
   Classroom Exam App — core/groups.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Teams: allocation, top-up, standings. */

/* ============ TEAM MODE ============
   Teams are decided by the teacher's browser in the waiting room and written into the session
   meta as a plain map of studentId → team name. Nothing else changes: students answer on their
   own phones exactly as before, and the pooling happens at the end, on the results.

   Keeping the allocation in meta (rather than on each participant record) means one write, and
   it survives the teacher closing the app — a rejoined session still knows who was on which
   team. The number of teams can be changed freely while students are still joining; it locks
   when the test starts, because re-drawing teams over answers already given would change scores
   retrospectively. Late joiners go to the smallest team so sizes stay level. */
const TEAM_NAMES = ["Red","Blue","Green","Amber","Purple","Teal","Orange","Pink","Silver","Bronze"];

const MAX_TEAMS = TEAM_NAMES.length;

let TEAM_DRAFT = { count:2, map:{} };
   // waiting-room state, before it goes into meta

function teamsEnabled(){ return !!(TEACHER.settings && TEACHER.settings.teams); }

function teamNameAt(i){ return TEAM_NAMES[i % TEAM_NAMES.length]; }


function onTeamsToggle(){
  const on=document.getElementById("opt-teams").checked;
  const box=document.getElementById("dash-teams-box");
  if(box) box.style.display = on ? "block" : "none";
}


/* Deal the joined students round-robin into `count` teams, in random order. Round-robin rather
   than random-per-student because random assignment routinely produces a team of one and a team
   of six in a class of fifteen, which then makes the averages look unfair even though they
   aren't. */
function allocateTeams(participants, count){
  const n=Math.max(2, Math.min(MAX_TEAMS, count|0));
  const ids=shuffle(participants.map(p=>p.studentId));
  const map={};
  ids.forEach((id,i)=>{ map[id]=teamNameAt(i%n); });
  return map;
}


// Anyone who joined since the last draw is slotted into whichever team is currently smallest.
function topUpTeams(map, participants, count){
  const n=Math.max(2, Math.min(MAX_TEAMS, count|0));
  const sizes={}; for(let i=0;i<n;i++) sizes[teamNameAt(i)]=0;
  Object.keys(map).forEach(id=>{ if(sizes[map[id]]!==undefined) sizes[map[id]]++; });
  participants.forEach(p=>{
    if(map[p.studentId] && sizes[map[p.studentId]]!==undefined) return;
    let smallest=teamNameAt(0);
    for(let i=1;i<n;i++){ const team=teamNameAt(i); if(sizes[team]<sizes[smallest]) smallest=team; }
    map[p.studentId]=smallest; sizes[smallest]++;
  });
  // Drop anyone who left the lobby, and anyone stranded on a team that no longer exists.
  const present=new Set(participants.map(p=>p.studentId));
  Object.keys(map).forEach(id=>{ if(!present.has(id) || sizes[map[id]]===undefined) delete map[id]; });
  return map;
}


function nudgeTeamCount(delta){
  const max=Math.max(2, Math.min(MAX_TEAMS, DASH_PARTICIPANTS.length||MAX_TEAMS));
  TEAM_DRAFT.count=Math.max(2, Math.min(max, (TEAM_DRAFT.count||2)+delta));
  TEAM_DRAFT.map=allocateTeams(DASH_PARTICIPANTS, TEAM_DRAFT.count);
  renderTeamPreview();
}

function reshuffleTeams(){
  TEAM_DRAFT.map=allocateTeams(DASH_PARTICIPANTS, TEAM_DRAFT.count);
  renderTeamPreview();
}


function renderTeamPreview(){
  const box=document.getElementById("dash-teams-box");
  if(!box || box.style.display==="none") return;
  document.getElementById("dash-team-count").textContent=TEAM_DRAFT.count;
  const note=document.getElementById("dash-team-note");
  const n=DASH_PARTICIPANTS.length;
  note.textContent = n===0
    ? t("groups.teams_drawn_when_students_join", "Teams are drawn when students join. Change the number any time before you start.")
    : t("groups.team_draft_summary", "{count} {students} in {teams} teams \u2014 about {each} each. Locked once the test starts.",
        { count:n, students: plural(n, t("groups.student", "student"), t("groups.students", "students")),
          teams: TEAM_DRAFT.count, each: Math.ceil(n/TEAM_DRAFT.count) });
  const wrap=document.getElementById("dash-team-preview");
  wrap.innerHTML="";
  const byTeam={};
  DASH_PARTICIPANTS.forEach(p=>{
    const team=TEAM_DRAFT.map[p.studentId]; if(!team) return;
    (byTeam[team]=byTeam[team]||[]).push(displayName(p.surname,p.firstName));
  });
  Object.keys(byTeam).sort().forEach(team=>{
    const d=document.createElement("div");
    d.style.cssText="margin:6px 0;font-size:.9rem;";
    d.innerHTML="<b>"+escapeHtml(team)+"</b> <span class='sub'>("+byTeam[team].length+")</span> — "+escapeHtml(byTeam[team].join(", "));
    wrap.appendChild(d);
  });
}


/* The team standings, drawn once at the end. Deliberately not shown live: a running total
   turns the test into a race and the last few minutes into a scramble, and the teams that fall
   behind early stop trying. Each team expands to show who was in it and what they scored. */
function renderTeamLeaderboard(){
  const box=document.getElementById("recap-teams");
  const list=document.getElementById("recap-team-list");
  if(!box || !list) return;
  const standings=computeTeamStandings(RECAP_ROWS);
  if(!standings.length){ box.style.display="none"; return; }
  box.style.display="block";
  list.innerHTML="";
  const medal=["\uD83E\uDD47","\uD83E\uDD48","\uD83E\uDD49"];
  standings.forEach(g=>{
    const det=document.createElement("details");
    det.style.cssText="border:2px solid var(--ink);border-radius:12px;margin-bottom:8px;padding:10px 14px;"+
      (g.rank===1?"background:var(--success-soft);":"");
    const sum=document.createElement("summary");
    sum.style.cssText="cursor:pointer;display:flex;align-items:center;gap:12px;font-weight:700;";
    sum.innerHTML='<span style="min-width:2.2em;">'+(medal[g.rank-1]||g.rank)+'</span>'+
      '<span style="flex:1;">'+escapeHtml(g.team)+'</span>'+
      '<span class="mono" style="font-size:1.25rem;">'+g.average.toFixed(1)+'%</span>';
    det.appendChild(sum);
    const body=document.createElement("div");
    body.style.cssText="margin-top:10px;font-size:.92rem;";
    const members=g.members.slice().sort((a,b)=>b.percentage-a.percentage);
    body.innerHTML=members.map(m=>{
      const idle=(m.answers||[]).length===0;
      return '<div style="display:flex;justify-content:space-between;gap:10px;padding:3px 0;'+(idle?'opacity:.55;':'')+'">'+
        '<span>'+escapeHtml(displayName(m.surname,m.firstName))+(idle?' <small class="hint">'+t("groups.counted_no_answers", '(not counted — no answers)')+'</small>':'')+'</span>'+
        '<span class="mono">'+m.score+'/'+m.totalPossible+' · '+Math.round(m.percentage)+'%</span></div>';
    }).join("");
    if(g.idle>0){
      body.innerHTML+='<p class="sub" style="margin:8px 0 0;">'+escapeHtml(
        t("groups.idle_members_left_out", "{idle} {members} left out of the average \u2014 the team is scored on the {scoring} who answered.",
          { idle:g.idle, members: plural(g.idle, t("groups.member", "member"), t("groups.members", "members")), scoring:g.scoring })
      )+'</p>';
    }
    det.appendChild(body);
    list.appendChild(det);
  });
}


/* Team standings, shared by the end-of-test leaderboard and the CSV so the two can never
   disagree. A team's score is the AVERAGE of its members' percentages, not the sum of their
   points: teams are rarely the same size, and a team of four would otherwise beat a team of
   three on headcount alone. Members who answered nothing are counted in the roster but left
   out of the average — a student who joins and does nothing would otherwise sink their team,
   which turns a group task into a lottery about who you were sitting next to. */
function computeTeamStandings(results){
  const byTeam={};
  results.forEach(r=>{
    const team=r.team; if(!team) return;
    if(!byTeam[team]) byTeam[team]={ team:team, members:[], scoring:0, pctSum:0, points:0, possible:0 };
    const g=byTeam[team];
    g.members.push(r);
    g.points+=Number(r.score)||0;
    g.possible+=Number(r.totalPossible)||0;
    if((r.answers||[]).length>0){ g.scoring++; g.pctSum+=Number(r.percentage)||0; }
  });
  const list=Object.keys(byTeam).map(k=>{
    const g=byTeam[k];
    g.average = g.scoring>0 ? (g.pctSum/g.scoring) : 0;
    g.size = g.members.length;
    g.idle = g.size - g.scoring;
    return g;
  });
  // Highest average first; a team with nobody scoring sorts last whatever its size.
  list.sort((a,b)=> b.average-a.average || b.scoring-a.scoring || a.team.localeCompare(b.team));
  list.forEach((g,i)=>{ g.rank=i+1; });
  return list;
}


// Appends a team summary beneath the student table. Writes nothing for an individual run.
function appendTeamBlock(rows, results, nQ){
  const standings=computeTeamStandings(results);
  if(!standings.length) return;
  const pad=new Array(Math.max(0,nQ)).fill("");
  rows.push([]);
  rows.push(["Team results"]);
  rows.push(["Rank","Team","Members","Counted","TeamAverage%","PointsTotal","PointsPossible"]);
  standings.forEach(g=>{
    rows.push([ g.rank, g.team, g.size, g.scoring, g.average.toFixed(1), g.points, g.possible ]);
  });
  rows.push([]);
  rows.push([t("groups.counted_note", "Counted = members who answered at least one question. The team average ignores the rest.")].concat(pad.slice(0,0)));
}


/* Tell the student which team they're on, and who else is on it. Shown on the waiting screen
   just before the test opens, and again on their results screen — in between, the questions
   have their full attention and a team badge would only be clutter. */
function studentTeamName(meta){
  const map=(meta&&meta.teamMap)||{};
  return map[STUDENT.id] || "";
}

function showStudentTeam(meta){
  const box=document.getElementById("wait-team");
  if(!box) return;
  const team=studentTeamName(meta);
  if(!team){ box.style.display="none"; return; }
  box.style.display="block";
  box.innerHTML='<div style="padding:12px;border:2px solid var(--ink);border-radius:12px;">'+
    '<div class="sub" style="margin:0 0 4px;">'+t("groups.team", 'Your team')+'</div>'+
    '<div style="font-size:1.6rem;font-weight:800;">'+escapeHtml(team)+'</div>'+
    '<small class="hint">'+t("groups.answer_own_phone_team_u2019s_score", 'You answer on your own phone. Your team\u2019s score is the average of everyone in it.')+'</small></div>';
}


/* ============ PAIRS ============
   Two people, different information. Role play deals 2–3 parts from a scenario; Describe It
   deals exactly two, and the odd student out joins a pair as a second guesser rather than being
   given nothing to do.

   Kept here rather than in either module because both need it and modules never reach into each
   other. Pure: no DOM, no database, so the test suite can run it directly.

   Shape matches the role play's: studentId -> { g, r, n }. r=0 describes, r=1 guesses. */
function pairUp(participants, seedShuffle){
  const named={};
  (participants||[]).forEach(p=>{ named[p.studentId]=displayName(p.surname,p.firstName); });
  const ids=(seedShuffle||shuffle)((participants||[]).map(p=>p.studentId));
  const out={};
  const pairs=Math.floor(ids.length/2);
  for(let g=1; g<=pairs; g++){
    const a=ids[(g-1)*2], b=ids[(g-1)*2+1];
    out[a]={ g:g, r:0, n:named[a]||"" };
    out[b]={ g:g, r:1, n:named[b]||"" };
  }
  /* An odd student out becomes pair 1's REFEREE (r=2): they hold the forbidden words and call a
     foul. That is a better job than a second guesser — it is the role the game has when it is
     played properly, and in a pair the guesser can only do it by being shown words that narrow
     what they are trying to guess. The describer count still equals the pair count, which is
     what the scoring is per. */
  if(ids.length % 2 === 1 && pairs >= 1){
    const spare=ids[ids.length-1];
    out[spare]={ g:1, r:2, n:named[spare]||"" };
  }
  return out;
}

/* Who, in this pair, holds the forbidden words and the foul button.

   With three people it is the referee, and the guesser is then told nothing at all — the game as
   it is meant to be played. With two, it falls to the guesser: somebody has to hold the rule or
   the describer is policing themselves, and a describer who marks their own fouls does not mark
   any. The cost is that the guesser sees words that narrow the answer, which is the honest
   trade-off of playing in pairs and is stated on the setup screen. */
function pairRefereeRole(pairs, g){
  return pairMembers(pairs, g).some(m => m.r === 2) ? 2 : 1;
}

/* Swap who describes and who guesses, within the same pair. The second round is where the gain
   is: the guesser has just heard the vocabulary used and now has to produce it. A pair holding a
   third member rotates rather than swaps, so nobody describes twice running. */
function swapPairRoles(pairs){
  const out={};
  const members={};
  Object.keys(pairs||{}).forEach(id=>{ (members[pairs[id].g]=members[pairs[id].g]||[]).push(id); });
  Object.keys(members).forEach(key=>{
    const g=Number(key);
    // Sorted so the rotation is the same order every round, whatever order the keys arrive in.
    const ids=members[key].slice().sort();
    let cur=ids.findIndex(id=>pairs[id].r===0);
    if(cur<0) cur=0;
    /* Everyone moves along one seat: describer -> guesser -> referee -> describer. In a pair
       that is a straight swap; in a three, nobody describes twice running and nobody is stuck
       refereeing all lesson. */
    const hasReferee = ids.length>2;
    ids.forEach((id,k)=>{
      const seat=(k - (cur+1) + ids.length*2) % ids.length;   // 0 = describes next
      out[id]={ g:g, r:(seat===0 ? 0 : (hasReferee && seat===2 ? 2 : 1)), n:pairs[id].n||"" };
    });
  });
  return out;
}

function pairNumbers(pairs){
  const seen={};
  Object.keys(pairs||{}).forEach(id=>{ seen[pairs[id].g]=true; });
  return Object.keys(seen).map(Number).sort((a,b)=>a-b);
}

function pairMembers(pairs, g){
  return Object.keys(pairs||{})
    .filter(id=>pairs[id].g===g)
    .sort((a,b)=>pairs[a].r-pairs[b].r)
    .map(id=>({ studentId:id, r:pairs[id].r, name:pairs[id].n||"?" }));
}

/* Which terms this pair sees, and in what order.

   Computed on each phone from the pair number and the round rather than written into the run:
   the alternative is the teacher's browser writing a different list for every pair on every
   round, which is a dozen writes where none are needed. Deterministic, so the describer and the
   teacher's screen agree about term 4 without either asking the other.

   Neighbouring pairs get different orders, which matters in a room: twelve pairs all shouting
   about "excess" at the same moment is a much easier game than it should be.

   ONE PERMUTATION PER PAIR, FOR THE WHOLE GAME — not one per round. It used to take the round
   number as well, so every round reshuffled the whole pool and the position restarted at zero.
   A pair gets through three or four subjects in a round, so round two routinely dealt them
   subjects they had already solved — and the student now ASKING is the one who held those
   subjects and knows the answers. Measured on the real generator: with a pool of twelve and
   four solved per round, 88% of pairs met a repeat; with a pool of eight, 97%.

   Reported from a lesson: "one pair had the exact same people appear after swapping roles, in
   the same order, making it very easy."

   With one permutation and a position that carries across rounds, a pair cannot meet a subject
   twice until they have been through every one. */
function termOrderFor(count, pairNo){
  const n=Math.max(0, count|0);
  const idx=[]; for(let i=0;i<n;i++) idx.push(i);
  // A small deterministic generator. Not cryptography — it only has to differ per pair.
  let s=(pairNo*7919 + 12345) >>> 0;
  const next=()=>{ s=(s*1664525 + 1013904223)>>>0; return s/4294967296; };
  for(let i=n-1;i>0;i--){ const j=Math.floor(next()*(i+1)); const tmp=idx[i]; idx[i]=idx[j]; idx[j]=tmp; }
  return idx;
}


/* How many roles a role-play scenario may declare, and so how many students can be in one
   group. Three until v3.19, when Chris asked for six.

   Here rather than in modules/roleplay.js because three files need it — the module that
   allocates, the editor that writes scenarios, and the importer that reads them. A constant
   three files share is not a module's private business, which the suite's architecture rule
   says out loud: a module may not reach into another module's declarations. */
const RP_MAX_ROLES = 6;

/* ---------- the lobby roster, with a way to remove somebody (v3.18) ----------

   Reported from a lesson: "Important to be able to delete users from the session. Some students
   were able to connect twice."

   WHY A DOUBLE JOIN HAPPENS, since the remedy depends on it. The identity is the anonymous
   sign-in, falling back to a per-code local id. Within one browser that is stable — a reload or
   a second go at the code writes to the SAME record, which was verified rather than assumed.
   What makes a second record is a second BROWSER: tapping the link in Teams or WhatsApp opens
   an in-app browser with its own storage, and opening it again in Chrome is, as far as the
   database can tell, a different person. A private window does the same.

   The app cannot reliably tell that from two genuine students, and the technique that would
   try — fingerprinting the device — misfires in a room of similar handsets and is the wrong
   thing to do to a class. So the student is asked at the door (see nameIsTaken), and the
   teacher gets a one-tap removal here for whichever record is stale.

   `lastSeen` is what identifies the stale one: a phone that joined and went quiet is almost
   always the abandoned browser. */

function lastSeenLabel(ts){
  const when=Number(ts)||0;
  if(!when) return "";
  const mins=Math.floor((Date.now()-when)/60000);
  if(mins<1) return t("roster.just_now", "just now");
  if(mins===1) return t("roster.a_minute_ago", "1 min ago");
  return t("roster.n_minutes_ago", "{n} min ago", { n:mins });
}

/* One chip per student: the name, how long since their phone said anything, the rejoin claim if
   they made one, and a remove button. `removeFn` is the game's own handler name — the three
   games each own their room, and none of them reaches into another. */
function lobbyRoster(participants, removeFn){
  const rows=(participants||[]).slice().sort(bySurname);
  if(!rows.length) return "";
  /* A COLUMN, not a row of chips. Inline chips of unequal width staggered on a phone, the
     remove buttons overlapped the line above, and a two-word name wrapped inside its own chip.
     One student per line, name left, button right, is also the shape a teacher scans down
     while looking for the one that has gone quiet. */
  return '<div class="roster-list">'+rows.map(p=>{
    const when=lastSeenLabel(p.lastSeen);
    /* The rejoin marker rides on a data attribute rather than a conditional class name: a
       bare " chip-rejoin" in a ternary is a loose string literal, and the hardcoded-text check
       is right to object to those. Styling keys off [data-rejoin="1"]. */
    return '<span class="chip chip-roster" data-rejoin="'+(p.rejoining ? "1" : "0")+'">'+
      '<span class="chip-name">'+escapeHtml(displayName(p.surname,p.firstName))+'</span>'+
      (p.rejoining ? '<span class="chip-flag">'+escapeHtml(t("roster.says_second_phone", "says: 2nd phone"))+'</span>' : "")+
      (when ? '<span class="chip-when">'+escapeHtml(when)+'</span>' : "")+
      '<button class="chip-x" title="'+escapeHtml(t("roster.remove", "Remove"))+'" '+
        'onclick="'+removeFn+'(\''+escapeHtml(String(p.studentId))+'\')">\u00d7</button>'+
    '</span>';
  }).join("")+'</div>';
}

/* Shared by the three games. Refuses once the game is dealt, because a removed student would
   leave their partner with nobody and the pairs map naming somebody who is gone. */
async function removeFromLobby(runId, participants, studentId, meta){
  if(meta && Number(meta.round) > 0){
    alert(t("roster.only_before_start",
      "Students can only be removed before the game is dealt. Removing one now would leave their partner without anybody."));
    return false;
  }
  const who=(participants||[]).filter(p=>p.studentId===studentId)[0];
  const name=who ? displayName(who.surname, who.firstName) : studentId;
  if(!confirm(t("roster.remove_confirm",
    "Remove {name} from the room?\n\nTheir phone will say they were removed and can join again with the code.",
    { name:name }))) return false;
  try{ await Backend.removeParticipant(runId, studentId); }
  catch(e){ alert(t("roster.remove_failed", "Couldn't remove them: ")+((e&&e.message)||e)); return false; }
  return true;
}

/* A student whose record disappears was removed by their teacher.

   Watched rather than polled, and deliberately cautious: it only fires once the record has
   been SEEN at least once, so the listener attaching before the join write lands cannot throw
   a student out of a room they just entered. A read that fails does not call back at all, so a
   dropped connection reads as silence, not as removal.

   Removal is offered in the lobby only, so in practice this lands on a phone that is waiting
   for the game to be dealt. */
function watchForRemoval(runId, studentId, onRemoved){
  let seen=false;
  return Backend.subscribeOwnRecord(runId, studentId, rec=>{
    if(rec){ seen=true; return; }
    if(seen) onRemoved();
  });
}

function showRemovedScreen(){
  showScreen("screen-removed");
}

/* ---------- pseudonyms: removed in v3.17 ----------

   v3.15 gave each student a two-word name ("Blue Falcon") derived from their own id, so a game
   could be run with no name typed and none stored. It is gone, at Chris's decision, because the
   classroom cost outweighed it: a teacher cannot pair up "Blue Falcon" and "Eager Condor" across
   a room of twenty-five without reading both phones.

   It also had a defect worth recording, since the replacement had to avoid it. Two students
   could draw the same pseudonym — about a one-in-nine chance in a class of twenty-five — and the
   collision was resolved only on the final leaderboard, by dedupeNames below. So two phones both
   said "Daring Ferret" while the leaderboard said "Daring Ferret 1" and "Daring Ferret 2". That
   is the mismatch Chris reported.

   Typed first names collide far more often than that: two Maries in a class is ordinary. So the
   replacement resolves the duplicate ONCE, at join, before anything is written, and stores the
   resolved name — see uniqueFirstName in modules/test.js. Every screen then quotes one string.

   The code is in the v3.16 folder if anonymous play is ever wanted back. */

/* The first names already in this room, so a second Marie can be told she is Marie 2 before she
   is written down rather than after. Read from the database rather than from any local list: the
   student joining has never seen the others. A failed read returns nothing, which means the
   duplicate goes unresolved — better than refusing to let somebody join because a read blipped. */
async function existingFirstNames(runId, exceptId){
  try{
    const res=await Backend.listParticipants(runId);
    return ((res&&res.participants)||[])
      /* NOT counting the student's own record. Without this, a student who reloads her phone
         and rejoins finds "Marie" already taken — by herself — and is renamed Marie 2. On the
         next reload "Marie" is free again, so she flips back. Her name oscillated on every
         rejoin, and the teacher's roster flickered with it. Shipped in v3.17, found in v3.18
         by probing what actually makes a second record. */
      .filter(p=>!exceptId || p.studentId !== exceptId)
      .map(p=>String(p.firstName||"").trim()).filter(Boolean);
  }catch(e){ console.warn("could not read the room's names", e); return []; }
}

/* Is this name already in the room, held by somebody else?

   Asked before the duplicate is resolved, because a duplicate has two quite different causes
   and only the student knows which: a second Marie, or the same Marie on a second phone. The
   app cannot tell. It could try to recognise the device — user agent, screen size, timezone —
   but in a room of twenty-five similar handsets that misfires, and covertly fingerprinting
   students to catch a double join is the wrong trade in a classroom tool. So it asks. */
function nameIsTaken(wanted, taken){
  const want=String(wanted||"").trim().toLowerCase();
  if(!want) return false;
  return (taken||[]).some(n=>String(n).trim().toLowerCase()===want);
}

/* "Marie" among two Maries becomes "Marie 2", then "Marie 3". Case-insensitive, because Marie
   and marie are the same person's name to everyone in the room except a computer.

   The first of a name keeps it unadorned: numbering everybody from one would make a class of
   twenty-five unique names read like a car park. */
function uniqueFirstName(wanted, taken){
  const want=String(wanted||"").trim();
  if(!want) return "";
  const used={};
  (taken||[]).forEach(n=>{ used[String(n).trim().toLowerCase()]=true; });
  if(!used[want.toLowerCase()]) return want;
  for(let n=2; n<100; n++){
    const candidate=want+" "+n;
    if(!used[candidate.toLowerCase()]) return candidate;
  }
  return want;
}

/* Where names are listed together, two students who drew the same one are told apart with a
   numeral. Only on the lists: inside a pair, "With Blue Falcon" is never ambiguous, because there
   is only one other person. */
function dedupeNames(rows, nameOf, setName){
  const seen={}, count={};
  (rows||[]).forEach(r=>{ const n=nameOf(r); count[n]=(count[n]||0)+1; });
  return (rows||[]).map(r=>{
    const n=nameOf(r);
    if(count[n]<=1) return r;
    seen[n]=(seen[n]||0)+1;
    return setName(r, n+" "+seen[n]);
  });
}

/* Whether this run hides who everybody is. One flag, read the same way by every game. */
