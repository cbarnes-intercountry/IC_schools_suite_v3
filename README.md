# Classroom Exam App — v3.9

The app is a folder rather than a single page. v3.0 moved the code without changing it;
**v3.1 adds role play**, the first activity built against the module contract.
**v3.1.1 fixed a bug in it**: saved role plays were coming back from the database labelled
"quiz", so they appeared in the Test Creator list and never in their own — which looked like
they were not saving at all.

**v3.2 makes short-answer marking strict**, in `core/answers.js`. An answer is matched against
exactly what the author typed, in the language of the test: no case folding, no accent
stripping, no typo tolerance, and a number that is not written the way that language writes
numbers is wrong. Every field where an answer is typed — the student's and the author's — now
turns the phone keyboard's autocapitalise, autocorrect and spellcheck off, because otherwise
the keyboard answers the capitalisation questions for the student. Do not loosen any of this
without reading the decisions log entry of 2026-09-25.

**v3.3 takes the English out of the code.** 479 strings now live in `lang/en.js`, reached by a
semantic key (`role.i_m_teacher`, never `"I'm the Teacher"`). The English also stays in the
markup as the fallback, so the page reads correctly before a script has run — and `lang/en.js`
is GENERATED from that markup rather than typed twice, with a test that fails the moment the
two disagree. `lang/fr.js` holds every key with an empty value; an empty value falls back to
English, so French can be filled in a screen at a time instead of all at once. The picker is on
the first screen, and a teacher's choice is stored on their own record so it follows them
between devices.

**v3.3.1 fixes a bug v3.3 introduced.** The extraction put a `t("key","English")` lookup inside
loops and functions whose own variable was already called `t` — a teacher record, a DOM node, a
running total — so the call invoked that instead of the lookup. Teacher Accounts came back
empty. `t` is a global now, so no local may use that name: every one was renamed, and the suite
fails if the name comes back.

**v3.9 lets one session mix up to three sets, from any areas.** A lesson is often two things —
the week's vocabulary and a warm-up, or the sector words plus the general ones the class keeps
losing — and re-launching the game between them costs a minute of everyone's attention.

Pick an area, pick a set, **Add**; repeat, from the same area or another one. Three is the
ceiling: a fourth stops being a lesson and becomes the whole bank shuffled together, which is
what sets exist to prevent. The chosen sets are listed with the area each came from, and can be
taken out again.

Three things it refuses, each saying why: a fourth set, the same set twice, and a set written in
a different language from the ones already chosen — the student interface follows the content's
language and one room cannot be in both. A term that appears in **more than one** of the chosen
sets is played once, and the summary says how many were folded together; an area is allowed to
carry the same word in two sets, but a pair meeting it twice in one round looks like a fault
from the floor.

The run is named after what is in it — *Claims + Finance* — so the Rejoin banner an hour later
says something recognisable.

**v3.8.2 shows which build you are looking at.** The version appears, small and grey, on the
first screen, on the teacher sign-in and in the teacher's top bar. It is read off the page's own
`?v=` cache tags rather than kept in a constant beside them, so there is one number to bump per
release and the badge cannot disagree with the files actually loaded.

Prompted by a report that a fix "had not been made": it had, in v3.8.1, but the copy being run
was v3.8 and nothing on screen said so.

**v3.8.1 fixes three things found in a real lesson.**

**The timers disagreed** between the teacher's screen and the students'. Both were right about
their own arithmetic: the round's start is written by one device and read by twenty-five others,
and phone clocks are routinely a minute apart, so each device was subtracting the teacher's start
time from its own clock. Every device now adds the offset Firebase publishes at
`.info/serverTimeOffset`, so they all count down together. Nothing to deploy — it is a read the
existing rules already allow.

**Word sets are no longer filed by school.** A quiz belongs to a course; "weather and seasons"
belongs to anyone teaching English. The launcher offers every area straight away, and the editor
no longer asks.

