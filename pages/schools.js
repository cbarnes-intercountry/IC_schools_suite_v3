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
    schoolFullLine(bySchool[school])+
    bySchool[school].map(c=>
      /* Name and one line, and nothing else.
         The badges used to be here too. They are transport information — what you need once you
         are going somewhere, not while you are deciding which campus you mean — and a list where
         every row carries four coloured discs is a list you scan past rather than read. They
         live on the campus page, one tap away, where the address and the walking directions
         they belong with are. */
      '<button class="hub-campus-link" onclick="hubOpenCampus(\''+escapeHtml(c.key)+'\')">'+
        '<span class="hub-campus-name">'+escapeHtml(c.name||"")+'</span>'+
        (c.oneLine ? '<span class="hub-campus-sub">'+escapeHtml(c.oneLine)+'</span>' : "")+
      '</button>').join("")
  ).join("");

  hubSetReviewed("schools-reviewed", campuses);
}

/* What the abbreviation stands for, under the heading.

   It lives on the campus rather than in a schools table, and the group takes the first campus
   that filled it in. That is deliberate: `school` is the grouping key and has to be byte-identical
   across all seven ISO campuses, so putting "Institut Supérieur d'Optique" in it would mean typing
   it seven times, where one stray accent splits ISO into two headings. Here, two campuses that
   disagree cost nothing worse than which wording wins. A second table could disagree silently;
   this cannot. */
function schoolFullLine(group){
  const full=(group||[]).map(c=>String(c.schoolFull||"").trim()).filter(Boolean)[0];
  return full ? '<p class="hub-school-full">'+escapeHtml(full)+'</p>' : "";
}

/* The same expansion, for ONE campus, found across its school rather than on its own record.

   Without this, a colleague who opens KEDGE Marseille sees no expansion while KEDGE Paris shows
   one, purely because Paris happened to be the campus somebody typed it on. The field is about
   the school, so the answer has to be the school's, wherever it was entered. */
function schoolFullFor(campus){
  const school=String((campus||{}).school||"").trim();
  if(!school) return "";
  const all=hubSection("campuses");
  return Object.keys(all)
    .filter(k=>String(all[k].school||"").trim()===school)
    .map(k=>String(all[k].schoolFull||"").trim())
    .filter(Boolean)[0] || "";
}

function hubOpenCampus(key){
  const c=Object.assign({ key:key }, hubSection("campuses")[key] || {});
  SCHOOLS.campusKey=key;

  const ttl=document.getElementById("campus-title");
  if(ttl) ttl.textContent=[c.school, c.name].filter(Boolean).join(" — ");

  const box=document.getElementById("campus-body");
  if(box){
    const bits=[];
    const full=schoolFullFor(c);
    if(full) bits.push('<p class="hub-school-full">'+escapeHtml(full)+'</p>');
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

    /* Who at Intercountry looks after this campus, between where it is and how to reach it:
       the question a teacher asks second, after finding the place and before anything goes
       wrong. "IC contact" rather than "referent", which reads as somebody school-side. */
    if(c.icContact){
      bits.push('<h3>'+escapeHtml(t("hub.ic_contact", "IC contact"))+'</h3>'+
        '<p class="hub-ic-contact">'+escapeHtml(c.icContact)+'</p>');
    }

    if(c.lines || c.buses || c.transport){
      bits.push('<h3>'+escapeHtml(t("hub.getting_there", "Getting there"))+'</h3>');
      if(c.lines) bits.push(lineBadges(c.lines, networkFor(c)));
      /* Buses on their own row, under their own label, so a campus reached by four bus numbers
         does not look like a campus on four metro lines. */
      if(c.buses){
        bits.push('<p class="hub-bus-label">'+escapeHtml(t("hub.by_bus", "By bus"))+'</p>'+
          busBadges(c.buses));
      }
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
