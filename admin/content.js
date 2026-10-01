/* ============================================================================
   Teacher Hub — admin/content.js
   ============================================================================ */

/* Editing the content, owner only.

   A NOTE ON WHY THIS EXISTS AT ALL. The decisions log says the editor is deferred — "launch
   with Chris editing, build the editor after a term, when it's clear which parts actually
   change". That was written before the storage decision. With the content in the Realtime
   Database rather than in repo files, "Chris editing" means hand-typing JSON into the Firebase
   console, including the prose of every guide. That is not a deferral, it is a wall. So the
   minimum that makes the chosen storage usable ships now: a form per record, and a paste box
   for bulk. What is still deferred is everything that would make this pleasant — reordering by
   drag, previews, revision history.

   The shapes are declared once, here, and the forms are generated from them. Six hand-written
   forms would be six places to add a field. */

const HUB_SHAPES = {
  campuses: {
    label: ["hub.section_campuses", "Campuses"],
    name: r => [r.school, r.name].filter(Boolean).join(" \u2014 "),
    fields: [
      { key:"school",    label:["hub.f_school", "School"], required:true,
        note:["hub.f_school_note", "The short name, spelt the same on every campus \u2014 this is what groups them."] },
      { key:"schoolFull", label:["hub.f_school_full", "What the abbreviation stands for"],
        note:["hub.f_school_full_note", "Shown under the school heading. Only one campus of each school needs it."] },
      { key:"name",      label:["hub.f_campus", "Campus"], required:true },
      { key:"oneLine",   label:["hub.f_oneline", "One line, for the list"] },
      { key:"address",   label:["hub.f_address", "Address"], lines:3 },
      { key:"network",   label:["hub.f_network", "Transport network"],
        note:["hub.f_network_note", "RATP, TCL, RTM, TBM, ILEVIA, ASTUCE or STAN. Leave empty and the postcode decides \u2014 set it only when that gets it wrong."] },
      { key:"lines",     label:["hub.f_lines", "Metro, RER and tram lines"],
        note:["hub.f_lines_note", "Separated by commas: M9, RER A, T3a. The badges are drawn from these, in the network\u2019s own colours."] },
      { key:"buses",     label:["hub.f_buses", "Bus lines"],
        note:["hub.f_buses_note", "Only where a bus is the way in. Separated by commas: B1, 21 jet, 24."] },
      { key:"transport", label:["hub.f_transport", "Getting there, in words"], lines:3 },
      { key:"mapImage",  label:["hub.f_mapimage", "Map image"],
        note:["hub.f_mapimage_note", "Put the picture in the site’s maps folder and type maps/kedge-paris.png here, or paste a full web address. If you replace a picture, change its name or add ?v=2 — browsers keep the old one otherwise."] },
      { key:"mapLink",   label:["hub.f_maplink", "Map link (optional)"],
        note:["hub.f_maplink_note", "Where \u201cOpen in Maps\u201d goes. Leave empty and the address is used."] },
      { key:"rooms",     label:["hub.f_rooms", "Rooms"] },
      { key:"access",    label:["hub.f_access", "Getting in"], lines:2 },
      { key:"phone",     label:["hub.f_phone", "Phone"] },
      { key:"icContact", label:["hub.f_ic_contact", "IC contact"],
        note:["hub.f_ic_contact_note", "Who at Intercountry looks after this campus. Separate several with commas."] },
      { key:"notes",     label:["hub.f_notes", "Anything else"], lines:3 }
    ]
  },
  people: {
    label: ["hub.section_people", "About Us"],
    name: r => r.name,
    fields: [
      { key:"name",       label:["hub.f_name", "Name"], required:true },
      { key:"role",       label:["hub.f_role", "Role"] },
      { key:"department", label:["hub.f_department", "Department"] },
      { key:"email",      label:["hub.f_email", "Work email"] },
      { key:"bio",        label:["hub.f_bio", "A short bio"], lines:6 },
      { key:"campuses",   label:["hub.f_campuses", "Teaches at"],
        note:["hub.f_campuses_note", "Campus names, separated by commas: Kedge Paris, IFPASS."] },
      { key:"photo",      label:["hub.f_photo", "Photo (web address)"],
        note:["hub.f_photo_note", "Ask the person first. A photo hosted on the open web is on the open web \u2014 only somewhere behind this sign-in keeps it to colleagues."] }
    ]
  },
  about: {
    label: ["hub.section_about", "About text"],
    name: r => r.title || "Intercountry",
    fields: [
      { key:"title", label:["hub.f_title", "Title"] },
      { key:"body",  label:["hub.f_body", "The text"], lines:8 }
    ]
  },
  contacts: {
    label: ["hub.section_contacts", "Who to ask"],
    name: r => r.problem,
    fields: [
      { key:"problem", label:["hub.f_problem", "The problem, in a colleague\u2019s words"], required:true },
      { key:"who",     label:["hub.f_who", "Who to ask"], required:true },
      { key:"how",     label:["hub.f_how", "How to reach them"] }
    ]
  },
  guides: {
    label: ["hub.section_guides", "Guides"],
    name: r => r.title,
    fields: [
      { key:"title", label:["hub.f_title", "Title"], required:true },
      { key:"body",  label:["hub.f_body", "The guide"], lines:12 }
    ]
  },
  faq: {
    label: ["hub.section_faq", "FAQ"],
    name: r => r.q,
    fields: [
      { key:"q", label:["hub.f_question", "Question"], required:true },
      { key:"a", label:["hub.f_answer", "Answer"], lines:5 }
    ]
  }
};

