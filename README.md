# Classroom Exam App — v3.14.1

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

**v3.14.1 makes the answer key readable by the person holding it.**

Word Partners hid the unfound partners behind dots on the HOLDER's screen. The reasoning written
into the code was that the holder "cannot read the answer off their own screen before it is said",
and it is backwards: the holder is not guessing, they are judging. A judge holding an answer key
they cannot read has no way to know which row to tap when their partner says "file a claim" — the
only way to play was to tap rows until one turned green.

Every partner is now legible from the moment the card appears. Ticked ones go green with a tick,
given ones are struck through with a dash, and the rest sit there waiting to be said. **Show one**
is now **Give one**, which is what it was always doing: the holder reads a partner out, presses it,
and the app records that it was handed over rather than produced, so it scores nothing and the card
does not count as cleared.

Reported twice. The first time it was described as "the answers would need to be visible to one
screen so that he can tick off the answers", and the answer given was that they were. They were
not — and the suite agreed, because one of its assertions said in as many words that none of the
words was showing. **A test can hold a bug in place as firmly as it holds a feature.**

**v3.14 fixes a stuck screen, and puts efficiency into the scoring.**

**The bug.** In Word Partners the speaker's screen stayed on the first word all round. The same
defect was in Twenty Questions, where the asker's category badge never moved — invisible only
because most sets are a single category.

It was not a slip. Only seat 0 advances the card, and it advances a number held on that phone; the
other phone may not read it, because a student may read their own participant record and nobody
else's. That rule is what stops anyone scoring a classmate, and it is not moving. So the position
now goes the long way round: seat 0 writes it, the teacher — the only party allowed to write meta
— copies it in, and the other phone reads it there. Two hops on subscriptions that already
existed, no rules change, about a second of lag on a card that lasts a minute.

Stated plainly: **the teacher's browser is now load-bearing for the speaker's screen.** Close the
tab mid-round and speakers stop advancing. It was already banking the scores, so this widens an
existing dependency rather than creating one.

**Twenty Questions is scored on the questions you did not use.** Solve in six of twenty and score
fourteen; solve in nineteen and score one; run out and score nothing. One flat point per solve paid
a wild guess exactly as much as a narrowing question, which is the whole skill. The holder's screen
shows what the card is worth *right now*, falling with every answer — a score nobody can see is a
score nobody believes.

**Word Partners pays three for clearing a card.** A pair with four of six is always tempted to move
to a fresh word where the first two come easily; the last two on a card are the ones worth having.

**No explicit time bonus in either**, on purpose. The round clock is already the time term: a
quicker pair reaches more cards and scores more for it. Paying twice for speed would push a class
towards blurting, which is the opposite of forming a careful question.

**v3.13 adds the third game — Word Partners — which trains collocation.**

One phone shows a word and the hidden list of words that go with it; the partner has to say them
out loud. The holder ticks each one off. Score is partners found, so a pair that digs deep into one
word beats a pair that races through four.

Three games, three competences: Describe It is circumlocution, Twenty Questions is the question,
this is collocation — the single biggest thing separating B1 from B2 in business English, and
exactly what a French speaker gets wrong by translating (*do a decision, *strong traffic, *declare
a claim).

**It has to be produced, not recognised.** A student shown "meet / do / make — a deadline" picks the
right one and has learned nothing, because the wrong answers were never live for them. Cold, from
the noun alone, is a different task, and it is the one a multiple-choice question cannot set.

**The button that matters is "That works too".** A pack lists six partners for *a deadline*; English
has more. A pair that produces "blow a deadline" and is told it is wrong has been taught something
false **by a checklist**. So the holder can accept anything that works, it scores like any other,
and nothing is recorded about which pair accepted what — the debrief question, "what else did you
find?", is a spoken one, and it is the best two minutes in the activity.

**"Show one"** reveals a partner the pair have not got and deliberately scores nothing: a word they
were shown is not a word they produced. It is struck through on the list, and the counter leaves it
out.

Three areas ship with it — Business core, Insurance and banking, Everyday — 90 words and 462
partners in nine sets. The insurance area is where collocation stops being polish and becomes the
exam.

