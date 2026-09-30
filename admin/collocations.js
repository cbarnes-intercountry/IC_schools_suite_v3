/* ============================================================================
   Classroom Exam App — admin/collocations.js
   Part of index.html's script, new in v3.13. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Writing collocation packs for Word Partners.

   A card is a head word, the kind of partner wanted, and the list of partners. Stored like every
   other set — same library, kind "partners" — so the backend did not have to change.

   The same thin editor as the other two, and the same reason: thirty cards with six partners each
   is an evening's work, so Excel is the intended route in and this screen is for fixing the two
   that came out wrong.

   `theme` is still the field name in the data, because that is what the set helpers in core read.
   The word on the screen is "set". */

let COLL = { key:null, name:"", list:[], lang:"en", lastTheme:"", clean:"" };

function collFingerprint(){ return JSON.stringify({ n:COLL.name, l:COLL.list, g:COLL.lang }); }
function markCollSaved(){ COLL.clean = collFingerprint(); }
function collAreDirty(){
  return isScreenActive("screen-wp-editor") && collFingerprint() !== COLL.clean;
}

function blankCard(){ return { id:"wc_"+uid(6), head:"", pattern:WP_DEFAULT_PATTERN, partners:[],
                               theme:COLL.lastTheme||"", lang:COLL.lang||"en" }; }

async function newCollocationSet(){
  COLL = { key:null, name:"", list:[], lang:"en", lastTheme:"", clean:"" };
  COLL.list=[blankCard(),blankCard(),blankCard()];
  renderCollocationList(); markCollSaved();
  showScreen("screen-wp-editor");
}

async function loadCollocationSet(){
  const key=document.getElementById("wp-library-select").value;
  if(!key){ alert(t("coll.pick_saved_pack_first", "Pick a saved area first.")); return; }
  let rec=null;
  try{ rec=await Backend.getQuiz(key); }catch(e){ alert(t("coll.couldn_t_load", "Couldn't load it: ")+e.message); return; }
  if(!rec){ alert(t("coll.pack_gone", "That area has gone.")); return; }
  COLL = { key:key, name:rec.name||"", list:(rec.questions||[]).slice(),
           lang:((rec.questions||[])[0]||{}).lang||"en", lastTheme:"", clean:"" };
  if(!COLL.list.length) COLL.list=[blankCard()];
  renderCollocationList(); markCollSaved();
  showScreen("screen-wp-editor");
}

async function deleteCollocationSet(){
  if(!requireOwner(t("coll.action_delete_area", "delete a saved area"))) return;
  const sel=document.getElementById("wp-library-select");
  const key=sel.value; if(!key){ alert(t("coll.pick_saved_pack_first", "Pick a saved area first.")); return; }
  if(!confirm(t("coll.delete_set_confirm", "Delete “{name}” for good?", {name:sel.options[sel.selectedIndex].text}))) return;
  try{ await Backend.deleteQuiz(key); }catch(e){ alert(t("coll.couldn_t_delete", "Couldn't delete it: ")+e.message); return; }
  await loadQuizList();
}

function collSetsInOrder(){
  const names=setsIn(COLL.list);
  const loose=COLL.list.some(c=>!String(c.theme||"").trim());
  return loose ? names.concat([""]) : names;
}
function collIndexesIn(name){
  const out=[];
  COLL.list.forEach((c,i)=>{ if(String(c.theme||"").trim()===name) out.push(i); });
  return out;
}

