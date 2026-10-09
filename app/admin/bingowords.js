/* ============================================================================
   Classroom Exam App — admin/bingowords.js
   Part of index.html's script, new in v3.32.1. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Writing word lists for Bingo.

   A list is words, each with a clue — the thing the teacher reads out in the definitions
   version. Stored like every other set, same library, kind "bingo", so the backend did not
   have to change.

   WHY THIS FILE EXISTS. v3.32 shipped bingo reading the quiz bank directly: the answer became
   the word, the question became the clue. It ran, and it was the wrong call — the launcher
   then offered a teacher their list of TESTS to play bingo with, and there was nowhere to
   build a word list at all. A game with no bank of its own is a game nobody can prepare.

   WHAT IT KEEPS from that idea is the useful half, and the reason this screen leads with it:
   a new list can be FILLED FROM any pack already in the library — Describe It terms, Twenty
   Questions subjects, Word Partners heads, a short-answer quiz. The words are typed once and
   played in several games, and the teacher's job here is fixing clues rather than inventing
   a vocabulary list from nothing.

   The same thin editor as the Describe It and Twenty Questions ones, for the same reason:
   twenty words typed one at a time is a chore, so importing and Excel are the intended routes
   in and this screen is for fixing the two that came out wrong. */

let BWORDS = { key:null, name:"", list:[], lang:"en", lastTheme:"", clean:"" };

function bwFingerprint(){ return JSON.stringify({ n:BWORDS.name, l:BWORDS.list, g:BWORDS.lang }); }
function markBwSaved(){ BWORDS.clean = bwFingerprint(); }
function bwAreDirty(){
  return isScreenActive("screen-bg-editor") && bwFingerprint() !== BWORDS.clean;
}

function blankBingoWord(){ return { id:"bw_"+uid(6), word:"", clue:"",
                                    theme:BWORDS.lastTheme||"", lang:BWORDS.lang||"en" }; }

async function newBingoSet(){
  BWORDS = { key:null, name:"", list:[], lang:"en", lastTheme:"", clean:"" };
  BWORDS.list=[blankBingoWord(),blankBingoWord(),blankBingoWord()];
  document.getElementById("bg-set-name").value="";
  renderBingoWordList();
  await fillBingoImportList();
  markBwSaved();
  showScreen("screen-bg-editor");
}

async function loadBingoSet(){
  const key=document.getElementById("bgw-library-select").value;
  if(!key){ alert(t("bgw.pick_saved_list_first", "Pick a saved list first.")); return; }
  let rec=null;
  try{ rec=await Backend.getQuiz(key); }catch(e){ alert(t("bgw.couldn_t_load", "Couldn't load it: ")+e.message); return; }
  if(!rec){ alert(t("bgw.list_gone", "That list has gone.")); return; }
  BWORDS = { key:key, name:rec.name||"", list:(rec.questions||[]).slice(),
             lang:((rec.questions||[])[0]||{}).lang||"en", lastTheme:"", clean:"" };
  if(!BWORDS.list.length) BWORDS.list=[blankBingoWord()];
  document.getElementById("bg-set-name").value=BWORDS.name;
  renderBingoWordList();
  await fillBingoImportList();
  markBwSaved();
  showScreen("screen-bg-editor");
}

async function deleteBingoSet(){
  if(!requireOwner(t("bgw.action_delete_list", "delete a saved list"))) return;
  const sel=document.getElementById("bgw-library-select");
  const key=sel.value; if(!key){ alert(t("bgw.pick_saved_list_first", "Pick a saved list first.")); return; }
  if(!confirm(t("bgw.delete_set_confirm", "Delete “{name}” for good?", {name:sel.options[sel.selectedIndex].text}))) return;
  try{ await Backend.deleteQuiz(key); }catch(e){ alert(t("bgw.couldn_t_delete", "Couldn't delete it: ")+e.message); return; }
  await loadQuizList();
}


/* ---------- filling a list from a bank that already exists ---------- */

/* What each kind is called in the import list, so a teacher picking one knows what they are
   about to pull in. Not a lookup table built at load time: that would freeze whatever
   language the page started in. */
function bingoSourceLabel(kind){
  if(kind==="describeit") return t("bgw.src_describeit", "Describe It words");
  if(kind==="twentyq")    return t("bgw.src_twentyq", "Twenty Questions subjects");
  if(kind==="partners")   return t("bgw.src_partners", "Word Partners");
  if(kind==="livequiz")   return t("bgw.src_livequiz", "Quiz game");
  if(kind==="bingo")      return t("bgw.src_bingo", "Bingo list");
  return t("bgw.src_quiz", "Test");
}

const BGW_SOURCES = ["describeit","twentyq","partners","quiz","livequiz","bingo"];

