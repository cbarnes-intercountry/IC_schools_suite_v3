/* ============================================================================
   Teacher Hub — pages/schools.js
   ============================================================================ */

/* Our Partner Schools, and one campus.

   THE CAMPUS RULE. Intercountry teaches at Kedge in Paris, Bordeaux, Marseille and Toulon. Those
   are four different doors, four different room lists and four different metro networks, and the
   one thing a teacher must never be shown is Bordeaux's entry code under Paris's heading. So a
   campus is a RECORD OF ITS OWN and the school is a field on it: the list groups by school, but
   nothing is ever merged, because the records never touch. Two clicks to any address. */

let SCHOOLS = { campusKey:null };

function renderSchools(){
  const campuses=sortedRecords(hubSection("campuses"), r=>r.name);
  const box=document.getElementById("schools-list");
  if(!box) return;

  if(!campuses.length){
    box.innerHTML=hubNothingYet(t("hub.no_campuses_yet", "No campuses have been added yet."));
    hubSetReviewed("schools-reviewed", []);
    return;
  }

  /* Grouped in the order the campuses come out, so a school with a low `order` on its first
     campus leads. Schools are not a table of their own: one text field on the campus is all the
     grouping needs, and a second table would be a second place to spell "Kedge" differently. */
  const order=[], bySchool={};
  campuses.forEach(c=>{
    const s=(c.school||"").trim() || t("hub.other", "Other");
    if(!bySchool[s]){ bySchool[s]=[]; order.push(s); }
    bySchool[s].push(c);
  });

  box.innerHTML = order.map(school =>
    '<h2 class="hub-school-name">'+escapeHtml(school)+'</h2>'+
    bySchool[school].map(c=>
      '<button class="hub-campus-link" onclick="hubOpenCampus(\''+escapeHtml(c.key)+'\')">'+
        '<span class="hub-campus-name">'+escapeHtml(c.name||"")+'</span>'+
        (c.oneLine ? '<span class="hub-campus-sub">'+escapeHtml(c.oneLine)+'</span>' : "")+
        (c.lines ? lineBadges(c.lines) : "")+
      '</button>').join("")
  ).join("");

  hubSetReviewed("schools-reviewed", campuses);
}

function hubOpenCampus(key){
  const c=Object.assign({ key:key }, hubSection("campuses")[key] || {});
  SCHOOLS.campusKey=key;

  const ttl=document.getElementById("campus-title");
  if(ttl) ttl.textContent=[c.school, c.name].filter(Boolean).join(" — ");

  const box=document.getElementById("campus-body");
  if(box){
    const bits=[];
    if(c.address) bits.push('<p class="hub-address">'+escapeHtml(c.address).replace(/\n/g,"<br>")+'</p>');

    /* The map first, because a person who has just arrived at the wrong end of a street looks at
       the picture before they read anything. A still image rather than an embedded map: no API
       key in a public repo, nothing loading Google on a staff page, and it survives on the
       printed sheet, where a live map is a white rectangle. */
    if(c.mapImage){
      bits.push('<img class="hub-map" src="'+escapeHtml(c.mapImage)+'" alt="'+
        escapeHtml(t("hub.map_of", "Map of {what}", { what:(c.name||"") }))+'" loading="lazy">');
    }
    if(c.address || c.mapLink){
      bits.push('<div class="hub-actions"><button class="btn-primary" onclick="hubOpenMap()">'+
        escapeHtml(t("hub.open_in_maps", "Open in Maps"))+'</button></div>');
    }

    if(c.lines || c.transport){
      bits.push('<h3>'+escapeHtml(t("hub.getting_there", "Getting there"))+'</h3>');
      if(c.lines) bits.push(lineBadges(c.lines));
      if(c.transport) bits.push('<p class="hub-transport">'+escapeHtml(c.transport).replace(/\n/g,"<br>")+'</p>');
    }

    const fields=[];
    if(c.rooms)  fields.push(hubField(t("hub.rooms", "Rooms"), c.rooms));
    if(c.access) fields.push(hubField(t("hub.getting_in", "Getting in"), c.access));
    if(c.phone)  fields.push(hubField(t("hub.phone", "Phone"), c.phone));
    if(fields.length) bits.push('<h3>'+escapeHtml(t("hub.at_the_door", "At the door"))+'</h3>'+fields.join(""));

    if(c.notes) bits.push('<h3>'+escapeHtml(t("hub.anything_else", "Anything else"))+'</h3>'+paragraphs(c.notes));

    /* Who is usually here, from the other direction: the person records name their campuses, so
       the campus page is built from them rather than from a second list somebody has to keep. */
    const here=peopleAtCampus(c);
    if(here.length){
      bits.push('<h3>'+escapeHtml(t("hub.who_teaches_here", "Who teaches here"))+'</h3>'+
        '<div class="hub-here">'+here.map(p=>
          '<button class="hub-chip" onclick="hubOpenPerson(\''+escapeHtml(p.key)+'\')">'+
            escapeHtml(p.name||"")+'</button>').join("")+'</div>');
    }

    box.innerHTML=bits.join("");
  }

  const rev=document.getElementById("campus-reviewed");
  if(rev){ rev.textContent=reviewedLine(c); rev.style.display = rev.textContent ? "block" : "none"; }
  showScreen("screen-campus");
}

/* Opens the address in whatever map app the phone has, with directions from where the person is
   standing — which is the thing an embedded map cannot do and the reason a still image plus this
   button beats an iframe. An explicit mapLink wins, so a campus with an awkward address (a
   building set back from the road, an entrance on another street) can point somewhere exact. */
function hubOpenMap(){
  const c=hubSection("campuses")[SCHOOLS.campusKey] || {};
  const url = (c.mapLink||"").trim() ||
    ("https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent([c.school, c.name, c.address].filter(Boolean).join(", ").replace(/\n/g, ", ")));
  try{ window.open(url, "_blank"); }catch(e){ location.href=url; }
}

/* A person's campuses are typed as text — "Kedge Paris, IFPASS" — rather than picked from a
   list, because the list would need maintaining and a typo would silently unlink somebody. The
   match is therefore forgiving: it looks for the campus name, or the school and campus together,
   anywhere in what they wrote. */
function peopleAtCampus(campus){
  const name=String(campus.name||"").trim().toLowerCase();
  const school=String(campus.school||"").trim().toLowerCase();
  if(!name && !school) return [];
  return sortedRecords(hubSection("people"), r=>r.name).filter(p=>{
    const at=String(p.campuses||"").toLowerCase();
    if(!at) return false;
    if(name && school) return at.indexOf(name)>=0 && at.indexOf(school.split(" ")[0])>=0;
    return at.indexOf(name || school)>=0;
  });
}
