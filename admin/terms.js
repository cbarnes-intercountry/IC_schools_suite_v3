/* ============================================================================
   Classroom Exam App — admin/terms.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Writing word packs for Describe It.

   A pack is a list of terms, each with up to three words the describer may not say. Stored like
   every other set — same library, kind "describeit" — so the backend did not have to change.

   The editor is deliberately thin. Forty terms typed one at a time is an evening's work, so
   Excel is the intended route in and this screen is for fixing the two that came out wrong. The
   rows are drawn from the data rather than written out in index.html: a pack is a list of
   identical rows, and forty of them in the markup would be forty places to get out of step. */

let TERMS = { key:null, name:"", schools:[], list:[], lang:"en", lastTheme:"", clean:"" };

/* Four on purpose. Every term is authored with four, and the teacher picks how many of them a
   class is actually held to — two, three or four — so one pack covers a warm-up and a B2 class
   without being written twice.

   Order matters: the obvious words go FIRST. Turning the difficulty down takes the last ones
   off, so it removes the obscure constraints rather than the ones that make the item work. */
const DI_MAX_FORBIDDEN = 4;

function termsFingerprint(){ return JSON.stringify({ n:TERMS.name, s:TERMS.schools, l:TERMS.list, g:TERMS.lang }); }
function markTermsSaved(){ TERMS.clean = termsFingerprint(); }
function termsAreDirty(){
  return isScreenActive("screen-di-editor") && termsFingerprint() !== TERMS.clean;
}

function blankTerm(){ return { id:"tm_"+uid(6), term:"", forbidden:[], theme:TERMS.lastTheme||"",
                               lang:TERMS.lang||"en" }; }

async function newTermSet(){
  TERMS = { key:null, name:"", schools:[], list:[], lang:"en", lastTheme:"", clean:"" };
  TERMS.list=[blankTerm(),blankTerm(),blankTerm()];
  await renderTermSchools();
  renderTermList(); markTermsSaved();
  showScreen("screen-di-editor");
}

async function loadTermSet(){
  const key=document.getElementById("di-library-select").value;
  if(!key){ alert(t("terms.pick_saved_pack_first", "Pick a saved area first.")); return; }
  let rec=null;
  try{ rec=await Backend.getQuiz(key); }catch(e){ alert(t("terms.couldn_t_load", "Couldn't load it: ")+e.message); return; }
  if(!rec){ alert(t("terms.pack_gone", "That area has gone.")); return; }
  TERMS = { key:key, name:rec.name||"", schools:quizSchools(rec), list:(rec.questions||[]).slice(),
            lang:((rec.questions||[])[0]||{}).lang||"en", lastTheme:"", clean:"" };
  if(!TERMS.list.length) TERMS.list=[blankTerm()];
  await renderTermSchools();
  renderTermList(); markTermsSaved();
  showScreen("screen-di-editor");
}

async function deleteTermSet(){
  if(!requireOwner(t("terms.action_delete_area", "delete a saved area"))) return;
  const sel=document.getElementById("di-library-select");
  const key=sel.value; if(!key){ alert(t("terms.pick_saved_pack_first", "Pick a saved area first.")); return; }
  if(!confirm(t("terms.delete_set_confirm", "Delete “{name}” for good?", {name:sel.options[sel.selectedIndex].text}))) return;
  try{ await Backend.deleteQuiz(key); }catch(e){ alert(t("terms.couldn_t_delete", "Couldn't delete it: ")+e.message); return; }
  await loadQuizList();
}

async function renderTermSchools(){
  const box=document.getElementById("di-school-checks");
  if(!box) return;
  let list=[];
  try{ list=(await Backend.listSchools()).schools||[]; }catch(e){ console.warn(e); }
  box.innerHTML = list.length ? list.map(n=>
    '<label class="chk"><input type="checkbox" value="'+escapeHtml(n)+'"'+
    (TERMS.schools.indexOf(n)>=0?" checked":"")+' onchange="readTermSchools()"> '+escapeHtml(n)+'</label>'
  ).join("") : '<p class="sub">'+t("scenarios.no_schools_yet_add_one_admin", 'No schools yet — add one in Admin first.')+'</p>';
}
function readTermSchools(){
  TERMS.schools = Array.prototype.slice
    .call(document.querySelectorAll("#di-school-checks input:checked")).map(i=>i.value);
}