async function fillBingoImportList(){
  const sel=document.getElementById("bgw-import-select");
  if(!sel) return;
  sel.innerHTML='<option value="">'+escapeHtml(t("bgw.select_a_pack", "— take words from —"))+'</option>';
  try{
    const r=await Backend.listQuizzes();
    (r.quizzes||[])
      .filter(q=>BGW_SOURCES.indexOf(q.kind)>=0)
      /* Not this list itself: importing a list into itself doubles every word and then the
         duplicate check silently throws the copies away, which looks like nothing happened. */
      .filter(q=>!BWORDS.key || q.key!==BWORDS.key)
      .sort((a,b)=>a.name.localeCompare(b.name))
      .forEach(q=>{
        const o=document.createElement("option");
        o.value=q.key;
        o.textContent=bingoSourceLabel(q.kind)+" · "+q.name+" ("+q.count+")";
        sel.appendChild(o);
      });
  }catch(e){ console.warn(e); }
}

async function importBingoWords(){
  const sel=document.getElementById("bgw-import-select");
  const key=sel && sel.value;
  if(!key){ alert(t("bgw.pick_a_pack_first", "Pick a pack to take words from.")); return; }
  let rec=null;
  try{ rec=await Backend.getQuiz(key); }catch(e){ alert(t("bgw.couldn_t_load", "Couldn't load it: ")+e.message); return; }
  if(!rec){ alert(t("bgw.list_gone", "That list has gone.")); return; }

  const rows=bingoImportFrom(setKind(rec), rec.questions||[]);
  if(!rows.length){ alert(t("bgw.nothing_usable", "Nothing in that pack fits on a bingo card — a cell holds a word, not a sentence.")); return; }

  /* ADDED, never replacing. A teacher building a twenty-word list out of two ten-word packs
     is the ordinary case, and an import that wiped what was already typed would cost them
     the clues they had just written. */
  const have={};
  BWORDS.list.forEach(w=>{ const k=String(w.word||"").trim().toLowerCase(); if(k) have[k]=true; });
  const fresh=rows.filter(r=>!have[r.word.toLowerCase()]);
  const dupes=rows.length-fresh.length;

  // Drop the blank starter rows, or an import lands under three empty lines.
  BWORDS.list=BWORDS.list.filter(w=>String(w.word||"").trim());
  fresh.forEach(r=>{
    const w=blankBingoWord();
    w.word=r.word; w.clue=r.clue; w.theme=r.theme||BWORDS.lastTheme||"";
    BWORDS.list.push(w);
  });
  if(!BWORDS.list.length) BWORDS.list=[blankBingoWord()];
  renderBingoWordList();

  const withClues=fresh.filter(r=>r.clue).length;
  alert(t("bgw.imported",
    "Added {count} {words}, {clues} of them with a clue.{dupes}\n\nRead the clues before the lesson — they were written for another game.",
    { count:fresh.length,
      words: plural(fresh.length, t("bg.word", "word"), t("bg.words", "words")),
      clues: withClues,
      dupes: dupes ? "\n"+t("bgw.n_already_here", "{n} were already on the list.", {n:dupes}) : "" }));
}


/* ---------- the list ---------- */

function bwSetsInOrder(){
  const names=setsIn(BWORDS.list);
  const loose=BWORDS.list.some(w=>!String(w.theme||"").trim());
  return loose ? names.concat([""]) : names;
}
function bwIndexesIn(name){
  const out=[];
  BWORDS.list.forEach((w,i)=>{ if(String(w.theme||"").trim()===name) out.push(i); });
  return out;
}

