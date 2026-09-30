/* ============================================================================
   Teacher Hub — pages/home.js
   ============================================================================ */

/* The front page, and the shared bits every page draws with.

   Six routes, set by Chris. Note what changed from v0.1 and why it is worth a second look: the
   labels have moved from questions ("Where am I teaching?") to names ("Our Partner Schools"),
   which is the opposite of the task-wording rule in the decisions log. That is a defensible
   change — the site now reads as an organisation's, not as one teacher's reference card — but it
   was a rule Chris wrote, so it is recorded here rather than quietly reversed.

   Quizzes and Games keeps the dominant position: most visits are to start a lesson, and
   everything else is reference. */

const HUB_ROUTES = [
  { id:"about",   screen:"screen-about",   render:() => renderAbout(),
    label:["hub.route_about", "About Us"],
    hint:["hub.route_about_hint", "Who we are, and who teaches where."] },
  { id:"who",     screen:"screen-who",     render:() => renderWho(),
    label:["hub.route_who", "Who to ask?"],
    hint:["hub.route_who_hint", "Who to go to for what, and how to reach them."] },
  { id:"schools", screen:"screen-schools", render:() => renderSchools(),
    label:["hub.route_schools", "Our Partner Schools"],
    hint:["hub.route_schools_hint", "Every campus: how to get there, how to get in."] },
  { id:"guides",  screen:"screen-guides",  render:() => renderGuides(),
    label:["hub.route_guides", "Guides"],
    hint:["hub.route_guides_hint", "How to use the tools and the LMS."] },
  { id:"faq",     screen:"screen-faq",     render:() => renderFaq(),
    label:["hub.route_faq", "FAQ"],
    hint:["hub.route_faq_hint", "The questions that keep coming up."] }
];

/* Loaded once per visit and held, because every page reads from it. A reference site whose pages
   each re-fetch is a site that feels slow on a phone in a corridor. */
let HUB = { loaded:false, data:{} };

async function hubLoad(force){
  if(HUB.loaded && !force) return HUB.data;
  try{
    HUB.data = await Backend.getHubAll();
    HUB.loaded = true;
  }catch(e){
    console.warn("hub content unavailable", e);
    HUB.data = {};
    HUB.loaded = false;
  }
  return HUB.data;
}

function hubSection(name){ return (HUB.data && HUB.data[name]) || {}; }

async function hubHome(){
  await hubLoad();
  renderHubHome();
  showScreen("screen-home");
}

function renderHubHome(){
  const who=document.getElementById("home-greeting");
  if(who) who.textContent = TEACHER_USER
    ? t("hub.hello_name", "Hello, {name}", { name:TEACHER_USER.name })
    : "";

  const box=document.getElementById("home-routes");
  if(box) box.innerHTML = HUB_ROUTES.map(r=>
    '<button class="hub-route" onclick="hubGo(\'' + r.id + '\')">'+
      '<span class="hub-route-label">'+escapeHtml(t(r.label[0], r.label[1]))+'</span>'+
      '<span class="hub-route-hint">'+escapeHtml(t(r.hint[0], r.hint[1]))+'</span>'+
    '</button>').join("");

  /* Said plainly when there is nothing behind the doors, rather than letting a colleague open
     five empty pages and decide the hub is broken. */
  const empty=document.getElementById("home-empty");
  const anything=["campuses","people","contacts","guides","faq","about"]
    .some(s=>Object.keys(hubSection(s)).length>0);
  if(empty) empty.style.display = anything ? "none" : "block";
}

function hubGo(routeId){
  const route=HUB_ROUTES.filter(r=>r.id===routeId)[0];
  if(!route) return;
  route.render();
  showScreen(route.screen);
}

/* The primary action. A link rather than a copy of the launcher: the hub does not reimplement
   the app, it opens it. */
function hubOpenApp(){
  try{ window.open(APP_URL, "_blank"); }
  catch(e){ location.href = APP_URL; }
}


/* ---------- the shared bits ---------- */

function hubNothingYet(message){
  return '<p class="sub hub-empty">'+escapeHtml(message)+'</p>';
}

function hubField(label, value){
  return '<p class="hub-field"><span class="hub-field-label">'+escapeHtml(label)+'</span> '+
    escapeHtml(value).replace(/\n/g,"<br>")+'</p>';
}

/* The owner-and-date line every page carries. It takes the OLDEST review on the page, not the
   newest: a page is only as current as its stalest entry, and showing the newest would let one
   freshly edited record vouch for five that nobody has looked at since last year. */
function hubSetReviewed(elementId, rows){
  const el=document.getElementById(elementId);
  if(!el) return;
  const dated=(rows||[]).filter(r=>Number(r.updated));
  if(!dated.length){ el.textContent=""; el.style.display="none"; return; }
  let oldest=dated[0];
  dated.forEach(r=>{ if(Number(r.updated) < Number(oldest.updated)) oldest=r; });
  el.textContent=reviewedLine(oldest);
  el.style.display = el.textContent ? "block" : "none";
}
