/* ============================================================================
   Classroom Exam App — admin/scenarios.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Writing role plays.

   Kept apart from the question builder on purpose: a scenario is not a question with extra
   fields. It has one situation everyone sees and two or three private briefs, and forcing
   that into the question editor would have bent both.

   Scenarios are stored exactly like quizzes and polls — a saved set in the same library,
   with kind "roleplay" — so nothing in the backend had to change to hold them. */

let SCEN = { key:null, name:"", schools:[], list:[], index:0, clean:"" };

/* A phone at arm's length while you are talking is not a sheet of paper. Anything past this
   stops being glanceable, so the editor says so rather than letting a teacher paste three
   paragraphs and discover it in front of a class. French runs 15–20% longer than English,
   so the limit counts characters rather than words. */
const RP_BRIEF_CHARS = 320;

function scenariosFingerprint(){
  return JSON.stringify({ n:SCEN.name, s:SCEN.schools, l:SCEN.list });
}
function markScenariosSaved(){ SCEN.clean = scenariosFingerprint(); }
function scenariosAreDirty(){
  return isScreenActive("screen-rp-editor") && scenariosFingerprint() !== SCEN.clean;
}

function blankScenario(){
  return { id:"sc_"+uid(6), title:"", situation:"",
    roles:[ { label:"", brief:"", secret:"", useful:"" },
            { label:"", brief:"", secret:"", useful:"" } ] };
}

async function newScenarioSet(){
  SCEN = { key:null, name:"", schools:[], list:[blankScenario()], index:0, clean:"" };
  await renderScenarioSchools();
  renderScenarioList(); writeScenarioForm(); markScenariosSaved();
  showScreen("screen-rp-editor");
}

async function loadScenarioSet(){
  const key=document.getElementById("rp-library-select").value;
  if(!key){ alert("Pick a saved role play first."); return; }
  let rec=null;
  try{ rec=await Backend.getQuiz(key); }catch(e){ alert("Couldn't load it: "+e.message); return; }
  if(!rec){ alert("That set has gone."); return; }
  SCEN = { key:key, name:rec.name||"", schools:quizSchools(rec), list:(rec.questions||[]).slice(),
           index:0, clean:"" };
  if(!SCEN.list.length) SCEN.list=[blankScenario()];
  await renderScenarioSchools();
  renderScenarioList(); writeScenarioForm(); markScenariosSaved();
  showScreen("screen-rp-editor");
}

async function deleteScenarioSet(){
  if(!requireOwner("delete a saved role play")) return;
  const sel=document.getElementById("rp-library-select");
  const key=sel.value; if(!key){ alert("Pick a saved role play first."); return; }
  if(!confirm("Delete “"+sel.options[sel.selectedIndex].text+"” for good?")) return;
  try{ await Backend.deleteQuiz(key); }catch(e){ alert("Couldn't delete it: "+e.message); return; }
  await loadQuizList();   // the shared filler, so every bank list stays in step
}

async function renderScenarioSchools(){
  const box=document.getElementById("rp-school-checks");
  if(!box) return;
  let list=[];
  try{ list=(await Backend.listSchools()).schools||[]; }catch(e){ console.warn(e); }
  box.innerHTML = list.length ? list.map(n=>
    '<label class="chk"><input type="checkbox" value="'+escapeHtml(n)+'"'+
    (SCEN.schools.indexOf(n)>=0?" checked":"")+' onchange="readScenarioSchools()"> '+escapeHtml(n)+'</label>'
  ).join("") : '<p class="sub">No schools yet — add one in Admin first.</p>';
}
function readScenarioSchools(){
  SCEN.schools = Array.prototype.slice
    .call(document.querySelectorAll("#rp-school-checks input:checked")).map(i=>i.value);
}

/* ---------- the list of scenarios in this set ---------- */

