/* ============================================================================
   Teacher Hub — core/lines.js
   ============================================================================ */

/* Metro, RER, tram and bus badges, drawn rather than uploaded.

   A teacher types "M9, RER A, T3a" into a campus and the page draws the badges in the operators'
   own colours. Drawn in CSS because a badge is a coloured disc with a character in it: an image
   file per line would mean sourcing sixty of them, hosting them, keeping them sharp on a retina
   phone, and committing trademarked roundels to a public repo. A disc and a letter is none of
   that, and it survives the printer, where a missing PNG leaves a hole.

   ---------------------------------------------------------------------------
   WHAT CHANGED IN v0.3.4, AND WHY IT MATTERED

   Until now there was ONE flat colour table, so "M1" meant Paris Metro 1 everywhere. Lille,
   Lyon and Marseille all have an M1 and an M2, and all three were being drawn in Paris yellow
   and Paris blue. Nobody would have reported it; everybody who knows those cities would have
   half-noticed.

   So the table is keyed by NETWORK first. A campus resolves its network from its postcode, with
   a `network` field to override when the postcode lies. A line the campus's network does not
   know falls back to grey — never to another city's palette.
   ---------------------------------------------------------------------------
   PROVENANCE

   The hex values were supplied by Chris from the operators' published palettes, and replace the
   set I had written from memory. Two are deliberate departures from what he sent, both flagged
   to him at the time:

     Paris M2   — supplied as #00643C and labelled "Blue-Green". Paris M2 is blue. The supplied
                  value looks like #0064B0 with the last three characters altered, and a green M2
                  would also collide with M12. Using the published blue.
     Lyon M B   — supplied as #E63138 and labelled "Blue/Red network brand". Lyon B is blue; A is
                  the red one, and he subsequently supplied A as #E61C24, which confirms it.

   Three further values he sent are used verbatim but are worth re-checking: RER E (#DE8B53 is a
   sandy orange, labelled "Magenta/Pink"), Transilien L and M8 (which look swapped against the
   published set), and Lille M1/M2 (#FF0000 and #008000 are CSS primaries, so almost certainly
   approximations). None of these is wrong enough to override on my own judgement.
   --------------------------------------------------------------------------- */

