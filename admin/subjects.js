/* ============================================================================
   Classroom Exam App — admin/subjects.js
   Part of index.html's script, new in v3.11. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Writing subject packs for Twenty Questions.

   A pack is a list of subjects, each with a category and one hint. Stored like every other set —
   same library, kind "twentyq" — so the backend did not have to change.

   The same thin editor as the Describe It one, for the same reason: thirty-six subjects typed one
   at a time is an evening's work, so Excel is the intended route in and this screen is for fixing
   the two that came out wrong.

   `theme` is still the field name in the data, because that is what every other pack uses and the
   set helpers in core read it. The word on the screen is "set". */

let SUBJ = { key:null, name:"", list:[], lang:"en", lastTheme:"", clean:"" };

function subjFingerprint(){ return JSON.stringify({ n:SUBJ.name, l:SUBJ.list, g:SUBJ.lang }); }
function markSubjSaved(){ SUBJ.clean = subjFingerprint(); }
function subjAreDirty(){
  return isScreenActive("screen-tq-editor") && subjFingerprint() !== SUBJ.clean;
}

function blankSubject(){ return { id:"sj_"+uid(6), subject:"", category:"Object", hint:"",
                                  facts:[], born:"", died:"",
                                  theme:SUBJ.lastTheme||"", lang:SUBJ.lang||"en" }; }

async function newSubjectSet(){
  SUBJ = { key:null, name:"", list:[], lang:"en", lastTheme:"", clean:"" };
  SUBJ.list=[blankSubject(),blankSubject(),blankSubject()];
  renderSubjectList(); markSubjSaved();
  showScreen("screen-tq-editor");
}

async function loadSubjectSet(){
  const key=document.getElementById("tq-library-select").value;
  if(!key){ alert(t("subjects.pick_saved_pack_first", "Pick a saved area first.")); return; }
  let rec=null;
  try{ rec=await Backend.getQuiz(key); }catch(e){ alert(t("subjects.couldn_t_load", "Couldn't load it: ")+e.message); return; }
  if(!rec){ alert(t("subjects.pack_gone", "That area has gone.")); return; }
  SUBJ = { key:key, name:rec.name||"", list:(rec.questions||[]).slice(),
           lang:((rec.questions||[])[0]||{}).lang||"en", lastTheme:"", clean:"" };
  if(!SUBJ.list.length) SUBJ.list=[blankSubject()];
  renderSubjectList(); markSubjSaved();
  showScreen("screen-tq-editor");
}

async function deleteSubjectSet(){
  if(!requireOwner(t("subjects.action_delete_area", "delete a saved area"))) return;
  const sel=document.getElementById("tq-library-select");
  const key=sel.value; if(!key){ alert(t("subjects.pick_saved_pack_first", "Pick a saved area first.")); return; }
  if(!confirm(t("subjects.delete_set_confirm", "Delete “{name}” for good?", {name:sel.options[sel.selectedIndex].text}))) return;
  try{ await Backend.deleteQuiz(key); }catch(e){ alert(t("subjects.couldn_t_delete", "Couldn't delete it: ")+e.message); return; }
  await loadQuizList();
}

function subjSetsInOrder(){
  const names=setsIn(SUBJ.list);
  const loose=SUBJ.list.some(sj=>!String(sj.theme||"").trim());
  return loose ? names.concat([""]) : names;
}
function subjIndexesIn(name){
  const out=[];
  SUBJ.list.forEach((sj,i)=>{ if(String(sj.theme||"").trim()===name) out.push(i); });
  return out;
}

