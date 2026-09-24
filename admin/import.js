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
          ? "That file has no poll questions in it."
          : "That file contains only poll questions — import it from the Poll Creator instead.");
        return;
      }
      TEACHER.questions=TEACHER.questions.concat(keep); renderQBank();
      if(dropped) alert("Imported "+keep.length+" question(s).\n\n"+dropped+" were the wrong type for this "+(BUILDER_MODE==="poll"?"poll":"quiz")+" and were skipped.");
    }catch(err){ alert("Couldn't read that file. Expecting a JSON array of question objects, or a file made by Export."); } };
    reader.readAsText(file); };
  input.click();
}


/* ============ EXCEL IMPORT ============ */
function importFromExcel(){
  if(typeof XLSX==="undefined"){ alert("Excel library didn't load (needs internet). Try JSON import."); return; }
  const input=document.createElement("input"); input.type="file"; input.accept=".xlsx,.xls,.csv";
  input.onchange=e=>{ const file=e.target.files[0]; if(!file) return; const reader=new FileReader();
    reader.onload=ev=>{ try{
      const wb=XLSX.read(ev.target.result,{type:"array"});
      const sheetName=wb.SheetNames.indexOf("Questions")>=0?"Questions":wb.SheetNames[0];
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{defval:""});
      const {questions,errors}=parseQuizRows(rows);
      if(questions.length===0){ alert("No valid questions found.\n\n"+(errors.join("\n")||"Check the template columns.")); return; }
      // Only the kind this bank holds is taken; the rest are reported rather than silently dropped.
      const keep=questions.filter(q=>isPollType(q.type)===(BUILDER_MODE==="poll"));
      const dropped=questions.length-keep.length;
      if(keep.length===0){
        alert(BUILDER_MODE==="poll"
          ? "That sheet has no poll questions.\n\nSet Type to “poll” or “cloud”, or import it into the Test Creator instead."
          : "That sheet contains only poll questions.\n\nImport it from the Poll Creator instead (Admin → + Create a New Poll).");
        return;
      }
      TEACHER.questions=TEACHER.questions.concat(keep); renderQBank();
      let msg="Imported "+keep.length+" question(s).";
      if(dropped) msg+="\n\n"+dropped+" question(s) were the wrong type for this "+(BUILDER_MODE==="poll"?"poll":"quiz")+" and were skipped.";
      if(errors.length) msg+="\n\nSkipped rows:\n"+errors.join("\n");
      alert(msg);
    }catch(err){ alert("Couldn't read that file: "+err.message); } };
    reader.readAsArrayBuffer(file); };
  input.click();
}