**Somebody now holds the rule.** The forbidden words are on the guesser's screen as well, with a
**They said it** button — a describer policing themselves marks no fouls at all. The button
counts the foul, flashes the screen red and buzzes the phone; it does *not* reach across and skip
the word, because a student's phone may only write its own record, and relaying that through the
teacher's browser is two network hops in a game measured in seconds. The pair are sitting a metre
apart: the referee presses and says so, and the describer moves on with Pass.

In a group of three the **third student referees** and the guesser is told nothing — the better
game, because seeing the forbidden words does narrow what the guesser is looking for. That is the
honest cost of playing in pairs, and it is stated on the setup screen. Each round everyone moves
along one seat: describe, guess, referee.

Fouls appear beside the hits on the teacher's board. They are counted, not subtracted — say if
you would rather they cost a point.

**v3.8 files the words by area and set, and makes them editable.** A pack is now **one area** —
Business language, Jobs and sectors, General English, French-speaker traps — and the **sets**
inside it are what a lesson picks: meetings, insurance, weather and seasons. Choosing an area
in the launcher opens its list of sets; only the chosen set is sent to the phones.

The editor works at the set's own level, because that is the level a teacher works at: **rename
a set once and every term in it follows**, move a term to another set (or to one that does not
exist yet) from a dropdown, add a term into a set rather than at the bottom of the file, and
remove a set with its terms after being told how many that is. The list groups by set name
rather than by where rows happen to sit, so a term that has just been moved joins its set at
once.

One rule changed because the real packs disagreed with it. A **duplicate is now a duplicate
within a set**, not within the area: an area holds several sets, a lesson plays one, and
*forecast* belongs in both Money and numbers and Reports and trends. The app still says when a
word appears in two sets — a class playing both would meet it twice — but no longer calls it an
error.

**Four packs ship with it**: Business language (168 terms, 14 sets), Jobs and sectors (100, 8),
General English (168, 14), French-speaker traps (48, 4) — **484 terms**, every one with four
forbidden words, all run through the app's own importer and validator before shipping.

**v3.7 adds the first game: Describe It.** One phone holds a term and two words the describer
may not say; their partner has to say the term. Pairs, on a clock, then swap roles — the guesser
has just spent ninety seconds hearing the vocabulary and now has to produce it.

It is the first activity whose whole claim is the one thing a phone buys that paper cannot: a
screen only one person can see. The describer taps **Got it** or **Pass**; the count belongs to
the pair, lives for one round and is never marked — a judgement about a word, not about a
person, which is what keeps it inside the rule that no student ever scores another. Only the
describer writes anything, so a guesser could not put a number on the board if they tried.

An odd number of students is handled rather than left to the teacher: one pair plays as a three
with two guessing, so the number of describers still equals the number of pairs. Each pair gets
its own order of terms, computed on the phone rather than written into the run, so neighbouring
pairs are not shouting about the same word at the same moment.

**Themes and difficulty.** A pack is a set of themes — claims, banking, working life — and a
lesson usually wants one of them, so a theme can be played on its own; only that theme's terms
are sent to the phones. Every term carries **four** forbidden words, written most obvious first,
and the teacher holds the class to the first **two, three or four** of them. One pack therefore
covers a warm-up and a B2 class without being written twice, and because it is always the first
*n*, turning the difficulty down removes the obscure constraints rather than the ones that make
the item work — you can read the sheet and see what a class will meet at each setting. The
setting can be turned up between rounds, which is when a teacher usually finds out it was wrong;
it takes effect on the next round so nobody's clock changes under them.

Word packs are a new bank kind, authored in Excel like everything else — **Admin → Word Pack
Creator**. `describe-it-starter-pack-en.xlsx` ships with **50 B1–B2 terms in five themes**
(claims and cover, selling and advising, banking and finance, working life, marketing and the
customer) so the game works the day it arrives; the Terms sheet is in import template **v6**.
The app refuses a forbidden word that contains the term, or the reverse, because that leaves the
describer nothing legal to say and only shows up in front of a class; it also flags a term
carrying fewer than four words, or none at all, since both are invisible until the wrong moment.