const LINE_NETWORKS = {
  /* Île-de-France — RATP / SNCF / IDFM */
  RATP: {
    name: "Île-de-France",
    colours: {
      "M1":  { bg:"#FFCE00", fg:"#000000" },
      "M2":  { bg:"#0064B0", fg:"#FFFFFF" },   /* published blue — see PROVENANCE */
      "M3":  { bg:"#9F9825", fg:"#FFFFFF" },
      "M4":  { bg:"#C04191", fg:"#FFFFFF" },
      "M5":  { bg:"#F28E2B", fg:"#000000" },
      "M6":  { bg:"#83C491", fg:"#000000" },
      "M7":  { bg:"#F3A4BA", fg:"#000000" },
      "M8":  { bg:"#E3A4B3", fg:"#000000" },
      "M9":  { bg:"#B6BD00", fg:"#000000" },
      "M10": { bg:"#E3B32A", fg:"#000000" },
      "M11": { bg:"#8D5E2A", fg:"#FFFFFF" },
      "M12": { bg:"#008B5A", fg:"#FFFFFF" },
      "M13": { bg:"#6EC4E8", fg:"#000000" },
      "M14": { bg:"#662483", fg:"#FFFFFF" },
      "RER A": { bg:"#F7403A", fg:"#FFFFFF" },
      "RER B": { bg:"#7BA3DC", fg:"#000000" },
      "RER C": { bg:"#F39200", fg:"#000000" },
      "RER D": { bg:"#5E9620", fg:"#FFFFFF" },
      "RER E": { bg:"#DE8B53", fg:"#000000" },
      "L":   { bg:"#CEADD2", fg:"#000000" },
      "U":   { bg:"#C9006B", fg:"#FFFFFF" },
      "T2":  { bg:"#C2002B", fg:"#FFFFFF" },
      "T3A": { bg:"#F28E2B", fg:"#000000" },
      "T8":  { bg:"#AEA32A", fg:"#000000" }
    }
  },

  /* Lyon — TCL. The metro is lettered, not numbered: there is no M1 or M2 here. */
  TCL: {
    name: "Lyon",
    colours: {
      "MA": { bg:"#E61C24", fg:"#FFFFFF" },
      "MB": { bg:"#0075BF", fg:"#FFFFFF" },   /* published blue — see PROVENANCE */
      "MC": { bg:"#F8931D", fg:"#000000" },
      "MD": { bg:"#00A099", fg:"#FFFFFF" },
      "T1": { bg:"#00A0E9", fg:"#FFFFFF" },
      "T2": { bg:"#009846", fg:"#FFFFFF" },
      "T3": { bg:"#920783", fg:"#FFFFFF" },
      "T4": { bg:"#E4007F", fg:"#FFFFFF" }
    }
  },

  /* Marseille — RTM */
  RTM: {
    name: "Marseille",
    colours: {
      "M1": { bg:"#00A3E0", fg:"#FFFFFF" },
      "M2": { bg:"#E4002B", fg:"#FFFFFF" },
      "T1": { bg:"#0082C8", fg:"#FFFFFF" },
      "T2": { bg:"#F28E2B", fg:"#000000" },
      "T3": { bg:"#8A3B8F", fg:"#FFFFFF" }
    }
  },

  /* Bordeaux — TBM */
  TBM: {
    name: "Bordeaux",
    colours: {
      "TA": { bg:"#81197F", fg:"#FFFFFF" },
      "TB": { bg:"#EB6909", fg:"#000000" },
      "TC": { bg:"#E42313", fg:"#FFFFFF" },
      "TD": { bg:"#91619D", fg:"#FFFFFF" }
    }
  },

  /* Lille — Ilévia */
  ILEVIA: {
    name: "Lille",
    colours: {
      "M1": { bg:"#FF0000", fg:"#FFFFFF" },
      "M2": { bg:"#008000", fg:"#FFFFFF" }
    }
  },

  /* Rouen — Réseau Astuce. The tram-train is branded "M", so that is what goes on the badge. */
  ASTUCE: {
    name: "Rouen",
    colours: {
      "M": { bg:"#ED1C24", fg:"#FFFFFF" }
    }
  },

  /* Nancy — STAN */
  STAN: {
    name: "Nancy",
    colours: {
      "T1": { bg:"#009EE0", fg:"#FFFFFF" }
    }
  }
};

const LINE_FALLBACK = { bg:"#75757F", fg:"#FFFFFF" };

/* Which network a campus belongs to, from its postcode. A campus may set `network` to one of the
   keys above and that wins, because a postcode is a guess and a teacher standing at the door is
   not.

   Marseille is carved out of the Bouches-du-Rhône by hand: 13001-13016 is RTM, and Aix (13100)
   is a different network altogether whose colours are not in this file. Aix therefore resolves
   to nothing and renders grey, which is the honest answer rather than Marseille's palette. */
function networkFor(campus){
  const c=campus||{};
  const explicit=String(c.network||"").trim().toUpperCase();
  if(explicit && LINE_NETWORKS[explicit]) return explicit;

  const m=/\b(\d{5})\b/.exec(String(c.address||""));
  if(!m) return null;
  const cp=m[1];
  if(/^(75|77|78|91|92|93|94|95)/.test(cp)) return "RATP";
  if(/^130(0[1-9]|1[0-6])$/.test(cp))       return "RTM";
  if(/^69/.test(cp)) return "TCL";
  if(/^33/.test(cp)) return "TBM";
  if(/^59/.test(cp)) return "ILEVIA";
  if(/^76/.test(cp)) return "ASTUCE";
  if(/^54/.test(cp)) return "STAN";
  return null;
}

/* What a teacher types is not what a lookup table holds. "m9", "M 9", "métro 9" and "Ligne 9"
   are all the same line to a person and four different strings to a computer.

   Note that TRAM normalises to T, not to M. It used to normalise to M, which turned Bordeaux's
   "Tram B" into the same key as Lyon's "Métro B" — harmless while there was one flat table and
   neither was in it, and a colour collision the moment there wasn't. */
