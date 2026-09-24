# Classroom Exam App — v3.1

The app is a folder rather than a single page. v3.0 moved the code without changing it;
**v3.1 adds role play**, the first activity built against the module contract.

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

426 checks. The suite reads the load order out of `index.html`, so adding a script file needs
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
