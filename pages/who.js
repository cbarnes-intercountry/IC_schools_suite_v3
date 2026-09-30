/* ============================================================================
   Teacher Hub — pages/who.js
   ============================================================================ */

/* "Who to ask?" — contacts, by the problem.

   The order is the point, and it is the reason this is its own route rather than a section of
   About Us. A teacher with a broken projector does not know which department owns projectors;
   they know the projector is broken. So the page lists problems in a colleague's words and gives
   the name as the answer. Who somebody IS lives in About Us; who to ask about a THING lives
   here, and the two are different questions. */

function renderWho(){
  const contacts=sortedRecords(hubSection("contacts"), r=>r.problem);
  const box=document.getElementById("who-contacts");
  if(box) box.innerHTML = contacts.length
    ? contacts.map(c=>
        '<div class="hub-row hub-contact">'+
          '<span class="hub-row-main">'+escapeHtml(c.problem||"")+'</span>'+
          '<span class="hub-row-side">'+escapeHtml(c.who||"")+'</span>'+
        '</div>'+
        (c.how ? '<p class="hub-row-note">'+hubContactLink(c.how)+'</p>' : ""))
      .join("")
    : hubNothingYet(t("hub.no_contacts_yet", "No contacts have been added yet."));

  hubSetReviewed("who-reviewed", contacts);
}

/* An email address in the "how" line becomes a link, because the answer to "who do I ask" is
   only useful if asking them is one tap away. Everything else stays plain text — a URL typed
   into a contact note is not a promise that it is safe to click. */
function hubContactLink(how){
  const s=String(how||"");
  const m=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.exec(s.trim());
  if(m) return '<a href="mailto:'+encodeURIComponent(s.trim())+'">'+escapeHtml(s.trim())+'</a>';
  return escapeHtml(s);
}
