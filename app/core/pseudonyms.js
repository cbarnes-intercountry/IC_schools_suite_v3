/* ============================================================================
   Classroom Exam App — core/pseudonyms.js
   Part of index.html's script, split out in v3.0 style. Loaded as a plain script in the
   order set by index.html; every file shares one global scope, so nothing is imported.
   ============================================================================ */

/* The names students play under when an activity does not want their own.

   WHY THESE ARE IN A FILE OF THEIR OWN. They are DATA, not interface text: a student plays
   under this name, says it out loud, and sees it on a leaderboard, so translating it would
   rename people mid-game and throw away two English words they would otherwise have learned.
   The suite's "every string a person reads goes through the lookup" check skips this file by
   name for that reason — which also retires the 240-word exception that would otherwise have
   to live in the test file's list.

   WHY TWO WORDS. One word is easier to call across a room, but teams form on the projected
   waiting room rather than by the teacher reading a register, and a two-word name is easier
   to pick out of a list of twenty-five. Dropping to single words is a change to this file
   and nothing else.

   WHAT THEY ARE CHOSEN FOR. Every word has to be sayable by a B1 French speaker and concrete
   enough to picture: no obscure fauna, no silent-letter traps, nothing that needs explaining
   before a game can start.

   A NOTE ON THE NUMBERS, because it is the thing that was got wrong before. v3.15 DERIVED a
   pseudonym from the student's id by hash over a pool of 2,500, which gave two students the
   same name about once in nine classes of twenty-five — and the clash surfaced only on the
   final leaderboard, so a phone read "Daring Ferret" while the board read "Daring Ferret 1".
   Expanding the pool does not fix that: even at 16,506 combinations a hash still collides
   about one class in fifty. What fixes it is ALLOCATING — see pickPseudonym below — which
   makes a clash impossible rather than unlikely. The size of these lists is about variety
   across a term, not about collisions. */

const PSEUDO_ADJECTIVES = [
  "Amber", "Arctic", "Autumn", "Azure", "Blazing", "Bold", "Brave", "Bright",
  "Bronze", "Calm", "Candid", "Cheerful", "Clever", "Coastal", "Copper", "Coral",
  "Cosmic", "Crimson", "Curious", "Daring", "Dawn", "Deep", "Desert", "Diamond",
  "Distant", "Eager", "Early", "Eastern", "Electric", "Elegant", "Emerald", "Endless",
  "Fearless", "Fleet", "Floating", "Forest", "Frosted", "Gallant", "Gentle", "Gifted",
  "Glowing", "Golden", "Graceful", "Grand", "Granite", "Happy", "Hidden", "Honest",
  "Humble", "Indigo", "Iron", "Ivory", "Jade", "Jolly", "Joyful", "Keen",
  "Kindly", "Laughing", "Lively", "Loyal", "Lucky", "Lunar", "Marble", "Merry",
  "Midnight", "Mighty", "Misty", "Modest", "Morning", "Mountain", "Neat", "Nimble",
  "Noble", "Northern", "Ocean", "Olive", "Opal", "Patient", "Peaceful", "Pearl",
  "Polar", "Prairie", "Proud", "Purple", "Quick", "Quiet", "Rapid", "Restless",
  "River", "Royal", "Ruby", "Rustic", "Sapphire", "Scarlet", "Shadow", "Sharp",
  "Shining", "Silent", "Silver", "Sleepy", "Smiling", "Smooth", "Snowy", "Solar",
  "Southern", "Spirited", "Spring", "Steady", "Stormy", "Summer", "Sunny", "Swift",
  "Thunder", "Tidal", "Tranquil", "Turquoise", "Twilight", "Valiant", "Velvet", "Violet",
  "Vivid", "Wandering", "Western", "Wild", "Winter", "Wise"
];

const PSEUDO_NOUNS = [
  "Albatross", "Antelope", "Badger", "Beaver", "Bison", "Buffalo", "Butterfly", "Camel",
  "Caribou", "Cheetah", "Cobra", "Condor", "Cougar", "Coyote", "Crane", "Cricket",
  "Crocodile", "Dolphin", "Donkey", "Dragon", "Dragonfly", "Eagle", "Egret", "Elephant",
  "Elk", "Falcon", "Ferret", "Finch", "Firefly", "Flamingo", "Fox", "Gazelle",
  "Gecko", "Gibbon", "Giraffe", "Goose", "Gopher", "Grouse", "Hamster", "Hare",
  "Hawk", "Hedgehog", "Heron", "Hornet", "Horse", "Ibex", "Ibis", "Iguana",
  "Impala", "Jackal", "Jaguar", "Jay", "Kestrel", "Kingfisher", "Koala", "Ladybird",
  "Lemur", "Leopard", "Lizard", "Llama", "Lobster", "Lynx", "Magpie", "Mantis",
  "Marlin", "Marmot", "Meerkat", "Mole", "Mongoose", "Moose", "Moth", "Narwhal",
  "Newt", "Nightingale", "Ocelot", "Octopus", "Orca", "Oriole", "Osprey", "Ostrich",
  "Otter", "Owl", "Panda", "Panther", "Parrot", "Partridge", "Pelican", "Penguin",
  "Pheasant", "Pigeon", "Platypus", "Polecat", "Porpoise", "Puffin", "Puma", "Python",
  "Quail", "Rabbit", "Raccoon", "Raven", "Reindeer", "Rhino", "Robin", "Salamander",
  "Salmon", "Seal", "Shark", "Sparrow", "Spider", "Squid", "Squirrel", "Stallion",
  "Starling", "Stingray", "Stork", "Swallow", "Swan", "Tapir", "Tiger", "Toucan",
  "Turtle", "Viper", "Vulture", "Walrus", "Weasel", "Whale", "Wolf", "Wombat",
  "Woodpecker", "Yak", "Zebra"
];

/* How many different names a room can be given before this file has to grow. Not a limit
   anyone will reach — a class is twenty-five — but the allocator needs to know when to stop
   looking. */
function pseudonymPoolSize(){ return PSEUDO_ADJECTIVES.length * PSEUDO_NOUNS.length; }

/* One name that nobody in this room already has.

   `taken` is the names already in the room, matched the same way typed names are — case and
   surrounding space ignored — so the comparison cannot differ between the two kinds of name.

   Random rather than sequential: sequential would hand the first student in every lesson the
   same name all term, and a class notices. Bounded rather than looping until it finds a gap,
   because an exhausted pool must end in a name rather than in a hung phone; after enough
   tries it falls back to numbering, which is what uniqueFirstName does for a typed name and
   is one behaviour rather than two. */
function pickPseudonym(taken, rnd){
  const r = typeof rnd === "function" ? rnd : Math.random;
  const tries = Math.min(200, pseudonymPoolSize());
  for(let i=0; i<tries; i++){
    const name = PSEUDO_ADJECTIVES[Math.floor(r()*PSEUDO_ADJECTIVES.length)] + " " +
                 PSEUDO_NOUNS[Math.floor(r()*PSEUDO_NOUNS.length)];
    if(!nameIsTaken(name, taken)) return name;
  }
  const first = PSEUDO_ADJECTIVES[Math.floor(r()*PSEUDO_ADJECTIVES.length)] + " " +
                PSEUDO_NOUNS[Math.floor(r()*PSEUDO_NOUNS.length)];
  return uniqueFirstName(first, taken);
}
