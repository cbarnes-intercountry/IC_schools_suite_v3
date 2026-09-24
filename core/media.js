/* ============================================================================
   Classroom Exam App — core/media.js
   Part of index.html's script, split out in v3.0. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is
   imported or exported.
   ============================================================================ */

/* Pictures: searching for them, choosing them, drawing them. */

// Show a question's image/audio in an arbitrary pair of containers. Used by both poll
// views so a picture attached in the builder actually reaches the projector and the phones.
function paintQuestionMedia(q, imgId, audioWrapId){
  const img=document.getElementById(imgId);
  if(img){
    if(q && q.image){ img.src=q.image; img.style.display="block"; }
    else { img.removeAttribute("src"); img.style.display="none"; }
    paintImageCredit(q, img);
  }
  const aw=document.getElementById(audioWrapId);
  if(aw) aw.innerHTML = (q && q.audio) ? '<audio controls preload="metadata" src="'+escapeHtml(q.audio)+'"></audio>' : "";
}

/* A credit line, only when the licence demands one. CC0 and public-domain pictures carry no
   imageCredit at all, so nothing is drawn and the question stays clean — which is the whole
   reason the picker defaults to those two licences. The line is inserted after the image and
   removed again when there is nothing to say, so it can't linger from a previous question. */
function paintImageCredit(q, img){
  const id=img.id+"-credit";
  let el=document.getElementById(id);
  const credit=(q && q.image && q.imageCredit) ? String(q.imageCredit) : "";
  if(!credit){ if(el) el.remove(); return; }
  if(!el){
    el=document.createElement("small");
    el.id=id; el.className="hint";
    el.style.cssText="display:block;margin-top:4px;opacity:.65;font-size:.72rem;";
    if(img.parentNode) img.parentNode.insertBefore(el, img.nextSibling);
  }
  el.textContent="Image: "+credit;
  el.style.display="block";
}


/* ============ IMAGE SEARCH (Creative Commons) ============
   Finds pictures for a question without an API key, so there is nothing to register, nothing
   to store and nothing that can expire. Two sources, tried in order:

     Openverse   — aggregates Flickr, Wikimedia and others. Broad, good for everyday subjects.
     Wikimedia   — Commons directly. Narrower and more encyclopaedic, but reliable, and it
                   covers named things (a company, a building, a person) that Openverse misses.

   Wikimedia is not only a fallback for when Openverse is down: its results genuinely differ, so
   a search that returns nothing useful from one is worth repeating against the other.

   LICENSING. The default is CC0 and public-domain only, which carry no attribution requirement
   at all — that is what lets a picture appear on a question with no credit line. Ticking
   "include images that need a credit" widens the search to the rest of Creative Commons, and
   anything chosen from that wider pool carries its credit through to the question and is shown
   to students. Storing the credit but hiding it would not be honouring the licence, so the two
   move together. */
const IMG_FREE_LICENSES = "cc0,pdm";
                 // Creative Commons, no credit required
const IMG_ANY_LICENSES  = "cc0,pdm,by,by-sa,by-nc,by-nd,by-nc-sa,by-nc-nd";

let IMG_PICKER = { page:0, results:[], target:null, source:"" };

let IMG_TOPIC = "";
   // the quiz's subject, worked out when the picker opens

/* Unsplash is the primary source: a curated, keyword-tagged library, which is why a search for
   "negotiation" returns something usable there and something random from an archive.
   The access key is not written into this page — it is kept in the database under
   config/unsplashKey, beside the GitHub token, and an owner sets it from the Admin screen. */
let _unsplashKey = null;

async function unsplashKey(){
  if(_unsplashKey !== null) return _unsplashKey;
  try{ const r = await Backend.getConfig("unsplashKey"); _unsplashKey = (r && r.value) || ""; }
  catch(e){ _unsplashKey = ""; }
  return _unsplashKey;
}


/* Turn a question into a search term. There is no AI in the page, so this is a heuristic:
   drop question words and filler, keep what's left, and use the longest few — longer words
   carry more meaning than short ones. It does well on concrete questions and poorly on
   abstract ones, which is why the box stays editable and why an ImageSearch column on the
   Excel import beats it whenever someone has bothered to fill one in. */
