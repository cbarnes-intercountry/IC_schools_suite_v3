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
    for(let i=1;i<n;i++){ const t=teamNameAt(i); if(sizes[t]<sizes[smallest]) smallest=t; }
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
    ? "Teams are drawn when students join. Change the number any time before you start."
    : n+" student"+(n===1?"":"s")+" in "+TEAM_DRAFT.count+" teams — about "+Math.ceil(n/TEAM_DRAFT.count)+" each. Locked once the test starts.";
  const wrap=document.getElementById("dash-team-preview");
  wrap.innerHTML="";
  const byTeam={};
  DASH_PARTICIPANTS.forEach(p=>{
    const t=TEAM_DRAFT.map[p.studentId]; if(!t) return;
    (byTeam[t]=byTeam[t]||[]).push(displayName(p.surname,p.firstName));
  });
  Object.keys(byTeam).sort().forEach(t=>{
    const d=document.createElement("div");
    d.style.cssText="margin:6px 0;font-size:.9rem;";
    d.innerHTML="<b>"+escapeHtml(t)+"</b> <span class='sub'>("+byTeam[t].length+")</span> — "+escapeHtml(byTeam[t].join(", "));
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
        '<span>'+escapeHtml(displayName(m.surname,m.firstName))+(idle?' <small class="hint">(not counted — no answers)</small>':'')+'</span>'+
        '<span class="mono">'+m.score+'/'+m.totalPossible+' · '+Math.round(m.percentage)+'%</span></div>';
    }).join("");
    if(g.idle>0){
      body.innerHTML+='<p class="sub" style="margin:8px 0 0;">'+g.idle+' member'+(g.idle===1?"":"s")+
        ' left out of the average — the team is scored on the '+g.scoring+' who answered.</p>';
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
    const t=r.team; if(!t) return;
    if(!byTeam[t]) byTeam[t]={ team:t, members:[], scoring:0, pctSum:0, points:0, possible:0 };
    const g=byTeam[t];
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
  rows.push(["Counted = members who answered at least one question. The team average ignores the rest."].concat(pad.slice(0,0)));
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
    '<div class="sub" style="margin:0 0 4px;">Your team</div>'+
    '<div style="font-size:1.6rem;font-weight:800;">'+escapeHtml(team)+'</div>'+
    '<small class="hint">You answer on your own phone. Your team\u2019s score is the average of everyone in it.</small></div>';
}
