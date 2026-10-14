/* Searching the bank, from above the pickers.
   -----------------------------------------------------------------------------------------
   WHAT v4.0 GOT WRONG, because it is the whole reason this file was rewritten.

   v4.0 made the search box rewrite the set dropdown's own options. Two faults came of it:

     1. It only appeared once a picker held eight or more sets. For Test, Synapse, Quizfire
        and Role Play the dropdown is already filtered to ONE SCHOOL, so the count it was
        measuring was a single school's slice — rarely eight, even with fifty tests in the
        bank. The feature was invisible in most of the app, which is how it was reported.
        The threshold is gone. A search field that is sometimes absent is worse than one that
        is occasionally unnecessary: you cannot learn to rely on it.

     2. Filtering the dropdown could only ever search WITHIN the chosen school, and the thing
        a teacher actually wants is "find me that test, I do not remember whose it is".

   So the search no longer touches the dropdowns. It sits above them with its own results
   list, searches the whole bank, and when a result is picked it DRIVES the dropdowns: school
   first, let the app's own filter repopulate the set list, then the set. Both dropdowns end
   up reading normally and `meta.school` is whatever was actually chosen — nothing downstream
   can tell the difference between a search and a hand-picked launch, which is the point.

   ONE ROW PER TEST AND SCHOOL. A test tagged to three schools produces three rows:

       DEI Quiz BTS1 — IFPASS      TST-4KRW
       DEI Quiz BTS1 — ECOTEC      TST-4KRW

   Choosing the row IS choosing the school, so the run is never labelled by guesswork. The
   four word games (Bingo!, Off-Limits, 20 Questions, Word Pairs) have no school dropdown, so
   there the schools are shown as context on one row rather than split across several.
*/

const SETSEARCH_MAX_ROWS = 40;     // a list longer than this is a query, not a result

/* Attach a search field above `anchor`, wired to drive `schoolSelect` (optional) and
   `setSelect`.

     setSearchAttach({ id, anchor, setSelect, schoolSelect?, records, label })

   `records` is the WHOLE list for this kind, never a school's slice — searching a slice is
   the fault this file exists to fix. `label` renders a record; the school is appended by this
   file so every picker words it the same way. */
function setSearchAttach(opts){
  const o = opts || {};
  const anchor = o.anchor, setSelect = o.setSelect;
  if(!anchor || !setSelect || !anchor.parentNode) return;

  const records = o.records || [];
  const holder = anchor.parentNode;
  const boxId = "search-" + o.id;
  let box = document.getElementById(boxId);
  let list = document.getElementById(boxId + "-results");

  if(!box){
    box = document.createElement("input");
    box.type = "search";
    box.id = boxId;
    box.className = "set-search";
    box.setAttribute("autocomplete", "off");
    // Written by a script, so it carries no data-i18n key — a language switch repaints
    // those, and would paint over this one (the v3.20a rule).
    box.placeholder = t("search.placeholder", "Search all schools by name, code or school");
    box.setAttribute("aria-label", box.placeholder);
    holder.insertBefore(box, anchor);

    list = document.createElement("div");
    list.id = boxId + "-results";
    list.className = "set-search-results";
    list.setAttribute("role", "listbox");
    holder.insertBefore(list, anchor);
    box.addEventListener("input", paint);
    box.addEventListener("keydown", e => { if(e.key === "Escape"){ box.value = ""; paint(); } });
  }

  /* Rebind on every call rather than once: the records change whenever the bank is reloaded,
     and a closure holding the first load would search a stale copy for the rest of the
     session. */
  box.onsearchpaint = paint;

  function rows(query){
    const out = [];
    records.forEach(rec => {
      if(!refMatches(rec, query)) return;
      const schools = (rec.schools || []).filter(Boolean);
      if(o.schoolSelect && schools.length){
        // one row per school: picking the row is picking the school
        schools.forEach(s => out.push({ rec, school:s }));
      } else {
        out.push({ rec, school:null });
      }
    });
    return out.sort((a, b) => {
      const n = String(a.rec.name||"").localeCompare(String(b.rec.name||""));
      return n !== 0 ? n : String(a.school||"").localeCompare(String(b.school||""));
    });
  }

  function choose(row){
    if(o.schoolSelect && row.school){
      o.schoolSelect.value = row.school;
      // The app's own filter repopulates the set dropdown. All four school filters are
      // synchronous, so the options exist by the time the next line runs. If one ever
      // becomes async this breaks silently, which is why a test drives the real handlers.
      if(typeof o.schoolSelect.onchange === "function") o.schoolSelect.onchange();
      else o.schoolSelect.dispatchEvent(new Event("change"));
    }
    setSelect.value = row.rec.key;
    if(setSelect.value !== row.rec.key){
      // The set is not in the dropdown — the school filter disagrees with the record's own
      // schools. Say so rather than leaving the teacher looking at an unchanged screen.
      if(note) note.textContent = t("search.could_not_select",
        "Found it, but it is not in the list for {school}.", { school: row.school || "" });
      return;
    }
    if(typeof setSelect.onchange === "function") setSelect.onchange();
    else setSelect.dispatchEvent(new Event("change"));
    box.value = "";
    paint();
    setSelect.focus();
  }

  let note = document.getElementById(boxId + "-note");

  function paint(){
    const q = box.value;
    while(list.firstChild) list.removeChild(list.firstChild);
    if(!note){
      note = document.createElement("div");
      note.id = boxId + "-note";
      note.className = "set-search-note";
      list.parentNode.insertBefore(note, list.nextSibling);
    }
    if(!q.trim()){ note.textContent = ""; list.style.display = "none"; return; }

    const found = rows(q);
    list.style.display = found.length ? "block" : "none";

    found.slice(0, SETSEARCH_MAX_ROWS).forEach(row => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "set-search-row";
      b.setAttribute("role", "option");
      const main = document.createElement("span");
      main.className = "set-search-row-name";
      main.textContent = o.label ? o.label(row.rec) : (row.rec.name || "");
      b.appendChild(main);
      if(row.school){
        const s = document.createElement("span");
        s.className = "set-search-row-school";
        s.textContent = "— " + row.school;
        b.appendChild(s);
      } else if((row.rec.schools || []).length){
        const s = document.createElement("span");
        s.className = "set-search-row-school";
        s.textContent = "· " + row.rec.schools.join(", ");
        b.appendChild(s);
      }
      b.addEventListener("click", () => choose(row));
      list.appendChild(b);
    });

    if(!found.length){
      note.textContent = refLooksLikeCode(q)
        ? t("search.no_such_code", "No set has the code {code}.", { code:q.trim().toUpperCase() })
        : t("search.nothing_matches", "Nothing matches {q}.", { q:q.trim() });
    } else if(found.length > SETSEARCH_MAX_ROWS){
      note.textContent = t("search.too_many",
        "{shown} of {total} — type more to narrow it.",
        { shown: SETSEARCH_MAX_ROWS, total: found.length });
    } else {
      note.textContent = t("search.n_found", "{count} found", { count: found.length });
    }
  }

  paint();
}

/* The standard option label: the set's name, whatever the game counts, and its code. Used by
   the dropdowns AND the search rows so a set reads the same wherever it appears. The code is
   on it because the point of having one is seeing it without opening the set. */
function setSearchLabel(rec, countText){
  const bits = [rec.name];
  if(countText) bits.push("(" + countText + ")");
  if(rec.combo) bits.push("· " + t("search.combined", "combined"));
  if(rec.ref) bits.push("· " + rec.ref);
  return bits.join(" ");
}
