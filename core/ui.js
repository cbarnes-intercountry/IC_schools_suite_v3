/* ============================================================================
   Teacher Hub — core/ui.js
   Loaded as a plain script in the order set by index.html; every file shares one
   global scope, so nothing is imported or exported.
   ============================================================================ */

/* Screens, and the small helpers everything formats with. Deliberately shorter than the app's
   copy: the quiz-shaped helpers (answer formatting, question-type labels, word normalisation)
   have no caller here, and a copied file carrying functions nobody calls is how two versions of
   the same helper quietly diverge. */

/* Which build is this? Read off the page's own `?v=` cache tags rather than kept in a constant
   beside them, so there is one number to bump and the badge cannot disagree with the files
   actually loaded. */
function appVersion(){
  try{
    const tag=[...document.getElementsByTagName("script")]
      .map(el=>el.getAttribute("src")||"")
      .map(src=>/[?&]v=([^&"']+)/.exec(src))
      .find(Boolean);
    return tag ? tag[1] : "";
  }catch(e){ return ""; }
}

function showAppVersion(){
  const v=appVersion();
  document.querySelectorAll(".app-version").forEach(el=>{
    el.textContent = v ? "v"+v : "";
  });
}

function showScreen(id){
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  const el=document.getElementById(id);
  if(el) el.classList.add("active");
  try{ window.scrollTo(0,0); }catch(e){}
}

function isScreenActive(id){
  const el=document.getElementById(id);
  return !!(el && el.classList && el.classList.contains("active"));
}

function uid(len){
  const n = len || 6;
  const abc="abcdefghijklmnopqrstuvwxyz0123456789";
  let s="";
  for(let i=0;i<n;i++) s+=abc[Math.floor(Math.random()*abc.length)];
  return s;
}

function escapeHtml(s){
  return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/* A date a person would write, not a timestamp. Used for the last-reviewed line every page
   carries, which is the whole reason a reference site can be trusted: a term-dates page with no
   date on it is a page nobody can tell is stale. */
function fmtDay(ts){
  const n=Number(ts);
  if(!n) return "";
  try{ return new Date(n).toLocaleDateString(uiLang()==="fr" ? "fr-FR" : "en-GB",
    { day:"numeric", month:"long", year:"numeric" }); }
  catch(e){ return ""; }
}

/* "Reviewed by Chris Barnes, 12 September 2026" — or nothing at all, rather than a half line
   claiming a review by nobody on no date. */
function reviewedLine(rec){
  const r=rec||{};
  const who=(r.owner||"").trim();
  const when=fmtDay(r.updated);
  if(who && when) return t("hub.reviewed_by_on", "Reviewed by {who}, {when}", { who:who, when:when });
  if(who) return t("hub.owned_by", "Kept by {who}", { who:who });
  if(when) return t("hub.reviewed_on", "Reviewed {when}", { when:when });
  return "";
}

/* Records come out of the database as a map, and a map has no order. Sorting by an explicit
   `order` number and falling back to the name keeps a list stable between reloads instead of
   reshuffling itself each time somebody opens the page. */
function sortedRecords(map, nameOf){
  const rows=Object.keys(map||{}).map(k=>Object.assign({ key:k }, map[k]));
  rows.sort((a,b)=>{
    const oa=Number(a.order), ob=Number(b.order);
    if(isFinite(oa) && isFinite(ob) && oa!==ob) return oa-ob;
    if(isFinite(oa) !== isFinite(ob)) return isFinite(oa) ? -1 : 1;
    return String(nameOf(a)||"").localeCompare(String(nameOf(b)||""));
  });
  return rows;
}

/* Turns the newlines a teacher typed into paragraphs, having escaped everything first. The hub
   holds prose written by colleagues; it must never hold markup they could paste in by accident
   and have run. */
function paragraphs(text){
  return String(text==null?"":text).split(/\n\s*\n/)
    .map(p=>p.trim()).filter(Boolean)
    .map(p=>"<p>"+escapeHtml(p).replace(/\n/g,"<br>")+"</p>").join("");
}