function renderScenarioList(){
  const box=document.getElementById("rp-scenario-list");
  if(!box) return;
  box.innerHTML = SCEN.list.map((sc,i)=>
    '<div class="qrow'+(i===SCEN.index?" active":"")+'" onclick="pickScenario('+i+')">'+
    '<span class="qrow-no">'+(i+1)+'</span>'+
    '<span class="qrow-text">'+escapeHtml(sc.title||"(untitled scenario)")+'</span>'+
    '<span class="qrow-meta">'+rpCoreRoles(sc).length+(rpExtraRole(sc)?"+1":"")+' roles</span>'+
    '</div>').join("");
  const nm=document.getElementById("rp-set-name"); if(nm) nm.value=SCEN.name;
}

function pickScenario(i){
  readScenarioForm();
  SCEN.index=Math.max(0, Math.min(i, SCEN.list.length-1));
  renderScenarioList(); writeScenarioForm();
}

function addScenario(){
  readScenarioForm();
  SCEN.list.push(blankScenario()); SCEN.index=SCEN.list.length-1;
  renderScenarioList(); writeScenarioForm();
}

function deleteScenario(){
  if(SCEN.list.length<=1){ alert("A set needs at least one scenario."); return; }
  if(!confirm("Delete this scenario from the set?")) return;
  SCEN.list.splice(SCEN.index,1);
  SCEN.index=Math.max(0, SCEN.index-1);
  renderScenarioList(); writeScenarioForm();
}

function moveScenario(dir){
  readScenarioForm();
  const i=SCEN.index, j=i+dir;
  if(j<0 || j>=SCEN.list.length) return;
  const t=SCEN.list[i]; SCEN.list[i]=SCEN.list[j]; SCEN.list[j]=t;
  SCEN.index=j; renderScenarioList(); writeScenarioForm();
}

/* ---------- the open scenario ---------- */

function writeScenarioForm(){
  const sc=SCEN.list[SCEN.index]||blankScenario();
  document.getElementById("rp-f-title").value=sc.title||"";
  document.getElementById("rp-f-situation").value=sc.situation||"";
  const roles=sc.roles||[];
  for(let r=0;r<3;r++){
    const has=!!roles[r];
    document.getElementById("rp-role-"+r).style.display = (r<2||has) ? "block" : "none";
    document.getElementById("rp-f-label-"+r).value=(roles[r]&&roles[r].label)||"";
    document.getElementById("rp-f-brief-"+r).value=(roles[r]&&roles[r].brief)||"";
    document.getElementById("rp-f-secret-"+r).value=(roles[r]&&roles[r].secret)||"";
    document.getElementById("rp-f-useful-"+r).value=(roles[r]&&roles[r].useful)||"";
    if(r===2) document.getElementById("rp-f-optional").checked = !!(roles[2]&&roles[2].optional);
    countBrief(r);
  }
  document.getElementById("rp-add-role").style.display = roles.length>=3 ? "none" : "inline-flex";
  document.getElementById("rp-drop-role").style.display = roles.length>=3 ? "inline-flex" : "none";
}

function readScenarioForm(){
  const sc=SCEN.list[SCEN.index]; if(!sc) return;
  sc.title=document.getElementById("rp-f-title").value.trim();
  sc.situation=document.getElementById("rp-f-situation").value.trim();
  const roles=[];
  const count=document.getElementById("rp-role-2").style.display==="none" ? 2 : 3;
  for(let r=0;r<count;r++){
    const role={ label:document.getElementById("rp-f-label-"+r).value.trim(),
                 brief:document.getElementById("rp-f-brief-"+r).value.trim(),
                 secret:document.getElementById("rp-f-secret-"+r).value.trim(),
                 useful:document.getElementById("rp-f-useful-"+r).value.trim() };
    if(r===2 && document.getElementById("rp-f-optional").checked) role.optional=true;
    roles.push(role);
  }
  sc.roles=roles;
}

function addThirdRole(){
  readScenarioForm();
  const sc=SCEN.list[SCEN.index];
  sc.roles.push({ label:"", brief:"", secret:"", useful:"", optional:true });
  writeScenarioForm(); renderScenarioList();
}
function dropThirdRole(){
  readScenarioForm();
  const sc=SCEN.list[SCEN.index];
  if(sc.roles.length>2) sc.roles.pop();
  writeScenarioForm(); renderScenarioList();
}