**v3.12a fixes two dead buttons, and adds the check that finds them.**

The **Start Twenty Questions** button did nothing. Its handler called `requireActive()` and
`makeCode()`, two functions that exist nowhere in the app — invented names that threw on the first
line. The whole suite passed throughout, because nothing in it ever called the function the button
is wired to.

That is a class of defect, not one mistake, so the fix is a check rather than a correction: every
name in an `onclick`, `onchange` or `oninput` — in the markup and in the markup the app generates
at runtime — must resolve to a function the app actually declares. It found a second one
immediately. **`setTermField` did not exist**, and it is wired to every text box in the Describe It
word editor: typing in a term or a forbidden word has gone nowhere since v3.8, and the only way to
change a pack was to re-import the sheet. It existed in v3.7 and was lost. Restored, and now it
also handles a pack that kept its words as one comma string.

**v3.12 puts the facts on the card, so the holder does not have to know who the person is.**

Reported from a lesson: younger players have no older pop-culture references, and older players
have no current ones. In this game that is worse than it sounds. In Describe It the describer needs
to know ONE WORD. Here the holder has to answer twenty arbitrary questions about a person, which
needs a whole biography — hand a 19-year-old "Serge Gainsbourg" and the card dies on the first
question. Choosing gentler names does not fix it; it only moves which half of the room is stuck.

So every subject may now carry **facts**, and the holder answers from those. They do not have to
have heard of the person. That turns the reference gap from a wall into the point of the activity:
the holder is reading English facts and converting them into spoken yes/no answers in real time,
which is harder and more useful than reciting what they already knew.

Years are stored as **numbers**, not prose. "Still alive" is the one fact on a card that expires by
itself; two numbers can be corrected in one cell, a sentence has to be found and rewritten. The
card computes the life line from them — and states the age at death as *"62 or 63"*, because years
alone cannot give an exact age and a card should not put a wrong fact about a real person on twenty
screens.

**Running out of questions stops being a dead end.** On a card with facts the holder is told to read
it out — the years and every line — and then say who it was. Neither of them scores either way,
which is exactly when a class will listen to a paragraph of English.

**The new area: Famous people.** 80 people in eight sets, banded by decade as well as by subject:
Business and money, Leaders and politics, Science and invention, Art and writing, Sport, Screen and
music: now, Screen and music: before you were born, French all eras. Pick "before you were born" for
your own references and "now" for theirs, or mix them and let each pair meet both.

**The staleness guard.** Building the packs prints every person over 80 who is shown as living, so
the file says what to verify instead of you remembering. The editor says the same thing on save.

**v3.11 adds the second game — Twenty Questions — and moves what the two share into core.**

One phone holds a secret; the partner has twenty yes/no questions to find it. Describe It trains
circumlocution: say it another way. This trains the thing a French speaker loses first and most
expensively, the QUESTION — auxiliary inversion, twenty times a round, without a gap-fill.

**The mechanic that does the teaching is the third button.** The holder answers Yes or No, and
each costs the asker one of their twenty. But "What colour is it?" is not a yes/no question, so it
gets the third button — and that one does **not** count. Nobody corrects anybody; a well-formed
question is simply worth something and a malformed one is not.

**Only the holder's phone shows the counter.** A student may read their own record and nobody
else's — the same rule that stops anyone scoring a classmate — so the asker has to *ask* how many
they have left, in English, and the holder has to answer. That is the design, not a workaround:
both of them end up talking to each other instead of reading a screen.

The asker is told the CATEGORY before the first question. That looks like a giveaway and is the
opposite: without it the first six questions go on establishing that we are not talking about an
animal, and the narrowing — the part with the language in it — never starts.

Settings: 10, 15 or 20 questions, and rounds of 3, 5 or 8 minutes, both changeable between rounds.
Three areas of packs ship with it — Workplace, Jobs, Everyday — 108 subjects in nine sets. The
Jobs area is the best one the game has: jobs narrow along lines students can already ask about,
and the Insurance and banking set is BTS Assurance vocabulary that is far easier to guess than to
define.