const IMG_STOPWORDS = new Set((
  // Grammar and question scaffolding.
  "a,an,the,and,or,but,if,then,than,that,this,these,those,of,in,on,at,to,for,from,with,without,"+
  "by,as,is,are,was,were,be,been,being,do,does,did,doing,have,has,had,will,would,shall,should,can,could,may,might,must,"+
  "what,which,who,whom,whose,when,where,why,how,not,no,yes,it,its,they,them,their,you,your,we,our,us,he,she,his,her,"+
  "according,primarily,mainly,mostly,following,best,most,least,more,less,many,much,some,any,all,both,each,every,other,"+
  "true,false,correct,answer,question,text,video,article,above,below,here,there,about,into,over,under,again,also,only,"+
  "one,two,three,four,five,first,second,third,next,last,does,say,said,mean,means,stand,called,call,name,names,term,terms,"+
  // Instruction verbs: they open a great many questions and describe nothing photographable.
  "put,place,choose,select,pick,match,identify,complete,explain,describe,define,list,give,state,order,arrange,rank,"+
  "difference,differences,between,among,versus,vs,advantage,advantages,disadvantage,disadvantages,main,example,examples,"+
  /* Meta-nouns and their adjectives. These describe the QUESTION rather than its subject, and
     they are the reason "What was the primary purpose of the first official insurance policies"
     used to search for "primary purpose official" — three words about the shape of the question,
     while "insurance" sat unused in fourth place. They are common in exam writing precisely
     because they are neutral, which is exactly what makes them useless to an image search. */
  "purpose,purposes,role,roles,aim,aims,goal,goals,reason,reasons,cause,causes,effect,effects,impact,impacts,"+
  "importance,significance,function,functions,feature,features,characteristic,characteristics,benefit,benefits,"+
  "factor,factors,aspect,aspects,element,elements,point,points,idea,ideas,concept,concepts,issue,issues,"+
  "result,results,outcome,outcomes,consequence,consequences,objective,objectives,principle,principles,"+
  "primary,official,original,general,typical,particular,specific,common,important,significant,relevant,possible,"+
  "type,types,kind,kinds,sort,form,forms,way,ways,method,methods,process,processes,step,steps,stage,stages,"+
  "part,parts,number,amount,level,levels,degree,extent,range,case,cases,situation,context,basis,"+
  "statement,statements,definition,definitions,description,meaning,meanings,key,word,words,"+
  "after,before,during,since,until,while,through,across,against,within,upon,per,via"
  ).split(","));


/* Words that carry no picture even when they survive the filter. A bare number is the clearest
   case: "1347" is the most specific word in a question about medieval insurance and the least
   searchable — no image library indexes by year. */
function imgWordUseless(w){
  return /^[\p{N}]+$/u.test(w) || /^[\p{N}]+(st|nd|rd|th|s)$/iu.test(w);
}


/* In a question of the shape "the X of the Y", Y is the subject and X is scaffolding — so
   "the primary purpose of the first official insurance policies" should search for "insurance
   policies", not for a description of the question's own grammar.

   The rule only fires when NOTHING before the "of" survived the filter, which is the signal
   that the opening really was pure scaffolding. Without that condition it does more harm than
   good: "a balance sheet covers a period of time" would collapse to "time", and "Lloyds of
   London" would lose the half that names the company. In both of those the head holds real
   words, so the sentence is left alone. */
function imgSubjectHalf(words){
  const i=words.findIndex(w=>w.raw==="of");
  if(i<0) return null;
  if(words.slice(0,i).some(w=>w.keep)) return null;   // the head said something — keep it
  const tail=words.slice(i+1).filter(w=>w.keep);
  return tail.length ? tail : null;
}


/* ---- Quiz topic ----
   A single word is often ambiguous on its own: "risk" returns rock climbers and skydivers,
   when a quiz about insurance wants an underwriter's idea of risk. The quiz itself already
   says what it is about, in two places — the name the teacher gave it, and the words that
   recur across its other questions — so the topic is read from those and added to short
   searches.

   The name is trusted first because a teacher typed it deliberately. Failing that, a word has
   to appear in at least two questions AND in at least a third of them before it counts as the
   subject; a word that turns up once is about that question, not about the quiz. */
function imgContentWords(text){
  return String(text||"")
    .replace(/[^\p{L}\p{N}\s-]/gu," ")
    .split(/\s+/)
    .filter(w=>w.length>2 && !IMG_STOPWORDS.has(w.toLowerCase()) && !imgWordUseless(w));
}


