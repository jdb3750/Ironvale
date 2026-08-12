# The menu drives, the scene stages — a survey of the rest of the Vale

The town square is the only screen in Iron Vale that is a place. Everything
else is stacked gold-bordered panels on the flat void: 76 `.win` panels across
eleven routes. The Drill Yard and the Bazaar Row proved that scenes belong
here; the decree below settles what kind of scene, and what a scene is for.

Iron Vale is a game. Nothing here diagnoses, predicts injury, proves its
advice, or stands in for a professional. These are rooms to be in, not
dashboards to read.

## The ledger formula

An earlier draft of this survey treated the scene as the interface — every
offer an object, every action a touch on the world. Joe has redirected it.
Scenes stay, but they are staged up close on a work surface, framed on what
the resident is doing, and everything in frame either displays state or does
work — no dressing that only sits there. The menu drives the interaction; the
scene stages it. A few obviously-clickable elements are allowed when they are
navigational — the forge's door, the Hall's fixtures — the exception, never
the grammar. NPC portraits — Joe's hand-drawn art over the typewriter
dialogue — are the talking surface; tap-to-speak busts are abolished.
Animation decorates a state change; it never gates one. The materials are
iron, oak, stone, and canvas, with the dark subtle fills the identity thread
settled. And the Hearth Tree, which the earlier draft parked in the inn room,
belongs to the bazaar thread's rework, not to any screen here.

## What the survey found

| Screen | File | Today | Verdict |
|---|---|---|---|
| Town square | `town.js:125` | Tiled sky + ground, three building rows, time-of-day | **Already a place** |
| Giver huts (×4) | `giver.js:185` | Portrait panel + offer cards | **Strongest candidate** |
| Quest training log | `giver.js:798` | Collapsible cards, number steppers | Strong |
| The Ledger House (Wick) | `giver.js:1143` | Three form rows + a list | **The formula — the reference** |
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

Four huts, one grammar. You stand at the giver's own station, close enough to
work: their surface fills the frame, and the window carries the same
`tod-day` / `tod-sunset` / `tod-night` tint the town square already uses. The
offers live in a menu the scene stages — the resident presents the work, the
surface holds it. You are not hunting a room for things to touch.

**Grunhilda's forge.** The mockup is an anvil close-up with an oath menu. The
quests are oaths in the menu beside the anvil; choose one and its terms come
up into the light; swear it and the hammer falls — the strike decorates the
swearing, it does not perform it. Billets glow on the cooling rack as ambient
state, one per open oath. The door in the back wall stays clickable, because
it is navigation: it opens onto the Drill Yard.

**Old Fenn's waystone.** The road out of frame keeps its milestones, near ones
legible, the far ones a haze on the ridge — distance as an ambient display of
how long each quest runs. The quest menu drives the choosing; the stones show
where what you chose will stand.

**Sage Elowen's willow.** The mockup is Elowen's writing board with a writ
menu. The rest writs are lines on her board; take one from the menu and her
reading of the week comes up in her own hand. The scene keeps exactly two
ambient state displays: the lanterns and the foliage — the willow fuller and
the lanterns brighter when you have earned more rest.

**Ser Bram's keep.** He is retired and there is nothing to take, so the room
should say so before he does: sheet over the long table, his sword still above
the hearth, one chair pulled to the fire. No menu items at all. The absence is
the design.

Utilities ride as corner glyphs in the ✕ weight class. The givers speak by
portrait — Joe's hand-drawn art over the typewriter dialogue — never from a
tappable bust.

## The quest training log — the anvil

Today: collapsible cards with plus/minus steppers and a LOG SET button each.

Instead: the exercise on deck sits on the anvil, up close, and the set menu
beside it does the work — weight, reps, log. The hammer strike and the tally
cut into the billet decorate the logged set; they never stand between you and
logging it. The quench trough along the bottom of the frame stays: it is
today's inked-sets list as ambient state, still steaming, and undo is a menu
act the trough restages by giving the billet back.

## The Ledger House — Wick's desk

Unchanged, because it already is the formula — name it the reference and build
the rest to match. You are looking down at the work surface. The ledger lies
open and displays state. The stamp rack is the kind menu made of objects — a
boot for the run, a wheel for the ride, a hook for the climb — the hourglass
is the minutes control, the quill takes the note. Nothing in frame is only
scenery. Striking a record is Wick ruling a line through it, the rule
decorating the strike, which is what "strike from the record" has always
meant. When a menu and a scene seem to fight anywhere else in the Vale,
resolve it the way this desk does.

## The Hall of Records — a building with rooms

The densest screen in the app: eight tabs, 29 panels, mostly tables. It is
also the one that most wants to be a place, because a hall of records is
already a place in every player's head.

The corridor stands as conceived — Joe likes the clickable fixtures, and they
are exactly the navigational exception the formula allows. Each tab becomes a
fixture you approach: the standing figure under glass (body), the physician's
chart wall (vitals), the Long Road map that is already drawn (deeds), the iron
rack and its ledger (iron), the loom with the Tapestry on it (calendar), the
shelf of bound volumes (compendium), the almanac on its lectern, and the
chronicle spooling out of the wall in one long scroll. Maud speaks by
portrait — her hand-drawn face and the typewriter line — when a room warrants
it, not from a corner bust on tap.

The tables themselves stay tables. A record you cannot read is not a better
record — the change is how you get to them and what surrounds them.

## Settings — the desk close-up

The sleeper. Settings is currently the densest form in the app, and here the
menu is the genuine driver: the mockup stages it as a close-up of the desk in
your room at the inn, and the form stays a form, laid out on oak under the
identity thread's dark fills. Name and face, PIN, units, the ravens'
credentials, the weekly counsel schedule, the focus charter, dev mode — rows
of one menu on the desk. The room's objects survive as what the rows display:
the raven in the cage by the window wears the band the credentials row sets,
the peg board over the desk shows the counsel days the schedule row chose, the
loose floorboard sits open only when dev mode is. The Hearth Tree no longer
lives here — it belongs to the bazaar thread's rework.

## The cheaper ones

**The Crankwerk** already draws its machine; it just needs a cellar around
it — pipes, a token slot, and the pull as a plain menu act. The capsule
rattling down the chute into the basket decorates the draw; it never delays
telling you what you drew.

**The Colosseum's** pens beneath the arena become the staging: the contestant
menu drives the backing, and the stalls show who stands where. The wager is a
stated amount; the coins pushed across the bookmaker's plank decorate the
stake.

**The Undercroft gate** is a stairway down into the dark with the descent
tally chalked on the wall as ambient state, Hesk speaking by portrait, and
DESCEND as the menu's one act. The crawler below it should stay a HUD — you
are in the dark, the map *is* the diegesis, and dressing it further would only
cost legibility.

**The Menagerie** is nearly there, and under the formula "The Herd" grid is no
longer the embarrassment — it is the menu, and it drives. The pen above it is
the stage, showing the creatures the grid selects.

**The adventurer picker** is small and it is the first thing anyone sees: the
road into the Vale at dawn as the staging, the adventurers as the menu, the
gate keeper asking for the word by portrait. "New adventurer" is the empty
place on the road.

## Order to build

1. The ravens chrome, first and alone.
2. Grunhilda's forge — it builds the shared close-up scene kit every other
   screen reuses.
3. Elowen's willow, the kit's second tenant.
4. The Hall of Records corridor. Largest reduction in menu surface.
5. The Ledger House, so the reference screen finally looks like the formula it
   named.
6. The room at the inn.

The cheap ones ride whenever there is slack. The implementation briefs in this
thread are being rewritten to match this order and this doctrine.
