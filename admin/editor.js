/* ============================================================================
   Classroom Exam App — admin/editor.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Building and saving a set of questions. */

/* Quizzes and polls are kept in two separate banks so they can't be confused. BUILDER_MODE
   says which bank the builder was opened from; it decides which question types are offered,
   what the save card says, and which list is refreshed afterwards. */
let BUILDER_MODE = "quiz";

const SETLABEL = { quiz:{ one:"quiz", Cap:"Quiz", sel:"quiz-library-select" },
                   poll:{ one:"poll", Cap:"Poll", sel:"poll-library-select" } };


async function loadQuizList(){
  try{
    const r = await Backend.listQuizzes();
    const all = (r.quizzes||[]).sort((a,b)=>a.name.localeCompare(b.name));
    [["quiz","quiz-library-select","— select a saved quiz —"],
     ["poll","poll-library-select","— select a saved poll —"]].forEach(([kind,id,placeholder])=>{
      const sel=document.getElementById(id);
      if(!sel) return;
      sel.innerHTML='<option value="">'+placeholder+'</option>';
      all.filter(q=>(q.kind==="poll"?"poll":"quiz")===kind).forEach(q=>{
        const sc=(q.schools||[]).join(", ");
        const opt=document.createElement("option"); opt.value=q.key;
        opt.textContent = q.name + (sc?" · "+sc:"") + " (" + q.count + " question" + (q.count===1?"":"s") + ")";
        sel.appendChild(opt);
      });
    });
  }catch(e){ console.warn(e); }
}

// Start a brand-new quiz or poll: clear the bank and open the builder in that mode.
/* ---- Unsaved work in the builder ----
   Nothing in the question builder touches the database until "Save Quiz" is pressed, so leaving
   the screen throws away everything since the last save. That is easy to do by accident: Back
   is a single click away from a morning's work.

   Rather than watch every input, the builder takes a fingerprint of its state when it opens and
   after each save, and compares on the way out. That way an edit made anywhere — a typed
   question, a reordered bank, a ticked school, an imported sheet — is noticed, including from
   the code paths that change TEACHER.questions directly without touching a form. */
let BUILDER_CLEAN = "";


function builderFingerprint(){
  const name=(document.getElementById("quiz-save-name")||{}).value||"";
  // The open editor is included, so typing a question and leaving without pressing Add counts.
  const draft=(document.getElementById("qe-text")||{}).value||"";
  let schools=[]; try{ schools=getCheckedSchools(); }catch(e){}
  return JSON.stringify({ mode:BUILDER_MODE, name, draft, schools, questions:TEACHER.questions||[] });
}

function markBuilderSaved(){ BUILDER_CLEAN=builderFingerprint(); }

function builderIsDirty(){
  if(!isScreenActive("screen-admin-builder")) return false;
  return builderFingerprint()!==BUILDER_CLEAN;
}

/* The one exit the app controls itself. The browser's own close/reload warning is handled by
   beforeunload further down — that one can only show the browser's fixed wording. */
function leaveBuilder(target){
  if(builderIsDirty() && !confirm(
      "You have changes that haven't been saved.\n\n"+
      "Leaving now discards them \u2014 nothing is kept until you press \u201cSave "+
      (BUILDER_MODE==="poll"?"Poll":"Quiz")+"\u201d.\n\nLeave without saving?")) return;
  BUILDER_CLEAN="";
  showScreen(target||"screen-admin");
}


function newSet(mode){
  BUILDER_MODE = (mode==="poll") ? "poll" : "quiz";
  TEACHER.questions = [];
  document.getElementById("quiz-save-name").value = "";
  setCheckedSchools([]);
  applyBuilderMode();
  renderQBank();
  showScreen("screen-admin-builder");
  markBuilderSaved();          // a blank builder is not unsaved work
}

function newQuiz(){ newSet("quiz"); }
   // kept: older buttons/bookmarks still work