function deriveQuizTopic(questions, setName){
  /* The questions are read before the name. The name is deliberate but often administrative
     and sometimes not in English — "BTS2 Assurance" would have searches asking Unsplash for
     "assurance", which is not the English word for the subject. The question text is the
     evidence of what the quiz is actually about, so it decides, and the name is the fallback
     when there isn't enough of it. */
  const qs=(questions||[]).filter(q=>q && q.text);
  if(qs.length>=2){
    const seenIn={};
    qs.forEach(q=>{
      new Set(imgContentWords(q.text).map(w=>w.toLowerCase())).forEach(w=>{ seenIn[w]=(seenIn[w]||0)+1; });
    });
    // A word must recur across the quiz, not just within one question: at least twice, and in
    // at least a third of the questions.
    const threshold=Math.max(2, Math.ceil(qs.length/3));
    const best=Object.keys(seenIn)
      .filter(w=>seenIn[w]>=threshold)
      // Most widespread first; on a tie the longer word wins, because the longer of two equally
      // common words is nearly always the specific one ("insurance" over "risk") — and the
      // shorter is often the very word that needed disambiguating in the first place.
      .sort((a,b)=> (seenIn[b]-seenIn[a]) || (b.length-a.length) || a.localeCompare(b));
    if(best.length) return best[0];
  }

  // Fall back to the set's name, minus the administrative noise teachers put in it
  // ("BTS2 Assurance — Unit 3" is a cohort and a unit number wrapped round a subject).
  const nameNoise=new Set(["bts","bts1","bts2","unit","test","quiz","poll","revision","final","mock",
    "exam","assessment","module","session","week","term","semester","part","level","group","class"]);
  const fromName=imgContentWords(setName).filter(w=>!nameNoise.has(w.toLowerCase()));
  return fromName.length ? fromName[fromName.length-1].toLowerCase() : "";
}


/* The topic is added to a ONE-WORD search and nothing longer. A single word is where the
   ambiguity lives — "risk" on its own returns rock climbers — while two or three words have
   already narrowed the field, and bolting the subject onto them costs more results than it
   buys. It is never repeated, and because the query ladder drops words from the end, the topic
   is the first thing released if the combined search comes back empty. */
function applyQuizTopic(query, topic){
  if(!query || !topic) return query;
  const words=query.split(/\s+/).filter(Boolean);
  if(words.length!==1) return query;
  if(words[0].toLowerCase()===topic.toLowerCase()) return query;
  return query+" "+topic;
}


function buildImageQuery(q){
  if(!q) return "";
  if(q.imageSearch) return String(q.imageSearch).trim();   // explicit term always wins

  const all=String(q.text||"")
    .replace(/[^\p{L}\p{N}\s-]/gu," ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w,i)=>({ w, i, raw:w.toLowerCase(),
                   keep: w.length>2 && !IMG_STOPWORDS.has(w.toLowerCase()) && !imgWordUseless(w) }));

  // Prefer the half of the sentence after "of", where the subject usually sits.
  let words = imgSubjectHalf(all) || all.filter(w=>w.keep);
  if(!words.length) words = all.filter(w=>w.keep);
  if(!words.length) return "";

  /* Take the first three, in order, with capitalised words promoted. Position beats length —
     English front-loads the subject, so "a balance sheet covers a period" gives "balance sheet
     covers", where picking the longest words would drop "sheet" and leave the meaningless
     "balance covers period". Capitals still win, because an acronym or proper noun is almost
     always what the question is really about. */
  const ranked=words.map(w=>({ w:w.w, i:w.i, cap:/^[\p{Lu}]/u.test(w.w) && w.i>0 }))
    .sort((a,b)=>(b.cap-a.cap) || (a.i-b.i))
    .slice(0,3)
    .sort((a,b)=>a.i-b.i);
  return ranked.map(r=>r.w).join(" ");
}


