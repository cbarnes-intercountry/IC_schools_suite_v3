/* The search box over a set picker.
   -----------------------------------------------------------------------------------------
   ONE component, used by all eight launchers and the Test Creator. The alternative was a
   filter written into each picker, which is eight chances for them to disagree about what a
   hit is — and this project has the v3.1.1 scar from a function that listed the kinds it knew
   about and so broke every kind added after it.

   It sits above an existing <select> and rebuilds that select's options from a list of
   records. It does not fetch anything: the caller already has the records from listQuizzes,
   and a search that re-read the bank on every keystroke would be slower and no more correct.

   What it searches is core/refcode.js refMatches — name, reference code and school. Question
   text is deliberately out: matching inside the questions means loading every set's full
   content, which on a bank of a few hundred sets is seconds of waiting for a box that is
   supposed to feel instant.

   The box only appears once there is enough in the list to be worth searching. A picker with
   four sets in it does not need a search box; it needs four sets. */

const SETSEARCH_MIN = 8;          // below this, the box is more furniture than help

/* Attach (or re-use) a search input immediately before `select`, and wire it to re-render.
   Returns nothing; the caller's `render` is the single source of what an option looks like,
   so this file never has an opinion about labels.

     setSearchMount(selectEl, records, render)
       selectEl  the <select> whose options are rebuilt
       records   the array from listQuizzes, already filtered to this game's kind
       render    (rec) -> option text

   The placeholder option (value "") is preserved from the select's own markup, so the
   existing data-i18n label keeps working and a language switch still repaints it. */
function setSearchMount(selectEl, records, render){
  if(!selectEl) return;
  const list = records || [];
  const holder = selectEl.parentNode;
  const id = selectEl.id + "-search";
  let box = document.getElementById(id);

  // The first option is the "— select a … —" placeholder the markup carries. Keep the node
  // itself rather than its text: it holds the data-i18n key, and an element a script writes
  // must not also carry one (the v3.20a rule).
  const placeholder = selectEl.firstElementChild &&
                      selectEl.firstElementChild.value === "" ? selectEl.firstElementChild : null;
  let note = null;                  // assigned below; paint() reads it through the closure

  function paint(){
    const q = box ? box.value : "";
    const keep = selectEl.value;
    while(selectEl.firstChild) selectEl.removeChild(selectEl.firstChild);
    if(placeholder) selectEl.appendChild(placeholder);

    let shown = 0;
    list.forEach(rec => {
      if(!refMatches(rec, q)) return;
      const o = document.createElement("option");
      o.value = rec.key;
      o.textContent = render(rec);
      selectEl.appendChild(o);
      shown++;
    });

    // A selection that survives the filter stays selected; one that does not is cleared, so
    // the teacher cannot launch a set the list is no longer showing them.
    selectEl.value = keep;
    if(selectEl.value !== keep){
      selectEl.value = "";
      if(typeof selectEl.onchange === "function") selectEl.onchange();
    }

    if(note){
      if(!q.trim()) note.textContent = "";
      else if(shown) note.textContent = t("search.n_of_m", "{shown} of {total}",
                                          { shown:shown, total:list.length });
      else if(refLooksLikeCode(q)) note.textContent =
        t("search.no_such_code", "No set has the code {code}.", { code:q.trim().toUpperCase() });
      else note.textContent = t("search.nothing_matches", "Nothing matches {q}.", { q:q.trim() });
    }
  }

  if(list.length < SETSEARCH_MIN){
    if(box && box.parentNode) box.parentNode.removeChild(box);
    const oldNote = document.getElementById(id + "-note");
    if(oldNote && oldNote.parentNode) oldNote.parentNode.removeChild(oldNote);
    box = null;
    note = null;
    paint();
    return;
  }

  if(!box){
    box = document.createElement("input");
    box.type = "search";
    box.id = id;
    box.className = "set-search";
    box.setAttribute("autocomplete", "off");
    // Written by a script, so it carries no data-i18n key — it would be repainted over.
    box.placeholder = t("search.placeholder", "Search by name, code or school");
    box.setAttribute("aria-label", box.placeholder);
    holder.insertBefore(box, selectEl);
    const n = document.createElement("div");
    n.id = id + "-note";
    n.className = "set-search-note";
    holder.insertBefore(n, selectEl);
    box.addEventListener("input", paint);
  }
  note = document.getElementById(id + "-note");
  paint();
}

/* The standard option label: the set's name, its code, and whatever the game counts. Used by
   every picker so a set reads the same wherever it is chosen. The code goes in because the
   whole point of having one is being able to see it without opening the set. */
function setSearchLabel(rec, countText){
  const bits = [rec.name];
  if(countText) bits.push("(" + countText + ")");
  if(rec.combo) bits.push("· " + t("search.combined", "combined"));
  if(rec.ref) bits.push("· " + rec.ref);
  return bits.join(" ");
}