// Restrict the type dropdown to the current mode, and relabel the save card.
function applyBuilderMode(){
  const poll = BUILDER_MODE==="poll";
  const sel = document.getElementById("qe-type");
  let firstAllowed = null;
  Array.prototype.forEach.call(sel.options, o=>{
    const allowed = (o.getAttribute("data-kind")==="poll") === poll;
    o.hidden = !allowed; o.disabled = !allowed;
    if(allowed && firstAllowed===null) firstAllowed=o.value;
  });
  // If the open question is the wrong kind for this mode, drop to the first legal type.
  if(sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].disabled && firstAllowed) sel.value=firstAllowed;
  document.getElementById("qe-points-wrap").style.display = poll ? "none" : "";   // polls are never marked
  renderTypeChips();   // the chip row follows the bank we just switched to
  document.getElementById("builder-badge").innerHTML = poll ? "Admin &middot; Poll Builder" : "Admin &middot; Question Builder";
  document.getElementById("quiz-save-label").textContent = poll ? "Save as poll" : "Save as quiz";
  document.getElementById("quiz-save-btn-text").textContent = poll ? "Save Poll" : "Save Quiz";
  document.getElementById("quiz-save-name").placeholder = poll ? "e.g. Session 3 — warm-up poll" : "e.g. Marketing Midterm 2026";
  document.getElementById("quiz-save-note").textContent = poll
    ? "Saved to the Poll Creator and launched from Teacher Home with “New Poll”."
    : "Saved to the Test Creator and launched with “Launch Test”.";
}

async function saveQuizToLibrary(){
  const mode = BUILDER_MODE;
  const L = SETLABEL[mode];
  // Commit whatever is open in the editor FIRST. Without this, ticking a box (e.g. "Show
  // results live") and going straight to Save silently discarded that edit.
  if(EDIT_INDEX>=0 && EDIT_INDEX<TEACHER.questions.length && !commitCurrentQuestion()) return;
  const name = document.getElementById("quiz-save-name").value.trim();
  const schools = getCheckedSchools();
  if(!name){ alert("Give the "+L.one+" a name first."); return; }
  if(schools.length===0){ alert("Tick at least one school to assign this "+L.one+" to (manage schools on the Admin page)."); return; }
  if(TEACHER.questions.length===0){ alert("Add or import some questions first."); return; }
  // Belt and braces: the dropdown already hides the wrong types, but an Excel or JSON
  // import can still bring in questions that don't belong in this bank.
  const strays = TEACHER.questions.filter(q=> isPollType(q.type) !== (mode==="poll"));
  if(strays.length){
    alert(mode==="poll"
      ? "A poll can only contain Poll and Word Cloud questions.\n\n"+strays.length+" question(s) here are quiz types — remove them, or save this in the Test Creator instead."
      : "A quiz can't contain Poll or Word Cloud questions — they have no correct answer, so they can't be marked.\n\n"+
        "Remove those "+strays.length+" question(s), or save this in the Poll Creator instead.");
    return;
  }
  try{
    await Backend.saveQuiz(quizKey(name), name, TEACHER.questions, schools, mode);
    markBuilderSaved();     // before leaving, so the exit guard stays quiet
    loadQuizList();
    alert('Saved "'+name+'" for '+schools.join(", ")+' ('+TEACHER.questions.length+' questions).');
    showScreen("screen-admin");
  }catch(e){ alert("Save failed: "+e.message); }
}

// Load a saved set into the builder, prefilling its name + assigned schools.
async function loadSetFromLibrary(mode){
  const L = SETLABEL[mode] || SETLABEL.quiz;
  const key = document.getElementById(L.sel).value;
  if(!key){ alert("Pick a saved "+L.one+" first."); return; }
  try{
    const rec = await Backend.getQuiz(key);
    if(!rec){ alert("That "+L.one+" could not be found."); loadQuizList(); return; }
    BUILDER_MODE = setKind(rec)==="poll" ? "poll" : "quiz";
    TEACHER.questions = (rec.questions||[]).map(q=>Object.assign({},q,{id:q.id||"q_"+uid(6)}));
    document.getElementById("quiz-save-name").value = rec.name || "";
    setCheckedSchools(quizSchools(rec));
    applyBuilderMode();
    renderQBank();
    showScreen("screen-admin-builder");
    markBuilderSaved();        // freshly loaded = nothing changed yet
  }catch(e){ alert("Load failed: "+e.message); }
}