What it cannot do, and says so on the setup screen: the app cannot hear the room, so it cannot
enforce the forbidden words. That is the guesser's job, and the screen asks them to do it.

**v3.6 checks the security rules against the app, and fixes two things that found.** The rules
now ship beside the code as `firebase-rules.json`, and the suite evaluates them against every
read and write the app performs — the app and the rules were two halves of one design with
nothing checking they agreed.

They did not agree in two places. A teacher who is not an owner could never save their
interface language, because v3.3 wrote it to `teachers/$uid`, which is owner-only on purpose;
preferences now live in a `prefs/$uid` node a teacher may write, and a refused save says so
instead of losing the choice quietly. And a student may only ever write the participant record
keyed by their own sign-in id — so the app now checks that before telling a student they are in
the room, rather than letting every write be refused in silence.

**Deploy `firebase-rules.json` before relying on the language preference** — see
`run_emulator.md`, which also has the two commands for checking the rules against the real
Firebase emulator on a machine that can download it.

**v3.5.1 fixes a dead end on the Home screen.** Starting a new activity warned that one was
already open, but the Rejoin button only appeared for a run that was already *running* — so a
room you opened and walked away from blocked you with no way back to it. The button now offers
the same set the warning counts, and says "waiting room open since…" when that is what it is.
A rejoined poll shows its lobby rather than a question nobody has been asked yet.

**v3.5 makes the silent failures loud, and adds a DOM harness so screens are run rather than
described.** A student whose join is refused is told they are not in the room, instead of being
shown a waiting screen. A dashboard that cannot read the class list says so, instead of looking
like an empty room. A recap that cannot read the results says so, instead of looking like a
test nobody sat. And a teacher signed in on the machine running the test now joins under a
local id rather than their own account.

The suite runs the whole lesson in node against a small stub DOM: room opens, students join,
dashboard renders, test ends, recap renders — plus each of those three refusals.

**v3.4.1 fixes a bug v3.3 introduced and v3.4 shipped.** A test session never recorded
`meta.kind`, because the test was the student router's default path and nothing had to ask.
v3.3 removed that default, which turned every quiz already in the database into "a kind the
app does not recognise" the moment a student tried to join. `runKind()` in `core/registry.js`
now answers that question in one place — a run that says nothing is a test — and new test
sessions write `kind:"quiz"` so the fallback stops being load-bearing for anything made from
now. Runs made before this keep working, permanently: they are never rewritten.

**v3.4 finishes the extraction and adds placeholders.** 748 keys now — v3.3 had left 238
user-visible strings behind, all of them in shapes its checks did not look at. Sentences the
code used to build by joining fragments are now single strings with `{placeholders}`, because
French does not keep English word order and a translator handed "Row " and " of " separately
cannot reorder them. `lang/en.js` is regenerated by `regen_lang.py`, never hand-edited.

The suite now works the other way round: **every string literal in every script must sit
inside a `t()` call or match a named exception** (a CSS class, an Excel column, a team name
stored in the database). Adding an exception means adding a line with a reason, not widening a
regex. It also renders the Teacher Accounts panel against a small DOM, which is the check that
was missing when v3.3 shipped it broken.

**Also in v3.3:** the test module registers itself like every other activity (the core no
longer has a default path, and no core file names an activity), and the Excel template gains a
`Scenarios` sheet for role plays plus a `Language` column that decides how numbers are marked.

## Running it

**It can no longer be opened by double-clicking `index.html`.** A browser refuses to load
sibling script files from a `file://` address. Either:

- push the folder to GitHub Pages and open it there, as normal; or
- serve it locally for a moment: open a terminal in this folder and run
  `python -m http.server 8000`, then visit `http://localhost:8000`.

## Deploying

**No build step and no Node.** Copy the files into the hosting repo and push. GitHub Pages
serves a folder of static files exactly as it served one page.

Two ways to do it:

- **Release:** copy the *contents* of this folder into the repo root, replacing `index.html`
  and adding `core/`, `modules/`, `admin/`, `styles/`, `lang/`, `boot.js` and `.nojekyll`.
  The site URL does not change, so join links and QR codes that students already have keep
  working.
- **Trial first:** copy the folder itself into the repo as `/v3.0/` and open
  `…github.io/v3.0/`. Everything works from a subfolder — join links are built from the
  current address, not a hardcoded one — but that address is the one students would need, so
  it is for testing rather than teaching.

**Browser caching** is handled. Every local script and stylesheet is loaded with a version
tag (`core/backend.js?v=3.0`), so a returning browser cannot mix a new `index.html` with an
old script it kept. **On every release, bump the version in those tags** — it is one
find-and-replace in `index.html`, and the test suite fails if any file is left untagged or on
a different version from the rest.

`.nojekyll` is an empty file that stops GitHub Pages running the files through Jekyll first.
Harmless, and it prevents a class of surprise if a folder is ever named with a leading
underscore.

## What is where

```
index.html        the page: markup only, no application code
styles/app.css    all the styling
lang/en.js        English strings (empty for now — see core/i18n.js)

core/             things every activity uses
  i18n.js         text lookup, and the language switch
  backend.js      the database, and the only file that opens it
  auth.js         who is signed in and what they may do
  ui.js           screens and the small formatting helpers
  session.js      a run: code, QR, meta, rejoining one
  groups.js       teams: allocation, top-up, standings
  bank.js         the questions themselves
  media.js        pictures: search, choose, draw
  security.js     exam monitoring (a deterrent and a log, not a lockdown)
  registry.js     the module contract

modules/          one file per activity
  test.js         the self-marking test, teacher and student sides
  poll.js         live polls and word clouds
  roleplay.js     role cards dealt to small groups (v3.1)

admin/            editing, importing, reporting, settings
  editor.js  import.js  reports.js  accounts.js
  scenarios.js    writing role plays (v3.1)

boot.js           start-up, loaded last
```

## The four rules that keep it this way

1. **Modules call core. Core never calls a module.** An activity registers itself with
   `registerActivity()`; the core never names one.
2. **Modules never call each other.** If two need the same thing, it moves into `core/`.
3. **Only `backend.js` opens the database.** `auth.js` is the only other file that names
   Firebase at all, and only for sign-in.
4. **A new activity adds one file and changes nothing else.** If adding one means editing
   `core/`, the contract is wrong — fix the contract rather than making an exception.
   Role play tested this in v3.1 and found three places where the core named activities one
   by one (the student router, the rejoin button, the home banner). They now ask the
   registry, so the next module will not touch them.

The test suite checks all four, so breaking one is a failing test rather than a discovery
made later.

## Tests

From the folder *above* this one:

```
node "_test v3.0.js"
```

720 checks. The suite reads the load order out of `index.html`, so adding a script file needs
no change to the test.

## Running a role play

Admin → **Role Play Creator** to write scenarios (or import a `Scenarios` sheet: one row per
role, with columns Scenario, Situation, Role, Brief, Secret, Useful, Optional). Then Teacher
Home → **Start a Role Play**, students join with the code, and **Deal the parts**.

A scenario has one situation everyone sees and two or three private briefs. Mark the third
role **optional** and a class of 23 becomes eleven pairs and one trio; without one, the spare
student gets a listening task instead. **Swap roles** keeps the pairs and changes who plays
what — that second run is where the fluency comes from. **New partners** reshuffles the room.
Nothing is marked and nothing is kept: the run is deleted when you end it.
