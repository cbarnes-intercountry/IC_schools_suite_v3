/* ============================================================================
   Classroom Exam App — admin/combos.js
   Combined word sets (v4.0)
   ============================================================================

   A combined set is an ordinary record in the same bank: combo:true, members:[keys], and no
   words of its own. core/backend.js getQuiz assembles the words from the members every time
   it is opened, which is what "follow the source" means — correct a word in one list and
   every combination holding that list is corrected, with nothing to re-sync.

   WHY ONLY THE FOUR WORD GAMES. A Test, a Quizfire, a Synapse and a Role Play are not lists of
   interchangeable items. Half of one role play bolted to half of another is not a longer role
   play; it is two situations and a cast that does not fit either. core/bank.js COMBO_KINDS is
   the list, and this screen reads it rather than repeating it.

   WHY THE MEMBERS ARE CHECKBOXES AND NOT A MULTI-SELECT. A teacher assembling a revision mix
   for a class is reading the names, not operating a control; a multi-select on a laptop
   trackpad loses the whole selection on one stray click.
*/

const COMBO = { kind:"bingo", key:null, sets:[], schools:[], chosen:new Set(), saved:"" };

/* The unsaved-work guard, the same shape as the quiz builder's. This screen holds a name, a
   set of schools and a set of ticked lists, none of which exist anywhere until Save is
   pressed — so a Back link that just changes screen throws the lot away without a word. The
   suite has a check against exactly that (\u201cno unguarded exit remains\u201d), written
   after the builder shipped with one; this screen was built with the same fault and the check
   caught it. */
function comboSignature(){
  const name = (document.getElementById("combo-name") || {}).value || "";
  return JSON.stringify([COMBO.kind, name.trim(),
                         [...COMBO.chosen].sort(), comboCheckedSchools().sort()]);
}
function markComboSaved(){ COMBO.saved = comboSignature(); }
function comboIsDirty(){
  if(!isScreenActive("screen-admin-combos")) return false;   // never warn from another screen
  return comboSignature() !== COMBO.saved;
}
function leaveCombos(to){
  if(comboIsDirty() && !confirm(t("combo.leave_unsaved",
    "This combined set has not been saved. Leave and lose it?"))) return;
  showScreen(to);
}

function comboSetsOfKind(kind){
  return COMBO.sets.filter(q => q.kind === kind && !q.combo)
                   .sort((a,b) => String(a.name||"").localeCompare(String(b.name||"")));
}

/* The library picker on the Admin screen: every combination, whatever its game. */
async function loadComboLibrary(){
  const sel = document.getElementById("combo-library-select");
  try{
    const qs = await Backend.listQuizzes();
    COMBO.sets = qs.quizzes || [];
    if(!sel) return;
    const combos = COMBO.sets.filter(q => q.combo)
                             .sort((a,b) => String(a.name||"").localeCompare(String(b.name||"")));
    setSearchMount(sel, combos, c => setSearchLabel(c,
      t("combo.n_lists", "{count} {lists}",
        { count:(c.members||[]).length,
          lists: plural((c.members||[]).length, t("combo.list", "list"), t("combo.lists", "lists")) })));
  }catch(e){ console.warn(e); }
}

function newComboSet(){
  COMBO.key = null;
  COMBO.chosen = new Set();
  const n = document.getElementById("combo-name"); if(n) n.value = "";
  const st = document.getElementById("combo-status"); if(st) st.textContent = "";
  comboKindPicked();
  markComboSaved();
  showScreen("screen-admin-combos");
}

async function loadComboSet(){
  if(!requireOwner(t("combo.action_edit", "edit a combined set"))) return;
  const sel = document.getElementById("combo-library-select");
  const key = sel && sel.value;
  if(!key){ alert(t("combo.pick_first", "Pick a combined set first.")); return; }
  try{
    // getRawQuiz, not getQuiz: getQuiz resolves a combination into its members' words, which
    // is exactly what this screen must not see — it edits the membership, not the words.
    const rec = await Backend.getRawQuiz(key);
    if(!rec || !rec.combo){ alert(t("combo.not_a_combo", "That is not a combined set.")); return; }
    COMBO.key = key;
    COMBO.kind = setKind(rec);
    COMBO.chosen = new Set(rec.members || []);
    const k = document.getElementById("combo-kind"); if(k) k.value = COMBO.kind;
    const n = document.getElementById("combo-name"); if(n) n.value = rec.name || "";
    const st = document.getElementById("combo-status");
    if(st) st.textContent = rec.ref ? t("combo.code_is", "Reference code {ref}", { ref:rec.ref }) : "";
    await comboRefresh(quizSchools(rec));
    markComboSaved();
    showScreen("screen-admin-combos");
  }catch(e){ alert(t("combo.load_failed", "Load failed: ") + e.message); }
}

function comboKindPicked(){
  const k = document.getElementById("combo-kind");
  const next = k ? k.value : "bingo";
  // Changing the game empties the selection rather than carrying it across: the keys chosen
  // under the old game are lists this game cannot play, and silently keeping them would
  // produce a combination that is half unplayable.
  if(next !== COMBO.kind){ COMBO.kind = next; COMBO.chosen = new Set(); }
  comboRefresh();
}

async function comboRefresh(preselectSchools){
  try{
    const [qs, ss] = await Promise.all([Backend.listQuizzes(), Backend.listSchools()]);
    COMBO.sets = qs.quizzes || [];
    COMBO.schools = ss.schools || [];
  }catch(e){ console.warn(e); }
  comboRenderSchools(preselectSchools);
  comboRenderMembers();
}