/* ---------- the rows ---------- */

/* A pack is ONE AREA — "General English", "Business language" — and the sets inside it are what
   a lesson picks: weather and seasons, meetings, insurance. So the editor reads as a list of
   sets, and every operation a teacher actually performs on a set exists at the set's own level:
   renaming it, emptying it, moving a term out of it. Doing those a row at a time is how a
   twenty-term set gets half-renamed.

   `theme` is still the field name in the data, because packs are already saved with it and a
   rename would strand them. The word on the screen is "set". */

/* The sets in the order they first appear, then anything untagged. Grouping by NAME rather than
   by consecutive runs matters: a term whose set was retyped belongs with its set immediately,
   not wherever it happens to sit in the list. */
function termSetsInOrder(){
  const names=diThemes(TERMS.list);
  const loose=TERMS.list.some(tm=>!String(tm.theme||"").trim());
  return loose ? names.concat([""]) : names;
}
function termIndexesIn(name){
  const out=[];
  TERMS.list.forEach((tm,i)=>{ if(String(tm.theme||"").trim()===name) out.push(i); });
  return out;
}

function renderTermList(){
  const box=document.getElementById("di-term-list");
  if(!box) return;
  let html="";
  termSetsInOrder().forEach(name=>{
    const rows=termIndexesIn(name);
    html += '<div class="di-theme-head">'+
      '<input type="text" class="di-setname-in" value="'+escapeHtml(name)+'" '+
        'placeholder="'+escapeHtml(t("terms.ph.set_name", "set name"))+'" '+
        'onchange="renameTermSet('+JSON.stringify(name).replace(/"/g,"&quot;")+',this.value)">'+
      '<span class="di-set-count">'+rows.length+'</span>'+
      '<button class="btn-outline btn-sm" onclick="addTermTo('+JSON.stringify(name).replace(/"/g,"&quot;")+')" '+
        'title="'+escapeHtml(t("terms.ti.add_here", "Add a term to this set"))+'">+</button>'+
      '<button class="btn-outline btn-sm" onclick="removeTermSet('+JSON.stringify(name).replace(/"/g,"&quot;")+')" '+
        'title="'+escapeHtml(t("terms.ti.remove_set", "Remove this set and its terms"))+'">\u00d7</button>'+
      '</div>';
    rows.forEach((i,k)=>{
      const tm=TERMS.list[i];
      const f=(tm.forbidden||[]).concat(["","","",""]).slice(0,DI_MAX_FORBIDDEN);
      const thin=(tm.forbidden||[]).filter(Boolean).length < DI_MAX_FORBIDDEN;
      html += '<div class="di-termrow'+(thin?" di-termrow-thin":"")+'">'+
        '<div class="di-termrow-top">'+
          '<span class="qrow-no">'+(k+1)+'</span>'+
          '<input type="text" class="di-term-in" value="'+escapeHtml(tm.term||"")+'" '+
            'placeholder="'+escapeHtml(t("terms.ph.term", "term"))+'" oninput="setTermField('+i+',-1,this.value)">'+
          '<select class="di-move-in" onchange="moveTermToSet('+i+',this.value)" '+
            'title="'+escapeHtml(t("terms.ti.move", "Move this term to another set"))+'">'+
            termSetsInOrder().map(n=>'<option value="'+escapeHtml(n)+'"'+(n===name?" selected":"")+'>'+
              escapeHtml(n || t("terms.no_set", "No set"))+'</option>').join("")+
            '<option value="__new__">'+escapeHtml(t("terms.new_set", "New set\u2026"))+'</option>'+
          '</select>'+
          '<button class="btn-outline btn-sm" onclick="deleteTerm('+i+')" '+
            'title="'+escapeHtml(t("terms.ti.remove", "Remove this term"))+'">\u00d7</button>'+
        '</div>'+
        '<div class="di-termrow-forbid">'+
          f.map((w,j)=>'<input type="text" class="di-forbid-in" value="'+escapeHtml(w)+'" '+
            'placeholder="'+escapeHtml(t("terms.ph.not_this", "not this"))+' '+(j+1)+'" '+
            'oninput="setTermField('+i+','+j+',this.value)">').join("")+
        '</div>'+
        '</div>';
    });
  });
  box.innerHTML = html || '<p class="sub">'+t("terms.pack_is_empty", "This area has no sets yet.")+'</p>';
  const nm=document.getElementById("di-set-name"); if(nm) nm.value=TERMS.name;
  const lg=document.getElementById("di-set-lang"); if(lg) lg.value=TERMS.lang||"en";
  const c=document.getElementById("di-term-count");
  if(c) c.textContent = t("di.n_terms", "{count} {terms}",
    { count:TERMS.list.length, terms: plural(TERMS.list.length, t("di.term", "term"), t("di.terms", "terms")) });
  const th=document.getElementById("di-theme-summary");
  if(th){
    const sets=diThemes(TERMS.list);
    const thin=TERMS.list.filter(tm=>(tm.forbidden||[]).filter(Boolean).length < DI_MAX_FORBIDDEN).length;
    th.textContent = (sets.length
        ? t("terms.n_sets", "{count} {sets}: {list}",
            { count:sets.length, list:sets.join(", "),
              sets: plural(sets.length, t("terms.set", "set"), t("terms.sets", "sets")) })
        : t("terms.no_sets_yet", "No sets yet."))
      + (thin ? " \u00b7 " + t("terms.n_thin",
          "{n} with fewer than four forbidden words", {n:thin}) : "");
  }
}

/* Renaming a set, once, for every term in it. Doing it row by row is how half a set ends up
   under the old name and the other half under the new one — and neither is then a full lesson. */
function renameTermSet(oldName, newName){
  const name=String(newName||"").trim();
  if(name===oldName){ return; }
  const clash=diThemes(TERMS.list).indexOf(name);
  if(name && clash>=0 &&
     !confirm(t("terms.merge_sets_confirm",
       "\u201c{name}\u201d already exists. Merge these {count} terms into it?",
       { name:name, count:termIndexesIn(oldName).length }))){ renderTermList(); return; }
  termIndexesIn(oldName).forEach(i=>{ TERMS.list[i].theme=name; });
  TERMS.lastTheme=name;
  renderTermList();
}

/* Emptying a set takes its terms with it, so the confirmation says how many. */
function removeTermSet(name){
  const rows=termIndexesIn(name);
  if(!rows.length) return;
  if(!confirm(t("terms.delete_set_terms_confirm",
    "Remove \u201c{name}\u201d and the {count} {terms} in it?",
    { name: name || t("terms.no_set", "No set"), count:rows.length,
      terms: plural(rows.length, t("di.term", "term"), t("di.terms", "terms")) }))) return;
  TERMS.list = TERMS.list.filter(tm=>String(tm.theme||"").trim()!==name);
  if(!TERMS.list.length) TERMS.list=[blankTerm()];
  renderTermList();
}

function addTermTo(name){
  const tm=blankTerm();
  tm.theme=name;
  // Straight after the last row of that set, so it appears where the teacher was looking.
  const rows=termIndexesIn(name);
  const at=rows.length ? rows[rows.length-1]+1 : TERMS.list.length;
  TERMS.list.splice(at, 0, tm);
  TERMS.lastTheme=name;
  renderTermList();
}

/* Moving a term between sets, including into one that does not exist yet — a term that turns out
   to belong somewhere else is the commonest edit there is, and retyping the set name on the row
   is only one typo away from making a second set with almost the same name. */
function moveTermToSet(i, value){
  const tm=TERMS.list[i]; if(!tm) return;
  if(value==="__new__"){
    const name=prompt(t("terms.name_the_new_set", "Name the new set:"), "");
    if(name===null){ renderTermList(); return; }
    tm.theme=String(name).trim();
  } else tm.theme=value;
  TERMS.lastTheme=tm.theme;
  renderTermList();
}

function addTerm(){ TERMS.list.push(blankTerm()); renderTermList(); }

/* A new, empty set. An area is written set by set, so this is the button a teacher reaches for
   first — "+ Term" without a set to put it in is the wrong shape. */
function addTermSet(){
  const name=prompt(t("terms.name_the_new_set", "Name the new set:"), "");
  if(name===null) return;
  const clean=String(name).trim();
  if(clean && diThemes(TERMS.list).indexOf(clean)>=0){
    alert(t("terms.set_already_exists", "\u201c{name}\u201d is already a set in this area.", {name:clean}));
    return;
  }
  const tm=blankTerm(); tm.theme=clean;
  TERMS.list.push(tm);
  TERMS.lastTheme=clean;
  renderTermList();
}

function deleteTerm(i){
  if(TERMS.list.length<=1){ alert(t("terms.area_needs_one_term", "An area needs at least one term.")); return; }
  TERMS.list.splice(i,1);
  renderTermList();
}

function setTermsLang(){
  TERMS.lang=document.getElementById("di-set-lang").value==="fr" ? "fr" : "en";
  TERMS.list.forEach(tm=>{ tm.lang=TERMS.lang; });
}

/* ---------- saving ---------- */

/* Two things make a pack unplayable rather than merely unfinished, so both are named before a
   class finds them: a term with nothing in it, and a forbidden word that contains the term (or
   the other way round), which leaves the describer nothing legal to say. */
function termProblems(list){
  const out=[];
  /* A duplicate is a duplicate WITHIN A SET, not within the area. An area holds several sets and
     a lesson plays one of them, so "forecast" belongs in both Money and numbers and Reports and
     trends — and the first draft of the real packs was full of exactly that. Flagging it as an
     error would have pushed a genuine word out of a lesson it belongs in. The same term twice in
     one set is still wrong: that pair would meet it twice in one round. */
  const seen={}, across={};
  (list||[]).forEach((tm,i)=>{
    const where=t("terms.where", "Term {n}: ", {n:i+1});
    const word=String(tm.term||"").trim();
    if(!word){ out.push(where+t("terms.is_empty", "is empty.")); return; }
    const set=String(tm.theme||"").trim();
    const key=set.toLowerCase()+"\u0000"+word.toLowerCase();
    if(seen[key]) out.push(where+t("terms.is_a_duplicate",
      "\u201c{term}\u201d appears twice in the same set.", {term:word}));
    seen[key]=true;
    (across[word.toLowerCase()]=across[word.toLowerCase()]||[]).push(set);
    // The overlap test is against the WORD, not the key — the key now carries the set name too,
    // and comparing against that would have quietly stopped this check finding anything.
    const bare=word.toLowerCase();
    diForbidden(tm).forEach(w=>{
      const lw=w.toLowerCase();
      if(lw===bare || bare.indexOf(lw)>=0 || lw.indexOf(bare)>=0)
        out.push(where+t("terms.forbidden_contains_term",
          "“{word}” overlaps the term itself, so there is nothing left to say.", {word:w}));
    });
    const n=diForbidden(tm).length;
    if(n>DI_MAX_FORBIDDEN)
      out.push(where+t("terms.too_many_forbidden", "more than {n} forbidden words.", {n:DI_MAX_FORBIDDEN}));
    /* Not an error: a thin term still plays. But it is invisible until a teacher turns the
       difficulty up and finds that item has quietly become the easy one. */
    else if(n<DI_MAX_FORBIDDEN)
      out.push(where+t("terms.thin_forbidden",
        "only {n} forbidden words \u2014 it will be the easy one when the class plays at four.", {n:n}));
    if(!String(tm.theme||"").trim())
      out.push(where+t("terms.no_set_named", "no set, so it can only be played as part of the whole area."));
  });
  /* Worth saying, never worth blocking: a class that plays both sets meets it twice. */
  Object.keys(across).forEach(word=>{
    const sets=[...new Set(across[word])].filter(Boolean);
    if(sets.length>1) out.push(t("terms.in_several_sets",
      "\u201c{term}\u201d is in {count} sets ({list}) \u2014 fine, unless you play them in the same lesson.",
      { term:word, count:sets.length, list:sets.join(", ") }));
  });
  return out;
}

async function saveTermSet(){
  TERMS.name=document.getElementById("di-set-name").value.trim();
  setTermsLang();
  readTermSchools();
  if(!TERMS.name){ alert(t("terms.give_area_name", "Give the area a name \u2014 Business language, General English, and so on.")); return; }
  if(!TERMS.schools.length){ alert(t("terms.tick_least_one_school", "Tick at least one school, or teachers won't find it.")); return; }
  // Empty rows at the bottom are the normal end of typing, not a mistake worth a dialogue.
  TERMS.list = TERMS.list.filter(tm=>String(tm.term||"").trim());
  if(!TERMS.list.length){ alert(t("terms.area_needs_one_term", "An area needs at least one term.")); TERMS.list=[blankTerm()]; renderTermList(); return; }
  const problems=termProblems(TERMS.list);
  if(problems.length){
    if(!confirm(t("terms.pack_isn_t_finished", "This pack isn’t finished:\n\n")+problems.slice(0,8).join("\n")+
      (problems.length>8 ? "\n"+t("scenarios.and_n_more", "…and {n} more", {n:problems.length-8}) : "")+
      "\n\n"+t("scenarios.save_it_anyway", "Save it anyway?"))) return;
  }
  const key=TERMS.key || quizKey(TERMS.name);
  try{ await Backend.saveQuiz(key, TERMS.name, TERMS.list, TERMS.schools, "describeit"); }
  catch(e){ alert(t("terms.couldn_t_save", "Couldn't save: ")+e.message); return; }
  TERMS.key=key; markTermsSaved();
  await loadQuizList();
  alert(t("terms.saved", "Saved “")+TERMS.name+"”.");
  showScreen("screen-admin");
}

function leaveTermEditor(){
  if(termsAreDirty() &&
     !confirm(t("terms.leave_without_saving", "Leave without saving?\n\nNothing is kept until you press Save Area."))) return;
  showScreen("screen-admin");
}

/* ---------- Excel ---------- */

function importTermsFromExcel(){
  if(typeof XLSX==="undefined"){ alert(t("scenarios.excel_library_didn_t_load_needs", "Excel library didn't load (needs internet).")); return; }
  const input=document.createElement("input"); input.type="file"; input.accept=".xlsx,.xls,.csv";
  input.onchange=e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const wb=XLSX.read(ev.target.result,{type:"array"});
        const name=wb.SheetNames.indexOf("Terms")>=0?"Terms":wb.SheetNames[0];
        const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{defval:""});
        const {terms,errors,lang}=parseTermRows(rows);
        if(!terms.length){
          alert(t("terms.no_terms_found", "No terms found.\n\n")+(errors.join("\n")||
            t("terms.sheet_shape_hint", "The sheet needs a Set column, a Term column, and up to four Forbidden columns.")));
          return;
        }
        const onlyBlank = TERMS.list.every(tm=>!String(tm.term||"").trim());
        TERMS.list = onlyBlank ? terms : TERMS.list.concat(terms);
        TERMS.lang = lang || TERMS.lang || "en";
        renderTermList();
        alert(t("terms.imported_n", "Imported {count} {terms}.",
          { count:terms.length, terms: plural(terms.length, t("di.term", "term"), t("di.terms", "terms")) })
        + (errors.length ? "\n\n"+t("scenarios.skipped", "Skipped:")+"\n"+errors.join("\n") : ""));
      }catch(err){ alert(t("import.couldn_t_read_file", "Couldn't read that file: ")+err.message); }
    };
    reader.readAsArrayBuffer(file);
  };
  input.click();
}
