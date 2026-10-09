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

// Built when asked, not at load: a table of words made once would keep the language the page
// started in. `sel` is an element id and never changes.
function setLabel(mode){
  if(mode==="poll")     return { one: t("editor.a_poll", "poll"), Cap: t("editor.poll_cap", "Poll"), sel: "poll-library-select" };
  if(mode==="livequiz") return { one: t("editor.a_livequiz", "quiz game"), Cap: t("editor.livequiz_cap", "Quiz Game"), sel: "lq-library-select" };
  return { one: t("editor.a_quiz", "quiz"), Cap: t("editor.quiz_cap", "Quiz"), sel: "quiz-library-select" };
}

/* Which question types a bank will hold.

   A test refuses poll types because they cannot be marked; a poll refuses the marked types
   because it marks nothing. A LIVE QUIZ takes everything: that is what it is for — a run of
   marked questions with a poll or a word cloud dropped in to break it up. So "what belongs
   here" stops being one boolean and becomes a question each bank answers for itself. */
function bankAccepts(mode, type){
  if(mode==="livequiz") return true;
  return isPollType(type) === (mode==="poll");
}


async function loadQuizList(){
  try{
    const r = await Backend.listQuizzes();
    const all = (r.quizzes||[]).sort((a,b)=>a.name.localeCompare(b.name));
    // One select per kind, matched exactly. The old version sorted everything into "poll or
    // else quiz", so any third kind silently joined the quizzes.
    [["quiz","quiz-library-select",t("editor.select_saved_quiz", "\u2014 select a saved quiz \u2014")],
     ["poll","poll-library-select",t("editor.select_saved_poll", "\u2014 select a saved poll \u2014")],
     ["livequiz","lq-library-select",t("editor.select_saved_livequiz", "\u2014 select a saved quiz game \u2014")],
     ["roleplay","rp-library-select",t("editor.select_saved_role_play", "\u2014 select a saved role play \u2014")],
     ["describeit","di-library-select",t("editor.select_saved_pack", "\u2014 select a saved word pack \u2014")],
     ["twentyq","tq-library-select",t("editor.select_saved_subjects", "\u2014 select a saved subject pack \u2014")],
     ["partners","wp-library-select",t("editor.select_saved_partners", "\u2014 select a saved partner pack \u2014")],
     ["bingo","bgw-library-select",t("editor.select_saved_bingo", "\u2014 select a saved word list \u2014")]].forEach(([kind,id,placeholder])=>{
      const sel=document.getElementById(id);
      if(!sel) return;
      sel.innerHTML='<option value="">'+escapeHtml(placeholder)+'</option>';
      all.filter(q=>q.kind===kind).forEach(q=>{
        const sc=(q.schools||[]).join(", ");
        const opt=document.createElement("option"); opt.value=q.key;
        const unit = (kind==="roleplay")
          ? plural(q.count, t("rp.scenario", "scenario"), t("rp.scenarios", "scenarios"))
          : (kind==="describeit")
            ? plural(q.count, t("di.term", "term"), t("di.terms", "terms"))
            : (kind==="twentyq")
              ? plural(q.count, t("tq.subject", "subject"), t("tq.subjects", "subjects"))
              : (kind==="partners" || kind==="bingo")
                ? plural(q.count, t("bg.word", "word"), t("bg.words", "words"))
                : plural(q.count, t("poll.question", "question"), t("poll.questions", "questions"));
        opt.textContent = q.name + (sc?" \u00b7 "+sc:"") + " (" + q.count + " " + unit + ")";
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
      t("editor.changes_haven_t_been_saved", "You have changes that haven\u2019t been saved.\n\n")+
      t("editor.leaving_discards_them", "Leaving now discards them \u2014 nothing is kept until you press \u201cSave {what}\u201d.\n\nLeave without saving?",
        { what: setLabel(BUILDER_MODE).Cap }))) return;
  BUILDER_CLEAN="";
  showScreen(target||"screen-admin");
}


function newSet(mode){
  BUILDER_MODE = (mode==="poll" || mode==="livequiz") ? mode : "quiz";
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
  const live = BUILDER_MODE==="livequiz";
  const sel = document.getElementById("qe-type");
  let firstAllowed = null;
  Array.prototype.forEach.call(sel.options, o=>{
    const allowed = bankAccepts(BUILDER_MODE, o.value);
    o.hidden = !allowed; o.disabled = !allowed;
    if(allowed && firstAllowed===null) firstAllowed=o.value;
  });
  // If the open question is the wrong kind for this mode, drop to the first legal type.
  if(sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].disabled && firstAllowed) sel.value=firstAllowed;
  /* A live quiz scores on speed and accuracy, not on an author's per-question weighting, so
     the Points box is hidden there too — see core/quizscore.js. The poll types inside one are
     unscored discussion beats, which is the same thing the box would have said. */
  document.getElementById("qe-points-wrap").style.display = (poll || live) ? "none" : "";
  /* The time box means two different things, so it says two different things (v3.31).

     On a TEST it is a cap: zero means no limit, and most questions have none. In a QUIZ GAME
     every question is timed — that is what the score is made of — so zero cannot mean "no
     clock"; it means "use the quiz's default", and the author sets a number here only when
     this particular question needs longer. Labelling both "Time limit (s)" was how a teacher
     ended up with a question nobody could score. */
  const qtl = document.getElementById("qe-qtime-label");
  if(qtl) qtl.textContent = live
    ? t("editor.seconds_this_question", "Seconds for this question")
    : t("admin_builder.time_limit_s", "Time limit (s)");
  const qth = document.getElementById("qe-qtime-hint");
  if(qth) qth.textContent = live
    ? t("editor.qtime_hint_live", "0 = use the quiz default. 5\u2013120.")
    : t("editor.qtime_hint_quiz", "0 = no limit.");
  renderTypeChips();   // the chip row follows the bank we just switched to
  document.getElementById("builder-badge").textContent = poll
    ? t("editor.badge_poll_builder", "Admin \u00b7 Poll Builder")
    : live
      ? t("editor.badge_livequiz_builder", "Admin \u00b7 Quiz Game Builder")
      : t("editor.badge_question_builder", "Admin \u00b7 Question Builder");
  const L = setLabel(BUILDER_MODE);
  document.getElementById("quiz-save-label").textContent = t("editor.save_as_what", "Save as {what}", {what:L.one});
  document.getElementById("quiz-save-btn-text").textContent = t("editor.save_what_btn", "Save {what}", {what:L.Cap});
  document.getElementById("quiz-save-name").placeholder = poll
    ? t("editor.ph_poll_name", "e.g. Session 3 \u2014 warm-up poll")
    : live
      ? t("editor.ph_livequiz_name", "e.g. Unit 4 \u2014 end-of-unit quiz game")
      : t("editor.ph_quiz_name", "e.g. Marketing Midterm 2026");
  document.getElementById("quiz-save-note").textContent = poll
    ? t("editor.note_saved_poll", "Saved to the Poll Creator and launched from Teacher Home with \u201cNew Poll\u201d.")
    : live
      ? t("editor.note_saved_livequiz", "Saved to the Live Quiz Creator and launched from Teacher Home with \u201cQuiz Game\u201d.")
      : t("editor.note_saved_quiz", "Saved to the Test Creator and launched with \u201cLaunch Test\u201d.");
}

async function saveQuizToLibrary(){
  const mode = BUILDER_MODE;
  const L = setLabel(mode);
  // Commit whatever is open in the editor FIRST. Without this, ticking a box (e.g. "Show
  // results live") and going straight to Save silently discarded that edit.
  if(EDIT_INDEX>=0 && EDIT_INDEX<TEACHER.questions.length && !commitCurrentQuestion()) return;
  const name = document.getElementById("quiz-save-name").value.trim();
  const schools = getCheckedSchools();
  if(!name){ alert(t("editor.give_it_a_name", "Give the {what} a name first.", {what:L.one})); return; }
  if(schools.length===0){ alert(t("editor.tick_a_school", "Tick at least one school to assign this {what} to (manage schools on the Admin page).", {what:L.one})); return; }
  if(TEACHER.questions.length===0){ alert(t("editor.add_import_some_questions_first", "Add or import some questions first.")); return; }
  // Belt and braces: the dropdown already hides the wrong types, but an Excel or JSON
  // import can still bring in questions that don't belong in this bank.
  const strays = TEACHER.questions.filter(q=> !bankAccepts(mode, q.type));
  if(strays.length){
    const strayCount = { count: strays.length,
      questions: plural(strays.length, t("poll.question", "question"), t("poll.questions", "questions")) };
    alert(mode==="poll"
      ? t("editor.strays_in_poll", "A poll can only contain Poll and Word Cloud questions.\n\n{count} {questions} here are quiz types \u2014 remove them, or save this in the Test Creator instead.", strayCount)
      /* Wording corrected in v3.20: a poll question CAN now carry a correct answer. What makes
         it a poll is that it is never marked and never kept, not that it has no answer. */
      : t("editor.strays_in_quiz", "A quiz can\u2019t contain Poll or Word Cloud questions \u2014 a poll is never marked and nothing it collects is kept.\n\nRemove those {count} {questions}, or save this in the Poll Creator instead.", strayCount));
    return;
  }
  try{
    await Backend.saveQuiz(quizKey(name), name, TEACHER.questions, schools, mode);
    markBuilderSaved();     // before leaving, so the exit guard stays quiet
    loadQuizList();
    alert(t("editor.saved_for_schools", "Saved \u201c{name}\u201d for {schools} ({count} {questions}).",
      { name:name, schools:schools.join(", "), count:TEACHER.questions.length,
        questions: plural(TEACHER.questions.length, t("poll.question", "question"), t("poll.questions", "questions")) }));
    showScreen("screen-admin");
  }catch(e){ alert(t("editor.save_failed", "Save failed: ")+e.message); }
}

// Load a saved set into the builder, prefilling its name + assigned schools.
async function loadSetFromLibrary(mode){
  const L = setLabel(mode);
  const key = document.getElementById(L.sel).value;
  if(!key){ alert(t("editor.pick_a_saved_first", "Pick a saved {what} first.", {what:L.one})); return; }
  try{
    const rec = await Backend.getQuiz(key);
    if(!rec){ alert(t("editor.that_could_not_be_found", "That {what} could not be found.", {what:L.one})); loadQuizList(); return; }
    /* The record's own kind, not a two-way guess. Reading it as "poll or else quiz" is what
       sent role play into the Test Creator in v3.1 and made it look as though nothing saved. */
    const k = setKind(rec);
    BUILDER_MODE = (k==="poll" || k==="livequiz") ? k : "quiz";
    TEACHER.questions = (rec.questions||[]).map(q=>Object.assign({},q,{id:q.id||"q_"+uid(6)}));
    document.getElementById("quiz-save-name").value = rec.name || "";
    setCheckedSchools(quizSchools(rec));
    applyBuilderMode();
    renderQBank();
    showScreen("screen-admin-builder");
    markBuilderSaved();        // freshly loaded = nothing changed yet
  }catch(e){ alert(t("poll.load_failed", "Load failed: ")+e.message); }
}

function loadQuizFromLibrary(){ return loadSetFromLibrary("quiz"); }

// Export a saved set as a JSON file (archiving / backup).
async function exportSavedSet(mode){
  const L = setLabel(mode);
  const key = document.getElementById(L.sel).value;
  if(!key){ alert(t("editor.pick_a_saved_to_export", "Pick a saved {what} to export.", {what:L.one})); return; }
  try{
    const rec = await Backend.getQuiz(key);
    if(!rec){ alert(t("editor.that_could_not_be_found", "That {what} could not be found.", {what:L.one})); return; }
    const payload = { name:rec.name, kind:setKind(rec), schools:quizSchools(rec), questions:rec.questions||[], exportedAt:new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download = setKind(rec) + "_" + quizKey(rec.name||"set") + ".json"; a.click();
  }catch(e){ alert(t("editor.export_failed", "Export failed: ")+e.message); }
}

function exportSavedQuiz(){ return exportSavedSet("quiz"); }

async function deleteSetFromLibrary(mode){
  if(!requireOwner(t("editor.action_delete_saved_set", "delete a saved quiz or poll"))) return;
  const L = setLabel(mode);
  const sel = document.getElementById(L.sel);
  const key = sel.value;
  if(!key){ alert(t("editor.pick_a_saved_to_delete", "Pick a saved {what} to delete.", {what:L.one})); return; }
  if(!confirm(t("editor.delete_saved_confirm", "Delete saved {what} \u201c{name}\u201d?", {what:L.one, name:sel.options[sel.selectedIndex].textContent}))) return;
  try{ await Backend.deleteQuiz(key); loadQuizList(); }catch(e){ alert(t("editor.delete_failed", "Delete failed: ")+e.message); }
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
    list.innerHTML='<p class="sub">'+t("editor.no_questions_yet", "No questions yet. Use “+ Add Question”.")+'</p>';
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
    const txt=document.createElement("span"); txt.className="qtxt"; txt.textContent=q.text||t("editor.no_text_yet", "(no text yet)");
    const tag=document.createElement("span"); tag.className="qtag"; tag.textContent=TAGS[q.type]||"?";
    div.appendChild(num); div.appendChild(txt);
    /* A checked poll and an opinion poll are both tagged POLL and read identically in the list,
       and the difference decides what happens on the projector. Flag the one with an answer. */
    if(pollIsChecked(q)){
      const kt=document.createElement("span"); kt.className="qtag"; kt.textContent=t("editor.tag_answer", "ANSWER");
      kt.style.background="var(--success-soft)"; kt.style.borderColor="var(--success)"; kt.style.color="var(--success)";
      kt.title=t("editor.tag_answer_title", "One choice is marked correct — shown when you reveal the results");
      div.appendChild(kt);
    }
    // Results are live by default now, so flag the exception instead: a lost tick stays obvious.
    if(isPollType(q.type) && q.hideResults){
      const lv=document.createElement("span"); lv.className="qtag"; lv.textContent=t("editor.hidden", "HIDDEN");
      lv.style.background="var(--amber-soft)"; lv.style.borderColor="var(--amber)"; lv.style.color="var(--amber)";
      lv.title=t("editor.hidden_title", "Results stay hidden until you press Reveal");
      div.appendChild(lv);
    }
    div.appendChild(tag);
    list.appendChild(div);
  });
}

function removeQuestion(i){ if(!confirm(t("editor.delete_question", "Delete this question?"))) return; TEACHER.questions.splice(i,1); renderQBank(); }


// Open the editor at index i. With no valid index, append a new blank question and edit that.
function openQuestionEditor(i){
  if(typeof i!=="number" || i<0 || i>=TEACHER.questions.length){
    TEACHER.questions.push(blankQuestion());
    i = TEACHER.questions.length-1;
  }
  EDIT_INDEX = i;
  writeQuestionToForm(TEACHER.questions[i]);
  document.getElementById("qe-counter").textContent = t("editor.n_of_m", "{n} of {total}", {n:EDIT_INDEX+1, total:TEACHER.questions.length});
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
  if(!text){ alert(t("editor.please_enter_question_text", "Please enter the question text.")); return null; }
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
    if(opts.length<2||correctIdx===null){ alert(t("editor.add_least_2_options_select_correct", "Add at least 2 options and select the correct one.")); return null; }
    q.options=opts; q.correct=opts[correctIdx];
  } else if(type==="tf"){ q.options=["True","False"]; q.correct=document.getElementById("tf-correct").value; }
  else if(type==="text"){
    const accepted=[]; document.querySelectorAll("#text-answers .qe-answer-row input[type=text]").forEach(inp=>{ const v=inp.value.trim(); if(v) accepted.push(v); });
    if(accepted.length===0){ alert(t("editor.add_least_one_acceptable_answer", "Add at least one acceptable answer.")); return null; }
    q.correct=accepted; q.caseSensitive=document.getElementById("text-casesens").checked;
  }
  else if(type==="order"){
    const items=[]; document.querySelectorAll("#order-items .qe-answer-row input[type=text]").forEach(inp=>{ const v=inp.value.trim(); if(v) items.push(v); });
    if(items.length<2){ alert(t("editor.add_least_2_items_correct_order", "Add at least 2 items (in the correct order).")); return null; }
    q.items=items; q.correct=items.slice();
  }
  else if(type==="poll"){
    /* Read the rows, not the text boxes, so a choice and the radio beside it stay together.
       Reading the inputs in two separate passes is how the key ends up one row out when an
       author leaves a blank row in the middle. */
    const opts=[]; let correctIdx=null;
    document.querySelectorAll("#poll-opts .qe-answer-row").forEach(row=>{
      const v=row.querySelector("input[type=text]").value.trim();
      const radio=row.querySelector("input[type=radio]");
      if(v){ opts.push(v); if(radio && radio.checked) correctIdx=opts.length-1; }
    });
    if(opts.length<2){ alert(t("editor.poll_needs_least_2_choices", "A poll needs at least 2 choices.")); return null; }
    q.options=opts; q.hideResults=document.getElementById("poll-hideresults").checked;
    q.points=0;   // marked or not, a poll scores nothing
    /* A check with nothing ticked would save as an opinion vote and look identical in the
       bank, so the author would find out in front of the class. Refuse instead. */
    const wantsKey=document.getElementById("poll-answer-mode").value==="check";
    if(wantsKey && correctIdx===null){
      alert(t("editor.poll_check_needs_correct", "Mark which choice is correct, or set this back to an opinion vote.")); return null;
    }
    q.correct = wantsKey ? opts[correctIdx] : null;
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
  box.innerHTML="";
  // The same question the dropdown is filtered by, so the chips and the list cannot disagree.
  [...sel.options].filter(o=>bankAccepts(BUILDER_MODE, o.value)).forEach(o=>{
    const b=document.createElement("button");
    b.type="button";
    b.className="type-chip"+(o.value===sel.value?" on":"");
    b.textContent=typeLabel(o.value)||o.textContent;
    b.onclick=()=>{ sel.value=o.value; renderTypeChips(); renderQEditorOptions(); };
    box.appendChild(b);
  });
}

function renderQEditorOptions(q){
  q = q || {};
  const type=document.getElementById("qe-type").value;
  const area=document.getElementById("qe-options-area");
  if(type==="mcq"){
    area.innerHTML='<label>'+t("editor.answer_options_select_correct_one", 'Answer options (select the correct one)')+'</label><div id="mcq-opts"></div>'+
      '<button type="button" class="btn-outline" onclick="addMCQOption()">'+t("editor.add_option", "+ Add option")+'</button>';
    if(q.type==="mcq"&&q.options){ q.options.forEach(o=>addMCQOption(o, o===q.correct)); }
    else { addMCQOption(); addMCQOption(); }
  } else if(type==="tf"){
    const c=(q.type==="tf"?q.correct:"True");
    area.innerHTML='<label>'+t("editor.correct_answer", 'Correct answer')+'</label><select id="tf-correct"><option value="True"'+(c==="True"?" selected":"")+'>'+t("editor.true", 'True')+'</option><option value="False"'+(c==="False"?" selected":"")+'>'+t("editor.false", 'False')+'</option></select>';
  } else if(type==="text"){
    area.innerHTML='<label>'+t("editor.acceptable_answers_any_one_counts_correct", 'Acceptable answers (any one counts as correct)')+'</label><div id="text-answers"></div>'+
      '<button type="button" class="btn-outline" onclick="addTextAnswer()">'+t("editor.add_acceptable_answer", "+ Add acceptable answer")+'</button>'+
      '<div class="toggle-row" style="margin-top:10px;"><span>Case sensitive (exact match — capitals &amp; accents must match)'+
      '<br><small class="hint">'+t("editor.leave_turn_off_only_item_where", 'Leave this on. Turn it off only for an item where either capital is genuinely correct — accents are never ignored either way.')+'</small></span>'+
      '<label class="switch"><input type="checkbox" id="text-casesens"><span class="slider"></span></label></div>';
    const accepted=(q.type==="text"&&Array.isArray(q.correct))?q.correct:null;
    if(accepted&&accepted.length){ accepted.forEach(a=>addTextAnswer(a)); } else { addTextAnswer(); }
    document.getElementById("text-casesens").checked = (q.type==="text") ? (q.caseSensitive!==false) : true;
    } else if(type==="order"){
    area.innerHTML='<label>'+t("editor.items_correct_order_students_see_them", 'Items in the CORRECT order (students see them shuffled and drag to reorder)')+'</label><div id="order-items"></div>'+
      '<button type="button" class="btn-outline" onclick="addOrderItem()">'+t("editor.add_item", "+ Add item")+'</button>';
    const items=(q.type==="order"&&q.items)?q.items:null;
    if(items&&items.length){ items.forEach(it=>addOrderItem(it)); } else { addOrderItem(); addOrderItem(); addOrderItem(); }
  } else if(type==="poll"){
    /* Two kinds of poll question since v3.20, chosen here rather than inferred from whether a
       radio happens to be ticked. An author who meant an opinion vote and brushed a radio would
       otherwise have built a comprehension check without being told. */
    const key=pollKey(q);
    area.innerHTML='<label>'+t("editor.what_kind_of_poll", 'What kind of question is this?')+'</label>'+
      '<select id="poll-answer-mode" onchange="pollAnswerModeChanged()">'+
        '<option value="opinion">'+t("editor.poll_mode_opinion", 'Opinion vote \u2014 no correct answer')+'</option>'+
        '<option value="check">'+t("editor.poll_mode_check", 'Comprehension check \u2014 one choice is correct')+'</option>'+
      '</select>'+
      '<label style="margin-top:12px;">'+t("editor.choices", 'Choices')+'</label><div id="poll-opts"></div>'+
      '<button type="button" class="btn-outline" onclick="addPollOption()">'+t("editor.add_choice", "+ Add choice")+'</button>'+
      '<small class="hint" id="poll-live-warn" style="display:none;color:var(--amber);"></small>'+
      '<div class="toggle-row" style="margin-top:10px;"><span>'+t("editor.hide_results_until_i_press_reveal", 'Hide results until I press Reveal')+'<br><small class="hint">'+t("editor.class_sees_only_response_counter_until", 'On = the class sees only a response counter until you press Reveal')+'</small></span>'+
      '<label class="switch"><input type="checkbox" id="poll-hideresults" onchange="pollAnswerModeChanged()"><span class="slider"></span></label></div>';
    document.getElementById("poll-answer-mode").value = key ? "check" : "opinion";
    const opts=(q.type==="poll"&&q.options)?q.options:null;
    if(opts&&opts.length){ opts.forEach(o=>addPollOption(o, key!==null && o===key)); } else { addPollOption(); addPollOption(); }
    document.getElementById("poll-hideresults").checked = (q.type==="poll") ? !!q.hideResults : false;
    pollAnswerModeChanged();
  } else if(type==="cloud"){
    const mw=(q.type==="cloud"&&q.maxWords)?q.maxWords:1;
    area.innerHTML='<label>'+t("editor.words_per_student", 'Words per student')+'</label>'+
      '<select id="cloud-maxwords"><option value="1"'+(mw==1?" selected":"")+'>'+t("editor.1_word", '1 word')+'</option>'+
      '<option value="2"'+(mw==2?" selected":"")+'>'+t("editor.up_2_words", 'Up to 2 words')+'</option>'+
      '<option value="3"'+(mw==3?" selected":"")+'>'+t("editor.up_3_words", 'Up to 3 words')+'</option></select>'+
      '<small class="hint">'+t("editor.words_matched_ignoring_capitals", "Words are matched ignoring capitals and accents, so “Assurance” and “assurance” combine into one entry.")+'</small>'+
      '<div class="toggle-row" style="margin-top:10px;"><span>'+t("editor.hide_results_until_i_press_reveal", 'Hide results until I press Reveal')+'<br><small class="hint">'+t("editor.cloud_stays_hidden_until_press_reveal", 'On = the cloud stays hidden until you press Reveal')+'</small></span>'+
      '<label class="switch"><input type="checkbox" id="cloud-hideresults"><span class="slider"></span></label></div>';
    document.getElementById("cloud-hideresults").checked = (q.type==="cloud") ? !!q.hideResults : false;
  }
}

/* The radio is in every row whichever mode the question is in, and the wrapper hides the column
   in opinion mode. Building the rows differently per mode would mean readQuestionFromForm had
   two shapes to cope with, and the mode could change under it between render and save. */
function addPollOption(value, checked){
  const wrap=document.getElementById("poll-opts");
  const row=document.createElement("div"); row.className="qe-answer-row";
  row.innerHTML='<input type="radio" name="poll-correct" class="poll-correct-radio"'+(checked?" checked":"")+
    ' title="'+escapeHtml(t("editor.mark_this_correct", "Mark this choice correct"))+'">'+
    '<input type="text" placeholder="'+escapeHtml(t("editor.ph_choice_text", "Choice text"))+'">'+
    '<button type="button" class="btn-outline" style="padding:6px 10px;" onclick="this.parentElement.remove()">x</button>';
  if(value!==undefined) row.querySelector("input[type=text]").value=value;
  wrap.appendChild(row);
}

/* Shows the radios in check mode, and says the one thing an author can get wrong without
   noticing: a checked question whose results are live announces the answer to the half of the
   class that has not voted yet. Said rather than silently corrected — flipping the author's own
   toggle for them is how a setting ends up fighting the person who set it. */
function pollAnswerModeChanged(){
  const mode=document.getElementById("poll-answer-mode"), opts=document.getElementById("poll-opts");
  const warn=document.getElementById("poll-live-warn"), hide=document.getElementById("poll-hideresults");
  if(!mode||!opts) return;
  const check = mode.value==="check";
  opts.classList.toggle("poll-keyed", check);
  if(!warn||!hide) return;
  const loud = check && !hide.checked;
  warn.style.display = loud ? "block" : "none";
  if(loud) warn.textContent = t("editor.poll_key_shown_live",
    "Results are live, so the answer appears as soon as the first student votes. Turn on “hide results” to keep it until you reveal.");
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
  // Same keyboard rule as the student's field, for the same reason in reverse: an author
  // typing "risk" must not have it stored as "Risk" by a phone or tablet.
  row.innerHTML='<input type="text" placeholder="Accepted answer" '+NO_KEYBOARD_HELP+'><button type="button" class="btn-outline" style="padding:6px 10px;" onclick="this.parentElement.remove()">x</button>';
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
  if(!confirm(t("editor.delete_question", "Delete this question?"))) return;
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
