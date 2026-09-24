/* ============================================================================
   Classroom Exam App — core/session.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* A run: its code, its QR, its meta, and picking one back up. */

// Firebase drops empty objects, so every meta map has to be read defensively.
function metaMap(meta, name){ return (meta && meta[name]) || {}; }

function metaFlag(meta, name, idx){ return !!metaMap(meta,name)[String(idx)]; }


// Auto-generate a unique, human-readable join code: 3 random letters + "-" + DDMMYY.
// e.g. ABC-170726. Random part keeps codes distinct even for simultaneous sessions on the same day.
function genSessionCode(){
  const L="ABCDEFGHJKLMNPQRSTUVWXYZ";
  let a=""; for(let i=0;i<3;i++) a+=L[Math.floor(Math.random()*L.length)];
  const d=new Date();
  const dd=String(d.getDate()).padStart(2,"0"), mm=String(d.getMonth()+1).padStart(2,"0"), yy=String(d.getFullYear()).slice(-2);
  return a+"-"+dd+mm+yy;
}


/* Join codes are ABC-DDMMYY. Students type them on a phone, so the field does the work:
   uppercase, drop anything that isn't a letter or digit, and put the dash in itself.
   Pasting "abc-180926" or "abc180926" both normalise to "ABC-180926". */
function formatSessionCode(el){
  const raw=(el.value||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
  let letters="", digits="";
  for(const ch of raw){
    if(letters.length<3 && ch>="A" && ch<="Z"){ letters+=ch; continue; }
    if(letters.length===3 && digits.length<6 && ch>="0" && ch<="9"){ digits+=ch; }
  }
  const out = letters + (letters.length===3 ? "-" : "") + digits;
  if(el.value!==out){
    el.value=out;
    try{ el.setSelectionRange(out.length,out.length); }catch(e){}
  }
}

/* ============ OPEN SESSIONS: REJOIN, PROMPT, 12-HOUR EXPIRY ============
   Closing the browser doesn't end a session — the run lives in the database, and only the
   teacher's own in-memory state is lost. These helpers find a run this teacher left open so
   Home can offer it back, warn before a second one is started, and stop a forgotten session
   lingering indefinitely.

   A run counts as OPEN when it belongs to this teacher, isn't marked ended, and started less
   than 12 hours ago. The clock runs from the start, not from the last student activity: a test
   still open half a day later is finished whatever was happening in it. Expiry is decided here
   rather than by a scheduled job — there is no server to run one — so a stale run is simply
   treated as closed on sight, and written back as ended the next time this teacher looks. */
const SESSION_TTL_MS = 12*60*60*1000;

let OPEN_RUN = null;
   // the run currently offered by the Rejoin button, if any

function runIsExpired(s){ return (Date.now() - (s.runAt||0)) > SESSION_TTL_MS; }

function runIsMine(s){
  const mine=((TEACHER_USER&&TEACHER_USER.email)||"").toLowerCase();
  // With no email on the account (the password fallback), ownership can't be established;
  // offering someone else's live session back would be worse than offering nothing.
  return !!mine && (s.teacherEmail||"").toLowerCase()===mine;
}

function runIsUnfinished(s){ return s.status!=="ended"; }


/* Returns { open:[...], stale:[...] } for this teacher — open runs newest first, plus the
   expired ones so the caller can tidy them away. */
async function findOpenRuns(){
  let sessions=[];
  try{ const r=await Backend.listSessions(); sessions=r.sessions||[]; }
  catch(e){ return { open:[], stale:[] }; }
  const mine=sessions.filter(s=>runIsMine(s) && runIsUnfinished(s));
  return { open: mine.filter(s=>!runIsExpired(s)), stale: mine.filter(runIsExpired) };
}


// Mark expired runs ended so they stop being counted, and drop any expired poll's responses —
// a closed poll keeps nothing, whether it was closed by hand or by the clock.
async function closeStaleRuns(stale){
  for(const s of stale){
    try{
      const run=await Backend.getRun(s.runId);
      const meta=Object.assign({}, (run&&run.meta)||{}, { status:"ended", endedBy:"timeout" });
      await Backend.updateMeta(s.runId, meta);
      if(activityKeepsNothing(s.kind)) await Backend.deleteRun(s.runId);
    }catch(e){ console.warn("stale close failed", s.runId, e); }
  }
}


/* Called whenever Teacher Home is shown. Only an ACTIVE run is offered: a session still sitting
   in the waiting room has nothing to go back to, and rejoining one would only reopen an empty
   lobby the teacher had already walked away from. */
async function refreshOpenRunBanner(){
  const box=document.getElementById("home-rejoin");
  if(!box) return;
  box.style.display="none"; OPEN_RUN=null;
  const { open, stale } = await findOpenRuns();
  if(stale.length) closeStaleRuns(stale);
  const active=open.filter(s=>s.status==="active");
  if(!active.length) return;
  const s=active[0];
  OPEN_RUN=s;
  const act = activity(s.kind);
  const what = (act && act.label) || "Test";
  document.getElementById("home-rejoin-detail").textContent =
    what+" "+s.code+" — "+s.studentCount+" student"+(s.studentCount===1?"":"s")+
    " joined, started "+fmtDate(s.runAt)+".";
  box.style.display="block";
}


/* Puts the teacher back on the live dashboard of a run they left. The run's own record is the
   source of truth — questions, settings and pace all come back from the database, not from
   whatever this browser last remembered. */
async function rejoinOpenRun(){
  if(!OPEN_RUN){ alert("That session is no longer open."); return; }
  const s=OPEN_RUN;
  let run=null;
  try{ run=await Backend.getRun(s.runId); }catch(e){ alert("Couldn't reopen the session: "+e.message); return; }
  if(!run || !run.meta || run.meta.status==="ended"){ alert("That session has already ended."); refreshOpenRunBanner(); return; }
  // Each activity says how it picks itself back up; the core does not know their names.
  const act = activity(s.kind);
  if(act && act.rejoin) return act.rejoin(s, run);

  TEACHER.sessionCode = run.code || s.code;
  TEACHER.runId = s.runId;
  TEACHER.questions = run.questions || [];
  TEACHER.settings = run.meta;
  TEACHER.school = run.meta.school || "";
  const dashCode=document.getElementById("dash-session-code");
  if(dashCode) dashCode.textContent = TEACHER.sessionCode;
  showScreen("screen-teacher-dashboard");
  restoreDashboardForState();
  startDashboardPolling();
}


async function rejoinPollRun(s, run){
  POLL.sessionCode = run.code || s.code;
  POLL.runId = s.runId;
  POLL.questions = run.questions || [];
  POLL.settings = run.meta;
  POLL.school = run.meta.school || "";
  POLL.name = run.meta.name || POLL.name || "";
  POLL.projecting = false;
  POLL.participants = [];
  document.getElementById("poll-live-code").textContent = POLL.sessionCode;
  document.getElementById("poll-live-mode").textContent = POLL.settings.anonymous ? "Anonymous" : "Named";
  document.getElementById("poll-title").textContent = POLL.name || "Live poll";
  document.getElementById("poll-title-meta").textContent =
    POLL.questions.length+" question"+(POLL.questions.length===1?"":"s")+(POLL.school?" · "+POLL.school:"");
  document.getElementById("poll-join-code").textContent = POLL.sessionCode;
  // Rejoin only ever offers an active run, so the stage goes straight back up.
  document.getElementById("poll-lobby").style.display="none";
  document.getElementById("poll-stage").style.display="block";
  document.getElementById("poll-controls").style.display="block";
  showScreen("screen-poll-live");
  renderPollQR();
  pollWatchParticipants();
  pollStartTimerTick();
  renderPollStage();
}


/* Guard in front of starting anything new. Unlike the Rejoin button this also counts a run
   still in the waiting room, because students may be sitting in that lobby — walking away
   without ending it would strand them on a screen that never advances. */
async function confirmNoOpenRun(what){
  const { open, stale } = await findOpenRuns();
  if(stale.length) closeStaleRuns(stale);
  if(!open.length) return true;
  const s=open[0];
  const act = activity(s.kind);
  const kind = (act && act.label ? act.label : "Test").toLowerCase();
  const where = s.status==="active" ? "in progress" : "waiting for students";
  const ok = confirm(
    "You already have a "+kind+" open.\n\n"+
    s.code+" — "+s.studentCount+" student"+(s.studentCount===1?"":"s")+" joined, "+where+".\n\n"+
    "Starting a new "+what+" will end it. Any answers already given are kept and will still "+
    "appear in the archive"+(activityKeepsNothing(s.kind)?", but a "+kind+" keeps nothing, so its responses go when it closes":"")+".\n\n"+
    "End it and continue?");
  if(!ok) return false;
  try{
    const run=await Backend.getRun(s.runId);
    const meta=Object.assign({}, (run&&run.meta)||{}, { status:"ended", endedBy:"superseded" });
    await Backend.updateMeta(s.runId, meta);
    if(activityKeepsNothing(s.kind)) await Backend.deleteRun(s.runId);
  }catch(e){ alert("Couldn't close the old session: "+e.message); return false; }
  return true;
}

function getJoinUrl(){ return location.origin+location.pathname+"?join="+encodeURIComponent(TEACHER.sessionCode); }

function renderJoinQR(){
  document.getElementById("dash-join-code").textContent=TEACHER.sessionCode;
  const holder=document.getElementById("qr-code"); holder.innerHTML="";
  if(location.protocol==="file:"){
    holder.innerHTML='<p style="color:var(--danger);font-weight:600;max-width:400px;">This file is open locally (file://...), so the QR link won\'t work on other devices. Host it (GitHub Pages) and open that URL. Students can still type the code <b>'+TEACHER.sessionCode+'</b> manually.</p>';
    return;
  }
  if(typeof QRCode!=="undefined") new QRCode(holder,{text:getJoinUrl(),width:180,height:180,correctLevel:QRCode.CorrectLevel.M});
  else holder.textContent="(QR library failed to load — share the code manually)";
}

function copyJoinLink(){
  if(location.protocol==="file:"){ alert("Open the hosted URL first — there's no shareable link from a local file."); return; }
  const url=getJoinUrl();
  navigator.clipboard ? navigator.clipboard.writeText(url).then(()=>alert("Link copied:\n"+url)) : prompt("Copy this link:",url);
}

// Enlarge the QR to (near) full screen so the class can scan it from a distance.
// Enlarge the join QR. A poll and a test each have their own run and code, so the caller
// says which ("poll" from the poll screens); otherwise the live test's code is used.
function openQRFullscreen(which){
  const isPoll = (which==="poll") || (!which && !!POLL.runId && isScreenActive("screen-poll-live"));
  const code = isPoll ? POLL.sessionCode : TEACHER.sessionCode;
  const url  = isPoll ? pollJoinUrl() : getJoinUrl();
  const overlay=document.getElementById("qr-overlay");
  const holder=document.getElementById("qr-overlay-code"); holder.innerHTML="";
  document.getElementById("qr-overlay-text").textContent=code||"";
  if(location.protocol!=="file:" && typeof QRCode!=="undefined" && code){
    const s=Math.max(220, Math.min(Math.min(window.innerWidth, window.innerHeight)-180, 440));
    new QRCode(holder,{text:url,width:s,height:s,correctLevel:QRCode.CorrectLevel.M});
  } else {
    holder.innerHTML='<p class="sub" style="max-width:320px;">QR needs the hosted URL. Students can type the code above.</p>';
  }
  overlay.style.display="flex";
}

function closeQRFullscreen(){ document.getElementById("qr-overlay").style.display="none"; }

// Read the rendered QR (canvas or img) as a PNG blob.
function getQRBlob(sel, cb){
  const c=document.querySelector(sel+" canvas");
  if(c && c.toBlob){ c.toBlob(cb); return; }
  const img=document.querySelector(sel+" img");
  if(img && img.src){ fetch(img.src).then(r=>r.blob()).then(cb).catch(()=>cb(null)); return; }
  cb(null);
}

// Copy the QR image to the clipboard (fallback: download it as PNG).
function copyQRImage(sel, ev){
  if(ev) ev.stopPropagation();
  getQRBlob(sel, async(blob)=>{
    if(!blob){ alert("QR image isn't available yet — make sure you're on the hosted URL."); return; }
    try{
      if(navigator.clipboard && window.ClipboardItem){
        await navigator.clipboard.write([new ClipboardItem({[blob.type||"image/png"]:blob})]);
        alert("QR image copied — paste it into your slides, email or chat.");
      } else { throw new Error("no image clipboard"); }
    }catch(e){
      const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
      a.download="join-qr-"+(TEACHER.sessionCode||"code")+".png"; a.click();
      alert("Your browser can't copy images to the clipboard, so the QR was downloaded as a PNG — attach or paste that instead.");
    }
  });
}

/* ============ STUDENT ============ */
/* The student's own side of a session: who they are and which run they are in. A test, a
   poll and a role play all identify the same person, so this belongs in core rather than
   inside whichever activity happened to be written first. (It sat in modules/test.js until
   v3.1, where the rule that modules never reach into each other caught it.) */
let STUDENT = { sessionCode:null, runId:null, id:null, surname:null, firstName:null, name:null, questions:[], order:[], answers:{},
  currentPos:0, timeSpent:{}, questionStartTs:null, cheatAlerts:[], meta:{}, paced:false, finished:false, testStarted:false };
