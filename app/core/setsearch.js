/* Searching the bank: a combobox above the pickers.
   -----------------------------------------------------------------------------------------
   THREE FAULTS SHIPPED BEFORE THIS FILE SETTLED. All three are recorded because each looked
   fine in review and each was caught by something other than reading the code.

   v4.0 made the search rewrite the set dropdown's own options, and only showed it once a
   picker held eight or more sets. For Test, Synapse, Quizfire and Role Play the dropdown is
   already filtered to ONE SCHOOL, so the count being measured was a single school's slice —
   rarely eight, even with fifty tests in the bank. The feature was invisible in most of the
   app. The threshold is gone, not lowered: a search field that is sometimes absent is worse
   than one that is occasionally unnecessary, because you cannot learn to rely on it.

   v4.0.1 moved the search beside the dropdowns, but bound the "input" listener ONCE, to the
   first paint closure, which captured the first `records` array. Re-attaching on a later load
   assigned a fresh paint to `box.onsearchpaint` — A PROPERTY NOTHING READS — under a comment
   claiming it rebound on every call. So the search went on querying the bank as it stood the
   first time that picker was opened: add a school to a test, come back, and the new school
   never appeared. A comment is not an implementation. The listener now reads SEARCH_STATE,
   which setSearchAttach overwrites on every call, so there is one source of truth and no
   closure to go stale.

   HOW IT BEHAVES. One row per test AND school — a test in three schools gives three rows:

       DEI Quiz BTS1 — IFPASS      TST-4KRW
       DEI Quiz BTS1 — ECOTEC      TST-4KRW

   Choosing the row IS choosing the school, so a run is never labelled by guesswork. Picking
   one sets the school dropdown, lets the app's own filter repopulate the set list, then
   selects the set — both dropdowns end up reading as though they had been used by hand.

   The four word games have no school dropdown, so there the schools are context on one row
   rather than split across several.
*/

const SETSEARCH_MAX_ROWS = 40;     // a list longer than this is a query, not a result

/* Live configuration per search box. The listeners are attached once and read THIS, so a
   reload of the bank reaches the search without rebinding anything. */
const SEARCH_STATE = {};

/* Split `text` on every occurrence of any term, so the matched part can be marked. Returns
   an array of {s, hit}. Case-insensitive, and it never builds HTML from the text — a set
   name is typed by a teacher and goes into the DOM as text nodes, not markup. */
function setSearchSplit(text, terms){
  const src = String(text == null ? "" : text);
  const want = (terms || []).filter(x => x && x.length).map(x => x.toLowerCase());
  if(!want.length) return [{ s:src, hit:false }];
  const low = src.toLowerCase();
  const marks = new Array(src.length).fill(false);
  want.forEach(term => {
    let i = low.indexOf(term);
    while(i >= 0){
      for(let j = i; j < i + term.length; j++) marks[j] = true;
      i = low.indexOf(term, i + 1);
    }
  });
  const out = [];
  let i = 0;
  while(i < src.length){
    const hit = marks[i];
    let j = i;
    while(j < src.length && marks[j] === hit) j++;
    out.push({ s: src.slice(i, j), hit: hit });
    i = j;
  }
  return out;
}

function setSearchPaintInto(el, text, terms){
  setSearchSplit(text, terms).forEach(part => {
    if(!part.s) return;
    if(part.hit){
      const m = document.createElement("span");
      m.className = "set-search-hit";
      m.textContent = part.s;
      el.appendChild(m);
    } else {
      el.appendChild(document.createTextNode(part.s));
    }
  });
}

/* Attach a search field above `anchor`, wired to drive `schoolSelect` (optional) and
   `setSelect`.

     setSearchAttach({ id, anchor, setSelect, schoolSelect?, records, label })

   `records` is the WHOLE list for this kind, never a school's slice. Call it again whenever
   the bank is reloaded; the state is replaced and the listeners pick it up. */