const HUB_SECTIONS = ["campuses", "people", "about", "contacts", "guides", "faq"];

/* A refused write, said usefully.

   "PERMISSION_DENIED: Permission denied" is the whole of what Firebase returns, and it names
   neither of the two things that actually cause it here. Both are one-look checks, so the
   message names them instead of leaving an owner to guess which. */
function hubWhyRefused(e){
  const msg = String((e && e.message) || e || "");
  if(/permission[_ ]?denied/i.test(msg)){
    return t("hub.denied_two_causes",
      "The database refused it. Either the hub rules have not been published yet (Firebase console \u2192 Realtime Database \u2192 Rules \u2014 look for a \u201chub\u201d block), or this account is not an owner.");
  }
  return msg;
}

let ADMIN = { section:"campuses", editing:null, status:"" };

function hubAdmin(){
  if(!requireOwner(t("hub.action_edit", "edit the hub"))) return;
  ADMIN.editing=null;
  renderAdmin();
  showScreen("screen-admin");
}

function renderAdmin(){
  const tabs=document.getElementById("admin-sections");
  if(tabs) tabs.innerHTML = HUB_SECTIONS.map(s=>{
    const shape=HUB_SHAPES[s];
    const n=Object.keys(hubSection(s)).length;
    const cls = s===ADMIN.section ? "hub-pill hub-pill-on" : "hub-pill";
    return '<button class="'+cls+'" onclick="hubAdminSection(\''+s+'\')">'+
      escapeHtml(t(shape.label[0], shape.label[1]))+' <b class="mono">'+n+'</b></button>';
  }).join("");

  const shape=HUB_SHAPES[ADMIN.section];
  const rows=sortedRecords(hubSection(ADMIN.section), shape.name);
  const list=document.getElementById("admin-list");
  if(list) list.innerHTML = rows.length
    ? rows.map(r=>
        '<div class="hub-row">'+
          '<span class="hub-row-main">'+escapeHtml(shape.name(r)||t("hub.untitled", "(untitled)"))+'</span>'+
          '<span class="hub-row-side">'+
            '<button class="mini" onclick="hubAdminEdit(\''+escapeHtml(r.key)+'\')">'+
              escapeHtml(t("hub.edit", "Edit"))+'</button> '+
            '<button class="mini danger" onclick="hubAdminDelete(\''+escapeHtml(r.key)+'\')">'+
              escapeHtml(t("hub.remove", "Remove"))+'</button>'+
          '</span>'+
        '</div>').join("")
    : hubNothingYet(t("hub.section_empty", "Nothing here yet."));

  renderAdminForm();

  const st=document.getElementById("admin-status");
  if(st) st.textContent=ADMIN.status||"";
}

function hubAdminSection(section){
  if(!HUB_SHAPES[section]) return;
  ADMIN.section=section;
  ADMIN.editing=null;
  ADMIN.status="";
  renderAdmin();
}

function hubAdminNew(){ ADMIN.editing=""; ADMIN.status=""; renderAdmin(); }

function hubAdminEdit(key){ ADMIN.editing=key; ADMIN.status=""; renderAdmin(); }

function hubAdminCancel(){ ADMIN.editing=null; renderAdmin(); }