function parseQuizRows(rows){
  const questions=[], errors=[];
  const get=(row,name)=>{ const key=Object.keys(row).find(k=>k.trim().toLowerCase()===name.toLowerCase()); return key?String(row[key]).trim():""; };
  rows.forEach((row,i)=>{
    const rowNum=i+2;
    const typeRaw=get(row,"Type").toLowerCase();
    const text=get(row,"Question");
    if(!typeRaw&&!text) return;
    if(!text){ errors.push("Row "+rowNum+": missing question text."); return; }
    const typeMap={"mcq":"mcq","multiple choice":"mcq","true/false":"tf","tf":"tf","true false":"tf","text":"text","short text":"text","short answer":"text","numeric":"numeric","number":"numeric","order":"order","puzzle":"order","ordering":"order",
                   "poll":"poll","vote":"poll","live poll":"poll","cloud":"cloud","wordcloud":"cloud","word cloud":"cloud"};
    const type=typeMap[typeRaw];
    if(!type){ errors.push("Row "+rowNum+': unknown Type "'+typeRaw+'".'); return; }
    const points=parseFloat(get(row,"Points"))||1;
    const timeLimitSec=Math.max(0, parseInt(get(row,"TimeLimitSec"),10)||0);
    const q={ id:"q_"+uid(6), type, text, points, timeLimitSec, image: get(row,"ImageURL")||null, audio: get(row,"AudioURL")||null };
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
        if(opts.length<2){ errors.push("Row "+rowNum+": poll needs at least 2 choices in OptionA..E."); return; }
        q.options=opts;
      } else {
        q.maxWords=Math.max(1, Math.min(3, parseInt(get(row,"MaxWords"),10)||1));
      }
      questions.push(q);
      return;
    }
    if(type==="mcq"){
      const opts=["OptionA","OptionB","OptionC","OptionD","OptionE"].map(c=>get(row,c)).filter(Boolean);
      if(opts.length<2){ errors.push("Row "+rowNum+": MCQ needs at least 2 options."); return; }
      const correctRaw=get(row,"Correct"); let correct=null;
      const letterIdx="ABCDE".indexOf(correctRaw.toUpperCase());
      if(letterIdx>=0&&letterIdx<opts.length) correct=opts[letterIdx];
      else if(opts.includes(correctRaw)) correct=correctRaw;
      if(correct===null){ errors.push("Row "+rowNum+': Correct "'+correctRaw+'" must be a letter or match an option.'); return; }
      q.options=opts; q.correct=correct;
    } else if(type==="tf"){
      const c=get(row,"Correct").toLowerCase();
      if(c!=="true"&&c!=="false"){ errors.push("Row "+rowNum+": True/False Correct must be True or False."); return; }
      q.options=["True","False"]; q.correct=c==="true"?"True":"False";
    } else if(type==="text"){
      const accepted=get(row,"Correct").split(",").map(s=>s.trim()).filter(Boolean);
      if(accepted.length===0){ errors.push("Row "+rowNum+": text question needs an accepted answer."); return; }
      q.correct=accepted;
      const cs=get(row,"CaseSensitive").toLowerCase();
      q.caseSensitive = !(cs==="false"||cs==="no"||cs==="0"); // default case-sensitive
    } else if(type==="numeric"){
      const n=parseFloat(get(row,"Correct"));
      if(isNaN(n)){ errors.push("Row "+rowNum+": numeric Correct must be a number."); return; }
      q.correct=n; q.tolerance=parseFloat(get(row,"Tolerance"))||0;
    } else if(type==="order"){
      const items=["OptionA","OptionB","OptionC","OptionD","OptionE"].map(c=>get(row,c)).filter(Boolean);
      if(items.length<2){ errors.push("Row "+rowNum+": puzzle needs at least 2 items (in OptionA..E, correct order)."); return; }
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

  (rows||[]).forEach((row,i)=>{
    const rowNum=i+2;
    const title=get(row,"Scenario");
    const label=get(row,"Role");
    const brief=get(row,"Brief");
    if(!title && !label && !brief) return;                       // a spacer row
    if(!title){ errors.push("Row "+rowNum+": no Scenario name, so this role belongs to nothing."); return; }
    if(!label){ errors.push("Row "+rowNum+': scenario "'+title+'" has a role with no name.'); return; }
    if(!byTitle[title]){
      byTitle[title]={ id:"sc_"+uid(6), title:title, situation:get(row,"Situation"), roles:[] };
      order.push(title);
    }
    // The situation is usually on the first row; take it from a later row if that is where
    // the teacher put it, rather than silently losing it.
    if(!byTitle[title].situation) byTitle[title].situation=get(row,"Situation");
    const role={ label:label, brief:brief, secret:get(row,"Secret"), useful:get(row,"Useful") };
    if(yes(get(row,"Optional"))) role.optional=true;
    byTitle[title].roles.push(role);
  });

  order.forEach(t=>{
    const sc=byTitle[t];
    if(!sc.situation) errors.push('Scenario "'+t+'": no Situation, so nobody sees the shared setup.');
    if(sc.roles.filter(r=>!r.optional).length<2){
      errors.push('Scenario "'+t+'": needs at least two roles that are not optional — skipped.');
      return;
    }
    if(sc.roles.length>3) errors.push('Scenario "'+t+'": only the first three roles are used.');
    sc.roles=sc.roles.slice(0,3);
    scenarios.push(sc);
  });
  return { scenarios:scenarios, errors:errors };
}
