# Places, not menus — a survey of the rest of the Vale

The town square is the only screen in Iron Vale that is a place. Everything
else is stacked gold-bordered panels on the flat void: 76 `.win` panels across
eleven routes. The Drill Yard and the Bazaar Row proved the treatment works;
this is the map of where else it should go.

Iron Vale is a game. Nothing here diagnoses, predicts injury, proves its
advice, or stands in for a professional. These are rooms to be in, not
dashboards to read.

## What the survey found

| Screen | File | Today | Verdict |
|---|---|---|---|
| Town square | `town.js:125` | Tiled sky + ground, three building rows, time-of-day | **Already a place** — the reference |
| Giver huts (×4) | `giver.js:185` | Portrait panel + offer cards | **Strongest candidate** |
| Quest training log | `giver.js:798` | Collapsible cards, number steppers | Strong |
| The Ledger House (Wick) | `giver.js:1143` | Three form rows + a list | Strong |
| Hall of Records | `hall.js:40` | Eight tabs, 29 panels, mostly tables | **Biggest win, hardest** |
| Settings | `misc.js:817` | The densest form in the app | Sleeper candidate |
| The Crankwerk | `misc.js:14` | Drawn machine inside a panel | Cheap win |
| Doctrines & Routines | `giver.js:485` | Card list + a forge form | Covered by the Drill Yard plan |
| The Colosseum | `colosseum.js:8` | Contestant buttons over a canvas stage | Medium |
| The Undercroft gate | `dungeon.js:24` | Portrait + stats table + DESCEND | Medium |
| The Menagerie | `ranch.js:36` | Canvas pen, plus a tile grid below it | Mostly there |
| Adventurer picker | `app.js:963` | Grid of cards | Small, high value |
| The Undercroft crawler | `dungeon.js:~140` | Roguelike HUD | **Leave it** |

## The giver huts

Four huts, one screen, one grammar. You are inside the room, not looking at a
portrait card: back wall, floor, a window carrying the same `tod-day` /
`tod-sunset` / `tod-night` tint the town square already uses. The giver stands
at their own station. The offers are objects in the room, and you take one by
touching it — never by reading a card and pressing ACCEPT beneath it.

**Grunhilda's forge.** Quests are billets glowing on the cooling rack beside
the anvil. Tap one and it lifts into the light with its terms. Swearing it is
Grunhilda putting hammer to it. The door in the back wall opens onto the Drill
Yard — the routine builder becomes an adjacent room, not a route.

**Old Fenn's waystone.** Quests are milestones carved along the road out of
frame, near ones legible, the far ones a haze on the ridge. The longer the
quest, the further down the road its stone sits. Tap a stone to read what it
asks. Distance is the interface.

**Sage Elowen's willow.** Rest writs are ribbons of folded paper tied to the
boughs; they turn in the wind. Tap one and it unfurls into her reading of the
week. The willow is fuller when you have earned more rest.

**Ser Bram's keep.** He is retired and there is nothing to take, so the room
should say so before he does: sheet over the long table, his sword still above
the hearth, one chair pulled to the fire. No offer objects at all. The absence
is the design.

Utilities ride as corner glyphs in the ✕ weight class, and the giver's own
portrait stays a small tappable bust — they speak on tap, not always.

## The quest training log — the anvil

Today: collapsible cards with plus/minus steppers and a LOG SET button each.

Instead: the exercise on deck sits on the anvil. Weight is set by hanging
plates from the wall rack — you tap plates, you do not type a number. Logging a
set is a hammer strike that cuts a tally into the billet. Finished work goes
into the quench trough along the bottom of the frame, still steaming; that
trough *is* today's inked-sets list, and pulling one back out is the undo.

## The Ledger House — Wick's desk

Today: a kind select, a minutes field, a note field, a submit button, a list.

Instead: you are looking down at the desk. The ledger lies open. A rack of
stamps stands beside the inkpot, one per kind of deed — a boot for the run, a
wheel for the ride, a hook for the climb — and you press the one you did. An
hourglass sets the minutes by how far you drag the sand. The quill takes the
note. Striking a record from the ledger is Wick ruling a line through it,
which is what "strike from the record" has always meant.

## The Hall of Records — a building with rooms

The densest screen in the app: eight tabs, 29 panels, mostly tables. It is also
the one that most wants to be a place, because a hall of records is already a
place in every player's head.

Replace the tab bar with a corridor you move along. Each tab becomes a fixture
you approach: the standing figure under glass (body), the physician's chart
wall (vitals), the Long Road map that is already drawn (deeds), the iron rack
and its ledger (iron), the loom with the Tapestry on it (calendar), the shelf
of bound volumes (compendium), the almanac on its lectern, and the chronicle
spooling out of the wall in one long scroll. Maud rides a corner as a small
bust and narrates the room you are standing in, on tap.

The tables themselves stay tables. A record you cannot read is not a better
record — the change is how you get to them and what surrounds them.

## Settings — your own room

The sleeper. Settings is currently the densest form in the app and it is the
one screen with an obvious diegetic home: the room you keep at the inn.

Your name and face are at the mirror. The PIN is the lock on the door. Units
are the measuring stick notched on the door frame. The ravens' credentials are
the band on the raven's leg, in the cage by the window. The weekly counsel
schedule is the peg board over the desk, days as pegs. The focus charter is the
paper pinned above it. Dev mode is the loose floorboard.

This is also where the Hearth Tree from the Bazaar plan lives, which is a good
reason to build the room once and let both features stand in it.

## The cheaper ones

**The Crankwerk** already draws its machine; it just needs a cellar around it —
pipes, a token slot, and a chute that drops the capsule into a basket you pick
from, instead of a capsule that pops inside a bordered panel.

**The Colosseum's** contestant buttons become the pens beneath the arena: you
walk the row of stalls and put your hand on the one you back. The wager is
coins pushed across the bookmaker's plank.

**The Undercroft gate** is a stairway down into the dark with the descent tally
chalked on the wall beside the door, and Hesk leaning next to it. The crawler
below it should stay a HUD — you are in the dark, the map *is* the diegesis,
and dressing it further would only cost legibility.

**The Menagerie** is nearly there. The scene is real; the "The Herd" tile grid
under it is the menu part, and those creatures belong in the pen where you can
tap them.

**The adventurer picker** is small and it is the first thing anyone sees: the
road into the Vale at dawn, each adventurer standing at the gate, the gate
keeper asking for the word. "New adventurer" is the empty place on the road.

## Order to build

1. The four giver huts, as one grammar with four dressings. Joe named these
   first and they are the most-visited screens after the square.
2. The Hall of Records corridor. Largest reduction in menu surface.
3. Wick's desk and the anvil, which share a technique — a form becoming a set
   of objects you handle.
4. Settings as the room, jointly with the Hearth Tree.
5. The cheap ones, whenever there is slack.