function openImagePicker(){
  const overlay=document.getElementById("img-overlay");
  const cur=(EDIT_INDEX>=0 && TEACHER.questions[EDIT_INDEX]) || null;
  // Read the live text box, not the saved question — the teacher may have just typed it.
  const draft={ text:(document.getElementById("qe-text")||{}).value||"",
                imageSearch:(cur&&cur.imageSearch)||"" };

  const nameBox=document.getElementById("quiz-save-name");
  IMG_TOPIC=deriveQuizTopic(TEACHER.questions, nameBox ? nameBox.value : "");
  const note=document.getElementById("img-topic-note");
  // An explicit term the teacher wrote is theirs alone — the topic is not bolted onto it.
  const base=buildImageQuery(draft);
  const withTopic=draft.imageSearch ? base : applyQuizTopic(base, IMG_TOPIC);
  if(note){
    note.style.display = (IMG_TOPIC && withTopic!==base) ? "block" : "none";
    note.textContent = "Added \u201c"+IMG_TOPIC+"\u201d from the rest of this quiz \u2014 delete it if it\u2019s pulling the wrong way.";
  }
  document.getElementById("img-q").value = withTopic;
  document.getElementById("img-results").innerHTML="";
  document.getElementById("img-status").textContent="";
  document.getElementById("img-source-note").textContent="";
  document.getElementById("img-more").style.display="none";
  IMG_PICKER={ page:0, results:[], target:"image", source:"" };
  overlay.style.display="flex";
  const box=document.getElementById("img-q");
  if(box && box.focus) try{ box.focus(); box.select(); }catch(e){}
  if(box.value) runImageSearch(0);
}

function closeImagePicker(){ document.getElementById("img-overlay").style.display="none"; }


const IMG_PAGE_SIZE=6;


/* Unsplash. Two of their API rules shape what happens here:

   Attribution. Every photo carries "Photo by <name> on Unsplash", stored on the question and
   shown under the picture. Unlike the Creative Commons sources there is no credit-free subset,
   so the credit line is not optional for these.

   Hotlinking. Unsplash asks that photos be served from their own CDN rather than copied
   elsewhere, because that is how a photographer's views are counted. So an Unsplash pick keeps
   its original URL instead of being copied into the repo the way an upload is. Their CDN is
   reliable and the URLs are stable, so the practical risk is a photographer deleting a photo —
   rare, and visible immediately if it happens. Pictures from the Creative Commons sources are
   still copied, since nothing there asks otherwise. */
async function searchUnsplash(query, page){
  const key=await unsplashKey();
  if(!key) throw new Error("no key");
  const url="https://api.unsplash.com/search/photos?query="+encodeURIComponent(query)+
    "&per_page="+IMG_PAGE_SIZE+"&page="+(page+1)+"&content_filter=high&orientation=landscape";
  const res=await fetch(url,{ headers:{ "Authorization":"Client-ID "+key, "Accept-Version":"v1" } });
  if(res.status===401) throw new Error("the Unsplash key was rejected");
  if(res.status===403) throw new Error("Unsplash's hourly limit is used up");
  if(!res.ok) throw new Error("Unsplash "+res.status);
  const j=await res.json();
  return (j.results||[]).map(r=>({
    thumb: (r.urls&&r.urls.small) || "",
    full:  (r.urls&&r.urls.regular) || (r.urls&&r.urls.full) || "",
    title: r.description || r.alt_description || "",
    creator: (r.user&&r.user.name) || "Unsplash photographer",
    license: "Unsplash",
    needsCredit: true,
    hotlink: true,                                     // served from Unsplash, not copied
    downloadLocation: (r.links&&r.links.download_location) || "",
    source: "Unsplash"
  }));
}


/* Unsplash counts a "download" when a picture is actually used, and asks to be told. It costs
   one request and keeps the photographer's statistics honest, so it fires when a picture is
   chosen — never during browsing, which would inflate every photo that merely appeared. */
async function notifyUnsplashUse(r){
  if(!r || !r.downloadLocation) return;
  try{
    const key=await unsplashKey();
    if(key) await fetch(r.downloadLocation, { headers:{ "Authorization":"Client-ID "+key } });
  }catch(e){ /* a failed count must never block the teacher */ }
}


async function searchOpenverse(query, page, allowCredit){
  const url="https://api.openverse.org/v1/images/?q="+encodeURIComponent(query)+
    "&page_size="+IMG_PAGE_SIZE+"&page="+(page+1)+
    "&license="+(allowCredit?IMG_ANY_LICENSES:IMG_FREE_LICENSES)+
    "&mature=false";
  const res=await fetch(url,{ headers:{ "Accept":"application/json" } });
  if(!res.ok) throw new Error("Openverse "+res.status);
  const j=await res.json();
  return (j.results||[]).map(r=>({
    thumb: r.thumbnail || r.url,
    full:  r.url,
    title: r.title || "",
    creator: r.creator || "",
    license: (r.license||"").toUpperCase(),
    needsCredit: !["CC0","PDM"].includes((r.license||"").toUpperCase()),
    source: "Openverse"
  }));
}


