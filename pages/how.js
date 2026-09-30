/* ============================================================================
   Teacher Hub — pages/how.js
   ============================================================================ */

/* Guides, and the FAQ — two routes now, not one page with two halves.

   In v0.1 both sat under "How do I…?". Chris split them on the front page, and they are
   genuinely different things: a guide is a thing you work through once, a FAQ answer is a thing
   you check in ten seconds. Putting them behind one door meant scrolling past twelve guide
   titles to read a two-line answer.

   Guides still open on their own page rather than expanding in place. That is the no-accordions
   rule doing real work: a list of twelve collapsed headings is a list nobody reads past the
   third, and a guide worth writing is worth a page with a date on it. */

let HOW = { guideKey:null };

function renderGuides(){
  const guides=sortedRecords(hubSection("guides"), r=>r.title);
  const box=document.getElementById("guides-list");
  if(box) box.innerHTML = guides.length
    ? guides.map(g=>
        '<button class="hub-guide-link" onclick="hubOpenGuide(\''+escapeHtml(g.key)+'\')">'+
          escapeHtml(g.title||"")+
        '</button>').join("")
    : hubNothingYet(t("hub.no_guides_yet", "No guides have been written yet."));
  hubSetReviewed("guides-reviewed", guides);
}

function renderFaq(){
  const faq=sortedRecords(hubSection("faq"), r=>r.q);
  const box=document.getElementById("faq-list");
  if(box) box.innerHTML = faq.length
    ? faq.map(f=>
        '<div class="hub-faq">'+
          '<p class="hub-faq-q">'+escapeHtml(f.q||"")+'</p>'+
          paragraphs(f.a)+
        '</div>').join("")
    : hubNothingYet(t("hub.no_faq_yet", "No questions have been added yet."));
  hubSetReviewed("faq-reviewed", faq);
}

function hubOpenGuide(key){
  const g=Object.assign({ key:key }, hubSection("guides")[key] || {});
  HOW.guideKey=key;
  const ttl=document.getElementById("guide-title");
  if(ttl) ttl.textContent=g.title||"";
  const body=document.getElementById("guide-body");
  if(body) body.innerHTML=paragraphs(g.body);
  const rev=document.getElementById("guide-reviewed");
  if(rev){ rev.textContent=reviewedLine(g); rev.style.display = rev.textContent ? "block" : "none"; }
  showScreen("screen-guide");
}