function setSearchAttach(opts){
  const o = opts || {};
  const anchor = o.anchor, setSelect = o.setSelect;
  if(!anchor || !setSelect || !anchor.parentNode) return;

  const holder = anchor.parentNode;
  const boxId = "search-" + o.id;

  // Replaced wholesale on every call. This is the fix for the v4.0.1 stale-closure fault:
  // the listeners below close over boxId, never over the records.
  SEARCH_STATE[boxId] = {
    records: o.records || [], label: o.label,
    schoolSelect: o.schoolSelect || null, setSelect: setSelect,
    rows: [], active: -1
  };

  let box = document.getElementById(boxId);
  if(box){ paint(boxId); return; }

  box = document.createElement("input");
  box.type = "search";
  box.id = boxId;
  box.className = "set-search";
  box.setAttribute("autocomplete", "off");
  box.setAttribute("role", "combobox");
  box.setAttribute("aria-expanded", "false");
  box.setAttribute("aria-controls", boxId + "-results");
  // Written by a script, so it carries no data-i18n key — a language switch repaints those
  // and would paint over this one (the v3.20a rule).
  box.placeholder = t("search.placeholder", "Search all schools by name, code or school");
  box.setAttribute("aria-label", box.placeholder);
  holder.insertBefore(box, anchor);

  const list = document.createElement("div");
  list.id = boxId + "-results";
  list.className = "set-search-results";
  list.setAttribute("role", "listbox");
  holder.insertBefore(list, anchor);

  const note = document.createElement("div");
  note.id = boxId + "-note";
  note.className = "set-search-note";
  holder.insertBefore(note, anchor);

  // paint() decides which row is active; setting it here as well was a second place
  // making the same decision, so a mutation to either was invisible.
  box.addEventListener("input", () => paint(boxId));
  box.addEventListener("keydown", e => {
    const st = SEARCH_STATE[boxId];
    if(e.key === "Escape"){ box.value = ""; st.active = -1; paint(boxId); return; }
    if(!st.rows.length) return;
    if(e.key === "ArrowDown"){ e.preventDefault(); st.active = (st.active + 1) % st.rows.length; paint(boxId); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); st.active = (st.active - 1 + st.rows.length) % st.rows.length; paint(boxId); }
    else if(e.key === "Enter"){
      e.preventDefault();
      if(st.active >= 0 && st.rows[st.active]) setSearchChoose(boxId, st.rows[st.active]);
    }
  });

  paint(boxId);
}

function setSearchRows(boxId, query){
  const st = SEARCH_STATE[boxId];
  const out = [];
  st.records.forEach(rec => {
    if(!refMatches(rec, query)) return;
    const schools = (rec.schools || []).filter(Boolean);
    if(st.schoolSelect && schools.length) schools.forEach(s => out.push({ rec, school:s }));
    else out.push({ rec, school:null });
  });
  return out.sort((a, b) => {
    const n = String(a.rec.name||"").localeCompare(String(b.rec.name||""));
    return n !== 0 ? n : String(a.school||"").localeCompare(String(b.school||""));
  });
}

function setSearchChoose(boxId, row){
  const st = SEARCH_STATE[boxId];
  const box = document.getElementById(boxId);
  const note = document.getElementById(boxId + "-note");
  if(st.schoolSelect && row.school){
    st.schoolSelect.value = row.school;
    // The app's own filter repopulates the set dropdown. All four school filters are
    // synchronous, so the options exist by the time the next line runs.
    if(typeof st.schoolSelect.onchange === "function") st.schoolSelect.onchange();
    else st.schoolSelect.dispatchEvent(new Event("change"));
  }
  st.setSelect.value = row.rec.key;
  if(st.setSelect.value !== row.rec.key){
    if(note) note.textContent = t("search.could_not_select",
      "Found it, but it is not in the list for {school}.", { school: row.school || "" });
    return;
  }
  if(typeof st.setSelect.onchange === "function") st.setSelect.onchange();
  else st.setSelect.dispatchEvent(new Event("change"));
  box.value = "";
  st.active = -1;
  paint(boxId);
  st.setSelect.focus();
}

