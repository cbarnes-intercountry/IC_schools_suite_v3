/* ============================================================================
   Classroom Exam App — admin/import.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Excel in, JSON out. */

function exportQuestionsJSON(){
  const blob=new Blob([JSON.stringify(TEACHER.questions,null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="questions.json"; a.click();
}

function importQuestionsPrompt(){
  const input=document.createElement("input"); input.type="file"; input.accept="application/json";
  input.onchange=e=>{ const file=e.target.files[0]; const reader=new FileReader();
    reader.onload=ev=>{ try{
      const data=JSON.parse(ev.target.result);
      // Accepts either a bare array of questions or a file produced by Export (which
      // wraps them in {name, kind, schools, questions}).
      const arr = Array.isArray(data) ? data : (Array.isArray(data.questions) ? data.questions : null);
      if(!arr) throw 0;
      arr.forEach(q=>{ if(!q.id) q.id="q_"+uid(6); });
      const keep=arr.filter(q=>isPollType(q.type)===(BUILDER_MODE==="poll"));
      const dropped=arr.length-keep.length;
      if(keep.length===0){
        alert(BUILDER_MODE==="poll"
          ? t("import.file_no_poll_questions", "That file has no poll questions in it.")
          : t("import.file_only_poll_questions", "That file contains only poll questions \u2014 import it from the Poll Creator instead."));
        return;
      }
      TEACHER.questions=TEACHER.questions.concat(keep); renderQBank();
      if(dropped) alert(
        t("import.imported_n", "Imported {count} {questions}.", { count:keep.length, questions: plural(keep.length, t("poll.question", "question"), t("poll.questions", "questions")) })
        + "\n\n" + t("import.n_wrong_type_skipped", "{count} were the wrong type for this {what} and were skipped.",
            { count:dropped, what:setLabel(BUILDER_MODE).one }));
    }catch(err){ alert(t("import.couldn_t_read_file_expecting_json", "Couldn't read that file. Expecting a JSON array of question objects, or a file made by Export.")); } };
    reader.readAsText(file); };
  input.click();
}


/* ============ EXCEL IMPORT ============ */
function importFromExcel(){
  if(typeof XLSX==="undefined"){ alert(t("import.excel_library_didn_t_load_needs", "Excel library didn't load (needs internet). Try JSON import.")); return; }
  const input=document.createElement("input"); input.type="file"; input.accept=".xlsx,.xls,.csv";
  input.onchange=e=>{ const file=e.target.files[0]; if(!file) return; const reader=new FileReader();
    reader.onload=ev=>{ try{
      const wb=XLSX.read(ev.target.result,{type:"array"});
      const sheetName=wb.SheetNames.indexOf("Questions")>=0?"Questions":wb.SheetNames[0];
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{defval:""});
      const {questions,errors}=parseQuizRows(rows);
      if(questions.length===0){ alert(t("import.no_valid_questions_found", "No valid questions found.\n\n")+(errors.join("\n")||t("import.check_template_columns", "Check the template columns."))); return; }
      // Only the kind this bank holds is taken; the rest are reported rather than silently dropped.
      const keep=questions.filter(q=>isPollType(q.type)===(BUILDER_MODE==="poll"));
      const dropped=questions.length-keep.length;
      if(keep.length===0){
        alert(BUILDER_MODE==="poll"
          ? t("import.sheet_no_poll_questions", "That sheet has no poll questions.\n\nSet Type to \u201cpoll\u201d or \u201ccloud\u201d, or import it into the Test Creator instead.")
          : t("import.sheet_only_poll_questions", "That sheet contains only poll questions.\n\nImport it from the Poll Creator instead (Admin \u2192 + Create a New Poll)."));
        return;
      }
      TEACHER.questions=TEACHER.questions.concat(keep); renderQBank();
      let msg=t("import.imported_n", "Imported {count} {questions}.", { count:keep.length, questions: plural(keep.length, t("poll.question", "question"), t("poll.questions", "questions")) });
      if(dropped) msg+="\n\n"+t("import.n_questions_wrong_type_skipped", "{count} {questions} were the wrong type for this {what} and were skipped.",
        { count:dropped, questions: plural(dropped, t("poll.question", "question"), t("poll.questions", "questions")), what:setLabel(BUILDER_MODE).one });
      if(errors.length) msg+="\n\n"+t("import.skipped_rows", "Skipped rows:")+"\n"+errors.join("\n");
      alert(msg);
    }catch(err){ alert(t("import.couldn_t_read_file", "Couldn't read that file: ")+err.message); } };
    reader.readAsArrayBuffer(file); };
  input.click();
}

/* The Language column, shared by both sheets. A set is written in one language — a test is not
   a bilingual object — so a sheet that disagrees with itself is an error rather than a guess.
   Blank means English, which is every sheet written before v5. */
function readSheetLang(rows, get, errors){
  const seen=[...new Set((rows||[]).map(r=>get(r,"Language").toLowerCase()).filter(Boolean))];
  const bad=seen.filter(v=>v!=="en"&&v!=="fr"&&v!=="english"&&v!=="french"&&v!=="anglais"&&v!=="français"&&v!=="francais");
  if(bad.length){ errors.push(t("import.language_not_recognised", "Language must be en or fr \u2014 \u201c{value}\u201d was not recognised.", {value:bad[0]})); return "en"; }
  const norm=[...new Set(seen.map(v=>v.startsWith("f")?"fr":"en"))];
  if(norm.length>1){ errors.push(t("import.sheet_mixes_languages", "This sheet mixes English and French rows. One set is written in one language \u2014 split them into two sheets.")); return "en"; }
  return norm[0]||"en";
}

function parseQuizRows(rows){
  const questions=[], errors=[];
  const get=(row,name)=>{ const key=Object.keys(row).find(k=>k.trim().toLowerCase()===name.toLowerCase()); return key?String(row[key]).trim():""; };
  const lang=readSheetLang(rows, get, errors);
  rows.forEach((row,i)=>{
    const rowNum=i+2;
    const typeRaw=get(row,"Type").toLowerCase();
    const text=get(row,"Question");
    if(!typeRaw&&!text) return;
    if(!text){ errors.push(t("import.row_missing_question_text", "Row {row}: missing question text.", {row:rowNum})); return; }
    const typeMap={"mcq":"mcq","multiple choice":"mcq","true/false":"tf","tf":"tf","true false":"tf","text":"text","short text":"text","short answer":"text","numeric":"numeric","number":"numeric","order":"order","puzzle":"order","ordering":"order",
                   "poll":"poll","vote":"poll","live poll":"poll","cloud":"cloud","wordcloud":"cloud","word cloud":"cloud"};
    const type=typeMap[typeRaw];
    if(!type){ errors.push(t("import.row_unknown_type", "Row {row}: unknown Type \u201c{type}\u201d.", {row:rowNum, type:typeRaw})); return; }
    const points=parseFloat(get(row,"Points"))||1;
    const timeLimitSec=Math.max(0, parseInt(get(row,"TimeLimitSec"),10)||0);
    const q={ id:"q_"+uid(6), type, text, points, timeLimitSec, lang: lang, image: get(row,"ImageURL")||null, audio: get(row,"AudioURL")||null };
    // Not a picture — a search term. It fills the image picker's box when this question is
    // opened, so a sheet can suggest what to look for without committing to a particular image.
    const isq=get(row,"ImageSearch"); if(isq) q.imageSearch=isq;
    if(isPollType(type)){
      // Poll questions are never marked, so Points and Correct are ignored on import.
      q.points=0; q.correct=null;
      // Results are revealed by default. New sheets use HideResults; older ones carried
      // ShowLive (blank = hidden), so honour that when HideResults isn't present at all.
      const hasCol=(name)=>Object.keys(row).some(k=>k.trim().toLowerCase()===name.toLowerCase());
      const yes=(v)=>(v==="true"||v==="yes"||v==="1"||v==="y"||v==="x");
      if(hasCol("HideResults")){
        q.hideResults = yes(get(row,"HideResults").toLowerCase());
      } else if(hasCol("ShowLive")){
        q.hideResults = !yes(get(row,"ShowLive").toLowerCase());
      } else {
        q.hideResults = false;
      }
      if(type==="poll"){
        const opts=["OptionA","OptionB","OptionC","OptionD","OptionE"].map(c=>get(row,c)).filter(Boolean);
        if(opts.length<2){ errors.push(t("import.row_poll_needs_choices", "Row {row}: poll needs at least 2 choices in OptionA..E.", {row:rowNum})); return; }
        q.options=opts;
      } else {
        q.maxWords=Math.max(1, Math.min(3, parseInt(get(row,"MaxWords"),10)||1));
      }
      questions.push(q);
      return;
    }
    if(type==="mcq"){
      const opts=["OptionA","OptionB","OptionC","OptionD","OptionE"].map(c=>get(row,c)).filter(Boolean);
      if(opts.length<2){ errors.push(t("import.row_mcq_needs_options", "Row {row}: MCQ needs at least 2 options.", {row:rowNum})); return; }
      const correctRaw=get(row,"Correct"); let correct=null;
      const letterIdx="ABCDE".indexOf(correctRaw.toUpperCase());
      if(letterIdx>=0&&letterIdx<opts.length) correct=opts[letterIdx];
      else if(opts.includes(correctRaw)) correct=correctRaw;
      if(correct===null){ errors.push(t("import.row_correct_must_match", "Row {row}: Correct \u201c{value}\u201d must be a letter or match an option.", {row:rowNum, value:correctRaw})); return; }
      q.options=opts; q.correct=correct;
    } else if(type==="tf"){
      const c=get(row,"Correct").toLowerCase();
      if(c!=="true"&&c!=="false"){ errors.push(t("import.row_tf_correct", "Row {row}: True/False Correct must be True or False.", {row:rowNum})); return; }
      q.options=["True","False"]; q.correct=c==="true"?"True":"False";
    } else if(type==="text"){
      const accepted=get(row,"Correct").split(",").map(s=>s.trim()).filter(Boolean);
      if(accepted.length===0){ errors.push(t("import.row_text_needs_answer", "Row {row}: text question needs an accepted answer.", {row:rowNum})); return; }
      q.correct=accepted;
      const cs=get(row,"CaseSensitive").toLowerCase();
      q.caseSensitive = !(cs==="false"||cs==="no"||cs==="0"); // default case-sensitive
    } else if(type==="numeric"){
      // parseFloat used to accept this silently: "3,5" came back as 3, so the whole class
      // was then marked against an answer the author never wrote. Strict, and it says so.
      const rawN=get(row,"Correct").trim();
      const n=parseStrictNumber(rawN,lang);
      if(n===null){ errors.push(t("import.row_numeric_correct",
        "Row {row}: numeric Correct must be written as a {language} number \u2014 \u201c{value}\u201d was not accepted (use {example}).",
        { row:rowNum, value:rawN,
          language: lang==="fr" ? t("import.french", "French") : t("import.english", "English"),
          example: lang==="fr" ? t("import.example_fr", "3,5, not 3.5") : t("import.example_en", "3.5, not 3,5") })); return; }
      const rawTol=get(row,"Tolerance").trim();
      const tol=rawTol?parseStrictNumber(rawTol,lang):0;
      if(tol===null){ errors.push(t("import.row_tolerance",
        "Row {row}: Tolerance must be written as a {language} number \u2014 \u201c{value}\u201d was not accepted.",
        { row:rowNum, value:rawTol,
          language: lang==="fr" ? t("import.french", "French") : t("import.english", "English") })); return; }
      q.correct=n; q.tolerance=tol;
    } else if(type==="order"){
      const items=["OptionA","OptionB","OptionC","OptionD","OptionE"].map(c=>get(row,c)).filter(Boolean);
      if(items.length<2){ errors.push(t("import.row_puzzle_needs_items", "Row {row}: puzzle needs at least 2 items (in OptionA..E, correct order).", {row:rowNum})); return; }
      q.items=items; q.correct=items.slice();
    }
    questions.push(q);
  });
  return {questions,errors};
}

/* ---------- role-play scenarios ----------
   One row per role, grouped by the Scenario column. The situation is written once, on the
   first row of each scenario; later rows may leave it blank. A role marked Optional is the
   third voice that absorbs a spare student when the class does not divide evenly. */
function parseScenarioRows(rows){
  const scenarios=[], errors=[], order=[], byTitle={};
  const get=(row,name)=>{ const key=Object.keys(row).find(k=>k.trim().toLowerCase()===name.toLowerCase()); return key?String(row[key]).trim():""; };
  const yes=v=>{ const s=String(v).trim().toLowerCase(); return s==="true"||s==="yes"||s==="1"||s==="y"||s==="x"; };
  const lang=readSheetLang(rows, get, errors);

  (rows||[]).forEach((row,i)=>{
    const rowNum=i+2;
    const title=get(row,"Scenario");
    const label=get(row,"Role");
    const brief=get(row,"Brief");
    if(!title && !label && !brief) return;                       // a spacer row
    if(!title){ errors.push(t("import.row_no_scenario_name", "Row {row}: no Scenario name, so this role belongs to nothing.", {row:rowNum})); return; }
    if(!label){ errors.push(t("import.row_role_no_name", "Row {row}: scenario \u201c{title}\u201d has a role with no name.", {row:rowNum, title:title})); return; }
    if(!byTitle[title]){
      byTitle[title]={ id:"sc_"+uid(6), title:title, lang:lang, situation:get(row,"Situation"), roles:[] };
      order.push(title);
    }
    // The situation is usually on the first row; take it from a later row if that is where
    // the teacher put it, rather than silently losing it.
    if(!byTitle[title].situation) byTitle[title].situation=get(row,"Situation");
    const role={ label:label, brief:brief, secret:get(row,"Secret"), useful:get(row,"Useful") };
    if(yes(get(row,"Optional"))) role.optional=true;
    byTitle[title].roles.push(role);
  });

  order.forEach(title=>{
    const sc=byTitle[title];
    if(!sc.situation) errors.push(t("import.scenario_no_situation", "Scenario \u201c{title}\u201d: no Situation, so nobody sees the shared setup.", {title:title}));
    if(sc.roles.filter(r=>!r.optional).length<2){
      errors.push(t("import.scenario_needs_two_roles", "Scenario \u201c{title}\u201d: needs at least two roles that are not optional \u2014 skipped.", {title:title}));
      return;
    }
    if(sc.roles.length>3) errors.push(t("import.scenario_only_three_roles", "Scenario \u201c{title}\u201d: only the first three roles are used.", {title:title}));
    sc.roles=sc.roles.slice(0,3);
    scenarios.push(sc);
  });
  return { scenarios:scenarios, errors:errors, lang:lang };
}


/* One row per term: a Theme, the Term, then up to four forbidden words. Accepts Forbidden1..4
   or Forbidden/Forbidden2../Forbidden4, because a teacher copying the header row by hand will
   write one or the other and neither is wrong.

   A blank Set inherits the row above, which is what an author who filled the column in once per
   block expects — and is how the sheet reads to a person. A pack is ONE AREA and the sets are
   what a lesson picks, so a term with no set can be played only as part of the whole area. */
function parseTermRows(rows){
  const terms=[], errors=[], seen={};
  const get=(row,name)=>{ const key=Object.keys(row).find(k=>k.trim().toLowerCase()===name.toLowerCase()); return key?String(row[key]).trim():""; };
  const lang=readSheetLang(rows, get, errors);
  let theme="";
  (rows||[]).forEach((row,i)=>{
    const rowNum=i+2;
    const word=get(row,"Term");
    // "Set" is the word on the screen; "Theme" was v3.7's, and packs written then still import.
    const here=get(row,"Set") || get(row,"Theme");
    const forbidden=["Forbidden1","Forbidden2","Forbidden3","Forbidden4"].map((n,j)=>
      get(row,n) || get(row, j===0 ? "Forbidden" : "Forbidden"+(j+1))).filter(Boolean);
    if(here) theme=here;
    if(!word && !forbidden.length) return;                       // a spacer row
    if(!word){ errors.push(t("import.row_no_term", "Row {row}: forbidden words with no term.", {row:rowNum})); return; }
    /* Within a SET, not within the area: an area holds several sets, a lesson plays one, and a
       word like "forecast" belongs in more than one of them. */
    const key=theme.toLowerCase()+"\u0000"+word.toLowerCase();
    if(seen[key]){ errors.push(t("import.row_duplicate_term", "Row {row}: \u201c{term}\u201d is already in this set.", {row:rowNum, term:word})); return; }
    seen[key]=true;
    if(forbidden.length>4) errors.push(t("import.row_only_four_forbidden", "Row {row}: only the first four forbidden words are used.", {row:rowNum}));
    if(!theme) errors.push(t("import.row_no_set", "Row {row}: \u201c{term}\u201d has no set, so it can only be played as part of the whole area.", {row:rowNum, term:word}));
    terms.push({ id:"tm_"+uid(6), term:word, forbidden:forbidden.slice(0,4), theme:theme, lang:lang });
  });
  return { terms:terms, errors:errors, lang:lang };
}


/* Twenty Questions subject sheets. Same shape as the term sheet — a Set column that carries down
   a block, one row per item — so a teacher who has filled one in knows how to fill the other. */
function parseSubjectRows(rows){
  const subjects=[], errors=[], seen={};
  const get=(row,name)=>{ const key=Object.keys(row).find(k=>k.trim().toLowerCase()===name.toLowerCase()); return key?String(row[key]).trim():""; };
  const lang=readSheetLang(rows, get, errors);
  let theme="";
  (rows||[]).forEach((row,i)=>{
    const rowNum=i+2;
    const word=get(row,"Subject");
    const here=get(row,"Set") || get(row,"Theme");
    const rawCat=get(row,"Category");
    const hint=get(row,"Hint");
    /* The holder's card. Semicolon-separated because a comma belongs inside a fact and a teacher
       typing one in Excel should not have to think about that. */
    const facts=get(row,"Facts");
    const born=get(row,"Born"), died=get(row,"Died");
    if(here) theme=here;
    if(!word && !hint && !facts) return;                         // a spacer row
    if(!word){ errors.push(t("import.row_no_subject", "Row {row}: a hint with no subject.", {row:rowNum})); return; }
    const key=theme.toLowerCase()+"\u0000"+word.toLowerCase();
    if(seen[key]){ errors.push(t("import.row_duplicate_subject", "Row {row}: “{subject}” is already in this set.", {row:rowNum, subject:word})); return; }
    seen[key]=true;
    /* A category the app does not know is not worth refusing a whole sheet for, but it must be
       said: the asker is told the category before their first question, so a silent fallback to
       Object would change the game without anyone knowing why. */
    const cat=TQ_CATEGORIES.find(c=>c.toLowerCase()===rawCat.toLowerCase());
    if(rawCat && !cat) errors.push(t("import.row_unknown_category",
      "Row {row}: category “{cat}” is not one the app knows, so “{subject}” is played as an Object.",
      {row:rowNum, cat:rawCat, subject:word}));
    if(!hint) errors.push(t("import.row_no_hint",
      "Row {row}: “{subject}” has no hint, so a stuck pair has nothing to fall back on.", {row:rowNum, subject:word}));
    if(!theme) errors.push(t("import.row_no_set_subject", "Row {row}: “{subject}” has no set, so it can only be played as part of the whole area.", {row:rowNum, subject:word}));
    const factList=String(facts||"").split(";").map(x=>x.trim()).filter(Boolean);
    /* Years are numbers or nothing. A row typing "c. 1930" or "unknown" into Born would otherwise
       reach the card as a life line that reads "bornNaN", which is worse than no line at all. */
    const b=parseInt(born,10), d=parseInt(died,10);
    if(born && !(b>=1 && b<=3000)) errors.push(t("import.row_bad_year",
      "Row {row}: {which} is not a year, so it is left off the card.", {row:rowNum, which:"Born"}));
    if(died && !(d>=1 && d<=3000)) errors.push(t("import.row_bad_year",
      "Row {row}: {which} is not a year, so it is left off the card.", {row:rowNum, which:"Died"}));
    subjects.push({ id:"sj_"+uid(6), subject:word, category:(cat||"Object"), hint:hint,
                    facts:factList,
                    born:(b>=1&&b<=3000)?b:"", died:(d>=1&&d<=3000)?d:"",
                    theme:theme, lang:lang });
  });
  return { subjects:subjects, errors:errors, lang:lang };
}
