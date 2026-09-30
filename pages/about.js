/* ============================================================================
   Teacher Hub — pages/about.js
   ============================================================================ */

/* About Us — who we are, one profile at a time.

   This was a directory in v0.1: four fields and no way in. Chris's note was that it "should
   really be about us", so a name is now a door rather than a row, and behind it is a person in
   their own words.

   ON PHOTOS. The decisions log draws a line here: no staff photos without asking people first,
   because a photo is the one addition that raises the data-protection stakes. Nothing in the
   code can enforce that, so the note lives where the photo is rendered and in the editor's own
   field label. A photo is stored as a URL, and WHERE that URL points decides who can see it: a
   file in the public repo is a photo of a colleague on the open web, and only somewhere behind
   the sign-in keeps it to the people the hub is for. */

function renderAbout(){
  const intro=hubSection("about")["intro"];
  const box=document.getElementById("about-intro");
  if(box){
    box.innerHTML = intro && intro.body ? paragraphs(intro.body) : "";
    box.style.display = intro && intro.body ? "block" : "none";
  }

  const people=sortedRecords(hubSection("people"), r=>r.name);
  const list=document.getElementById("about-people");
  if(list) list.innerHTML = people.length
    ? people.map(p=>
        '<button class="hub-person-link" onclick="hubOpenPerson(\''+escapeHtml(p.key)+'\')">'+
          (p.photo
            ? '<img class="hub-avatar" src="'+escapeHtml(p.photo)+'" alt="" loading="lazy">'
            : '<span class="hub-avatar hub-avatar-none" aria-hidden="true">'+
              escapeHtml(initials(p.name))+'</span>')+
          '<span class="hub-person-text">'+
            '<span class="hub-person-name">'+escapeHtml(p.name||"")+'</span>'+
            '<span class="hub-person-role">'+escapeHtml(hubRoleLine(p))+'</span>'+
          '</span>'+
        '</button>').join("")
    : hubNothingYet(t("hub.no_people_yet", "Nobody has been added yet."));

  hubSetReviewed("about-reviewed", people);
}

/* Somebody with no photo gets their initials in a disc rather than a grey silhouette. A missing
   photo should not look like a fault, because for most people it will be a choice. */
function initials(name){
  const parts=String(name==null?"":name).trim().split(/\s+/).filter(Boolean);
  if(!parts.length) return "?";
  if(parts.length===1) return parts[0].slice(0,1).toUpperCase();
  return (parts[0].slice(0,1) + parts[parts.length-1].slice(0,1)).toUpperCase();
}

function hubRoleLine(p){
  const role=(p.role||"").trim(), dept=(p.department||"").trim();
  if(role && dept) return t("hub.role_in_department", "{role} · {department}", { role:role, department:dept });
  return role || dept || "";
}

function hubOpenPerson(key){
  const p=Object.assign({ key:key }, hubSection("people")[key] || {});

  const ttl=document.getElementById("person-name");
  if(ttl) ttl.textContent=p.name||"";
  const role=document.getElementById("person-role");
  if(role){ role.textContent=hubRoleLine(p); role.style.display = role.textContent ? "block" : "none"; }

  const photo=document.getElementById("person-photo");
  if(photo){
    if(p.photo){ photo.src=p.photo; photo.alt=""; photo.style.display="block"; }
    else { photo.removeAttribute("src"); photo.style.display="none"; }
  }

  const bio=document.getElementById("person-bio");
  if(bio){ bio.innerHTML=paragraphs(p.bio); bio.style.display = p.bio ? "block" : "none"; }

  const mail=document.getElementById("person-email");
  if(mail){
    if(p.email){
      mail.innerHTML='<a href="mailto:'+encodeURIComponent(p.email)+'">'+escapeHtml(p.email)+'</a>';
      mail.style.display="block";
    } else { mail.innerHTML=""; mail.style.display="none"; }
  }

  /* Their campuses, as buttons through to the campus page — the same link the campus page draws
     back to them. One typed field, two directions, nothing to keep in step. */
  const at=document.getElementById("person-campuses");
  if(at){
    const mine=campusesForPerson(p);
    at.innerHTML = mine.length
      ? '<h3>'+escapeHtml(t("hub.teaches_at", "Teaches at"))+'</h3><div class="hub-here">'+
        mine.map(c=>'<button class="hub-chip" onclick="hubOpenCampus(\''+escapeHtml(c.key)+'\')">'+
          escapeHtml([c.school, c.name].filter(Boolean).join(" — "))+'</button>').join("")+'</div>'
      : "";
    at.style.display = mine.length ? "block" : "none";
  }

  const rev=document.getElementById("person-reviewed");
  if(rev){ rev.textContent=reviewedLine(p); rev.style.display = rev.textContent ? "block" : "none"; }
  showScreen("screen-person");
}

function campusesForPerson(p){
  const at=String(p.campuses||"").toLowerCase();
  if(!at.trim()) return [];
  return sortedRecords(hubSection("campuses"), r=>r.name).filter(c=>{
    const name=String(c.name||"").trim().toLowerCase();
    const school=String(c.school||"").trim().toLowerCase();
    if(name && school) return at.indexOf(name)>=0 && at.indexOf(school.split(" ")[0])>=0;
    return !!(name || school) && at.indexOf(name || school)>=0;
  });
}
