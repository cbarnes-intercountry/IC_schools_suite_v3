/* ============================================================================
   Classroom Exam App — core/security.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Exam monitoring. A deterrent and a log, not a lockdown: it cannot see a second
   device or an overlay, and it never claims to. */

// A participant's raw logged alerts (from result if submitted, else live progress).
function rawCheatAlerts(p){
  if(p.result && p.result.cheatAlerts) return p.result.cheatAlerts;
  if(p.progress && p.progress.cheatAlerts) return p.progress.cheatAlerts;
  return [];
}

// Alerts that count = those logged AFTER the teacher's last reset (cheatBaseline).
function effectiveCheatCount(p){ return Math.max(0, rawCheatAlerts(p).length - (p.cheatBaseline||0)); }


/* Security monitoring */
function logCheat(type){
  if(STUDENT.finished || STUDENT._suppressCheat) return; // ignore events during submit/confirm
  STUDENT.cheatAlerts.push({type,time:Date.now()});
  syncProgress(true);
}

function requestFS(el){
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
  if(fn){ try{ const r=fn.call(el); if(r&&r.catch) r.catch(()=>{}); }catch(e){} }
}

function inFullscreen(){ return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement); }

/* Extra monitoring: viewport-shrink (split-screen / overlay) and focus polling. */
let _focusPoll=null, _focusLostCount=0, _vpBaseH=0, _vpBaseW=0, _splitFlagged=false, _vpTimer=null;

/* Full-screen recovery: if the student drops out of full screen mid-test we show a blocking
   overlay. Their tap on it is the user gesture browsers require to re-enter full screen, so
   an accidental exit is self-correcting. A genuine exit is still logged once, after a short
   grace period so a momentary flicker (common when tapping on Android) isn't counted. */
let _fsGraceTimer=null, _fsSupported=false;

function fullscreenAvailable(){
  const el=document.documentElement;
  return !!(el.requestFullscreen||el.webkitRequestFullscreen||el.mozRequestFullScreen||el.msRequestFullscreen);
}

function showFSOverlay(){
  const o=document.getElementById("fs-overlay"); if(!o) return;
  o.style.display="flex";
  STUDENT._suppressCheat=true;   // don't stack other alerts while they're getting back in
}

function hideFSOverlay(){
  const o=document.getElementById("fs-overlay"); if(o) o.style.display="none";
  STUDENT._suppressCheat=false;
}

function resumeFullscreen(){
  requestFS(document.documentElement);   // called from the overlay tap = valid user gesture
  hideFSOverlay();
  // Re-baseline the viewport once the screen settles, so the change doesn't read as a shrink.
  setTimeout(()=>{ _vpBaseH=vpH(); _vpBaseW=vpW(); _splitFlagged=false; }, 800);
}

function onFullscreenChange(){
  if(STUDENT.finished || !STUDENT.testStarted) return;
  if(inFullscreen()){ clearTimeout(_fsGraceTimer); hideFSOverlay(); return; }
  clearTimeout(_fsGraceTimer);
  _fsGraceTimer=setTimeout(()=>{
    if(STUDENT.finished || inFullscreen()) return;   // came back on its own — ignore
    logCheat("exited_fullscreen");                    // genuine exit: log once...
    showFSOverlay();                                  // ...and ask them to return
  }, 1500);
}

let _securityOn=false;

function enableSecurityMonitoring(){
  // (No on-screen badge: students are told about monitoring on the consent + waiting screens.)
  // Try to enter full screen. This works because enableSecurityMonitoring is reached from the
  // student's "Start Your Test" tap (a user gesture). Note: iOS Safari does not support web
  // full screen, so on iPhones the test runs windowed and we skip the recovery overlay.
  _fsSupported = fullscreenAvailable();
  requestFS(document.documentElement);
  if(_securityOn) return; // attach listeners only once
  _securityOn=true;
  if(_fsSupported){
    ["fullscreenchange","webkitfullscreenchange","mozfullscreenchange","MSFullscreenChange"].forEach(ev=>
      document.addEventListener(ev, onFullscreenChange));
  }
  document.addEventListener("visibilitychange",()=>{ if(document.hidden) logCheat("tab_switch_or_minimized"); });
  document.addEventListener("copy",e=>{ e.preventDefault(); logCheat("copy_attempt"); });
  document.addEventListener("paste",e=>{ e.preventDefault(); logCheat("paste_attempt"); });
  // Long-press on a touchscreen also fires "contextmenu". Block the menu either way, but only
  // log it as an attempt for a genuine mouse right-click — otherwise every tap-and-hold on a
  // phone would raise a false alert.
  document.addEventListener("touchstart", ()=>{ _lastTouchAt=Date.now(); }, {passive:true});
  document.addEventListener("contextmenu",e=>{
    e.preventDefault();
    const fromTouch = (e.pointerType==="touch") || (Date.now()-_lastTouchAt < 1500) || _touchDevice();
    if(!fromTouch) logCheat("right_click_attempt");
  });
  // Page Lifecycle: the OS froze/suspended this tab (e.g. backgrounded for another app).
  document.addEventListener("freeze", ()=>logCheat("tab_frozen"));
  // Focus polling — catches an overlay/app that steals focus while the page stays visible.
  // Requires focus to be lost for ~2.4s continuously, so a normal tap (which at most causes a
  // momentary blip that recovers immediately) never triggers it.
  _focusLostCount = 0;
  _focusPoll = setInterval(()=>{
    if(STUDENT.finished || STUDENT._suppressCheat){ _focusLostCount=0; return; }
    const focused = document.hasFocus ? document.hasFocus() : true;
    if(!focused && !document.hidden){ _focusLostCount++; if(_focusLostCount===3) logCheat("focus_lost"); }
    else { _focusLostCount = 0; }
  }, 800);
  // Viewport-shrink — catches split-screen / multi-window and some overlays. Baseline is taken
  // shortly after the test opens; keyboard and rotation are guarded against in onViewportResize.
  setTimeout(()=>{ _vpBaseH=vpH(); _vpBaseW=vpW(); }, 600);
  (window.visualViewport || window).addEventListener("resize", onViewportResize);
}