/* Wikimedia Commons. Everything here is freely licensed, but the licence of an individual file
   is only in its metadata, so the no-credit filter is applied after the fact rather than in the
   query. origin=* is what makes the request readable from another site. */
async function searchWikimedia(query, page, allowCredit){
  const offset=page*IMG_PAGE_SIZE;
  const url="https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*"+
    "&generator=search&gsrnamespace=6&gsrlimit="+(IMG_PAGE_SIZE*3)+"&gsroffset="+offset+
    "&gsrsearch="+encodeURIComponent(query+" filetype:bitmap")+
    "&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=420";
  const res=await fetch(url);
  if(!res.ok) throw new Error("Wikimedia "+res.status);
  const j=await res.json();
  const pages=(j.query&&j.query.pages)||{};
  const out=[];
  Object.values(pages).forEach(p=>{
    const ii=(p.imageinfo||[])[0]; if(!ii) return;
    const meta=ii.extmetadata||{};
    const lic=((meta.LicenseShortName&&meta.LicenseShortName.value)||"").toUpperCase();
    const free=/CC0|PUBLIC DOMAIN|PD/.test(lic);
    if(!allowCredit && !free) return;
    out.push({
      thumb: ii.thumburl || ii.url,
      full:  ii.url,
      title: (p.title||"").replace(/^File:/,""),
      creator: ((meta.Artist&&meta.Artist.value)||"").replace(/<[^>]*>/g,"").trim(),
      license: lic,
      needsCredit: !free,
      source: "Wikimedia Commons"
    });
  });
  return out.slice(0, IMG_PAGE_SIZE);
}


/* Progressively shorter attempts at the same search. A three-word phrase is specific and
   often finds nothing; dropping to two words, then one, is what stops a search that merely
   needed widening from looking broken. The words are dropped from the end, because the first
   word of a phrase built from a question is usually its subject. */
function queryLadder(query){
  const words=query.split(/\s+/).filter(Boolean);
  const out=[];
  for(let n=words.length; n>=1; n--) out.push(words.slice(0,n).join(" "));
  return out.length ? out : [query];
}


async function runImageSearch(page){
  const query=(document.getElementById("img-q").value||"").trim();
  const allowCredit=document.getElementById("img-allow-credit").checked;
  const status=document.getElementById("img-status");
  const grid=document.getElementById("img-results");
  const more=document.getElementById("img-more");
  more.style.display="none";
  if(!query){ status.textContent="Type something to search for."; grid.innerHTML=""; return; }
  status.textContent="Searching\u2026";
  if(page===0) grid.innerHTML="";
  if(EDIT_INDEX>=0 && TEACHER.questions[EDIT_INDEX]) TEACHER.questions[EDIT_INDEX].imageSearch=query;

  /* Unsplash first — curated and tagged, so it answers the everyday searches well. The
     Creative Commons sources follow, and earn their place on the encyclopaedic ones:
     Wikimedia has a photograph of a named building or a company's headquarters where a stock
     library has only a generic office. */
  const providers=[
    ["Unsplash",          (q,p)=>searchUnsplash(q,p)],
    ["Openverse",         (q,p)=>searchOpenverse(q,p,allowCredit)],
    ["Wikimedia Commons", (q,p)=>searchWikimedia(q,p,allowCredit)]
  ];

  let results=[], usedSource="", usedQuery=query, noKey=false, firstError="";
  // Narrowing the phrase is tried across every source before giving up on it entirely: a
  // one-word search on the best library beats a three-word search on the weakest.
  outer:
  for(const attempt of queryLadder(query)){
    for(const [name,fn] of providers){
      try{
        const r=await fn(attempt, page);
        if(r.length){ results=r; usedSource=name; usedQuery=attempt; break outer; }
      }catch(e){
        const msg=(e&&e.message)||String(e);
        if(msg==="no key"){ noKey=true; continue; }      // not an error, just not set up yet
        if(!firstError) firstError=name+": "+msg;
      }
    }
  }

  IMG_PICKER.page=page; IMG_PICKER.results=results; IMG_PICKER.source=usedSource;

  if(!results.length){
    status.innerHTML = firstError
      ? escapeHtml(firstError)+" \u2014 try again shortly, or use the upload tile."
      : "Nothing found for \u201c"+escapeHtml(query)+"\u201d. Try a plainer, more concrete word \u2014 something you could photograph.";
    if(noKey && !firstError){
      status.innerHTML += '<br><b>Unsplash isn\u2019t set up yet</b>, so only the Creative Commons archives were searched. '+
        'An owner can add the Unsplash key in Admin \u2192 Image Search.';
    }
    document.getElementById("img-source-note").textContent="";
    return;
  }

  // Say when the phrase was widened, so a teacher isn't puzzled by results that only loosely
  // match what they typed.
  status.textContent = (usedQuery!==query)
    ? "Nothing for \u201c"+query+"\u201d, so this is \u201c"+usedQuery+"\u201d."
    : "";
  document.getElementById("img-source-note").textContent="From "+usedSource+" \u00b7 tap a picture to use it";
  renderImageResults(results, page===0);
  more.style.display="inline-block";
}


