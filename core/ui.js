/* ============================================================================
   Classroom Exam App — core/ui.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Screens, and the small helpers everything formats with. */

// Word-cloud normalisation: fold case and accents so "Assurance", "assurance" and
// "ASSURANCE " all land on the same entry instead of three tiny separate ones.
function normWord(w){
  let s=String(w==null?"":w).trim().toLowerCase();
  try{ s=s.normalize("NFD").replace(/[̀-ͯ]/g,""); }catch(e){}
  return s.replace(/[^\p{L}\p{N}'\- ]/gu,"").replace(/\s+/g," ").trim();
}


/* ---------- Utils ---------- */
function showScreen(id){
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  // Teacher Home is reached from half a dozen places (sign-in, Back links, ending a test),
  // so the check for an abandoned session hangs off the screen change rather than off each
  // caller. Fire-and-forget: a failed lookup must never block the screen from appearing.
  if(id==="screen-teacher-login" && typeof refreshOpenRunBanner==="function"){
    Promise.resolve().then(refreshOpenRunBanner).catch(e=>console.warn(e));
  }
}

function uid(len=6){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let out="";
  for(let i=0;i<len;i++) out+=chars[Math.floor(Math.random()*chars.length)];
  return out;
}

function shuffle(arr){ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

function csvEscape(v){ if(v===undefined||v===null) v=""; return '"'+String(v).replace(/"/g,'""')+'"'; }

function fmtTime(sec){ sec=Math.max(0,Math.round(sec)); const m=Math.floor(sec/60), s=sec%60; return m+":"+String(s).padStart(2,"0"); }

function displayName(surname, firstName){ const s=(surname||"").trim(), f=(firstName||"").trim(); return s ? (s.toUpperCase()+(f?", "+f:"")) : (f||"?"); }

function bySurname(a,b){ const s=(a.surname||"").toLowerCase().localeCompare((b.surname||"").toLowerCase()); return s!==0?s:(a.firstName||"").toLowerCase().localeCompare((b.firstName||"").toLowerCase()); }

function fmtDate(ts){ try{ return new Date(ts).toLocaleString(); }catch(e){ return ""; } }


// The chip row mirrors the (hidden) type select, showing only the kinds valid for this bank.
const TYPE_LABELS={mcq:"Multiple choice",tf:"True / False",text:"Short text",order:"Puzzle",poll:"Poll",cloud:"Word cloud"};

function isScreenActive(id){ const el=document.getElementById(id); return !!(el && el.classList && el.classList.contains("active")); }

function formatCorrect(q){ if(!q.type) return ""; if(q.type==="text") return (q.correct||[]).join(" / "); if(q.type==="order") return (q.correct||q.items||[]).join(" > "); return q.correct; }

function escapeHtml(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function vpH(){ return (window.visualViewport&&window.visualViewport.height)||window.innerHeight||0; }

function vpW(){ return (window.visualViewport&&window.visualViewport.width)||window.innerWidth||0; }

function keyboardLikelyOpen(){ const a=document.activeElement; return !!(a&&(a.tagName==="INPUT"||a.tagName==="TEXTAREA")); }

// Flag a shrink that STILL holds a short moment after the last resize, so the on-screen keyboard
// opening/closing (a brief, self-correcting animation) and rotation don't cause false alarms.
// Threshold is deliberately low (18%): a soft keyboard raised for an OVERLAY shrinks the page
// while none of our own answer fields are focused — the tell-tale of "typing somewhere else".
const VP_SHRINK_THRESHOLD = 0.25;

const VP_SETTLE_MS = 700;
   // long enough to clear a keyboard-close animation, short enough to catch brief overlay use
function onViewportResize(){
  const w=vpW();
  if(_vpBaseW && Math.abs(w-_vpBaseW) > _vpBaseW*0.2){ _vpBaseW=w; _vpBaseH=vpH(); _splitFlagged=false; clearTimeout(_vpTimer); return; } // rotation → reset
  if(!_vpBaseH){ _vpBaseH=vpH(); _vpBaseW=w; return; }
  clearTimeout(_vpTimer);
  _vpTimer=setTimeout(()=>{
    if(STUDENT.finished || STUDENT._suppressCheat) return;
    if(keyboardLikelyOpen()) return;                 // steady keyboard state — one of OUR fields is focused
    const h=vpH();
    const shrink=(_vpBaseH-h)/_vpBaseH;
    if(shrink>VP_SHRINK_THRESHOLD){ if(!_splitFlagged){ _splitFlagged=true; logCheat("split_screen_or_overlay_suspected"); } }
    else if(h>=_vpBaseH*0.95){ _splitFlagged=false; }  // returned to full height — re-arm
  }, VP_SETTLE_MS);
}

let _lastTouchAt=0;

function _touchDevice(){ return ("ontouchstart" in window) || (navigator.maxTouchPoints>0); }