function loadQuizFromLibrary(){ return loadSetFromLibrary("quiz"); }

// Export a saved set as a JSON file (archiving / backup).
async function exportSavedSet(mode){
  const L = SETLABEL[mode] || SETLABEL.quiz;
  const key = document.getElementById(L.sel).value;
  if(!key){ alert("Pick a saved "+L.one+" to export."); return; }
  try{
    const rec = await Backend.getQuiz(key);
    if(!rec){ alert("That "+L.one+" could not be found."); return; }
    const payload = { name:rec.name, kind:setKind(rec), schools:quizSchools(rec), questions:rec.questions||[], exportedAt:new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download = setKind(rec) + "_" + quizKey(rec.name||"set") + ".json"; a.click();
  }catch(e){ alert("Export failed: "+e.message); }
}

function exportSavedQuiz(){ return exportSavedSet("quiz"); }

async function deleteSetFromLibrary(mode){
  if(!requireOwner("delete a saved quiz or poll")) return;
  const L = SETLABEL[mode] || SETLABEL.quiz;
  const sel = document.getElementById(L.sel);
  const key = sel.value;
  if(!key){ alert("Pick a saved "+L.one+" to delete."); return; }
  if(!confirm('Delete saved '+L.one+' "'+sel.options[sel.selectedIndex].textContent+'"?')) return;
  try{ await Backend.deleteQuiz(key); loadQuizList(); }catch(e){ alert("Delete failed: "+e.message); }
}

function deleteQuizFromLibrary(){ return deleteSetFromLibrary("quiz"); }


/* ============ QUESTION BANK (edit-in-place editor) ============ */
let EDIT_INDEX = -1;
 // index into TEACHER.questions currently open in the editor

function renderQBank(){
  document.getElementById("qcount").textContent = TEACHER.questions.length;
  const list = document.getElementById("qbank-list");
  list.innerHTML = "";
  if(TEACHER.questions.length===0){
    list.innerHTML='<p class="sub">No questions yet. Use “+ Add Question”.</p>';
    document.getElementById("qe-card").style.display="none";
    return;
  }
  const TAGS={mcq:"MCQ",tf:"T/F",text:"TEXT",order:"ORDER",poll:"POLL",cloud:"CLOUD"};
  TEACHER.questions.forEach((q,i)=>{
    const div=document.createElement("div");
    div.className="qbank-item"+(i===EDIT_INDEX?" active":"");
    // Commit the open question before jumping to another one, or edits made to it
    // would be thrown away without warning.
    div.onclick=()=>{ if(i!==EDIT_INDEX && EDIT_INDEX>=0 && EDIT_INDEX<TEACHER.questions.length && !commitCurrentQuestion()) return; openQuestionEditor(i); };
    const num=document.createElement("span"); num.className="qnum"; num.textContent=String(i+1).padStart(2,"0");
    const txt=document.createElement("span"); txt.className="qtxt"; txt.textContent=q.text||"(no text yet)";
    const tag=document.createElement("span"); tag.className="qtag"; tag.textContent=TAGS[q.type]||"?";
    div.appendChild(num); div.appendChild(txt);
    // Results are live by default now, so flag the exception instead: a lost tick stays obvious.
    if(isPollType(q.type) && q.hideResults){
      const lv=document.createElement("span"); lv.className="qtag"; lv.textContent="HIDDEN";
      lv.style.background="var(--amber-soft)"; lv.style.borderColor="var(--amber)"; lv.style.color="var(--amber)";
      lv.title="Results stay hidden until you press Reveal";
      div.appendChild(lv);
    }
    div.appendChild(tag);
    list.appendChild(div);
  });
}

function removeQuestion(i){ if(!confirm("Delete this question?")) return; TEACHER.questions.splice(i,1); renderQBank(); }


// Open the editor at index i. With no valid index, append a new blank question and edit that.
function openQuestionEditor(i){
  if(typeof i!=="number" || i<0 || i>=TEACHER.questions.length){
    TEACHER.questions.push(blankQuestion());
    i = TEACHER.questions.length-1;
  }
  EDIT_INDEX = i;
  writeQuestionToForm(TEACHER.questions[i]);
  document.getElementById("qe-counter").textContent = (EDIT_INDEX+1)+" of "+TEACHER.questions.length;
  document.getElementById("qe-card").style.display="block";   // editor lives beside the bank
  renderQBank();
}

function writeQuestionToForm(q){
  document.getElementById("qe-type").value = q.type || "mcq";
  renderTypeChips();
  document.getElementById("qe-text").value = q.text || "";
  document.getElementById("qe-image-url").value = q.image || "";
  document.getElementById("qe-audio-url").value = q.audio || "";
  previewQMedia("image", q.image||"");
  previewQMedia("audio", q.audio||"");
  document.getElementById("qe-image-status").textContent = "";
  document.getElementById("qe-audio-status").textContent = "";
  document.getElementById("qe-points").value = (q.points!==undefined?q.points:1);
  document.getElementById("qe-qtime").value = q.timeLimitSec || 0;
  renderQEditorOptions(q);
}

// Read the form into a question object, or return null (after alerting) if invalid.
function readQuestionFromForm(){
  const type=document.getElementById("qe-type").value;
  const text=document.getElementById("qe-text").value.trim();
  const points=parseFloat(document.getElementById("qe-points").value)||0;
  const timeLimitSec=Math.max(0, parseInt(document.getElementById("qe-qtime").value,10)||0);
  if(!text){ alert("Please enter the question text."); return null; }
  const cur=TEACHER.questions[EDIT_INDEX]||{};
  const q={ id:cur.id||("q_"+uid(6)), type, text, points, timeLimitSec, image:document.getElementById("qe-image-url").value.trim()||null,
              audio:document.getElementById("qe-audio-url").value.trim()||null };
  // The search term and the credit belong to the question, not the form: the term so the
  // picker reopens where it left off, the credit so it travels with the picture it belongs to.
  if(cur.imageSearch) q.imageSearch=cur.imageSearch;
  if(q.image && cur.imageCredit) q.imageCredit=cur.imageCredit;
  if(type==="mcq"){
    const opts=[]; let correctIdx=null;
    document.querySelectorAll("#mcq-opts .opt-row").forEach(row=>{
      const val=row.querySelector("input[type=text]").value.trim();
      const checked=row.querySelector("input[type=radio]").checked;
      if(val){ opts.push(val); if(checked) correctIdx=opts.length-1; }
    });
    if(opts.length<2||correctIdx===null){ alert("Add at least 2 options and select the correct one."); return null; }
    q.options=opts; q.correct=opts[correctIdx];
  } else if(type==="tf"){ q.options=["True","False"]; q.correct=document.getElementById("tf-correct").value; }
  else if(type==="text"){
    const accepted=[]; document.querySelectorAll("#text-answers .qe-answer-row input[type=text]").forEach(inp=>{ const v=inp.value.trim(); if(v) accepted.push(v); });
    if(accepted.length===0){ alert("Add at least one acceptable answer."); return null; }
    q.correct=accepted; q.caseSensitive=document.getElementById("text-casesens").checked;
  }
  else if(type==="order"){
    const items=[]; document.querySelectorAll("#order-items .qe-answer-row input[type=text]").forEach(inp=>{ const v=inp.value.trim(); if(v) items.push(v); });
    if(items.length<2){ alert("Add at least 2 items (in the correct order)."); return null; }
    q.items=items; q.correct=items.slice();
  }
  else if(type==="poll"){
    const opts=[]; document.querySelectorAll("#poll-opts .qe-answer-row input[type=text]").forEach(inp=>{ const v=inp.value.trim(); if(v) opts.push(v); });
    if(opts.length<2){ alert("A poll needs at least 2 choices."); return null; }
    q.options=opts; q.hideResults=document.getElementById("poll-hideresults").checked;
    q.points=0; q.correct=null;   // opinion vote: nothing to mark
  }
  else if(type==="cloud"){
    q.maxWords=Math.max(1,Math.min(3,parseInt(document.getElementById("cloud-maxwords").value,10)||1));
    q.hideResults=document.getElementById("cloud-hideresults").checked;
    q.points=0; q.correct=null;
  }
  return q;
}

function commitCurrentQuestion(){ const q=readQuestionFromForm(); if(!q) return false; TEACHER.questions[EDIT_INDEX]=q; return true; }

function renderTypeChips(){
  const box=document.getElementById("qe-type-chips");
  const sel=document.getElementById("qe-type");
  if(!box||!sel) return;
  const kind = (typeof BUILDER_MODE!=="undefined" && BUILDER_MODE==="poll") ? "poll" : "quiz";
  box.innerHTML="";
  [...sel.options].filter(o=>o.dataset.kind===kind).forEach(o=>{
    const b=document.createElement("button");
    b.type="button";
    b.className="type-chip"+(o.value===sel.value?" on":"");
    b.textContent=TYPE_LABELS[o.value]||o.textContent;
    b.onclick=()=>{ sel.value=o.value; renderTypeChips(); renderQEditorOptions(); };
    box.appendChild(b);
  });
}

function renderQEditorOptions(q){
  q = q || {};
  const type=document.getElementById("qe-type").value;
  const area=document.getElementById("qe-options-area");
  if(type==="mcq"){
    area.innerHTML='<label>Answer options (select the correct one)</label><div id="mcq-opts"></div>'+
      '<button type="button" class="btn-outline" onclick="addMCQOption()">+ Add option</button>';
    if(q.type==="mcq"&&q.options){ q.options.forEach(o=>addMCQOption(o, o===q.correct)); }
    else { addMCQOption(); addMCQOption(); }
  } else if(type==="tf"){
    const c=(q.type==="tf"?q.correct:"True");
    area.innerHTML='<label>Correct answer</label><select id="tf-correct"><option value="True"'+(c==="True"?" selected":"")+'>True</option><option value="False"'+(c==="False"?" selected":"")+'>False</option></select>';
  } else if(type==="text"){
    area.innerHTML='<label>Acceptable answers (any one counts as correct)</label><div id="text-answers"></div>'+
      '<button type="button" class="btn-outline" onclick="addTextAnswer()">+ Add acceptable answer</button>'+
      '<div class="toggle-row" style="margin-top:10px;"><span>Case sensitive (exact match — capitals &amp; special characters must match)</span>'+
      '<label class="switch"><input type="checkbox" id="text-casesens"><span class="slider"></span></label></div>';
    const accepted=(q.type==="text"&&Array.isArray(q.correct))?q.correct:null;
    if(accepted&&accepted.length){ accepted.forEach(a=>addTextAnswer(a)); } else { addTextAnswer(); }
    document.getElementById("text-casesens").checked = (q.type==="text") ? (q.caseSensitive!==false) : true;
    } else if(type==="order"){
    area.innerHTML='<label>Items in the CORRECT order (students see them shuffled and drag to reorder)</label><div id="order-items"></div>'+
      '<button type="button" class="btn-outline" onclick="addOrderItem()">+ Add item</button>';
    const items=(q.type==="order"&&q.items)?q.items:null;
    if(items&&items.length){ items.forEach(it=>addOrderItem(it)); } else { addOrderItem(); addOrderItem(); addOrderItem(); }
  } else if(type==="poll"){
    area.innerHTML='<label>Choices (no correct answer &mdash; this is an opinion vote)</label><div id="poll-opts"></div>'+
      '<button type="button" class="btn-outline" onclick="addPollOption()">+ Add choice</button>'+
      '<div class="toggle-row" style="margin-top:10px;"><span>Hide results until I press Reveal<br><small class="hint">On = the class sees only a response counter until you press Reveal</small></span>'+
      '<label class="switch"><input type="checkbox" id="poll-hideresults"><span class="slider"></span></label></div>';
    const opts=(q.type==="poll"&&q.options)?q.options:null;
    if(opts&&opts.length){ opts.forEach(o=>addPollOption(o)); } else { addPollOption(); addPollOption(); }
    document.getElementById("poll-hideresults").checked = (q.type==="poll") ? !!q.hideResults : false;
  } else if(type==="cloud"){
    const mw=(q.type==="cloud"&&q.maxWords)?q.maxWords:1;
    area.innerHTML='<label>Words per student</label>'+
      '<select id="cloud-maxwords"><option value="1"'+(mw==1?" selected":"")+'>1 word</option>'+
      '<option value="2"'+(mw==2?" selected":"")+'>Up to 2 words</option>'+
      '<option value="3"'+(mw==3?" selected":"")+'>Up to 3 words</option></select>'+
      '<small class="hint">Words are matched ignoring capitals and accents, so &ldquo;Assurance&rdquo; and &ldquo;assurance&rdquo; combine into one entry.</small>'+
      '<div class="toggle-row" style="margin-top:10px;"><span>Hide results until I press Reveal<br><small class="hint">On = the cloud stays hidden until you press Reveal</small></span>'+
      '<label class="switch"><input type="checkbox" id="cloud-hideresults"><span class="slider"></span></label></div>';
    document.getElementById("cloud-hideresults").checked = (q.type==="cloud") ? !!q.hideResults : false;
  }
}

function addPollOption(value){
  const wrap=document.getElementById("poll-opts");
  const row=document.createElement("div"); row.className="qe-answer-row";
  row.innerHTML='<input type="text" placeholder="Choice text"><button type="button" class="btn-outline" style="padding:6px 10px;" onclick="this.parentElement.remove()">x</button>';
  if(value!==undefined) row.querySelector("input[type=text]").value=value;
  wrap.appendChild(row);
}

function addMCQOption(value, checked){
  const wrap=document.getElementById("mcq-opts");
  const row=document.createElement("div"); row.className="opt-row";
  row.innerHTML='<input type="radio" name="mcq-correct"'+(checked?" checked":"")+'><input type="text" placeholder="Option text"><button type="button" class="btn-outline" style="padding:6px 10px;" onclick="this.parentElement.remove()">x</button>';
  if(value!==undefined) row.querySelector("input[type=text]").value=value;
  wrap.appendChild(row);
}

function addTextAnswer(value){
  const wrap=document.getElementById("text-answers");
  const row=document.createElement("div"); row.className="qe-answer-row";
  row.innerHTML='<input type="text" placeholder="Accepted answer"><button type="button" class="btn-outline" style="padding:6px 10px;" onclick="this.parentElement.remove()">x</button>';
  if(value!==undefined) row.querySelector("input[type=text]").value=value;
  wrap.appendChild(row);
}

function addOrderItem(value){
  const wrap=document.getElementById("order-items");
  const row=document.createElement("div"); row.className="qe-answer-row";
  row.innerHTML='<input type="text" placeholder="Item text"><button type="button" class="btn-outline" style="padding:6px 10px;" onclick="this.parentElement.remove()">x</button>';
  if(value!==undefined) row.querySelector("input[type=text]").value=value;
  wrap.appendChild(row);
}

// Editor navigation — the question list beside the editor is how you move between questions.
function editorAddQuestion(){ if(!commitCurrentQuestion()) return; TEACHER.questions.push(blankQuestion()); openQuestionEditor(TEACHER.questions.length-1); }

function editorDeleteCurrent(){
  if(!confirm("Delete this question?")) return;
  TEACHER.questions.splice(EDIT_INDEX,1);
  if(TEACHER.questions.length===0){ EDIT_INDEX=-1; renderQBank(); return; }
  openQuestionEditor(Math.min(EDIT_INDEX, TEACHER.questions.length-1));
}


/* Closing the tab or hitting reload with unsaved questions in the builder. Browsers deliberately
   allow no custom wording here — they show their own "Leave site?" prompt — so this only decides
   whether it appears. Returning early when the builder is clean matters: a page that always asks
   trains people to click through without reading. */
window.addEventListener("beforeunload", function(e){
  if(typeof builderIsDirty!=="function" || !builderIsDirty()) return;
  e.preventDefault();
  e.returnValue = "";      // required by older browsers to trigger the prompt
  return "";
});
