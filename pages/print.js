/* ============================================================================
   Teacher Hub — pages/print.js
   ============================================================================ */

/* One printable page of key numbers and room codes, for when the internet fails.

   This is the page that justifies the rest of the site on the day it is least available. It is
   therefore built from the SAME records as the screens — not a separately maintained copy —
   because a printed sheet that disagrees with the site is worse than no sheet, and a second
   place to type the door code is a second place to forget to change it.

   Campuses are grouped by school here too, and never merged: a sheet that ran Bordeaux's rooms
   under a Kedge heading with Paris's would be exactly the mixing this model exists to prevent.

   What goes on it: addresses, room lists, entry instructions, transport lines, phones, and the
   contacts-by-problem list. What does not: profiles, guides, the FAQ, and the map images — a
   sheet in a bag should hold what you cannot look up, and a printer is where a screenshot of a
   map goes to become a grey rectangle. */

function renderPrintSheet(){
  const campuses=sortedRecords(hubSection("campuses"), r=>r.name);
  const contacts=sortedRecords(hubSection("contacts"), r=>r.problem);

  const when=document.getElementById("print-when");
  if(when) when.textContent=t("hub.printed_on", "Printed {when}", { when: fmtDay(Date.now()) });

  const order=[], bySchool={};
  campuses.forEach(c=>{
    const s=(c.school||"").trim() || t("hub.other", "Other");
    if(!bySchool[s]){ bySchool[s]=[]; order.push(s); }
    bySchool[s].push(c);
  });

  const box=document.getElementById("print-campuses");
  if(box) box.innerHTML = order.map(school =>
    '<h2 class="print-school">'+escapeHtml(school)+'</h2>'+
    bySchool[school].map(c=>{
      const lines=[];
      if(c.address) lines.push(escapeHtml(c.address).replace(/\n/g,", "));
      if(c.lines)   lines.push(escapeHtml(t("hub.getting_there", "Getting there"))+": "+escapeHtml(c.lines));
      if(c.rooms)   lines.push(escapeHtml(t("hub.rooms", "Rooms"))+": "+escapeHtml(c.rooms));
      if(c.access)  lines.push(escapeHtml(t("hub.getting_in", "Getting in"))+": "+escapeHtml(c.access));
      if(c.phone)   lines.push(escapeHtml(t("hub.phone", "Phone"))+": "+escapeHtml(c.phone));
      return '<div class="print-block"><h3>'+escapeHtml(c.name||"")+'</h3>'+
        lines.map(l=>'<p>'+l+'</p>').join("")+'</div>';
    }).join("")
  ).join("");

  const cbox=document.getElementById("print-contacts");
  if(cbox) cbox.innerHTML = contacts.map(c=>
    '<p><b>'+escapeHtml(c.problem||"")+'</b> — '+escapeHtml(c.who||"")+
    (c.how ? " ("+escapeHtml(c.how)+")" : "")+'</p>').join("");

  /* Said on the sheet itself, because a printout carries no clue how old it is once it is in a
     bag, and an entry code that changed in October is exactly the thing this sheet gets wrong. */
  const stale=document.getElementById("print-stale");
  if(stale) stale.textContent=t("hub.print_check_date",
    "Check the date above before trusting a door code — this sheet does not update itself.");

  showScreen("screen-print");
}

function hubPrint(){
  try{ window.print(); }catch(e){ console.warn(e); }
}