function lineKey(raw){
  let s=String(raw==null?"":raw).trim().toUpperCase();
  try{ s=s.normalize("NFD").replace(/[̀-ͯ]/g,""); }catch(e){}
  s=s.replace(/\s+/g," ");
  s=s.replace(/^(METRO|METRO LIGNE|LIGNE|LINE)\s+/,"M");
  s=s.replace(/^(TRAMWAY|TRAM)\s+/,"T");
  s=s.replace(/^TRANSILIEN\s+/,"");
  /* M9 / M 9 / M9bis, and the lettered metros (Lyon A-D) */
  s=s.replace(/^M\s*(\d+)\s*(BIS|B)?$/, (m,n,b)=>"M"+n+(b?"B":""));
  s=s.replace(/^M\s*([A-D])$/, (m,l)=>"M"+l);
  /* T1 / T 1 / T3a / T3A, and the lettered trams (Bordeaux A-D) */
  s=s.replace(/^T\s*(\d+)\s*([AB])?$/, (m,n,l)=>"T"+n+(l||""));
  s=s.replace(/^T\s*([A-D])$/, (m,l)=>"T"+l);
  s=s.replace(/^RER\s*([A-E])$/,"RER $1");
  return s;
}

/* The characters on the badge: "M9" shows 9, "RER A" shows A, "T3A" shows T3a, Lyon's "MB"
   shows B. Anything the table does not know keeps whatever the teacher typed, trimmed — better
   a grey badge reading "Navette" than nothing at all.

   A NUMBERED TRAM KEEPS ITS T. It used to render as the bare number, so Marseille's T2 and
   Marseille's M2 both drew a disc reading "2" — different colours, same character, and at
   IFPASS Lyon and IFPASS Marseille the two sit on the same page. The mode heading above them
   says which is which, but a badge should not need its heading read to be unambiguous. This is
   also how the operators sign them: the platform at Bercy says T3a, not 3a.

   A LETTERED tram keeps the bare letter, because that IS its signage — Bordeaux signs Tram B
   as "B", and "TB" is a string nobody would recognise. The collision the T prefix exists to
   prevent cannot happen there: Bordeaux has no metro, and a lettered metro (Lyon) and a
   lettered tram (Bordeaux) are never on one campus page. */
function lineLabel(key, raw){
  let m=/^M(\d+)(B)?$/.exec(key);
  if(m) return m[1] + (m[2] ? "bis" : "");
  m=/^M([A-D])$/.exec(key);
  if(m) return m[1];
  m=/^T(\d+)([AB])?$/.exec(key);
  if(m) return "T" + m[1] + (m[2] ? m[2].toLowerCase() : "");
  m=/^T([A-D])$/.exec(key);
  if(m) return m[1];
  m=/^RER ([A-E])$/.exec(key);
  if(m) return m[1];
  if(key==="M" || key==="L" || key==="U") return key;
  return String(raw==null?"":raw).trim();
}

/* The network is named in the badge's title rather than drawn, so a badge stays a badge on a
   phone and a colleague can still find out that this "B" is a Lyon metro and not a Bordeaux
   tram. An unknown line says so in the title too, rather than looking like a deliberate grey. */
function lineBadge(raw, network){
  const key=lineKey(raw);
  const net=LINE_NETWORKS[network] || null;
  /* `col`, not `c`: `c` is the campus everywhere else in this codebase, and a colour object
     called `c` here is how `c.bg` ended up looking like a campus field to the coverage check.
     The same shadowing cost a real bug in print.js, where `c` was both a campus and a contact. */
  const col=(net && net.colours[key]) || LINE_FALLBACK;
  const known=!!(net && net.colours[key]);
  const typed=String(raw==null?"":raw).trim();
  /* Two different reasons a badge is grey, and they are not the same thing to the person
     reading it. Lyon's TER is grey because TER is not in TCL's table, NOT because Lyon is
     unknown — saying "network not recognised" there is simply false, and a tooltip that is
     wrong about why is worse than one that says nothing. */
  const title = known ? (net.name + " — " + typed)
    : net ? t("hub.line_not_listed", "{line} — {network}, colour not listed",
              { line:typed, network:net.name })
          : t("hub.line_no_network", "{line} — network not recognised", { line:typed });
  return '<span class="line-badge'+(known ? "" : " line-badge-unknown")+'" '+
    'style="background:'+col.bg+';color:'+col.fg+';" title="'+escapeHtml(title)+'">'+
    escapeHtml(lineLabel(key, raw))+'</span>';
}