function renderBingoWordList(){
  const box=document.getElementById("bgw-word-list");
  if(!box) return;
  let html="";
  bwSetsInOrder().forEach(name=>{
    const rows=bwIndexesIn(name);
    html += '<div class="di-theme-head">'+
      '<input type="text" class="di-setname-in" value="'+escapeHtml(name)+'" '+
        'placeholder="'+escapeHtml(t("bgw.ph.set_name", "set name"))+'" '+
        'onchange="renameBingoSetName('+JSON.stringify(name).replace(/"/g,"&quot;")+',this.value)">'+
      '<span class="di-set-count">'+rows.length+'</span>'+
      '<button class="btn-outline btn-sm" onclick="addBingoWordTo('+JSON.stringify(name).replace(/"/g,"&quot;")+')" '+
        'title="'+escapeHtml(t("bgw.ti.add_here", "Add a word to this set"))+'">+</button>'+
      '<button class="btn-outline btn-sm" onclick="removeBingoSetName('+JSON.stringify(name).replace(/"/g,"&quot;")+')" '+
        'title="'+escapeHtml(t("bgw.ti.remove_set", "Remove this set and its words"))+'">×</button>'+
      '</div>';
    rows.forEach((i,k)=>{
      const w=BWORDS.list[i];
      const thin=!String(w.clue||"").trim();
      html += '<div class="di-termrow'+(thin?" di-termrow-thin":"")+'">'+
        '<div class="di-termrow-top">'+
          '<span class="qrow-no">'+(k+1)+'</span>'+
          '<input type="text" class="di-term-in" value="'+escapeHtml(w.word||"")+'" '+
            'placeholder="'+escapeHtml(t("bgw.ph.word", "the word on the card"))+'" '+
            'oninput="setBingoWordField('+i+',\'word\',this.value)">'+
          '<select class="di-move-in" onchange="moveBingoWordToSet('+i+',this.value)" '+
            'title="'+escapeHtml(t("bgw.ti.move", "Move this word to another set"))+'">'+
            bwSetsInOrder().map(n=>'<option value="'+escapeHtml(n)+'"'+(n===name?" selected":"")+'>'+
              escapeHtml(n || t("bgw.no_set", "No set"))+'</option>').join("")+
            '<option value="__new__">'+escapeHtml(t("bgw.new_set", "New set…"))+'</option>'+
          '</select>'+
          '<button class="btn-outline btn-sm" onclick="deleteBingoWord('+i+')" '+
            'title="'+escapeHtml(t("bgw.ti.remove", "Remove this word"))+'">×</button>'+
        '</div>'+
        '<div class="di-termrow-forbid">'+
          '<input type="text" class="tq-hint-in" value="'+escapeHtml(w.clue||"")+'" '+
            'placeholder="'+escapeHtml(t("bgw.ph.clue", "what you read out — a definition, or a sentence with a gap"))+'" '+
            'oninput="setBingoWordField('+i+',\'clue\',this.value)">'+
        '</div>'+
      '</div>';
    });
  });
  box.innerHTML=html;
  bwPaintCount();
}

/* The count, against the floor, said while the list is being written rather than when the
   game refuses to start. A teacher who can see that seven more are needed types seven more. */
function bwPaintCount(){
  const el=document.getElementById("bgw-count");
  if(!el) return;
  const good=bingoWords(BWORDS.list).length;
  const short=BINGO_MIN_WORDS-good;
  el.textContent = short>0
    ? t("bgw.n_words_need_more", "{count} usable — {short} more for a game of bingo.",
        { count:good, short:short })
    : t("bgw.n_words_enough", "{count} usable — enough for bingo.", { count:good });
  el.className = "hint" + (short>0 ? " warn" : "");
}

function setBingoWordField(i, field, value){
  const w=BWORDS.list[i]; if(!w) return;
  w[field]=value;
  if(field==="word") bwPaintCount();
}

function renameBingoSetName(oldName, newName){
  const name=String(newName||"").trim();
  if(name===oldName) return;
  const clash=setsIn(BWORDS.list).indexOf(name);
  if(name && clash>=0 &&
     !confirm(t("bgw.merge_sets_confirm",
       "“{name}” already exists. Merge these {count} words into it?",
       { name:name, count:bwIndexesIn(oldName).length }))){ renderBingoWordList(); return; }
  bwIndexesIn(oldName).forEach(i=>{ BWORDS.list[i].theme=name; });
  BWORDS.lastTheme=name;
  renderBingoWordList();
}

function removeBingoSetName(name){
  const rows=bwIndexesIn(name);
  if(!rows.length) return;
  if(!confirm(t("bgw.delete_set_words_confirm",
    "Remove “{name}” and the {count} {words} in it?",
    { name: name || t("bgw.no_set", "No set"), count:rows.length,
      words: plural(rows.length, t("bg.word", "word"), t("bg.words", "words")) }))) return;
  BWORDS.list = BWORDS.list.filter(w=>String(w.theme||"").trim()!==name);
  if(!BWORDS.list.length) BWORDS.list=[blankBingoWord()];
  renderBingoWordList();
}

function addBingoWordTo(name){
  const w=blankBingoWord();
  w.theme=name;
  const rows=bwIndexesIn(name);
  const at=rows.length ? rows[rows.length-1]+1 : BWORDS.list.length;
  BWORDS.list.splice(at, 0, w);
  BWORDS.lastTheme=name;
  renderBingoWordList();
}

function moveBingoWordToSet(i, value){
  const w=BWORDS.list[i]; if(!w) return;
  if(value==="__new__"){
    const name=prompt(t("bgw.name_the_new_set", "Name the new set:"), "");
    if(name===null){ renderBingoWordList(); return; }
    w.theme=String(name).trim();
  } else w.theme=value;
  BWORDS.lastTheme=w.theme;
  renderBingoWordList();
}

function addBingoWord(){ BWORDS.list.push(blankBingoWord()); renderBingoWordList(); }

function deleteBingoWord(i){
  if(BWORDS.list.length<=1){ alert(t("bgw.list_needs_one_word", "A list needs at least one word.")); return; }
  BWORDS.list.splice(i,1);
  renderBingoWordList();
}

function setBingoWordsLang(){
  BWORDS.lang=document.getElementById("bgw-set-lang").value==="fr" ? "fr" : "en";
  BWORDS.list.forEach(w=>{ w.lang=BWORDS.lang; });
}


/* ---------- saving ---------- */

/* The checks a bingo list needs, and only those.

   The one that matters is the GIVEAWAY: a clue containing its own word reads the answer out
   with the question, which in the definitions version is the whole exercise handed over. It
   is also the easiest mistake to make, because the obvious clue for a word is usually a
   sentence about the word using the word. Same rule as the Twenty Questions hint check, for
   the same reason. */
const BGW_STOP = "a an the of to it is in on and or you your they their with for one at".split(" ");

function bwWordsOf(text){
  const m=String(text||"").toLowerCase().match(/[a-z]+/g);
  return m ? m.filter(w=>w.length>2 && BGW_STOP.indexOf(w)<0) : [];
}

function bingoListProblems(list){
  const out=[];
  const seen={};
  (list||[]).forEach((w,i)=>{
    const where=t("bgw.where", "Word {n}: ", {n:i+1});
    const word=String(w.word||"").trim();
    if(!word){ out.push(where+t("bgw.is_empty", "is empty.")); return; }
    if(word.split(/\s+/).length > 3)
      out.push(where+t("bgw.too_long", "“{word}” is too long for a card cell and will be left out.", {word:word}));
    const key=word.toLowerCase();
    if(seen[key]) out.push(where+t("bgw.is_a_duplicate",
      "“{word}” appears twice — only the first will be used.", {word:word}));
    seen[key]=true;
    const clue=String(w.clue||"").trim();
    if(!clue){
      out.push(where+t("bgw.no_clue",
        "no clue, so it can only be called as the word itself."));
    } else if(bwWordsOf(clue).indexOf(key)>=0 || clue.toLowerCase().indexOf(key)>=0){
      out.push(where+t("bgw.clue_gives_it_away",
        "the clue contains “{word}”, which reads the answer out with the question.", {word:word}));
    }
  });
  const usable=bingoWords(list).length;
  if(usable < BINGO_MIN_WORDS)
    out.push(t("bgw.too_few_to_play",
      "Only {count} usable {words}: bingo needs {min}, or a card is full before the room looks up.",
      { count:usable, words: plural(usable, t("bg.word", "word"), t("bg.words", "words")),
        min: BINGO_MIN_WORDS }));
  return out;
}

async function saveBingoSet(){
  BWORDS.name=document.getElementById("bg-set-name").value.trim();
  setBingoWordsLang();
  if(!BWORDS.name){ alert(t("bgw.give_list_name", "Give the list a name — Insurance basics, Unit 4 vocabulary, and so on.")); return; }
  BWORDS.list = BWORDS.list.filter(w=>String(w.word||"").trim());
  if(!BWORDS.list.length){
    alert(t("bgw.list_needs_one_word", "A list needs at least one word."));
    BWORDS.list=[blankBingoWord()]; renderBingoWordList(); return;
  }
  const problems=bingoListProblems(BWORDS.list);
  if(problems.length){
    /* Saveable anyway: a list is written over several sittings, and refusing to save an
       unfinished one is how a teacher loses the twelve words they had. */
    if(!confirm(t("bgw.list_isn_t_finished", "This list isn’t finished:\n\n")+problems.slice(0,8).join("\n")+
      (problems.length>8 ? "\n"+t("scenarios.and_n_more", "…and {n} more", {n:problems.length-8}) : "")+
      "\n\n"+t("scenarios.save_it_anyway", "Save it anyway?"))) return;
  }
  const key=BWORDS.key || quizKey(BWORDS.name);
  try{ await Backend.saveQuiz(key, BWORDS.name, BWORDS.list, [], "bingo"); }
  catch(e){ alert(t("bgw.couldn_t_save", "Couldn't save: ")+e.message); return; }
  BWORDS.key=key; markBwSaved();
  await loadQuizList();
  alert(t("bgw.saved", "Saved “")+BWORDS.name+"”.");
  showScreen("screen-admin");
}

function leaveBingoEditor(){
  if(bwAreDirty() &&
     !confirm(t("bgw.leave_without_saving", "Leave without saving?\n\nNothing is kept until you press Save List."))) return;
  showScreen("screen-admin");
}