function renderAdminForm(){
  const box=document.getElementById("admin-form");
  if(!box) return;
  if(ADMIN.editing===null){ box.innerHTML=""; box.style.display="none"; return; }
  box.style.display="block";

  const shape=HUB_SHAPES[ADMIN.section];
  const rec = ADMIN.editing ? (hubSection(ADMIN.section)[ADMIN.editing] || {}) : {};
  box.innerHTML =
    '<h3>'+escapeHtml(ADMIN.editing ? t("hub.edit_entry", "Edit") : t("hub.add_entry", "Add"))+'</h3>'+
    shape.fields.map(f=>{
      const label=escapeHtml(t(f.label[0], f.label[1]))+(f.required ? ' <span class="hub-req">*</span>' : "");
      const val=escapeHtml(rec[f.key]==null ? "" : rec[f.key]);
      const id="admin-f-"+f.key;
      /* A note under the field rather than a placeholder inside it: a placeholder disappears
         the moment somebody starts typing, which is exactly when "spelt the same on every
         campus" stops being advice and starts being the thing they are getting wrong. */
      const note = f.note ? '<span class="hub-note">'+escapeHtml(t(f.note[0], f.note[1]))+'</span>' : "";
      return '<label class="hub-label">'+label+note+
        (f.lines
          ? '<textarea id="'+id+'" rows="'+f.lines+'"></textarea>'
          : '<input id="'+id+'" type="text">')+
        '</label>';
    }).join("")+
    '<div class="hub-actions">'+
      '<button class="btn-primary" onclick="hubAdminSave()">'+escapeHtml(t("hub.save", "Save"))+'</button> '+
      '<button onclick="hubAdminCancel()">'+escapeHtml(t("hub.cancel", "Cancel"))+'</button>'+
    '</div>';

  /* Values are set as properties rather than written into the markup above. A colleague's
     address with a quote in it would otherwise end the attribute and put the rest of their
     address into the page as markup. */
  shape.fields.forEach(f=>{
    const el=document.getElementById("admin-f-"+f.key);
    if(el) el.value = rec[f.key]==null ? "" : String(rec[f.key]);
  });
}

async function hubAdminSave(){
  if(!requireOwner(t("hub.action_edit", "edit the hub"))) return;
  const shape=HUB_SHAPES[ADMIN.section];
  const rec={};
  let missing=null;
  shape.fields.forEach(f=>{
    const el=document.getElementById("admin-f-"+f.key);
    const v=(el ? String(el.value||"") : "").trim();
    if(f.required && !v && !missing) missing=t(f.label[0], f.label[1]);
    if(v) rec[f.key]=v;
  });
  if(missing){
    ADMIN.status=t("hub.needs_field", "{field} can’t be empty.", { field:missing });
    renderAdmin();
    return;
  }

  /* Who changed it and when, stamped here rather than typed, because the last-reviewed line on
     every page is only worth printing if nobody can forget to update it. */
  rec.owner = (TEACHER_USER && TEACHER_USER.name) || "";
  rec.updated = Date.now();
  const existing = ADMIN.editing ? (hubSection(ADMIN.section)[ADMIN.editing] || {}) : {};
  if(existing.order != null) rec.order = existing.order;

  /* About text is one record, not a list: the page reads hub/about/intro, so the key is fixed
     rather than generated. A second "intro" would be a second paragraph nobody could see. */
  const key = ADMIN.editing || (ADMIN.section==="about" ? "intro" : (ADMIN.section.slice(0,2) + "_" + uid(6)));
  try{
    await Backend.setHubItem(ADMIN.section, key, rec);
  }catch(e){
    ADMIN.status=t("hub.save_failed", "Not saved: {why}", { why:hubWhyRefused(e) });
    renderAdmin();
    return;
  }
  await hubLoad(true);
  ADMIN.editing=null;
  ADMIN.status=t("hub.saved", "Saved.");
  renderAdmin();
}

async function hubAdminDelete(key){
  if(!requireOwner(t("hub.action_edit", "edit the hub"))) return;
  const shape=HUB_SHAPES[ADMIN.section];
  const rec=hubSection(ADMIN.section)[key] || {};
  if(!confirm(t("hub.confirm_remove", "Remove “{what}”? This cannot be undone.",
      { what: shape.name(rec) || t("hub.untitled", "(untitled)") }))) return;
  try{
    await Backend.deleteHubItem(ADMIN.section, key);
  }catch(e){
    ADMIN.status=t("hub.remove_failed", "Not removed: {why}", { why:hubWhyRefused(e) });
    renderAdmin();
    return;
  }
  await hubLoad(true);
  if(ADMIN.editing===key) ADMIN.editing=null;
  ADMIN.status=t("hub.removed", "Removed.");
  renderAdmin();
}