/* "M9, RER A, T3a" — separated however a person separated them. The network comes from the
   campus, so the SAME text renders differently at two campuses, which is the entire point. */
function lineBadges(text, network){
  const parts=splitLines(text);
  if(!parts.length) return "";
  return '<span class="line-badges">'+parts.map(p=>lineBadge(p, network)).join("")+'</span>';
}

/* Which KIND of thing a line is, worked out from the normalised key.

   The colour says which line; it does not say whether you are looking for a metro entrance, a
   tram stop or a mainline platform, and at an unfamiliar campus that is the thing you need
   first. A row of bare discs makes a colleague infer it from the colour, which only works if
   they already know the city. */
const TRANSILIEN_LETTERS = { H:1, J:1, K:1, L:1, N:1, P:1, R:1, U:1 };

function lineMode(key, raw){
  if(/^RER [A-E]$/.test(key)) return "rer";
  if(/^M(\d+B?|[A-D])?$/.test(key)) return "metro";
  if(/^T(\d+[AB]?|[A-D])$/.test(key)) return "tram";
  if(TRANSILIEN_LETTERS[key]) return "transilien";
  if(/^(TER|TRAIN|SNCF)\b/i.test(String(raw==null?"":raw).trim())) return "train";
  return "other";
}

/* Metro before RER before tram, because that is roughly the order of "how most people arrive",
   and a fixed order means two campuses never present the same information in two shapes.
   `other` last: it is the bucket for anything the key rules do not recognise, and a thing
   nobody could classify should not head the list. */
const LINE_MODES = [
  ["metro",      ["hub.mode_metro", "Metro"]],
  ["rer",        ["hub.mode_rer", "RER"]],
  ["transilien", ["hub.mode_transilien", "Transilien"]],
  ["tram",       ["hub.mode_tram", "Tram"]],
  ["train",      ["hub.mode_train", "Train"]],
  ["other",      ["hub.mode_other", "Also"]]
];

/* The campus page's transport block: one labelled row per mode, buses included, in one place
   so the rows cannot drift apart. Modes with nothing in them draw nothing — an empty "Tram"
   heading is worse than no heading, because it reads as "no trams here" rather than "nobody
   has typed any". */
function lineModeRows(text, network, busText){
  const parts=splitLines(text);
  const byMode={};
  parts.forEach(p=>{
    const m=lineMode(lineKey(p), p);
    (byMode[m] = byMode[m] || []).push(p);
  });

  const rows=LINE_MODES.filter(m=>byMode[m[0]] && byMode[m[0]].length).map(m=>
    '<p class="hub-mode-label">'+escapeHtml(t(m[1][0], m[1][1]))+'</p>'+
    '<span class="line-badges">'+byMode[m[0]].map(p=>lineBadge(p, network)).join("")+'</span>');

  const buses=splitLines(busText);
  if(buses.length){
    rows.push('<p class="hub-mode-label">'+escapeHtml(t("hub.mode_bus", "Bus"))+'</p>'+
      busBadges(busText));
  }
  return rows.join("");
}

/* Buses are deliberately NOT coloured.

   Bus numbers are mostly not colour-coded — every Paris bus is the same green — so running them
   through the table above would produce a wall of identical badges that says nothing, and bury
   the one metro badge that actually tells you how to get there. They are also long: Luminy alone
   is four numbers. So they render neutral, on their own row, under their own label, and only on
   the campuses where a bus is genuinely the way in. */
function busBadges(text){
  const parts=splitLines(text);
  if(!parts.length) return "";
  return '<span class="line-badges bus-badges">'+parts.map(p=>
    '<span class="bus-badge">'+escapeHtml(p)+'</span>').join("")+'</span>';
}

function splitLines(text){
  return String(text==null?"":text).split(/[,;/]+/).map(s=>s.trim()).filter(Boolean);
}