function renderImageResults(results, replace){
  const grid=document.getElementById("img-results");
  if(replace) grid.innerHTML="";
  results.forEach(r=>{
    const cell=document.createElement("button");
    cell.type="button";
    cell.style.cssText="padding:0;border:2px solid var(--ink);border-radius:12px;overflow:hidden;background:#fff;cursor:pointer;display:block;text-align:left;";
    const img=document.createElement("img");
    img.src=r.thumb; img.alt=r.title; img.loading="lazy";
    img.style.cssText="width:100%;height:130px;object-fit:cover;display:block;";
    img.onerror=()=>{ cell.remove(); };     // a thumbnail that won't load is no use to anyone
    const cap=document.createElement("span");
    cap.style.cssText="display:block;padding:6px 8px;font-size:.78rem;line-height:1.3;";
    cap.textContent=(r.title||"Untitled").slice(0,60);
    if(r.needsCredit){
      const lic=document.createElement("small");
      lic.className="hint";
      lic.style.display="block";
      lic.textContent="credit: "+(r.creator||"unknown")+" ("+r.license+")";
      cap.appendChild(lic);
    }
    cell.appendChild(img); cell.appendChild(cap);
    cell.onclick=()=>chooseImage(r);
    grid.appendChild(cell);
  });
}


/* ============ MEDIA HOSTING (images + audio via your GitHub repo) ============
   Question media is not secret — students must see/hear it — so it is stored as a public
   file in the repo that already hosts this app, and the question keeps only the URL.
   That keeps the database small and needs no paid storage. */
/* ---- Media hosting settings (set once, here in the code) ----
   Owner/repo/branch are NOT secret, so they live here. The access token is NOT stored
   here: this page is served publicly, so anything in it can be read by students — and a
   token with write access would let anyone alter the app. Instead the token is kept in the
   database under config/githubToken, which the security rules expose only to signed-in
   teachers. Set it once: Firebase console → Realtime Database → Data → add a "config" child
   named githubToken with the token as its value. */
const MEDIA = {
  owner:  "cbarnes-intercountry",
  repo:   "IC-quiz-app-hosting",
  branch: "main"
};

let _ghToken = null;
     // fetched from the database on demand, never shown in the UI
async function ghToken(){
  if(_ghToken !== null) return _ghToken;
  try{ const r = await Backend.getConfig("githubToken"); _ghToken = (r && r.value) || ""; }
  catch(e){ _ghToken = ""; }
  return _ghToken;
}

async function mediaReady(){
  return !!(MEDIA.owner && MEDIA.repo && await ghToken());
}


// Read any file as base64 (works for images and audio alike).
function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(String(r.result).split(",")[1]);
    r.onerror=()=>reject(new Error("Couldn't read that file."));
    r.readAsDataURL(file);
  });
}

// Shrink an image before upload so pages stay quick on phones.
function compressImage(file, maxW=1000, quality=0.72){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        const scale=Math.min(1,maxW/img.width);
        const cv=document.createElement("canvas");
        cv.width=Math.round(img.width*scale); cv.height=Math.round(img.height*scale);
        cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);
        resolve({ base64:cv.toDataURL("image/jpeg",quality).split(",")[1], ext:"jpg" });
      };
      img.onerror=()=>reject(new Error("That image couldn't be read."));
      img.src=e.target.result;
    };
    r.onerror=()=>reject(new Error("Couldn't read that file."));
    r.readAsDataURL(file);
  });
}

