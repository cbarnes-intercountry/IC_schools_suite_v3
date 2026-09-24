/* ============================================================================
   Classroom Exam App — boot.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Start-up. Loaded last, once everything it calls exists. */

/* ---------- Boot ---------- */
window.addEventListener("DOMContentLoaded", () => {
  Backend.init();
  refreshModeBadge();
  teacherAuthBoot();   // recognise a signed-in teacher
  initQMediaDropZones();
  window.addEventListener("resize", ()=>{ if(document.getElementById("dash-student-list").children.length) applyQGrid(); });
  const joinCode = new URLSearchParams(location.search).get("join");
  if(joinCode){
    document.getElementById("s-session-code").value = joinCode.toUpperCase();
    formatSessionCode(document.getElementById("s-session-code"));
    showScreen("screen-student-join");
    // Scanning the QR resolves the session straight away: an anonymous poll is joined in one
    // step, and anything needing a name reveals the name boxes instead.
    setTimeout(()=>{ studentJoin(); }, 60);
  }
});