/* ---------- bulk ----------

   Typing forty staff names one form at a time is not a thing anybody does twice, so the whole
   section goes in and out as JSON. Out first: the box fills with what is there, so the way to
   learn the shape is to look at it rather than to read documentation. */
function hubAdminExport(){
  const box=document.getElementById("admin-json");
  if(box) box.value = JSON.stringify(hubSection(ADMIN.section), null, 2);
  const st=document.getElementById("admin-status");
  if(st) st.textContent=t("hub.exported", "Copied into the box below.");
}

async function hubAdminImport(){
  if(!requireOwner(t("hub.action_edit", "edit the hub"))) return;
  const box=document.getElementById("admin-json");
  const text=(box ? box.value : "").trim();
  if(!text){ ADMIN.status=t("hub.nothing_to_import", "Nothing in the box to import."); renderAdmin(); return; }

  let parsed=null;
  try{ parsed=JSON.parse(text); }
  catch(e){ ADMIN.status=t("hub.bad_json", "That isn’t valid JSON: {why}", { why:(e&&e.message)||e });
            renderAdmin(); return; }

  const map = hubNormaliseImport(parsed, ADMIN.section);
  if(map.error){ ADMIN.status=map.error; renderAdmin(); return; }

  const n=Object.keys(map.records).length;
  if(!confirm(t("hub.confirm_import",
      "Replace this whole section with {n} entries? Everything currently in it goes.", { n:n }))) return;

  try{
    await Backend.replaceHubSection(ADMIN.section, map.records);
  }catch(e){
    ADMIN.status=t("hub.import_failed", "Not imported: {why}", { why:hubWhyRefused(e) });
    renderAdmin(); return;
  }
  await hubLoad(true);
  ADMIN.status=t("hub.imported", "Imported {n} entries.", { n:n });
  renderAdmin();
}

/* Accepts either shape a person would paste: the map the export produces, or a plain list of
   records. A list gets keys generated for it.

   The required field is checked here rather than on the way out of the box, because a paste
   that silently creates twelve nameless rows is a paste whose damage is found a week later by
   somebody else. */
function hubNormaliseImport(parsed, section){
  const shape=HUB_SHAPES[section];
  const required=shape.fields.filter(f=>f.required).map(f=>f.key);
  let entries=[];

  if(Array.isArray(parsed)){
    entries = parsed.map(r=>[null, r]);
  } else if(parsed && typeof parsed==="object"){
    entries = Object.keys(parsed).map(k=>[k, parsed[k]]);
  } else {
    return { error: t("hub.import_not_records", "That JSON isn’t a list of entries.") };
  }

  const records={};
  for(let i=0;i<entries.length;i++){
    const rec=entries[i][1];
    if(!rec || typeof rec!=="object" || Array.isArray(rec)){
      return { error: t("hub.import_row_not_object", "Entry {n} isn’t a record.", { n:i+1 }) };
    }
    const bad=required.filter(k=>!String(rec[k]==null?"":rec[k]).trim())[0];
    if(bad){
      const f=shape.fields.filter(x=>x.key===bad)[0];
      return { error: t("hub.import_row_missing", "Entry {n} has no {field}.",
        { n:i+1, field:t(f.label[0], f.label[1]) }) };
    }
    /* Only the fields this section declares. A pasted record carrying extra keys would put
       whatever they are into the database unchecked, and the rules cannot tell text from text. */
    const clean={};
    shape.fields.forEach(f=>{
      const v=rec[f.key];
      if(v!=null && String(v).trim()) clean[f.key]=String(v).trim();
    });
    if(rec.order!=null && isFinite(Number(rec.order))) clean.order=Number(rec.order);
    clean.owner = String(rec.owner||"").trim() || ((TEACHER_USER && TEACHER_USER.name) || "");
    clean.updated = Number(rec.updated) || Date.now();
    records[entries[i][0] || (section.slice(0,2) + "_" + uid(6))] = clean;
  }
  return { records: records };
}
