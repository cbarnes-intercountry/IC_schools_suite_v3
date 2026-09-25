/* ============================================================================
   Classroom Exam App — admin/reports.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Results, the archive, and the CSV. */

// Manual retention: download a JSON backup of every run older than 6 months, then delete them.
async function archiveOldReports(){
  if(!requireOwner("purge old reports")) return;
  const st=document.getElementById("archive-status");
  st.textContent=t("reports.checking", "Checking…");
  try{
    const r=await Backend.listSessions();
    const cutoff=Date.now()-REPORT_VISIBLE_DAYS*24*60*60*1000;
    const old=(r.sessions||[]).filter(x=>(x.runAt||0)<cutoff);
    if(old.length===0){ st.textContent=t("reports.nothing_archive_no_runs_older_than", "Nothing to archive — no runs older than 6 months."); return; }
    if(!confirm(t("reports.found", "Found ")+old.length+" run(s) older than 6 months. Download a backup and then permanently delete them from the database?")) { st.textContent=t("reports.cancelled", "Cancelled."); return; }
    // Build a full backup (run details + participants) before deleting anything.
    const backup={ exportedAt:new Date().toISOString(), runs:[] };
    for(const run of old){
      let questions=[], participants=[];
      try{ const full=await Backend.getRun(run.runId); questions=(full&&full.questions)||[]; }catch(e){ console.warn(e); }
      try{ const p=await Backend.listParticipants(run.runId); participants=p.participants||[]; }catch(e){ console.warn(e); }
      backup.runs.push({ runId:run.runId, code:run.code, runAt:run.runAt, school:run.school||"", questions, participants });
    }
    const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download="exam_report_archive_"+new Date().toISOString().slice(0,10)+".json"; a.click();
    // Delete after the backup download has been triggered.
    let deleted=0;
    for(const run of old){ try{ await Backend.deleteRun(run.runId); deleted++; }catch(e){ console.warn(e); } }
    st.textContent="Archived and deleted "+deleted+" run(s). Backup file downloaded — store it somewhere safe.";
  }catch(e){ st.textContent="Archive failed: "+e.message; }
}


/* ============ CSV EXPORT ============ */
// Current live session:
function exportResultsCSV(){ return buildAndDownloadCSV(TEACHER.runId, TEACHER.sessionCode, TEACHER.questions); }