function countBrief(r){
  const ta=document.getElementById("rp-f-brief-"+r);
  const out=document.getElementById("rp-count-"+r);
  if(!ta||!out) return;
  const n=ta.value.length;
  out.textContent=n+" / "+RP_BRIEF_CHARS;
  out.className = n>RP_BRIEF_CHARS ? "rp-count over" : "rp-count";
}

function scenarioProblems(list){
  const out=[];
  (list||[]).forEach((sc,i)=>{
    const where="Scenario "+(i+1)+(sc.title?" ("+sc.title+")":"")+": ";
    if(!sc.title) out.push(where+"needs a title.");
    if(!sc.situation) out.push(where+"needs a situation everyone can see.");
    const roles=sc.roles||[];
    if(rpCoreRoles(sc).length<2) out.push(where+"needs at least two roles that are not optional.");
    roles.forEach((r,j)=>{
      if(!r.label) out.push(where+"role "+(j+1)+" has no name.");
      if(!r.brief) out.push(where+'role "'+(r.label||j+1)+'" has no brief.');
      if((r.brief||"").length>RP_BRIEF_CHARS)
        out.push(where+'role "'+(r.label||j+1)+'" is '+r.brief.length+" characters — too long to read on a phone mid-conversation.");
    });
  });
  return out;
}

async function saveScenarioSet(){
  readScenarioForm();
  SCEN.name=document.getElementById("rp-set-name").value.trim();
  readScenarioSchools();
  if(!SCEN.name){ alert("Give the set a name."); return; }
  if(!SCEN.schools.length){ alert("Tick at least one school, or teachers won't find it."); return; }
  const problems=scenarioProblems(SCEN.list);
  if(problems.length){
    if(!confirm("This set isn't finished:\n\n"+problems.slice(0,8).join("\n")+
      (problems.length>8?"\n…and "+(problems.length-8)+" more":"")+"\n\nSave it anyway?")) return;
  }
  const key=SCEN.key || quizKey(SCEN.name);
  try{ await Backend.saveQuiz(key, SCEN.name, SCEN.list, SCEN.schools, "roleplay"); }
  catch(e){ alert("Couldn't save: "+e.message); return; }
  SCEN.key=key; markScenariosSaved();
  await loadQuizList();   // the shared filler, so every bank list stays in step
  alert("Saved “"+SCEN.name+"”.");
  showScreen("screen-admin");
}

function leaveScenarioEditor(){
  readScenarioForm();
  if(scenariosAreDirty() &&
     !confirm("Leave without saving?\n\nNothing is kept until you press Save Role Play.")) return;
  showScreen("screen-admin");
}

/* ---------- Excel ---------- */

function importScenariosFromExcel(){
  if(typeof XLSX==="undefined"){ alert("Excel library didn't load (needs internet)."); return; }
  const input=document.createElement("input"); input.type="file"; input.accept=".xlsx,.xls,.csv";
  input.onchange=e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const wb=XLSX.read(ev.target.result,{type:"array"});
        const name=wb.SheetNames.indexOf("Scenarios")>=0?"Scenarios":wb.SheetNames[0];
        const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{defval:""});
        const {scenarios,errors}=parseScenarioRows(rows);
        if(!scenarios.length){
          alert("No scenarios found.\n\n"+(errors.join("\n")||
            "The sheet needs one row per role, with columns Scenario, Situation, Role and Brief."));
          return;
        }
        readScenarioForm();
        // An empty starter scenario is replaced rather than left at the top of the set.
        const onlyBlank = SCEN.list.length===1 && !SCEN.list[0].title && !SCEN.list[0].situation;
        SCEN.list = onlyBlank ? scenarios : SCEN.list.concat(scenarios);
        SCEN.index = 0;
        renderScenarioList(); writeScenarioForm();
        alert("Imported "+scenarios.length+" scenario(s)."+(errors.length?"\n\nSkipped:\n"+errors.join("\n"):""));
      }catch(err){ alert("Couldn't read that file: "+err.message); }
    };
    reader.readAsArrayBuffer(file);
  };
  input.click();
}
