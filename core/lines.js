/* ============================================================================
   Teacher Hub — core/lines.js
   ============================================================================ */

/* Metro, RER and tram line badges, drawn rather than uploaded.

   A teacher types "M9, RER A, T3b" into a campus and the page draws the badges in the operators'
   own colours. Drawn in CSS because a badge is a coloured disc with a character in it: an image
   file per line would mean sourcing forty of them, hosting them, keeping them sharp on a retina
   phone, and relying on trademarked logos. A disc and a letter is none of that, and it prints.

   ---------------------------------------------------------------------------
   THESE COLOURS NEED CHECKING BEFORE ANYONE RELIES ON THEM.

   They are written from memory: web access is switched off for this organisation, so nothing
   here has been verified against RATP, TBM or RTM. Paris Metro 1-14 I am reasonably confident
   about; the trams and the regional networks much less so. A wrong colour is the kind of error
   nobody reports and everybody half-notices.

   The safe part is the FALLBACK: a line this table does not know is drawn as a neutral grey
   badge carrying its label, so an unrecognised or mistyped line still looks deliberate instead
   of vanishing or breaking the row.
   --------------------------------------------------------------------------- */

const LINE_COLOURS = {
  /* Paris — Metro (RATP) */
  "M1":  { bg:"#FFCE00", fg:"#000000" },
  "M2":  { bg:"#0064B0", fg:"#FFFFFF" },
  "M3":  { bg:"#9F9825", fg:"#FFFFFF" },
  "M3B": { bg:"#98D4E2", fg:"#000000" },
  "M4":  { bg:"#C04191", fg:"#FFFFFF" },
  "M5":  { bg:"#F28E42", fg:"#000000" },
  "M6":  { bg:"#83C491", fg:"#000000" },
  "M7":  { bg:"#F3A4BA", fg:"#000000" },
  "M7B": { bg:"#83C491", fg:"#000000" },
  "M8":  { bg:"#CEADD2", fg:"#000000" },
  "M9":  { bg:"#D5C900", fg:"#000000" },
  "M10": { bg:"#E3B32A", fg:"#000000" },
  "M11": { bg:"#8D5E2A", fg:"#FFFFFF" },
  "M12": { bg:"#00814F", fg:"#FFFFFF" },
  "M13": { bg:"#98D4E2", fg:"#000000" },
  "M14": { bg:"#662483", fg:"#FFFFFF" },

  /* Paris — RER */
  "RER A": { bg:"#E3051C", fg:"#FFFFFF" },
  "RER B": { bg:"#5291CE", fg:"#FFFFFF" },
  "RER C": { bg:"#FFCE00", fg:"#000000" },
  "RER D": { bg:"#00814F", fg:"#FFFFFF" },
  "RER E": { bg:"#A0006E", fg:"#FFFFFF" },

  /* Bordeaux — TBM trams. Less certain than the Paris set. */
  "TBM A": { bg:"#C8102E", fg:"#FFFFFF" },
  "TBM B": { bg:"#F2A900", fg:"#000000" },
  "TBM C": { bg:"#6E2639", fg:"#FFFFFF" },
  "TBM D": { bg:"#00843D", fg:"#FFFFFF" },

  /* Marseille — RTM metro. Also less certain. */
  "RTM M1": { bg:"#0064B0", fg:"#FFFFFF" },
  "RTM M2": { bg:"#E3051C", fg:"#FFFFFF" }
};

const LINE_FALLBACK = { bg:"#75757F", fg:"#FFFFFF" };

/* What a teacher types is not what a lookup table holds. "m9", "M 9", "métro 9" and "Ligne 9"
   are all the same line to a person and four different strings to a computer, so the typing is
   normalised and the LABEL shown on the badge stays short — the number or letter alone, which is
   what is written on the platform. */
function lineKey(raw){
  let s=String(raw==null?"":raw).trim().toUpperCase();
  try{ s=s.normalize("NFD").replace(/[̀-ͯ]/g,""); }catch(e){}
  s=s.replace(/^(METRO|LIGNE|LINE|TRAM|TRAMWAY)\s+/,"M");
  s=s.replace(/\s+/g," ");
  if(/^M\s*(\d+)\s*(BIS|B)?$/.test(s)) s=s.replace(/^M\s*(\d+)\s*(BIS|B)?$/, (m,n,b)=>"M"+n+(b?"B":""));
  if(/^RER\s*([A-E])$/.test(s)) s=s.replace(/^RER\s*([A-E])$/,"RER $1");
  return s;
}

/* The characters on the badge: "M9" shows 9, "RER A" shows A, "T3B" shows 3b. Anything the
   table does not know keeps whatever the teacher typed, trimmed — better a grey badge reading
   "Navette" than nothing at all. */
function lineLabel(key, raw){
  const m=/^M(\d+)(B)?$/.exec(key);
  if(m) return m[1] + (m[2] ? "bis" : "");
  const r=/^RER ([A-E])$/.exec(key);
  if(r) return r[1];
  const t=/^(?:TBM|RTM) ?(.+)$/.exec(key);
  if(t) return t[1];
  return String(raw==null?"":raw).trim();
}

function lineBadge(raw){
  const key=lineKey(raw);
  const c=LINE_COLOURS[key] || LINE_FALLBACK;
  const label=lineLabel(key, raw);
  const known = !!LINE_COLOURS[key];
  /* The network is named in the title rather than drawn, so a badge stays a badge on a phone
     and a colleague can still find out what "9" belongs to. */
  return '<span class="line-badge'+(known ? "" : " line-badge-unknown")+'" '+
    'style="background:'+c.bg+';color:'+c.fg+';" title="'+escapeHtml(String(raw).trim())+'">'+
    escapeHtml(label)+'</span>';
}

/* "M9, RER A, T3b" — separated however a person separated them. */
function lineBadges(text){
  const parts=String(text==null?"":text).split(/[,;/]+/).map(s=>s.trim()).filter(Boolean);
  if(!parts.length) return "";
  return '<span class="line-badges">'+parts.map(lineBadge).join("")+'</span>';
}