// Any run (used by History and the live dashboard):
async function buildAndDownloadCSV(runId, code, questionsMaybe, schoolMaybe){
  let questions=questionsMaybe, participants=[], school=schoolMaybe||"", runMeta=null;
  try{
    if(!questions){ const run=await Backend.getRun(runId); questions=(run&&run.questions)||[]; if(run&&run.code) code=run.code; if(run&&run.meta){ if(run.meta.school) school=run.meta.school; runMeta=run.meta; } }
    const r=await Backend.listParticipants(runId); participants=r.participants||[];
  }catch(e){ alert(t("reports.couldn_t_fetch_results", "Couldn't fetch results: ")+e.message); return; }
  const results=buildEffectiveResults(participants, questions, runMeta).slice().sort(bySurname);

  /* One row per student. The per-question detail goes sideways into Q1..Qn, holding the mark
     awarded, so the sheet sorts, totals and charts without any reshaping. An unanswered
     question scores 0 — a blank would quietly drop out of an average. The full question text
     can't fit in a column heading, so it goes in a key block above the table; Excel shows that
     as a few short rows before the header, which sorting and filtering ignore. */
  const nQ=questions.length;
  const qCols=[]; for(let i=0;i<nQ;i++) qCols.push("Q"+(i+1));
  const rows=[];

  rows.push(["Exam results"]);
  rows.push(["Session code", code||""]);
  rows.push(["School", school||""]);
  rows.push(["Exported", fmtDate(Date.now())]);
  rows.push(["Students", String(results.length)]);
  rows.push([]);
  rows.push(["Question key"]);
  questions.forEach((q,i)=>rows.push(["Q"+(i+1), q.text||"", q.type||"", "worth "+(q.points||0)+" pt"+((q.points||0)===1?"":"s"), formatCorrect(q)]));
  rows.push([]);

  rows.push(["Surname","FirstName","School","SessionCode","Team","Status",
    "TotalScore","TotalPossible","Percentage","TimeTakenSeconds",
    "CheatAlertCount","CheatAlertDetails","FinishedAt"].concat(qCols));

  results.forEach(r=>{
    const alertDetails=(r.cheatAlerts||[]).map(a=>a.type+"@"+new Date(a.time).toLocaleTimeString()).join(" | ");
    // Marks land in the column matching the question's position in the quiz, not the order the
    // student saw them — randomised question order would otherwise scramble the columns.
    const marks=new Array(nQ).fill(0);
    (r.answers||[]).forEach(ans=>{
      const idx=ans.questionIndex;
      if(idx>=0 && idx<nQ) marks[idx]=Number(ans.pointsAwarded)||0;
    });
    const timeTaken=(r.answers||[]).reduce((t,a)=>t+(a.timeSpentSec||0),0);
    rows.push([ r.surname||"", r.firstName||"", school, code, r.team||"", r.status||"Submitted",
      r.score, r.totalPossible, r.percentage.toFixed(1), timeTaken.toFixed(1),
      (r.cheatAlerts||[]).length, alertDetails, r.finishedAt?fmtDate(r.finishedAt):"" ].concat(marks));
  });

  appendTeamBlock(rows, results, nQ);

  const csv=rows.map(row=>row.map(csvEscape).join(",")).join("\n");
  const blob=new Blob([csv],{type:"text/csv"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="exam_results_"+(code||runId)+".csv"; a.click();
}


/* ============ HISTORY TAB ============ */
// Reports are visible for 6 months; older runs are hidden here (and purged/archived server-side).
const REPORT_VISIBLE_DAYS = 183;

async function openHistory(){
  showScreen("screen-teacher-history");
  const el=document.getElementById("history-list"); el.innerHTML='<p class="sub">'+t("teacher_history.loading", 'Loading…')+'</p>';
  try{
    const r=await Backend.listSessions();
    const cutoff = Date.now() - REPORT_VISIBLE_DAYS*24*60*60*1000;
    // Polls are excluded: their responses are deleted on close, so there is nothing to report.
    let all=(r.sessions||[]).filter(x=>x.kind!=="poll");
    // A plain teacher sees only the runs they launched; an owner sees the whole school's.
    if(!isOwner()) all=all.filter(runIsMine);
    const runs=all.filter(x=>(x.runAt||0)>=cutoff).sort((a,b)=>b.runAt-a.runAt);
    const hidden=all.length-runs.length;
    if(runs.length===0){
      el.innerHTML='<p class="sub">'+(isOwner()?"No quizzes in the last 6 months.":"You haven\u2019t run any tests in the last 6 months.")
        +(hidden>0?' ('+hidden+' older run(s) are hidden and will be archived/deleted server-side.)':'')+'</p>';
      return;
    }
    el.innerHTML="";
    runs.forEach(run=>{
      const div=document.createElement("div"); div.className="student-row";
      const cnt = (run.studentCount!==undefined) ? (run.studentCount+" student"+(run.studentCount===1?"":"s")) : "";
      const school = run.school ? " · "+run.school : "";
      const who = run.teacherName ? " · "+escapeHtml(run.teacherName) : "";
      div.innerHTML='<span><b>'+run.code+'</b>'+school+'<br><small class="hint">'+fmtDate(run.runAt)+(cnt?" · "+cnt:"")+who+'</small></span>';
      const btn=document.createElement("button"); btn.className="btn-outline"; btn.style.flex="0 0 auto"; btn.textContent=t("reports.download_csv", "Download CSV");
      btn.onclick=()=>buildAndDownloadCSV(run.runId, run.code, null, run.school);
      div.appendChild(btn);
      if(isOwner()){
        const del=document.createElement("button"); del.className="btn-danger"; del.style.flex="0 0 auto"; del.textContent=t("reports.delete", "Delete");
        del.onclick=()=>deleteRunFromHistory(run);
        div.appendChild(del);
      }
      el.appendChild(div);
    });
    if(hidden>0){ const n=document.createElement("p"); n.className="sub"; n.style.marginTop="10px";
      n.textContent = hidden+" run(s) older than 6 months are hidden here (archived/deleted server-side)."; el.appendChild(n); }
  }catch(e){ el.innerHTML='<p class="sub" style="color:var(--danger)">Couldn\'t load history: '+e.message+'</p>'; }
}


/* Permanently remove one run's record and every student answer in it. Owner-only, and
   deliberately not undoable — there is no bin to restore from, so the confirmation spells out
   what is about to go and asks for the session code back to make an accidental click unlikely. */
async function deleteRunFromHistory(run){
  if(!requireOwner("delete a result")) return;
  const typed=prompt(
    "Delete the results for "+run.code+" permanently?\n\n"+
    (run.studentCount||0)+" student record(s) will be erased. This cannot be undone — download the CSV first if you might need it.\n\n"+
    "Type the session code to confirm:");
  if(typed===null) return;
  if(String(typed).trim().toUpperCase()!==String(run.code).toUpperCase()){ alert(t("reports.didn_t_match_nothing_was_deleted", "That didn't match — nothing was deleted.")); return; }
  try{ await Backend.deleteRun(run.runId); }
  catch(e){ alert(t("editor.delete_failed", "Delete failed: ")+e.message); return; }
  openHistory();
}