**`core/rounds.js` is new, and is the point of the release architecturally.** Two games now run a
timed round in pairs and add the counts up across rounds and partner swaps. Rule 2 says a module
may not call another module, so that machinery — the clock, the pair standings, the running
totals, when a round is banked, how a pack's sets are read — moved into core and Describe It was
rewired onto it. The suite checks it both ways: neither module calls the other, and core, once its
comments are stripped, contains no word from either game.

**v3.10 keeps score across the whole game, and fixes a freeze at the bell.**

**The bug**: after **Swap roles**, the student who had just been describing stayed stuck on the
round-over panel and never saw the guesser's screen. It was infinite recursion, not a slow
network: the card renderer drew the clock, the clock routine noticed the round had ended and
called the renderer back, and the two went round until the browser gave up — two thousand
frames deep. Only a round that had actually reached its bell could start it, which is why it
survived testing and appeared in a lesson. The clock now paints digits and nothing else, and one
tick decides when a change of phase is worth a redraw.

**Scores carry across rounds and partner swaps.** Each round's scoreboard appears between rounds
— this round's pairs, then the running total — and totals are kept per *student*, not per
pair, because pairs do not survive **New pairs**. Both partners bank the pair's score: the
guesser's questions are half the work. The teacher's browser does the banking, three seconds
after the bell so that scores still in flight are not lost, and it banks each round exactly once.

**No more fouls.** Taboo does not count them — say a forbidden word and you lose the card and
move on, which is the penalty. The guesser's button now flashes the describer's screen and
nothing else: no tally, no number, and nothing a student records about a classmate.

**Round length is 30, 60 or 90 seconds**, chosen at setup and changeable between rounds beside
the difficulty. Both land on the *next* round, so no pair has its clock shortened mid-run.

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
node "_test v3.14.1.js"
```

1,288 checks. The suite reads the load order out of `index.html`, so adding a script file needs
no change to the test.

## Running Word Partners

Admin → **Partner Sets · Word Partners** to write areas (or import a `Partners` sheet: Set, Word,
Pattern, Partners, Language — partners separated by semicolons, four to eight a card, most natural
first). Then Teacher Home → **Start Word Partners** → area, set, round length; students join with
the code, and **Deal the pairs**.

The order of the partners matters: "Show one" reveals the first one the pair have not got, so the
order decides what a stuck pair is handed. A partner must actually collocate rather than merely be
possible — "organise a deadline" is grammatical and nobody says it.

An odd student out becomes a **second speaker**. Two people producing against one checklist is the
strongest version of this for a weaker pair: they prompt each other, and the holder hears twice as
much language. Nothing is marked and nothing is kept.

## Running Twenty Questions

Admin → **Subject Sets · Twenty Questions** to write areas (or import a `Subjects` sheet: Set,
Subject, Category, Hint, Facts, Born, Died, Language — facts separated by semicolons, years as
bare numbers, a blank Died meaning living). Then Teacher Home → **Start Twenty Questions** → area, set,
question limit, round length; students join with the code, and **Deal the pairs**.

A subject has to survive "Is it alive?" as a first question, which is why these are not the
Describe It words — you cannot guess an excess with yes/no questions. Each one carries a category
the asker is told up front and one hint the holder can reveal if the pair stalls; the editor
refuses to let a hint contain its own subject, because the obvious clue is usually a description of
the thing using the thing's own words.

An odd student out becomes a **second asker**, not a referee: the holder answers, so there is
nothing to arbitrate, and two askers confer — which is the strongest version of the game for a
weaker pair. Nothing is marked and nothing is kept.

## Running a role play

Admin → **Role Play Creator** to write scenarios (or import a `Scenarios` sheet: one row per
role, with columns Scenario, Situation, Role, Brief, Secret, Useful, Optional). Then Teacher
Home → **Start a Role Play**, students join with the code, and **Deal the parts**.

A scenario has one situation everyone sees and two or three private briefs. Mark the third
role **optional** and a class of 23 becomes eleven pairs and one trio; without one, the spare
student gets a listening task instead. **Swap roles** keeps the pairs and changes who plays
what — that second run is where the fluency comes from. **New partners** reshuffles the room.
Nothing is marked and nothing is kept: the run is deleted when you end it.