function renderCollocationList(){
  const box=document.getElementById("wp-card-list");
  if(!box) return;
  let html="";
  collSetsInOrder().forEach(name=>{
    const rows=collIndexesIn(name);
    html += '<div class="di-theme-head">'+
      '<input type="text" class="di-setname-in" value="'+escapeHtml(name)+'" '+
        'placeholder="'+escapeHtml(t("coll.ph.set_name", "set name"))+'" '+
        'onchange="renameCollocationSet('+JSON.stringify(name).replace(/"/g,"&quot;")+',this.value)">'+
      '<span class="di-set-count">'+rows.length+'</span>'+
      '<button class="btn-outline btn-sm" onclick="addCardTo('+JSON.stringify(name).replace(/"/g,"&quot;")+')" '+
        'title="'+escapeHtml(t("coll.ti.add_here", "Add a word to this set"))+'">+</button>'+
      '<button class="btn-outline btn-sm" onclick="removeCollocationSet('+JSON.stringify(name).replace(/"/g,"&quot;")+')" '+
        'title="'+escapeHtml(t("coll.ti.remove_set", "Remove this set and its words"))+'">×</button>'+
      '</div>';
    rows.forEach((i,k)=>{
      const c=COLL.list[i];
      const n=wpPartners(c).length;
      const thin=n < WP_MIN_PARTNERS;
      html += '<div class="di-termrow'+(thin?" di-termrow-thin":"")+'">'+
        '<div class="di-termrow-top">'+
          '<span class="qrow-no">'+(k+1)+'</span>'+
          '<input type="text" class="di-term-in" value="'+escapeHtml(c.head||"")+'" '+
            'placeholder="'+escapeHtml(t("coll.ph.head", "the word, e.g. a deadline"))+'" '+
            'oninput="setCardField('+i+',\'head\',this.value)">'+
          '<select class="di-move-in" onchange="moveCardToSet('+i+',this.value)" '+
            'title="'+escapeHtml(t("coll.ti.move", "Move this word to another set"))+'">'+
            collSetsInOrder().map(x=>'<option value="'+escapeHtml(x)+'"'+(x===name?" selected":"")+'>'+
              escapeHtml(x || t("coll.no_set", "No set"))+'</option>').join("")+
            '<option value="__new__">'+escapeHtml(t("coll.new_set", "New set…"))+'</option>'+
          '</select>'+
          '<button class="btn-outline btn-sm" onclick="deleteCard('+i+')" '+
            'title="'+escapeHtml(t("coll.ti.remove", "Remove this word"))+'">×</button>'+
        '</div>'+
        '<div class="di-termrow-forbid">'+
          '<select class="tq-cat-in" onchange="setCardField('+i+',\'pattern\',this.value)">'+
            WP_PATTERNS.map(pt=>'<option value="'+pt+'"'+(wpPattern(c)===pt?" selected":"")+'>'+
              escapeHtml(wpPatternLabel(pt))+'</option>').join("")+
          '</select>'+
          '<input type="text" class="tq-hint-in" value="'+escapeHtml(wpPartners(c).join("; "))+'" '+
            'placeholder="'+escapeHtml(t("coll.ph.partners", "partners, separated by semicolons"))+'" '+
            'oninput="setCardPartners('+i+',this.value)">'+
          '<span class="wp-count-in mono">'+n+'</span>'+
        '</div>'+
        '</div>';
    });
  });
  box.innerHTML = html || '<p class="sub">'+t("coll.pack_is_empty", "This area has no sets yet.")+'</p>';
  const nm=document.getElementById("wp-set-name"); if(nm) nm.value=COLL.name;
  const lg=document.getElementById("wp-set-lang"); if(lg) lg.value=COLL.lang||"en";
  const cEl=document.getElementById("wp-card-count");
  if(cEl) cEl.textContent = t("wp.n_cards", "{count} {cards}",
    { count:COLL.list.length, cards: plural(COLL.list.length, t("wp.card", "word"), t("wp.cards", "words")) });
  const th=document.getElementById("wp-theme-summary");
  if(th){
    const sets=setsIn(COLL.list);
    const total=COLL.list.reduce((n,c)=>n+wpPartners(c).length, 0);
    const thin=COLL.list.filter(c=>wpPartners(c).length < WP_MIN_PARTNERS).length;
    th.textContent = (sets.length
        ? t("coll.n_sets", "{count} {sets}: {list}",
            { count:sets.length, list:sets.join(", "),
              sets: plural(sets.length, t("coll.set", "set"), t("coll.sets", "sets")) })
        : t("coll.no_sets_yet", "No sets yet."))
      + " · " + t("coll.n_partners_in_all", "{n} partners in all", {n:total})
      + (thin ? " · " + t("coll.n_thin", "{n} with fewer than {min}", {n:thin, min:WP_MIN_PARTNERS}) : "");
  }
}

function setCardField(i, field, value){
  const c=COLL.list[i]; if(!c) return;
  c[field]=value;
}

function setCardPartners(i, value){
  const c=COLL.list[i]; if(!c) return;
  c.partners=String(value||"").split(";").map(x=>x.trim()).filter(Boolean);
  /* The count beside the box, without redrawing the row the teacher is typing in — a re-render
     here would move the caret to the end of the field on every keystroke. */
  const box=document.getElementById("wp-card-list");
  if(!box) return;
  const spans=box.querySelectorAll ? box.querySelectorAll(".wp-count-in") : null;
  if(spans && spans[i]) spans[i].textContent=String(wpPartners(c).length);
}

function renameCollocationSet(oldName, newName){
  const name=String(newName||"").trim();
  if(name===oldName){ return; }
  const clash=setsIn(COLL.list).indexOf(name);
  if(name && clash>=0 &&
     !confirm(t("coll.merge_sets_confirm",
       "“{name}” already exists. Merge these {count} words into it?",
       { name:name, count:collIndexesIn(oldName).length }))){ renderCollocationList(); return; }
  collIndexesIn(oldName).forEach(i=>{ COLL.list[i].theme=name; });
  COLL.lastTheme=name;
  renderCollocationList();
}

function removeCollocationSet(name){
  const rows=collIndexesIn(name);
  if(!rows.length) return;
  if(!confirm(t("coll.delete_set_cards_confirm",
    "Remove “{name}” and the {count} {cards} in it?",
    { name: name || t("coll.no_set", "No set"), count:rows.length,
      cards: plural(rows.length, t("wp.card", "word"), t("wp.cards", "words")) }))) return;
  COLL.list = COLL.list.filter(c=>String(c.theme||"").trim()!==name);
  if(!COLL.list.length) COLL.list=[blankCard()];
  renderCollocationList();
}

function addCardTo(name){
  const c=blankCard();
  c.theme=name;
  const rows=collIndexesIn(name);
  const at=rows.length ? rows[rows.length-1]+1 : COLL.list.length;
  COLL.list.splice(at, 0, c);
  COLL.lastTheme=name;
  renderCollocationList();
}

function moveCardToSet(i, value){
  const c=COLL.list[i]; if(!c) return;
  if(value==="__new__"){
    const name=prompt(t("coll.name_the_new_set", "Name the new set:"), "");
    if(name===null){ renderCollocationList(); return; }
    c.theme=String(name).trim();
  } else c.theme=value;
  COLL.lastTheme=c.theme;
  renderCollocationList();
}

function addCard(){ COLL.list.push(blankCard()); renderCollocationList(); }

function addCollocationSet(){
  const name=prompt(t("coll.name_the_new_set", "Name the new set:"), "");
  if(name===null) return;
  const clean=String(name).trim();
  if(clean && setsIn(COLL.list).indexOf(clean)>=0){
    alert(t("coll.set_already_exists", "“{name}” is already a set in this area.", {name:clean}));
    return;
  }
  const c=blankCard(); c.theme=clean;
  COLL.list.push(c);
  COLL.lastTheme=clean;
  renderCollocationList();
}

function deleteCard(i){
  if(COLL.list.length<=1){ alert(t("coll.area_needs_one_card", "An area needs at least one word.")); return; }
  COLL.list.splice(i,1);
  renderCollocationList();
}

function setCollocationsLang(){
  COLL.lang=document.getElementById("wp-set-lang").value==="fr" ? "fr" : "en";
  COLL.list.forEach(c=>{ c.lang=COLL.lang; });
}

/* ---------- saving ---------- */

function collocationProblems(list){
  const out=[];
  const seen={}, across={};
  (list||[]).forEach((c,i)=>{
    const where=t("coll.where", "Word {n}: ", {n:i+1});
    const head=wpHead(c);
    if(!head){ out.push(where+t("coll.is_empty", "is empty.")); return; }
    const set=String(c.theme||"").trim();
    const key=set.toLowerCase()+"\u0000"+wpNormalise(head);
    if(seen[key]) out.push(where+t("coll.is_a_duplicate",
      "“{head}” appears twice in the same set.", {head:head}));
    seen[key]=true;
    (across[wpNormalise(head)]=across[wpNormalise(head)]||[]).push(set);

    const partners=wpPartners(c);
    if(partners.length < WP_MIN_PARTNERS){
      out.push(where+t("coll.too_few_partners",
        "only {n} {partners} — fewer than {min} is over before it starts.",
        { n:partners.length, min:WP_MIN_PARTNERS,
          partners: plural(partners.length, t("wp.partner", "partner"), t("wp.partners", "partners")) }));
    }
    if((c.partners||[]).length > WP_MAX_PARTNERS){
      out.push(where+t("coll.too_many_partners",
        "more than {max} partners — the rest are dropped, because a longer list scrolls on a phone.",
        {max:WP_MAX_PARTNERS}));
    }
    /* The same word twice on one card is two taps for one answer, which quietly doubles a pair's
       score on that card. */
    const dupe={};
    partners.forEach(p=>{
      const k=wpNormalise(p);
      if(dupe[k]) out.push(where+t("coll.partner_twice",
        "“{word}” is listed twice.", {word:p}));
      dupe[k]=true;
      /* A partner that IS the head is not a collocation, it is the word again. */
      if(k===wpNormalise(head)) out.push(where+t("coll.partner_is_head",
        "“{word}” is the word itself, not a partner for it.", {word:p}));
    });
    if(!String(c.theme||"").trim())
      out.push(where+t("coll.no_set_named", "no set, so it can only be played as part of the whole area."));
  });
  Object.keys(across).forEach(word=>{
    const sets=[...new Set(across[word])].filter(Boolean);
    if(sets.length>1) out.push(t("coll.in_several_sets",
      "“{head}” is in {count} sets ({list}) — fine, unless you play them in the same lesson.",
      { head:word, count:sets.length, list:sets.join(", ") }));
  });
  return out;
}

async function saveCollocationSet(){
  COLL.name=document.getElementById("wp-set-name").value.trim();
  setCollocationsLang();
  if(!COLL.name){ alert(t("coll.give_area_name", "Give the area a name — Business core, Insurance and banking, and so on.")); return; }
  COLL.list = COLL.list.filter(c=>wpHead(c));
  if(!COLL.list.length){ alert(t("coll.area_needs_one_card", "An area needs at least one word.")); COLL.list=[blankCard()]; renderCollocationList(); return; }
  const problems=collocationProblems(COLL.list);
  if(problems.length){
    if(!confirm(t("coll.pack_isn_t_finished", "This pack isn’t finished:\n\n")+problems.slice(0,8).join("\n")+
      (problems.length>8 ? "\n"+t("scenarios.and_n_more", "…and {n} more", {n:problems.length-8}) : "")+
      "\n\n"+t("scenarios.save_it_anyway", "Save it anyway?"))) return;
  }
  const key=COLL.key || quizKey(COLL.name);
  try{ await Backend.saveQuiz(key, COLL.name, COLL.list, [], "partners"); }
  catch(e){ alert(t("coll.couldn_t_save", "Couldn't save: ")+e.message); return; }
  COLL.key=key; markCollSaved();
  await loadQuizList();
  alert(t("coll.saved", "Saved “")+COLL.name+"”.");
  showScreen("screen-admin");
}

function leaveCollocationEditor(){
  if(collAreDirty() &&
     !confirm(t("coll.leave_without_saving", "Leave without saving?\n\nNothing is kept until you press Save Area."))) return;
  showScreen("screen-admin");
}

/* ---------- Excel ---------- */

function importCollocationsFromExcel(){
  if(typeof XLSX==="undefined"){ alert(t("scenarios.excel_library_didn_t_load_needs", "Excel library didn't load (needs internet).")); return; }
  const input=document.createElement("input"); input.type="file"; input.accept=".xlsx,.xls,.csv";
  input.onchange=e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const wb=XLSX.read(ev.target.result,{type:"array"});
        const name=wb.SheetNames.indexOf("Partners")>=0?"Partners":wb.SheetNames[0];
        const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{defval:""});
        const {cards,errors,lang}=parseCollocationRows(rows);
        if(!cards.length){
          alert(t("coll.no_cards_found", "No words found.\n\n")+(errors.join("\n")||
            t("coll.sheet_shape_hint", "The sheet needs a Set column, a Word column, a Partners column and a Pattern column.")));
          return;
        }
        const onlyBlank = COLL.list.every(c=>!wpHead(c));
        COLL.list = onlyBlank ? cards : COLL.list.concat(cards);
        COLL.lang = lang || COLL.lang || "en";
        renderCollocationList();
        alert(t("coll.imported_n", "Imported {count} {cards}.",
          { count:cards.length, cards: plural(cards.length, t("wp.card", "word"), t("wp.cards", "words")) })
        + (errors.length ? "\n\n"+t("scenarios.skipped", "Skipped:")+"\n"+errors.join("\n") : ""));
      }catch(err){ alert(t("import.couldn_t_read_file", "Couldn't read that file: ")+err.message); }
    };
    reader.readAsArrayBuffer(file);
  };
  input.click();
}
