# Campus map images

Drop a picture of each campus map in here and type its path into the campus's
**Map image** field in the editor — `maps/kedge-paris.png`, relative, no leading slash.
The hub resolves it against its own page, so it works the same locally and on GitHub Pages.

## Naming

`<school>-<campus>.png`, lowercase, no spaces or accents: `kedge-paris.png`,
`iso-aix-en-provence.png`.

## Replacing one

**Browsers cache these and nothing busts that cache.** The code files carry `?v=0.3.4` tags;
an image in here does not. If you overwrite `kedge-paris.png` with a new map, anyone who has
already opened that campus may keep seeing the old one for a long time.

Two ways round it, either is fine:

- change the filename — `kedge-paris-2.png` — and update the field, or
- leave the filename and type `maps/kedge-paris.png?v=2` in the field. It is a free text
  field, so the suffix just works, and you bump the number each time.

## Size

Keep them under about 300 KB. They are already lazy-loaded, so they do not hold up the page,
but a colleague opening a campus on 4G in a corridor is the case to design for. A screenshot
at phone width is plenty — this is a "which end of the street" picture, not a navigation tool.
The **Open in Maps** button is what gives real directions.

## Where the picture comes from

An **OpenStreetMap** screenshot is the clean option: openly licensed, and it only asks for an
attribution line, which the campus's "Anything else" field can carry.

A **Google Maps** screenshot is Google's imagery. Inside a signed-in staff tool nobody is going
to mind, but this repo is public, so the image is on the open web with it. Worth knowing before
twenty-six of them go in.

## What does NOT go in here

Staff photos. A map of a building is not sensitive; a photograph of a colleague in a public
repo is findable by anyone, and the decisions log draws the line there — ask the person first,
and host it somewhere behind the sign-in.