async function uploadToGitHub(base64, ext){
  const g={ owner:MEDIA.owner, repo:MEDIA.repo, branch:MEDIA.branch, token:await ghToken() };
  const path="media/"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,8)+"."+ext;
  const res=await fetch("https://api.github.com/repos/"+g.owner+"/"+g.repo+"/contents/"+path,{
    method:"PUT",
    headers:{ "Authorization":"Bearer "+g.token, "Accept":"application/vnd.github+json", "Content-Type":"application/json" },
    body:JSON.stringify({ message:"Add question media "+path, content:base64, branch:g.branch||"main" })
  });
  if(!res.ok){ throw new Error("GitHub upload failed ("+res.status+")"); }
  return "https://raw.githubusercontent.com/"+g.owner+"/"+g.repo+"/"+(g.branch||"main")+"/"+path;
}

// Every route in (tile click, drag-and-drop, clipboard paste) ends up here. On success the
// resulting URL is written into the hidden field, which is what gets saved on the question.
function qMediaBrowse(kind){ const f=document.getElementById("qe-"+kind+"-file"); if(f) f.click(); }

function handleQMediaUpload(evt, kind){
  const file=evt.target.files&&evt.target.files[0];
  evt.target.value="";
  if(file) uploadQMedia(file, kind, file.name);
}

async function uploadQMedia(file, kind, label){
  const status=document.getElementById("qe-"+kind+"-status");
  const urlBox=document.getElementById("qe-"+kind+"-url");
  if(!await mediaReady()){
    status.textContent="File upload isn't available — check the media token in the database.";
    return;
  }
  const MAX=10*1024*1024;
  if(kind==="audio" && file.size>MAX){
    status.textContent="That clip is "+(file.size/1048576).toFixed(1)+" MB — please keep audio under 10 MB.";
    return;
  }
  status.textContent="Uploading…";
  try{
    let payload;
    if(kind==="image"){ payload=await compressImage(file); }
    else {
      const ext=((file.name||"").split(".").pop()||"mp3").toLowerCase().replace(/[^a-z0-9]/g,"");
      payload={ base64:await fileToBase64(file), ext:ext||"mp3" };
    }
    const url=await uploadToGitHub(payload.base64,payload.ext);
    if(urlBox) urlBox.value=url;
    previewQMedia(kind,url,label);
    status.textContent="✓ Uploaded. It may take a few seconds to become visible.";
  }catch(e){
    status.textContent="✗ "+(e.message||e);
  }
}

/* A picture chosen from the search is copied into the repo rather than linked to where it was
   found. A quiz can sit in the archive for years; a link to someone else's server is a hole
   waiting to appear in it, and re-fetching the same picture for every student in the room is
   rude to whoever is hosting it.

   The copy needs the picture's own server to allow this page to read its bytes, which most but
   not all do. When it refuses, the original URL is kept instead — a working question with a
   fragile link beats no question at all — and the teacher is told which they got. */
async function chooseImage(r){
  const status=document.getElementById("qe-image-status");
  const urlBox=document.getElementById("qe-image-url");
  closeImagePicker();

  const credit = r.needsCredit
    ? (r.source==="Unsplash" ? "Photo by "+(r.creator||"Unsplash photographer")+" on Unsplash"
                             : (r.creator||"Unknown")+(r.license?" ("+r.license+")":""))
    : "";

  let finalUrl="", copied=false;
  if(r.hotlink){
    // Unsplash asks that its photos be served from its own CDN, so this one is linked, not copied.
    finalUrl = r.full || r.thumb;
    notifyUnsplashUse(r);            // fire and forget: their download count, not our concern
    status.textContent="\u2713 Added from Unsplash \u2014 the credit shows under the picture.";
  } else {
    status.textContent="Copying the picture into your library\u2026";
    try{
      if(!await mediaReady()) throw new Error("no media token");
      const payload=await urlToCompressedImage(r.full || r.thumb);
      finalUrl=await uploadToGitHub(payload.base64, payload.ext);
      copied=true;
    }catch(e){
      finalUrl=r.full || r.thumb;     // fall back to the original location
    }
    status.textContent = copied
      ? "\u2713 Added to your library" + (credit ? " \u2014 the credit will show under the picture." : ".")
      : "\u2713 Added, but linked to its original home rather than copied \u2014 it may stop working if that site removes it.";
  }

  if(urlBox) urlBox.value=finalUrl;
  // The credit travels with the question, so it can never end up under the wrong picture.
  if(EDIT_INDEX>=0 && TEACHER.questions[EDIT_INDEX]){
    const q=TEACHER.questions[EDIT_INDEX];
    if(credit) q.imageCredit=credit; else delete q.imageCredit;
  }
  previewQMedia("image", finalUrl, r.title||"image");
}