function comboRenderSchools(preselect){
  const box = document.getElementById("combo-schools");
  if(!box) return;
  const want = new Set(preselect || comboCheckedSchools());
  while(box.firstChild) box.removeChild(box.firstChild);
  COMBO.schools.forEach(name => {
    const lab = document.createElement("label");
    lab.className = "check";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.value = name; cb.className = "combo-school";
    if(want.has(name)) cb.checked = true;
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(" " + name));
    box.appendChild(lab);
  });
}

function comboCheckedSchools(){
  return [...document.querySelectorAll(".combo-school")].filter(c => c.checked).map(c => c.value);
}

function comboRenderMembers(){
  const box = document.getElementById("combo-members");
  if(!box) return;
  while(box.firstChild) box.removeChild(box.firstChild);
  const mine = comboSetsOfKind(COMBO.kind);
  if(!mine.length){
    const p = document.createElement("p");
    p.className = "sub";
    p.textContent = t("combo.no_lists", "No word lists saved for this game yet.");
    box.appendChild(p);
    comboRenderCount();
    return;
  }
  mine.forEach(rec => {
    const lab = document.createElement("label");
    lab.className = "check";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.value = rec.key; cb.className = "combo-member";
    if(COMBO.chosen.has(rec.key)) cb.checked = true;
    cb.addEventListener("change", () => {
      if(cb.checked) COMBO.chosen.add(rec.key); else COMBO.chosen.delete(rec.key);
      comboRenderCount();
    });
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(" " + setSearchLabel(rec,
      t("combo.n_items", "{count}", { count:rec.count }))));
    box.appendChild(lab);
  });
  comboRenderCount();
}

/* The running total is the number that decides whether the set is playable, so it is on the
   screen while the boxes are being ticked rather than discovered at launch. It is an UPPER
   bound: the same word in two lists plays once, and getQuiz de-duplicates. Saying so matters
   — a teacher who ticks two overlapping lists to clear bingo's 19-word floor should not be
   told they have 24 and then find they have 17 in front of a class. */
function comboRenderCount(){
  const el = document.getElementById("combo-count");
  if(!el) return;
  const mine = comboSetsOfKind(COMBO.kind);
  const picked = mine.filter(r => COMBO.chosen.has(r.key));
  const total = picked.reduce((a, r) => a + (r.count || 0), 0);
  if(!picked.length){ el.textContent = t("combo.pick_two", "Tick at least two lists."); return; }
  el.textContent = t("combo.total_hint",
    "{lists} {listword}, up to {total} items — fewer if the same word is in more than one.",
    { lists: picked.length,
      listword: plural(picked.length, t("combo.list", "list"), t("combo.lists", "lists")),
      total: total });
}

async function saveComboSet(){
  if(!requireOwner(t("combo.action_save", "save a combined set"))) return;
  const name = (document.getElementById("combo-name") || {}).value || "";
  if(!name.trim()){ alert(t("combo.name_needed", "Give the combined set a name.")); return; }
  const members = [...COMBO.chosen];
  /* Two is the floor. One list "combined" is just that list under a second name and a second
     code, which is two codes for one thing and a question later about which is current. */
  if(members.length < 2){
    alert(t("combo.two_needed", "A combined set needs at least two lists. Tick another, or use the list itself."));
    return;
  }
  const key = COMBO.key || quizKey(name);
  try{
    const r = await Backend.saveQuiz(key, name.trim(), [], comboCheckedSchools(), COMBO.kind,
                                     { combo:true, members:members });
    COMBO.key = key;
    const st = document.getElementById("combo-status");
    if(st) st.textContent = t("combo.saved_as", "Saved. Reference code {ref}", { ref:r.ref || "" });
    markComboSaved();
    await loadComboLibrary();
  }catch(e){ alert(t("combo.save_failed", "Save failed: ") + e.message); }
}

async function deleteComboSet(){
  if(!requireOwner(t("combo.action_delete", "delete a combined set"))) return;
  const sel = document.getElementById("combo-library-select");
  const key = sel && sel.value;
  if(!key){ alert(t("combo.pick_to_delete", "Pick a combined set to delete.")); return; }
  const label = sel.options[sel.selectedIndex].textContent;
  if(!confirm(t("combo.delete_confirm",
    "Delete the combined set “{name}”?\n\nThe word lists it holds are not touched.",
    { name: label }))) return;
  try{ await Backend.deleteQuiz(key); await loadComboLibrary(); }
  catch(e){ alert(t("combo.delete_failed", "Delete failed: ") + e.message); }
}

/* ---- the back-fill ---------------------------------------------------------------------
   Owner-only, and it reports what it did rather than finishing silently: a teacher pressing
   a button called "Assign reference codes" is entitled to see the codes it assigned. */
async function assignRefsUI(){
  if(!requireOwner(t("combo.action_assign", "assign reference codes"))) return;
  if(!confirm(t("combo.assign_confirm",
    "Give a permanent reference code to every saved set that has none?\n\nSets that already have a code keep it."))) return;
  try{
    const r = await Backend.assignMissingRefs();
    if(!r.assigned.length){
      alert(t("combo.assign_none", "Every saved set already has a code ({count} in all).",
              { count: r.already }));
      return;
    }
    const lines = r.assigned.slice(0, 40).map(a => a.ref + "  " + a.name);
    if(r.assigned.length > 40) lines.push(t("combo.assign_and_more", "… and {count} more",
                                            { count: r.assigned.length - 40 }));
    alert(t("combo.assign_done", "{count} {sets} given a code:\n\n{list}",
      { count: r.assigned.length,
        sets: plural(r.assigned.length, t("combo.set", "set"), t("combo.sets", "sets")),
        list: lines.join("\n") }));
    await loadComboLibrary();
  }catch(e){ alert(t("combo.assign_failed", "Could not assign codes: ") + e.message); }
}