function renderSubjectList(){
  const box=document.getElementById("tq-subject-list");
  if(!box) return;
  let html="";
  subjSetsInOrder().forEach(name=>{
    const rows=subjIndexesIn(name);
    html += '<div class="di-theme-head">'+
      '<input type="text" class="di-setname-in" value="'+escapeHtml(name)+'" '+
        'placeholder="'+escapeHtml(t("subjects.ph.set_name", "set name"))+'" '+
        'onchange="renameSubjectSet('+JSON.stringify(name).replace(/"/g,"&quot;")+',this.value)">'+
      '<span class="di-set-count">'+rows.length+'</span>'+
      '<button class="btn-outline btn-sm" onclick="addSubjectTo('+JSON.stringify(name).replace(/"/g,"&quot;")+')" '+
        'title="'+escapeHtml(t("subjects.ti.add_here", "Add a subject to this set"))+'">+</button>'+
      '<button class="btn-outline btn-sm" onclick="removeSubjectSet('+JSON.stringify(name).replace(/"/g,"&quot;")+')" '+
        'title="'+escapeHtml(t("subjects.ti.remove_set", "Remove this set and its subjects"))+'">×</button>'+
      '</div>';
    rows.forEach((i,k)=>{
      const sj=SUBJ.list[i];
      const thin=!String(sj.hint||"").trim();
      /* Edited as one line of semicolons rather than five boxes. A person carries five or six
         facts; a five-box row is unreadable on a laptop and impossible on a phone, and the sheet
         uses the same separator, so what a teacher types here matches what they typed there. */
      const factsLine=tqFacts(sj).join("; ");
      html += '<div class="di-termrow'+(thin?" di-termrow-thin":"")+'">'+
        '<div class="di-termrow-top">'+
          '<span class="qrow-no">'+(k+1)+'</span>'+
          '<input type="text" class="di-term-in" value="'+escapeHtml(sj.subject||"")+'" '+
            'placeholder="'+escapeHtml(t("subjects.ph.subject", "subject"))+'" oninput="setSubjectField('+i+',\'subject\',this.value)">'+
          '<select class="di-move-in" onchange="moveSubjectToSet('+i+',this.value)" '+
            'title="'+escapeHtml(t("subjects.ti.move", "Move this subject to another set"))+'">'+
            subjSetsInOrder().map(n=>'<option value="'+escapeHtml(n)+'"'+(n===name?" selected":"")+'>'+
              escapeHtml(n || t("subjects.no_set", "No set"))+'</option>').join("")+
            '<option value="__new__">'+escapeHtml(t("subjects.new_set", "New set…"))+'</option>'+
          '</select>'+
          '<button class="btn-outline btn-sm" onclick="deleteSubject('+i+')" '+
            'title="'+escapeHtml(t("subjects.ti.remove", "Remove this subject"))+'">×</button>'+
        '</div>'+
        '<div class="di-termrow-forbid">'+
          '<select class="tq-cat-in" onchange="setSubjectField('+i+',\'category\',this.value)">'+
            TQ_CATEGORIES.map(c=>'<option value="'+c+'"'+(tqCategory(sj)===c?" selected":"")+'>'+
              escapeHtml(t("tq.cat_"+c.toLowerCase(), c))+'</option>').join("")+
          '</select>'+
          '<input type="text" class="tq-hint-in" value="'+escapeHtml(sj.hint||"")+'" '+
            'placeholder="'+escapeHtml(t("subjects.ph.hint", "one hint — re-open the question, don’t answer it"))+'" '+
            'oninput="setSubjectField('+i+',\'hint\',this.value)">'+
        '</div>'+
        '<div class="di-termrow-forbid tq-factsrow">'+
          '<input type="text" class="tq-year-in" value="'+escapeHtml(String(sj.born||""))+'" '+
            'inputmode="numeric" placeholder="'+escapeHtml(t("subjects.ph.born", "born"))+'" '+
            'oninput="setSubjectField('+i+',\'born\',this.value)">'+
          '<input type="text" class="tq-year-in" value="'+escapeHtml(String(sj.died||""))+'" '+
            'inputmode="numeric" placeholder="'+escapeHtml(t("subjects.ph.died", "died"))+'" '+
            'oninput="setSubjectField('+i+',\'died\',this.value)">'+
          '<input type="text" class="tq-facts-in" value="'+escapeHtml(factsLine)+'" '+
            'placeholder="'+escapeHtml(t("subjects.ph.facts", "facts the holder answers from, separated by semicolons"))+'" '+
            'oninput="setSubjectFacts('+i+',this.value)">'+
        '</div>'+
        '</div>';
    });
  });
  box.innerHTML = html || '<p class="sub">'+t("subjects.pack_is_empty", "This area has no sets yet.")+'</p>';
  const nm=document.getElementById("tq-set-name"); if(nm) nm.value=SUBJ.name;
  const lg=document.getElementById("tq-set-lang"); if(lg) lg.value=SUBJ.lang||"en";
  const c=document.getElementById("tq-subject-count");
  if(c) c.textContent = t("tq.n_subjects", "{count} {subjects}",
    { count:SUBJ.list.length, subjects: plural(SUBJ.list.length, t("tq.subject", "subject"), t("tq.subjects", "subjects")) });
  const th=document.getElementById("tq-theme-summary");
  if(th){
    const sets=setsIn(SUBJ.list);
    const noHint=SUBJ.list.filter(sj=>!String(sj.hint||"").trim()).length;
    th.textContent = (sets.length
        ? t("subjects.n_sets", "{count} {sets}: {list}",
            { count:sets.length, list:sets.join(", "),
              sets: plural(sets.length, t("subjects.set", "set"), t("subjects.sets", "sets")) })
        : t("subjects.no_sets_yet", "No sets yet."))
      + (noHint ? " · " + t("subjects.n_without_hints",
          "{n} with no hint", {n:noHint}) : "");
  }
}

function setSubjectField(i, field, value){
  const sj=SUBJ.list[i]; if(!sj) return;
  sj[field]=value;
}

function setSubjectFacts(i, value){
  const sj=SUBJ.list[i]; if(!sj) return;
  sj.facts=String(value||"").split(";").map(x=>x.trim()).filter(Boolean);
}

function renameSubjectSet(oldName, newName){
  const name=String(newName||"").trim();
  if(name===oldName){ return; }
  const clash=setsIn(SUBJ.list).indexOf(name);
  if(name && clash>=0 &&
     !confirm(t("subjects.merge_sets_confirm",
       "“{name}” already exists. Merge these {count} subjects into it?",
       { name:name, count:subjIndexesIn(oldName).length }))){ renderSubjectList(); return; }
  subjIndexesIn(oldName).forEach(i=>{ SUBJ.list[i].theme=name; });
  SUBJ.lastTheme=name;
  renderSubjectList();
}

function removeSubjectSet(name){
  const rows=subjIndexesIn(name);
  if(!rows.length) return;
  if(!confirm(t("subjects.delete_set_subjects_confirm",
    "Remove “{name}” and the {count} {subjects} in it?",
    { name: name || t("subjects.no_set", "No set"), count:rows.length,
      subjects: plural(rows.length, t("tq.subject", "subject"), t("tq.subjects", "subjects")) }))) return;
  SUBJ.list = SUBJ.list.filter(sj=>String(sj.theme||"").trim()!==name);
  if(!SUBJ.list.length) SUBJ.list=[blankSubject()];
  renderSubjectList();
}

function addSubjectTo(name){
  const sj=blankSubject();
  sj.theme=name;
  const rows=subjIndexesIn(name);
  const at=rows.length ? rows[rows.length-1]+1 : SUBJ.list.length;
  SUBJ.list.splice(at, 0, sj);
  SUBJ.lastTheme=name;
  renderSubjectList();
}

function moveSubjectToSet(i, value){
  const sj=SUBJ.list[i]; if(!sj) return;
  if(value==="__new__"){
    const name=prompt(t("subjects.name_the_new_set", "Name the new set:"), "");
    if(name===null){ renderSubjectList(); return; }
    sj.theme=String(name).trim();
  } else sj.theme=value;
  SUBJ.lastTheme=sj.theme;
  renderSubjectList();
}

function addSubject(){ SUBJ.list.push(blankSubject()); renderSubjectList(); }

function addSubjectSet(){
  const name=prompt(t("subjects.name_the_new_set", "Name the new set:"), "");
  if(name===null) return;
  const clean=String(name).trim();
  if(clean && setsIn(SUBJ.list).indexOf(clean)>=0){
    alert(t("subjects.set_already_exists", "“{name}” is already a set in this area.", {name:clean}));
    return;
  }
  const sj=blankSubject(); sj.theme=clean;
  SUBJ.list.push(sj);
  SUBJ.lastTheme=clean;
  renderSubjectList();
}

function deleteSubject(i){
  if(SUBJ.list.length<=1){ alert(t("subjects.area_needs_one_subject", "An area needs at least one subject.")); return; }
  SUBJ.list.splice(i,1);
  renderSubjectList();
}

function setSubjectsLang(){
  SUBJ.lang=document.getElementById("tq-set-lang").value==="fr" ? "fr" : "en";
  SUBJ.list.forEach(sj=>{ sj.lang=SUBJ.lang; });
}

/* ---------- saving ---------- */

/* The rule that matters here is the giveaway. A hint containing a word of its own subject hands
   the pair the answer at exactly the moment the hint is supposed to re-open the question — and it
   is the easiest mistake to make, because the obvious clue is usually a description of the thing
   using the thing's own words. The rest are the same shape as the Describe It checks. */
const SUBJ_STOP = "a an the of to it is in on and or you your they their with for one at".split(" ");

function subjWords(text){
  return String(text||"").toLowerCase().match(/[a-z]+/g)
    ? String(text||"").toLowerCase().match(/[a-z]+/g)
        .filter(w=>w.length>2 && SUBJ_STOP.indexOf(w)<0)
    : [];
}

function subjectProblems(list){
  const out=[];
  const seen={}, across={};
  (list||[]).forEach((sj,i)=>{
    const where=t("subjects.where", "Subject {n}: ", {n:i+1});
    const word=String(sj.subject||"").trim();
    if(!word){ out.push(where+t("subjects.is_empty", "is empty.")); return; }
    const set=String(sj.theme||"").trim();
    const key=set.toLowerCase()+"\u0000"+word.toLowerCase();
    if(seen[key]) out.push(where+t("subjects.is_a_duplicate",
      "“{subject}” appears twice in the same set.", {subject:word}));
    seen[key]=true;
    (across[word.toLowerCase()]=across[word.toLowerCase()]||[]).push(set);

    const hint=String(sj.hint||"").trim();
    if(!hint){
      out.push(where+t("subjects.no_hint",
        "no hint — a pair that stalls on this one has nothing to fall back on."));
    } else {
      const inHint=subjWords(hint);
      subjWords(word).forEach(w=>{
        if(inHint.indexOf(w)>=0) out.push(where+t("subjects.hint_gives_away",
          "the hint contains “{word}”, which gives it away.", {word:w}));
      });
    }

    /* The same giveaway rule, on the facts — and here it is easier to break, because the natural
       way to write a fact is to start from the name: "Gainsbourg wrote songs for Bardot" ends the
       round before the first question. The facts sit in front of the holder for the whole card. */
    const mine=subjWords(word);
    tqFacts(sj).forEach((f,k)=>{
      const inFact=subjWords(f);
      mine.forEach(w=>{
        if(inFact.indexOf(w)>=0) out.push(where+t("subjects.fact_gives_away",
          "fact {n} contains “{word}”, which gives it away.", {n:k+1, word:w}));
      });
    });

    /* A card with no facts is playable only by a holder who already knows the person — which is
       the problem the fact card exists to solve. */
    const born=tqYear(sj.born), died=tqYear(sj.died);
    if(!tqFacts(sj).length && (born || died || tqCategory(sj)==="Person")){
      out.push(where+t("subjects.no_facts",
        "no facts — only a holder who already knows them can answer, which is the thing the card is for."));
    }
    if(born && died && died < born) out.push(where+t("subjects.died_before_born",
      "died in {died} but born in {born}.", {died:died, born:born}));
    if(String(sj.born||"").trim() && !born) out.push(where+t("subjects.born_not_a_year",
      "“{value}” is not a year, so no dates appear on the card.", {value:sj.born}));
    if(String(sj.died||"").trim() && !died) out.push(where+t("subjects.died_not_a_year",
      "“{value}” is not a year, so no dates appear on the card.", {value:sj.died}));
    /* The one fact on a card that expires by itself. Checked when a pack is edited, not only when
       it is built, because the editor is where a teacher fixes it. */
    if(born && !died && (new Date().getFullYear() - born) >= 80)
      out.push(where+t("subjects.check_still_living",
        "shown as living and would be {age} — worth checking before the lesson.",
        {age:new Date().getFullYear()-born}));
    if(!String(sj.theme||"").trim())
      out.push(where+t("subjects.no_set_named", "no set, so it can only be played as part of the whole area."));
  });
  Object.keys(across).forEach(word=>{
    const sets=[...new Set(across[word])].filter(Boolean);
    if(sets.length>1) out.push(t("subjects.in_several_sets",
      "“{subject}” is in {count} sets ({list}) — fine, unless you play them in the same lesson.",
      { subject:word, count:sets.length, list:sets.join(", ") }));
  });
  return out;
}

async function saveSubjectSet(){
  SUBJ.name=document.getElementById("tq-set-name").value.trim();
  setSubjectsLang();
  if(!SUBJ.name){ alert(t("subjects.give_area_name", "Give the area a name — Workplace, Jobs, Everyday, and so on.")); return; }
  SUBJ.list = SUBJ.list.filter(sj=>String(sj.subject||"").trim());
  if(!SUBJ.list.length){ alert(t("subjects.area_needs_one_subject", "An area needs at least one subject.")); SUBJ.list=[blankSubject()]; renderSubjectList(); return; }
  const problems=subjectProblems(SUBJ.list);
  if(problems.length){
    if(!confirm(t("subjects.pack_isn_t_finished", "This pack isn’t finished:\n\n")+problems.slice(0,8).join("\n")+
      (problems.length>8 ? "\n"+t("scenarios.and_n_more", "…and {n} more", {n:problems.length-8}) : "")+
      "\n\n"+t("scenarios.save_it_anyway", "Save it anyway?"))) return;
  }
  const key=SUBJ.key || quizKey(SUBJ.name);
  try{ await Backend.saveQuiz(key, SUBJ.name, SUBJ.list, [], "twentyq"); }
  catch(e){ alert(t("subjects.couldn_t_save", "Couldn't save: ")+e.message); return; }
  SUBJ.key=key; markSubjSaved();
  await loadQuizList();
  alert(t("subjects.saved", "Saved “")+SUBJ.name+"”.");
  showScreen("screen-admin");
}

function leaveSubjectEditor(){
  if(subjAreDirty() &&
     !confirm(t("subjects.leave_without_saving", "Leave without saving?\n\nNothing is kept until you press Save Area."))) return;
  showScreen("screen-admin");
}

/* ---------- Excel ---------- */

function importSubjectsFromExcel(){
  if(typeof XLSX==="undefined"){ alert(t("scenarios.excel_library_didn_t_load_needs", "Excel library didn't load (needs internet).")); return; }
  const input=document.createElement("input"); input.type="file"; input.accept=".xlsx,.xls,.csv";
  input.onchange=e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const wb=XLSX.read(ev.target.result,{type:"array"});
        const name=wb.SheetNames.indexOf("Subjects")>=0?"Subjects":wb.SheetNames[0];
        const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{defval:""});
        const {subjects,errors,lang}=parseSubjectRows(rows);
        if(!subjects.length){
          alert(t("subjects.no_subjects_found", "No subjects found.\n\n")+(errors.join("\n")||
            t("subjects.sheet_shape_hint", "The sheet needs a Set column, a Subject column, a Category column and a Hint column.")));
          return;
        }
        const onlyBlank = SUBJ.list.every(sj=>!String(sj.subject||"").trim());
        SUBJ.list = onlyBlank ? subjects : SUBJ.list.concat(subjects);
        SUBJ.lang = lang || SUBJ.lang || "en";
        renderSubjectList();
        alert(t("subjects.imported_n", "Imported {count} {subjects}.",
          { count:subjects.length, subjects: plural(subjects.length, t("tq.subject", "subject"), t("tq.subjects", "subjects")) })
        + (errors.length ? "\n\n"+t("scenarios.skipped", "Skipped:")+"\n"+errors.join("\n") : ""));
      }catch(err){ alert(t("import.couldn_t_read_file", "Couldn't read that file: ")+err.message); }
    };
    reader.readAsArrayBuffer(file);
  };
  input.click();
}