function paint(boxId){
  const st = SEARCH_STATE[boxId];
  const box = document.getElementById(boxId);
  const list = document.getElementById(boxId + "-results");
  const note = document.getElementById(boxId + "-note");
  if(!st || !box || !list) return;

  const q = box.value;
  while(list.firstChild) list.removeChild(list.firstChild);

  if(!q.trim()){
    st.rows = []; st.active = -1;
    note.textContent = ""; list.style.display = "none";
    box.setAttribute("aria-expanded", "false");
    return;
  }

  const found = setSearchRows(boxId, q);
  st.rows = found.slice(0, SETSEARCH_MAX_ROWS);
  if(st.active >= st.rows.length) st.active = st.rows.length ? 0 : -1;
  if(st.active < 0 && st.rows.length) st.active = 0;

  list.style.display = st.rows.length ? "block" : "none";
  box.setAttribute("aria-expanded", st.rows.length ? "true" : "false");

  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);

  st.rows.forEach((row, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "set-search-row" + (i === st.active ? " is-active" : "");
    b.id = boxId + "-row-" + i;
    b.setAttribute("role", "option");
    b.setAttribute("aria-selected", i === st.active ? "true" : "false");

    const main = document.createElement("span");
    main.className = "set-search-row-name";
    setSearchPaintInto(main, row.rec.name || "", terms);
    b.appendChild(main);

    if(row.school){
      const s = document.createElement("span");
      s.className = "set-search-row-school";
      s.appendChild(document.createTextNode("— "));
      setSearchPaintInto(s, row.school, terms);
      b.appendChild(s);
    } else if((row.rec.schools || []).length){
      const s = document.createElement("span");
      s.className = "set-search-row-school";
      s.appendChild(document.createTextNode("· "));
      setSearchPaintInto(s, row.rec.schools.join(", "), terms);
      b.appendChild(s);
    }

    if(row.rec.ref){
      const c = document.createElement("span");
      c.className = "set-search-row-ref";
      // the code is matched as a whole, so it is marked when the query is part of it
      const codeTerms = refNormalise(q) && refNormalise(row.rec.ref).indexOf(refNormalise(q)) >= 0
        ? [q.trim().toLowerCase().replace(/[^a-z0-9]/g, "")] : [];
      if(codeTerms.length){
        const hit = document.createElement("span");
        hit.className = "set-search-hit";
        hit.textContent = row.rec.ref;
        c.appendChild(hit);
      } else {
        c.textContent = row.rec.ref;
      }
      b.appendChild(c);
    }

    b.addEventListener("click", () => setSearchChoose(boxId, row));
    b.addEventListener("mouseenter", () => {
      if(st.active === i) return;
      st.active = i; paint(boxId);
    });
    list.appendChild(b);
  });

  if(st.active >= 0) box.setAttribute("aria-activedescendant", boxId + "-row-" + st.active);
  else box.removeAttribute("aria-activedescendant");

  if(!found.length){
    note.textContent = refLooksLikeCode(q)
      ? t("search.no_such_code", "No set has the code {code}.", { code:q.trim().toUpperCase() })
      : t("search.nothing_matches", "Nothing matches {q}.", { q:q.trim() });
  } else if(found.length > SETSEARCH_MAX_ROWS){
    note.textContent = t("search.too_many", "{shown} of {total} — type more to narrow it.",
      { shown: SETSEARCH_MAX_ROWS, total: found.length });
  } else {
    note.textContent = t("search.n_found", "{count} found", { count: found.length });
  }
}

/* The standard option label: the set's name, whatever the game counts, and its code. Used by
   the dropdowns so a set reads the same there as in the search rows, which build their parts
   separately so the matched text can be marked. */
function setSearchLabel(rec, countText){
  const bits = [rec.name];
  if(countText) bits.push("(" + countText + ")");
  if(rec.combo) bits.push("· " + t("search.combined", "combined"));
  if(rec.ref) bits.push("· " + rec.ref);
  return bits.join(" ");
}
