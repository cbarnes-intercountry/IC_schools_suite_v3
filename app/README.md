# Classroom Exam App — v3.33

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

**v3.15 adds a final leaderboard and an anonymous mode.**

**The leaderboard.** Ending Twenty Questions or Word Partners now shows the final standings before
the run is cleared. Your screen lists **everybody**, because the useful information is the
distribution — who scored nothing all session is the thing worth noticing. **Project** puts the
**top five only** on the wall: a class of 24 seeing exactly where they came teaches the bottom
third where they came, and they stop trying. Celebratory at the front, diagnostic in your hand.

Ties share a place, as they do in any sport. The round in progress is banked first, so ending
mid-round does not lose the round the class just played. Nothing is kept — closing the screen
deletes the run exactly as End always did.

**Anonymous mode**, a tick box on each game's setup screen, off by default. Students join with the
code and **nothing else**: no name is asked for, so none is stored, so there is no key for anybody
to hold — including you. Each student is given a two-word name derived from their own id, so a
phone that reconnects gets the same one back without anything being written down.

Two words rather than a number because the pair has to say them: *"Blue Falcon, you're with me"* is
a sentence and *"Player 14"* is not. It is also two more English words said twenty times a round.

What it costs, plainly: the roster tells you **how many** have joined, not **which** — so you
cannot see that one particular student is missing. A student on a second device is a second player.
And two students can draw the same name; lists that show them together number them apart.

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
node "_test v3.15.js"
```

1,355 checks. The suite reads the load order out of `index.html`, so adding a script file needs
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


---

**Versions 3.16 to 3.19 are not written up here.** Their entries live in the project log, which
is where the history has been kept since the README stopped being the only place to put it.
In short: v3.16 and v3.17 settled how students are named (first names, resolved at join so the
phone, the roster and the leaderboard all quote one string), v3.18 added removing a student from
the lobby and stopped Twenty Questions dealing the same pair twice in a row, and v3.19 took role
play from three roles to six.

## A poll question with a right answer (v3.20)

A poll question may now carry a **correct answer**, which turns it from an opinion vote into a
comprehension check the whole room answers at once. Mark one choice in the editor (the type
selector above the choices decides which kind of question it is), or put a letter in the
**Correct** column of a poll row in the import sheet. Leave it blank and nothing changes.

**It is still a poll.** It scores nothing, it is never marked, it writes no report, and the run
is deleted when you close it. The only thing the answer does is let the room be told what it was.

**When the room is told is the teacher's decision, and nobody's else's.** The answer appears at
the moment you reveal the results — the correct bar is ticked on the projector, and every phone
is told whether it was right, including the phones of students who never voted. Before that, a
phone that has voted says only "Vote recorded". Which means a question set to show results live
announces its own answer as soon as the first student votes: the editor says so in amber when
you mark an answer without turning "hide results" on, and the import sheet says so too. For a
real check, hide the results.

One thing worth knowing and not fixed here: the answers to **any** activity, this one and the
marked test alike, are written into the session every joined student reads. A student who opens
a developer console on their phone can read them. That has been true since v2 and is wider than
polls; it wants a version of its own, where the student's copy of a question has the answer
stripped out and the answer is relayed at reveal.


## The teacher marks the paper (v3.20a)

**What was wrong.** A submitted result was taken at face value. The student's own device wrote
`score`, `totalPossible` and `percentage` into their own participant record — which the security
rules correctly let them do — and the dashboard, the recap and the exported CSV all reported it.
Only students who did NOT submit were ever marked by the teacher's device. A student who knew
this could have put 100% in a CSV without answering a question.

**What changed.**

1. **Every mark is computed on the teacher's device, from the student's answers**, against the
   teacher's own copy of the questions. The live dashboard squares already worked this way
   mid-test; it was the moment of submission that handed authority to the phone. There is now
   one marker in the room.
2. **The student submits work, not a mark.** The result carries `order`, `answers`, `timeSpent`,
   `cheatAlerts`, `finishedAt` and `raw:true` — and no score of any kind.
3. **Submitting no longer deletes `progress`.** It held the only copy of the answers the mark
   can honestly be rebuilt from.
4. **The answers are flushed before submitting, and waited for.** The checkpoint runs every 20
   seconds, so without this a student's last answers could simply not be there at marking time.
5. **A failed submission is now visible.** It used to be a `console.warn` behind a feedback
   screen reading "Your answers are in" — a student could walk out believing they had submitted.
   The screen now says which happened, and the heading follows: no "Nicely done" over a warning
   that the work never arrived.
6. **The write window closes (rules change — must be deployed).** A student may write their own
   participant record only while the run is **both** not `ended` **and** less than 12 hours old.
   Without it, recomputation is only as good as the last moment anyone could edit: a student
   could sit the test, learn the answers afterwards and quietly rewrite their own
   `progress.answers`. Teachers are unaffected.

   The clock half is not belt and braces. A run is marked ended when the teacher presses End —
   or when they next open Home and the app tidies away anything past its 12-hour life. A
   session a teacher simply forgot therefore stays `active` in the database for as long as
   nobody looks at it, overnight and over a weekend, and the status test alone would leave it
   open to its students the whole time. The rules close it on the clock, with no app running.

   The 12 hours is written in two places — `SESSION_TTL_MS` decides what the app OFFERS the
   teacher, the rule decides what the database PERMITS — and the suite fails if they disagree.
   A session with no `runAt` refuses students rather than trusting them: `createSession` has
   always written one, so its absence means a hand-edited record, and a refused write is now
   visible on the student's screen within a minute rather than silently costing the protection.

**Deployment order: the app first, then the rules.** An old build against the new rules would
have a late submission silently refused; the new build says so on screen.

**A record from a run sat before v3.20a** has no answers kept, so there is nothing to recompute.
Its figure is shown as it stands and labelled *Submitted (self-marked — pre-3.20a run)* rather
than passing as marked work.

**What this does NOT do.** The answers are still written into the session every joined student
reads, so a student who opens a developer console can still read them — and with the write
window closed they would have to use them during the test rather than after it. That is the
separate change (a student copy with answers stripped, relayed at reveal), and it is worth
doing before anything that scores a live competition.

**Cheat alerts are written by the student and can be edited by the student.** The write window
closes that after the test; during it, the log is theirs. It is a deterrent and a record, never
evidence, and nothing in the reports pretends otherwise.


## The end of a test, and how fast an answer travels (v3.20b)

### A regression in v3.20a, fixed

The student's device auto-submits when it sees the teacher end the test. Under v3.20a's write
window that submit was refused — so **pressing End Test would have shown "Something went wrong"
to every student still working**, which on a manually timed test is most of the class.

A run that has already closed is now finished **on the device**, writing nothing. The answers
are already in the database; the phone shows the ordinary Test Complete screen with marks; the
unanswered last question scores zero, which is what it is. A Finish pressed a second after the
bell takes the same path. A refusal while the run is still OPEN is still reported — that one is
a real fault.

Whether the run has closed is asked of `STUDENT.meta` and nowhere else. An earlier draft also
passed a flag from the subscription, which was the same fact arriving twice.

### Who was still working when the bell went

Ending a test records `endedAt`. A student with answers and no submission now reads as
**Working at the bell** when their last activity was within a minute of it, and stays
**Incomplete (disconnected)** when their phone went quiet twenty minutes earlier. One is a
normal ending, the other wants looking into, and they were indistinguishable before. A run with
no `endedAt` — anything from before v3.20b — is not guessed at.

### Latency: about 4 seconds, now about 300ms for a tap

Three write paths, because the three things that change have nothing in common.

- **A tap** — an option chosen, a puzzle row moved — writes immediately. The dashboard square
  turns over in a round trip. **No extra writes:** one tap made one write before too; the four
  seconds it waited first were pure delay.
- **Typing** keeps a batch, cut from 4s to **1.2s**. A short-answer field fires on every
  keystroke, and that is the only reason the delay existed.
- **A cheat alert** writes immediately, on its own path. It is what a teacher most wants to see
  while it is still happening, and it must never wait behind batching meant for a text box.

Answer writes now carry **only the field that changed** rather than rewriting the whole of
progress each time, so the shorter typing window costs almost nothing in bandwidth.

Two things that had to come with that, both caught by their own checks:

- A delta write carries `lastSeen` in the **same** update. The dashboard calls a student
  Dropped after 30 seconds without one, so a delta that skipped it would show the class
  disconnecting as they answered.
- The question **order** is written once as the test opens. It is not a field that changes, so
  no delta carries it — and until v3.20b it first reached the database at the 20-second
  checkpoint, meaning a paper ended inside the first twenty seconds had answers and nothing to
  read them against. The teacher would have marked it 0 of 0.


## Which rules file to upload

**`firebase-rules-combined.json` — not `firebase-rules.json`.**

The hub and the app share one Firebase project, and a project has exactly one rules document.
Whichever file you upload becomes the whole ruleset:

- `firebase-rules.json` is the APP's half. It has no `hub` node, so uploading it leaves the
  Teacher Hub's data with no rules at all.
- The hub's own file is the other half. It has no `sessions`, `participants` or `quizzes`, so
  uploading that one does the same to the exams.
- `firebase-rules-combined.json` is both, and is the only one that should ever go up.

The combined file is now GENERATED — `make_rules_combined.py <app folder> <hub folder>` — and
the suite fails if it has drifted from either source. It is not maintained by hand because
the hand-maintained version rotted: by v3.20b both copies on disk still carried the
participants rule from before the write window, so uploading either would have quietly undone
v3.20a's protection with nothing on screen to say so.


## What a student is called (v3.21)

**A property of the activity, not a setting a teacher picks each time.** Each module now
declares one `nameMode`, and the registry refuses to register one that does not:

| | |
|---|---|
| `full` | Test — it is marked and it leaves a CSV somebody reads weeks later |
| `first` | Role play, Describe It, Twenty Questions, Word Partners — you pair people by reading a name out, and a pseudonym cannot be paired across a room |
| `pseudonym` | Quiz and bingo when they arrive — nothing is kept and nobody needs identifying afterwards |
| `anonymous` | A poll, where being identifiable is the thing that stops an honest answer |

This replaces three hooks — `requiresName`, `firstNameOnly`, and whatever was left over — which
encoded one decision in three places and had no room for a fourth answer. An unrecognised mode
falls back to asking for a full name: wrong one way means a student types a name they did not
need to, wrong the other way means an exam with no names on it.

**Polls now choose between all three**, because all three are defensible for a poll. A record
written before v3.21 has only the old `anonymous` flag and is read exactly as it was.

### Pseudonyms are back, allocated rather than derived

v3.15 had them; v3.17 removed them for two reasons, and both still stand. The first is why the
four pairing games keep first names. The second was a defect: the name was DERIVED from the
student's id by hash over a pool of 2,500, so two students in a class of twenty-five drew the
same one about **once in nine classes** — and the clash surfaced only on the final leaderboard,
so a phone read "Daring Ferret" while the board read "Daring Ferret 1".

Expanding the pool does not fix that. Even at 16,506 combinations a hash still collides about
**one class in fifty**. What fixes it is reading the room and picking something unused, which
makes a clash **impossible** rather than unlikely — the same read, the same comparison and the
same resolution a typed first name has gone through since v3.17.

A pseudonym is stored as the student's first name, because that is what it is: a first name the
app chose. Every screen downstream needed no change to show one.

The word lists live in `core/pseudonyms.js` — 126 adjectives × 131 nouns — and are deliberately
NOT translated: a student plays under the name, says it aloud and sees it on a board, so
translating it would rename people mid-game and throw away two English words. The suite skips
that file by name for exactly that reason.

---

## v3.30 — the quiz game

A projected, teacher-paced game played for points. It is not a test and it is not a poll, and
the differences are the design: **marked, but kept by nobody.**

**A third bank.** The Live Quiz Creator takes every question type there is — MCQ, true/false,
short text, numeric, ordering, polls and word clouds in the same set. A poll dropped into the
sequence scores nothing and is a pause for discussion; it is not counted as a question the
room got wrong. The Excel importer now asks the bank what it accepts rather than sorting
sheets into poll-or-not, so a mixed sheet imports whole.

**The score** (`core/quizscore.js`), stated once so the board, the projection and the
student's card cannot disagree:

    grace  = 0.25 x T                        reading time, no decay
    points = round(700 + 300 x (1 - t'/(T - grace)))   correct answers only
    wrong, or no answer                      = 0       no streak bonus

Kahoot's floor is 500, which makes pure speed worth a **doubled** correct count. At 700 it is
worth 43%, so accuracy stays the dominant term — that is the narrowing. The first quarter of
the clock scores full marks whatever happens in it, because four seconds of a twenty-second
question is reading, and charging for reading time scores CEFR level rather than knowledge.
There is no streak bonus: it compounds, and the student who breaks a streak loses a bonus
whose size they could not see.

**Teams** form by themselves as the room fills, and everyone answers on their own phone. A
team's score for a question is the **mean over its members at that moment** — summing would
hand the larger team a standing lead for being larger, and dividing by who *answered* would
reward a team for having its weakest member sit out. Individual play is a toggle.

**Ties break on total response time**, and a question nobody answered counts as the **whole
clock**. Without that, saying nothing would lower your total time and improve your tiebreak.

**Pseudonyms by default**, first names on a toggle, never surnames. Nothing is kept and nobody
needs identifying afterwards, and a projected board of real first names ranks a class by name
in front of itself.

**Media.** Images show on the projector and on phones. **Audio is projector-only and the clock
waits for the clip** — one or two plays, the teacher's choice — or the room is scored on how
long the recording is. **Video is projector-only and URL-only**, through an allowlist
(YouTube via the no-cookie host, Vimeo); anything else is not framed at all. Twenty-five
phones streaming one clip over school wifi is the likeliest way a lesson falls over, and an
embedded player on a personal phone sets that provider's cookies on a device the school does
not own. The next question's image is fetched while this one is being answered.

**Known limit, stated plainly:** the questions are in the session every joined student can
read, exactly as they are for a test — a student with a developer console can read them. That
is accepted here because nothing is kept and no mark follows anybody, and it is why the
separate "answers off the phone" work is scoped to the true test mode.

Nothing is archived. The run is deleted behind the final board.

---

## v3.30.1 — the name on the phone is the name on the board

**The bug Chris reported:** in quiz mode, the pseudonym on a student's phone did not match the
one on the teacher's screen.

**The cause, and it is older than quiz mode.** v3.21 replaced derived pseudonyms with
*allocated* ones — read the room, pick a name nobody has — and v3.17 does the same for typed
first names, asking "is that you, joining again on another phone?" when one is taken. Both
read the room through `existingFirstNames()`, which reads `participants/<runId>`.

That node is **teacher-only**, correctly: it carries answers, scores and the cheat alert log.
So on a student's phone the read came back `permission_denied`, was caught, logged to a console
nobody reads, and returned an empty array. **Every student allocated against an empty room** —
a blind draw with extra steps. Two students could draw the same pseudonym, and one of them
would then see their own name sitting against somebody else's score. The duplicate-first-name
question had never once been able to fire on a student's phone either.

**The fix: a names-only index.** `roster/<runId>/<studentId> = "Nimble Salmon"` — readable by
any signed-in user, writable only by its owner, capped at 60 characters so it cannot become
free storage. Names only. Answers, scores and alerts stay exactly where they were, and a
student still cannot read another student's record. A pseudonym is not personal data, and a
first name is said out loud across the room all lesson.

The name is claimed **before** the student joins, so the next phone to read the room sees it.
Two reads that both land before either write can still collide — that is now a few
milliseconds of exposure instead of the whole session, against 16,506 pseudonyms.

A removed student gets their name back, and deleting a run takes its index with it. Runs
created before v3.30.1 have no index; the old read is still the fallback, which works on a
teacher's device and is no worse than before on a student's.

**This also repairs polls, Describe It, Twenty Questions and Word Partners**, which share the
same function.

> **The rules change.** Deploy `firebase-rules-combined.json` as always — it now carries the
> `roster` node. The app's own rules file must never be deployed.

---

## v3.31 — a clock that is not autoplay, and three phases

**Autoplay and the question timer are different things**, and v3.30 ran them together. The
countdown was wired into the autoplay branch, so a teacher pacing the room by hand had a timer
the class could see run out and do nothing.

They are now separate, as they should always have been:

- **The clock belongs to the question.** Every question is timed, it counts down on the board,
  and it ends the question when it reaches zero — whether or not anybody is driving.
- **Autoplay only decides who presses Next** — the teacher, or nobody.

**Per-question time limits are set in the builder.** The box was already there; it now says
what it means, which differs by bank. On a test it is a cap and `0` means no limit. In a quiz
game every question is timed, so `0` means *use the quiz's default* (5–120 s otherwise).
Labelling both "Time limit (s)" is how an author ends up with a question nobody can score.

**A question now ends on whichever comes first:** the clock running out, or **every student
having answered**. A room that has all answered in nine seconds of a twenty-second question
spends eleven seconds watching a timer, and that is where a class starts talking. An empty
lobby does not count as everybody.

**Then two screens, never merged:**

1. **The answer** — the correct answer alone and very large, with the question above it and
   *"1 of 3 got it"* below. The question header comes down with the question, so the stem is
   not on screen twice beside a tally that stopped being true.
2. **The standings** — **top five only** for individuals (v3.15's ruling: a class of
   twenty-four seeing exactly where each of them came teaches the bottom third where they
   came, and they stop trying). Every team shows, because a team is not a person.

Shown together nobody reads the answer, which is why they are two screens.

Under autoplay the answer holds 5 seconds and the board 6. By hand they stay until the teacher
moves on — which is the whole difference the two settings are supposed to express. **One
button** drives it, and it says which of the three things it will do: *End question → Show
scores → Next question*.

On a student's phone the board phase shows **their own points and team**, not the leaderboard:
top five on the wall, your own place in your hand, so the room looks up instead of
twenty-five people reading the same list off twenty-five screens.

---

## v3.32 — vocabulary bingo

Nine words on each phone, drawn from a list of twenty or more. The teacher calls them one at
a time; a full card wins. Nothing is kept.

**Two versions, the teacher's choice, and the difference is the whole pedagogy:**

- **Definitions** — the teacher reads a definition or a gapped sentence and the student works
  out which of their nine words it describes. That is the exercise.
- **The word itself** — recognition. A ninety-second warm-up, and that is all it is.

**No fourth content type.** Bingo reads any quiz or quiz-game set as a word list: the
**answer** goes on the card, the **question** is what gets read out. So a short-answer set
written for a test plays as bingo with nothing added to it.

**The card is derived, not dealt** (`core/bingocard.js`). Nine list indexes worked out from
the student's own id and the run id, so the same student always gets the same card back — a
reload is not a reroll — while two students never hold the same nine words. Handing out
twenty-five cards through the database would be the roster problem again with nine times the
data.

**Tapping is allowed on any cell.** In the strong version, working out which word a definition
describes *is* the exercise; an app that only accepted taps on words it had already called
would be doing the comprehension. So a full card is a **claim**, and the claim is verified —
first on the student's own phone, which names the word they jumped on privately rather than a
teacher saying it in front of the room, and then on the teacher's device against the calls
actually made. That is "false bingo auto-rejected", and it is the same principle as the test
recomputing a mark rather than trusting a submitted score (v3.20a).

**The list length is the duration dial.** A full card on a 3×3 needs all nine of a student's
words; with twenty in the list the first of twenty-five cards lands around call fifteen —
four or five minutes. Twelve words and it is over before the room looks up. So the minimum is
**19** (more than twice the card), a shorter list is refused with the number in the message,
and the setup screen says how many calls and roughly how many minutes before you start.

**Two toggles, because each one changes the game:**

- *Show the list of words already called* — on, a student who missed one can catch up and the
  exercise becomes reading a list; off, they had to be listening. The list shows the calls
  that have **been and gone**, never the one on the wall: printing the current word in the
  catch-up strip would answer the definition the blur is hiding.
- *Call the next word automatically* — timing is who decides when the next word comes, not how
  the game is played.

In the definitions version the word itself sits blurred under its clue, so a stuck room gets
it from the front rather than from the next desk.

Pseudonyms, like the quiz. The name exists only so a winner can be read out.

---

## v3.32.1 — bingo gets a bank of its own

**The bug.** v3.32 shipped the game without a builder. It read the quiz bank directly — the
answer became the word, the question the clue — which ran, but meant the launcher offered a
teacher their **tests** to play bingo with, and there was nowhere to write a word list at all.
A game with no bank of its own is a game nobody can prepare.

**Admin → Word Lists · Bingo.** A list is words, each with the clue you read out, filed by set
like every other pack (`kind:"bingo"`, same library, no backend change). The launcher now
offers bingo lists and nothing else, and there is no school step — these packs are filed by
area, as the other games' packs are.

**It keeps the useful half of the old idea: fill a list from a pack you already have.** One
control, and the words come across translated rather than retyped:

| from | the word | the clue |
|---|---|---|
| Describe It | the term | — |
| Twenty Questions | the subject | its hint (already written to re-open a question) |
| Word Partners | the head word | its partners — "meet, miss, set" for *deadline* |
| a test / quiz game | the short answer | the question |
| another bingo list | copied | copied |

Importing **adds**, never replaces — building one list out of two packs is the ordinary case,
and a wipe would cost the clues just written. Words already on the list are not added twice,
and a list is never offered as a source of itself. Everything arrives through the same rules a
typed word meets, so an import cannot slip a sentence onto a card.

**The editor checks what a bingo list needs**, and says so on save without refusing it (a list
is written over several sittings):

- a **clue containing its own word** — the easiest mistake there is, because the obvious clue
  for a word is a sentence about the word using the word, and in the definitions version that
  reads the answer out with the question;
- duplicates, entries too long for a cell, and words with no clue;
- **how many more words** are needed, shown live while the list is written rather than when
  the game refuses to start.

---

## v3.33 — two clues per word, chosen at launch

**Every bingo word now carries a short definition AND a gapped sentence**, and the teacher
picks which is read out when they launch the game. The same list plays three ways:

| mode | what the room hears | what it is |
|---|---|---|
| the word | *premium* | recognition. A ninety-second warm-up. |
| definition | *The amount you pay each month or year for cover* | they work out which of their nine it is |
| gap sentence | *The ___ went up again after two claims* | the word in a context that constrains it — the hardest and most useful |

v3.32 stored one clue and made the choice an author's, so a teacher wanting two difficulties
out of the same vocabulary had to keep two lists. A word missing the chosen clue **falls
back** — to its other clue, then to itself — so a half-written list is a playable game with
some easy items in it rather than a game that stops.

**The editor has two boxes per word**, and checks both on save: neither clue may contain its
own word (a definition that says it reads the answer out with the question; a "gapped"
sentence that still contains it has not been gapped), and a gap sentence must actually have
`___` in it. The count beside the heading says how many of each clue the list has, so you can
see which modes it can be played in before you launch.

**A Bingo sheet in the import template (v8)**: Set, Word, Definition, Gap sentence, Language.
Column notes explain what each one is for and what makes a bad clue. Sheets written against
v3.32's single-clue idea still import — `Term` and `Clue` are read as `Word` and `Definition`.

### The four Describe It areas now ship as bingo lists

**475 words, 950 clues**, filed under the same set names as the Describe It packs — so the
vocabulary taught on Tuesday is the vocabulary played on Friday.

| file | words | sets |
|---|---|---|
| `bingo-business-language-en.xlsx` | 164 | 14 |
| `bingo-general-english-en.xlsx` | 166 | 14 |
| `bingo-jobs-and-sectors-en.xlsx` | 98 | 8 |
| `bingo-french-speaker-traps-en.xlsx` | 47 | 4 |

The rules they were written to, and they are not stylistic:

- **Neither clue contains its own word**, in any inflected form.
- **A definition is said in one breath.** It is read aloud once to a room, not printed for a
  student to re-read. Sixteen words is the ceiling.
- **A gap sentence constrains the word.** "This is a ___" fits forty words and teaches
  nothing; the sentence has to carry the collocation and the situation.
- **No clue uses another word from the same set**, since nine of them are on a card together.
- The *French-speaker traps* clues **distinguish rather than define** — a French speaker
  already has a meaning for "eventually" and "sensible", and a definition that only gives the
  English sense leaves the trap untouched.

`packs/check_bingo_clues.py` holds the clue files to those rules and the build refuses to run
if it has anything to say. The suite then re-checks the shipped rows through **the app's own
importer and the app's own giveaway test**, so a pack the app would refuse is a failing test
rather than something found in front of a class.

One term is deliberately left out — *the turn of the century*, five words with no shorter form
that is still the expression. The omission is recorded with its reason in `bingo_traps.py`
rather than being a silent loss.