/* Fetch a picture by URL and put it through the same shrink-for-phones step as an upload.
   crossOrigin is set before the source so the canvas stays readable; without it the browser
   silently taints the canvas and the export throws. */
function urlToCompressedImage(url, maxW=1000, quality=0.72){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.crossOrigin="anonymous";
    img.onload=()=>{
      try{
        const scale=Math.min(1, maxW/img.width);
        const cv=document.createElement("canvas");
        cv.width=Math.round(img.width*scale); cv.height=Math.round(img.height*scale);
        cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);
        resolve({ base64:cv.toDataURL("image/jpeg",quality).split(",")[1], ext:"jpg" });
      }catch(e){ reject(new Error("That picture can't be copied from its site.")); }
    };
    img.onerror=()=>reject(new Error("That picture couldn't be loaded."));
    img.src=url;
  });
}


// Filled tiles are labelled with the file's own name, falling back to the URL's last segment.
function qMediaName(url){
  try{ return decodeURIComponent(String(url).split("/").pop().split("?")[0]) || "file"; }
  catch(e){ return "file"; }
}

function previewQMedia(kind,url,label){
  const tile=document.getElementById("qe-"+kind+"-tile");
  const name=document.getElementById("qe-"+kind+"-name");
  if(kind==="image"){
    const img=document.getElementById("qe-image-preview");
    if(img){ if(url) img.src=url; else img.removeAttribute("src"); }
  }
  if(name) name.textContent = url ? (label || qMediaName(url)) : "";
  if(name && url) name.title = url;
  if(tile) tile.classList.toggle("filled", !!url);
}

// Detach media from this question. The uploaded file stays in the repo (other questions may
// use it); the question simply stops pointing at it once saved.
function clearQMedia(kind){
  if(kind==="image" && EDIT_INDEX>=0 && TEACHER.questions[EDIT_INDEX]) delete TEACHER.questions[EDIT_INDEX].imageCredit;
  const box=document.getElementById("qe-"+kind+"-url"); if(box) box.value="";
  const picker=document.getElementById("qe-"+kind+"-file"); if(picker) picker.value="";
  previewQMedia(kind,"");
  const status=document.getElementById("qe-"+kind+"-status");
  if(status) status.textContent="Removed — save the question to confirm.";
}

// Drag-and-drop onto either tile, plus paste-an-image anywhere in the builder.
function initQMediaDropZones(){
  [["image",/^image\//],["audio",/^audio\//]].forEach(([kind,accept])=>{
    const tile=document.getElementById("qe-"+kind+"-tile"); if(!tile) return;
    const off=e=>{ e.preventDefault(); tile.classList.remove("over"); };
    tile.addEventListener("dragover", e=>{ e.preventDefault(); tile.classList.add("over"); });
    tile.addEventListener("dragleave", off);
    tile.addEventListener("drop", e=>{
      off(e);
      const file=(e.dataTransfer&&e.dataTransfer.files||[])[0]; if(!file) return;
      if(!accept.test(file.type||"")){
        document.getElementById("qe-"+kind+"-status").textContent="That's not a"+(kind==="image"?"n image":" sound")+" file.";
        return;
      }
      uploadQMedia(file, kind, file.name);
    });
  });
  document.addEventListener("paste", e=>{
    const card=document.getElementById("qe-card");
    if(!card || card.style.display==="none") return;
    const t=e.target, tag=(t&&t.tagName)||"";
    if(tag==="INPUT"||tag==="TEXTAREA") return;   // let text paste into the fields
    const item=[...((e.clipboardData&&e.clipboardData.items)||[])].find(i=>i.type.startsWith("image/"));
    if(!item) return;
    const file=item.getAsFile(); if(!file) return;
    e.preventDefault();
    uploadQMedia(file, "image", "pasted-image");
  });
}
