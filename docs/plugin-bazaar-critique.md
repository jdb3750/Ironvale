# The Plugin Bazaar — a design critique of the mockups

**Status: review notes for the author. Nothing here is approved to build.**
The author's rulings on the seven boss calls have since been folded into
`docs/plugin-bazaar-plan.md` (§8); this document stands as the review record.

What was reviewed: the four canonical mockups —
`docs/mockups/{bazaar-row-v2,bazaar-row-mobile,bazaar-stall,dwelling-tree}`,
PNGs examined at zoom, generating HTML read line by line — together with plan
§8 and its neighbors (§1, §5, §7, §11), all held against the app's real
idioms: the `style.css` tokens and `.win` shadow dialect, the town's 3x sky
and 5x buildings, `typewrite` at `app.js:687`, the giver dialogue chrome,
`confirmModal` weight conventions, and the raven's voice in `app.js:468` and
`intervals.py:234`. The brief the mockups were built under is taken as law:
everything on screen should feel important, and clutter is removed by moving
it *into* the fiction, never out of it.

The one-line verdict: the fiction is doing real UX work — signboards as
decluttered listings, disclosure as merchant speech, the load mask as labor —
and the failures are mostly places where two costumes are worn at once, or
where the software shows through a single seam in an otherwise excellent
garment.

---

## Tears

Cross-cutting defects, worst first.

### 1. The raven, four ways

The update notice — the most repeated journey in a healthy ecosystem — goes
wrong four ways at once in `bazaar-row-v2`. The raven perches over the wrong
stall: the `.raven-note` is nested inside the Scrivener's `.bld` (lines
489–492) while its word concerns the Bellmaker, against §8d's own rule, "the
raven perches over the stall it brings word of." The news is doubled: the
Bellmaker's Cart carries a stock JRPG `<span class="bang">!</span>` (line
505) — two signals on two stalls for one fact, and the player pixel-hunts; in
town the bang means "your sworn business awaits," and it should stay there.
The courier is nearly invisible: `raven_perch` is a 24-wide grid in a 48px
canvas — 2x density against a 3x sky and 7x stalls — its `#20202a` body lost
on dark teal cloud dither, only the yellow eye pixel reading, while the tag
(`margin-top:-30px`) hovers 60px up-right with no string, a stray tooltip.
And the bird pronounces raw semver: "krrk. the Bellmaker has mended his Bells
— v1.5.0 hangs on the cart; yours is v1.4.1" — "mended his Bells" is the best
line in the set, then a character speaks a version triple and the costume
rips. (The footer's `v0.9.4` is deliberate chrome below the fold; this number
sits in a mouth.)

One consolidated prescription. One herald: the raven, redrawn at scene
density (3x minimum; 7x perched on a stall), atop the Bellmaker's green
canopy where his dark body silhouettes, the tag hung from his beak by the
same 2px string the ware-tag already uses — the string is the pointer, no new
chrome. The bang retires from the Bazaar; the raven *is* the exclamation
mark. Versions become the maker's mark everywhere: "the new casting hangs on
the cart, marked 1.5.0; yours bears 1.4.1" — a mark is a thing a craftsman
stamps, a "v" a thing a settings panel prints. And the last mile gets
scripted at last: tapping the raven flies you to the merchant's dialogue
already opened on the mend — "v1.5.0, mended and ready — shall I ring it up?"
/ "*Hang the new bell.*" / "*The old one still rings true.*"

### 2. Shelf vs tree

The market screens teach a lifecycle the dwelling contradicts. The stall
caption reads "nothing on this bench acts until it stands on your shelf at
home" (`bazaar-stall.html:424`), and Halvard's legally load-bearing
disclosure says "Set out, it may do three things and three only" (line 396) —
shelf language, both. But `dwelling-tree.html` and §8c are unambiguous: the
tree "replaces any shelf- or list-shaped lifecycle screen"; "what hangs upon
the tree works; what sleeps in the box only sleeps." A player who hears
"shelf" at market and finds a tree at home has caught the fiction changing
its story — and a stale `dwelling-shelf.html` still sits in the set. Purge
shelf vocabulary from the market screens: "the ware sits where you can turn
it over — nothing on this bench acts until it hangs upon your hearth tree";
"Hung upon your tree, it may do three things and three only…" Retire
`dwelling-shelf.*` from the reference set.

### 3. The acquire dead end

The first purchase ends in a room the player has never seen. "Take it home,
Halvard." → "it travels packed away" → the dialogue closes — end of specced
flow, the ware asleep in an ornament box inside a dwelling screen that does
not exist in the app today and that nothing at the stall points at. The
likeliest first-purchase outcome: buy a theme, see no change, conclude the
Bazaar is broken. Default-inactive is the right trust decision (§5c), but a
safety default that reads as a malfunction poisons the feature on its first
run — and the game already bridges scenes, as the raid-claim ceremony's "TO
THE MENAGERIE" walk shows (`town.js:434`).

The fix costs one merchant line and one response line, in the existing
chrome. Halvard wraps the parcel — "It'll be waiting in your ornament box, by
the hearth tree" — and the choices become "*I'll hang it this very hour.*"
(navigates to the dwelling, ware pre-selected, hands already reaching) / "*It
can sleep a while.*" The wrapping beat is also the honest place to hide the
release download, which currently has no specced loading moment at all — §7
only covers the hang. This is also boss call 3: bridge line, or sacred walk.

### 4. Break-loudly has no face at home

The plan requires load failures to degrade to a disabled ware with a named
reason (§7, §2b), and §8b scripts the "made for another season of the Vale"
line — *at the stall*, the place you visit to buy things you don't own yet.
But the player experiencing a break is at home, or nowhere: their custom
screen is simply missing from the Vale. The tree — the state ledger — has
exactly three states in the mockup: "upon the tree", "in the box", "being
hung…". An ornament that silently stops working while still glowing breaks
the screen's one-line rule, at the most alarming moment the ecosystem can
produce ("my game changed and I didn't touch it") — and only ravens *update*
news reaches the player, never *breakage* news.

The ornament falls. It lies at the foot of the tree, dark, distinct from the
box; its list line reads "fallen in the night — made for another season of
the Vale; the trader must mend it"; and the raven that already carries sync
word carries this word too: "krrk. a frost took the Tinker's Ledger in the
night." Nothing new is invented — raven, floor, and list-state column all
exist. The break becomes a thing that visibly happened in the place, a scene
rather than a toast.

### 5. The disclosure spent on browsing, behind a typewriter with no throttle

Two flow defects compound at the bench. Browsing and disclosure are
conflated: the held ware is spotlit with the merchant's full disclosure —
roughly 430 characters, about three seconds of typewriter at the app's rate —
spoken for it. If turning over the next good re-triggers the speech,
comparing six charms is six sermons, and the trust ceremony, load-bearing
exactly once (before "Take it home"), becomes noise players learn to ignore —
which defeats it at the one moment it matters. And the typewriter cannot be
skipped: `typewrite()` at `app.js:687` has no tap-to-complete; the only out
is the OS-level reduced-motion setting. Town greetings are one sentence, so
it never hurt before; merchant disclosures are paragraphs, and the fifteenth
visit means re-watching text you know by heart. A standing app gap the Bazaar
converts from charm into grind.

Split "turning it over" from "being told." The paper ware-tag already on the
bench *is* the browse layer: tap a good, it comes to hand, the tag swings
into view, the merchant offers a half-line of patter ("Ah, the Ledger — good
eye."). The full plain-speech disclosure moves to where the Bazaar's law
actually requires it: after "Take it home," before the parcel is wrapped —
merchants don't recite terms at browsers; they speak plainly before money
changes hands. For the typewriter: one global gesture, in fiction — tap the
dialog window and the ink dries at once (line completes; second tap
advances). And merchants remember faces: on repeat visits Halvard abbreviates
("You know my patter by now"), with a quiet response line "*Speak it in full
again, tinker.*" for whoever wants the ceremony back. The shortening *is* a
relationship.

### 6. One tap does too much at the tree

"Tap a ware to hang it upon the tree, or to lift it down again" makes plugin
activation — loader execution, registration, eventually tier-2 server
behavior — the cheapest gesture in the game, cheaper than abandoning a quest,
which gets a `confirmModal` (`town.js:457`). On a phone, a scroll-thumb graze
hangs or lifts a ware. Meanwhile "Return the ware" allegedly lives "from the
same list" (§8c) with no visible affordance anywhere in the mockup — the
destructive action hidden behind a row whose tap already means something
else. Interaction weight should track consequence: mis-lifting kills a theme
mid-scroll, and an undiscoverable uninstall means orphaned wares accumulate
forever.

Tap takes the ware **in hand** — the detail moment the stall's bench already
established — and from in-hand the actions are response lines: "*Hang it upon
the tree.*" / "*Lay it back in the box.*" / "*Return it to the trader.*" —
the last getting its ledger-striking confirm. One extra tap, purchased
deliberately: every lifecycle mutation becomes an act performed in a place,
uninstall gets a visible home, the scroll-graze is de-fanged, and the tree
reuses the stall's own idiom instead of inventing one.

### 7. Exclusive wares break the hang-everything fiction

The tree as drawn implies unlimited concurrent ornaments, but a theme is
exclusive by nature — two dyes cannot both take the cloth, and font packs and
sound kits are likely the same shape. The mockup shows Emberfall Dye upon the
tree and two more dyes in the box; what happens when the player hangs a
second is unspecced: error? silent swap? both glowing with one secretly dead?
The last is the worst outcome and the default if unhandled — and this is the
*typical* case, not the edge, because the Dyer's Tent is the cheapest rung
and players will own five dyes.

The hands do the swap as one continuous motion: hanging Winterwatch, they
first lift Emberfall down into the box, then hang the newcomer — one
animation, both list rows updating in view — with a one-time line giving the
constraint its fiction: "the new dye takes; the old is rinsed and boxed."
Visually, exclusive kinds get a single named hook — "the dye branch holds one
skein" — so the constraint is a fact of the tree, not an error message.

### 8. The tree stops telling truth at scale

Ornaments are 48px sprites on a roughly 288px tree; about seven hang before
overlap. Worse, ornament identity is stall-shaped, not ware-shaped — every
dye is the same swatch sprite in a different palette — so "which dye is
active?" is unanswerable from the tree, and at twenty wares even "how many?"
gets hard. The box shows two 36px sprites; at twelve boxed wares it is either
a lie or a smear. §8c's answer — "branches grow and the box deepens" — is a
sentence, not a design; unbounded growth of a fixed-composition pixel scene
is exactly what pixel scenes do worst. The split view's contract is tree =
glanceable truth, list = detail; if the tree degrades into decoration, the
screen is a list with a large picture beside it.

Let the tree tell the *summary* truth and the list the *itemized* truth, and
say so in the fiction: ornaments cluster by stall (all dyes share one bough);
a tapped cluster fans out its wares like the held-good beat; any ornament
swings out its paper tag on tap — the chrome exists. The box stops depicting
contents and instead visibly deepens: a fuller box sprite with a chalked
count on the slats, "the box holds nine" — honest at any scale. (Whether the
tree should instead have finite hooks is boss call 5.)

### 9. The crate nobody will find, and the row that never looks new

The crate at the row's end — the install-from-URL escape hatch, per §11
possibly the *only* acquisition path for a while, carrying the heaviest trust
burden in the plan (§8a's "docker-compose-from-a-stranger bar") — is labeled
with four words of fine print: "from a named road." As a costume it is
elegant (you name the road = you paste the URL); as an entry point it is past
charming-mystery into genuinely unfindable. A player told "paste the repo URL
in the game" will never connect that instruction to an unlabeled crate. Keep
it mysterious to passersby but give it a first-tap voice: a carter leaning on
it, whose one line does both jobs — "Come by no stall, this one. Name the
road it traveled and I'll haul it in — but I carry crates; I don't vouch for
them." Discovery through conversation, the game's native way of marking
what's tappable, and the plan's required warning worn as character instead of
a confirmation dialog.

Second gap: signboards say only trade and count ("Scrolls — four"), so on the
fifteenth visit nothing distinguishes four-you've-seen from
three-old-plus-one-new, and finding a new listing means re-interrogating
every merchant. Fresh chalk: a new listing gets a chalked mark on the board —
"Scrolls — four, one *fresh-chalked*" — that weathers away once the player
has stepped up. New-ness becomes a thing the place shows, not a badge system.

### 10. Mobile is half-done

The phone — where a fitness game is actually played, one thumb, between sets
— got a dedicated row mockup and nothing else, and even that mockup's footer
is a four-way collision. In `bazaar-row-mobile` at y≈590–730: the "tap to
step up" prompt box sits directly on the `crate_road` sprite, the crate's
corner poking out from behind the black box; the "from a named road" plate is
orphaned 60px below the crate it labels, centered in empty grass; the road
strip runs along the very bottom, empty, with nobody on it; and up top the
raven's tag occludes the scene-label subtitle mid-word ("traders from beyond
the Vale — every…" disappears under it). Make the bottom a proper road's-end
vignette — hero, cue signpost, and crate standing together *on* the road
strip as one grouped scene — and let the raven's move to the correct stall
roofline (tear 1) clear the header.

The larger gap: `dwelling-tree.html` carries responsive rules for the bazaar
row and **none** for `.tree-split` — the tree pane is `flex: 0 0 380px`
beside a list, which at a 390px viewport means overflow or a crushed list.
The most-visited screen of the feature has no phone layout, and the obvious
fix (stack tree above list) puts the actionable rows a full scroll below a
478px picture, every visit. On the phone the room should fold the other way:
list first, the working surface under the thumb, with the tree as a shallow
*hearth glimpse* above it — tree and box in one wide short scene that scrolls
away. When the player hangs a ware, the glimpse scrolls itself back into view
for the hands animation: the ceremony kept when it's earned, out of the way
when it isn't.

---

## Craft

Composition defects; the prescriptions stand alone.

**The hero breaks the scene frame.** In `bazaar-row-v2` (inherited on
mobile), `.hero-step` is anchored `bottom:-60px` off the Tinker's plate, so
the player sprite straddles the scene panel's bottom border — head on the
road, torso across the green edge trim, boots floating on raw page-void — and
the "step up to the bench" cue box is likewise cut by the frame line. The
"you are here" anchor is the one element that looks mis-composited. Let the
road own him: seat his feet on the `.scene-road` strip's top edge, fully
inside the frame, and plant the cue as a small roadside signpost in the
existing nameplate idiom — black plate, gold border, post pixel and all. The
road stops being decoration and becomes where you stand, which is the fiction
anyway.

**The Tinker's wares float in a black void, at two densities.** In
`bazaar-stall`, `.bench-goods` hovers `bottom:96px` above the bench-top over
pure page background — no rail, no hooks; the coil and lantern levitate, and
only the held cog has a `.tie`, which ties into its tag, not the bench. The
held `cog_charm` is 12x12 at 84px (7x) while its neighbors are 12x12 at 60px
(5x) — same shelf, same object class, two densities, the most visible kind of
mixing. And the caption says "the ware *sits* where you can turn it over";
nothing sits. Give the bench a crossbeam — the row-screen stalls already have
the sprite band — and hang all three wares from it at a uniform 5x, each on
its own tie. The held one gets the glow, the tag, and hangs one row lower,
pulled toward you: emphasis by position and light, not pixel size. Bonus: the
dim coil and lantern stop being gray-on-black and silhouette properly against
the beam's `#8a6a40` wood.

**The stall banner is 80% empty, and contradicts its own board.** The banner
band of `bazaar-stall` (y≈95–232) packs all content into the left ~150px and
leaves ~700px of uninterrupted cloud dither — the first impression of every
merchant visit is a vast empty sky. And the row's board promised "Charms —
six" while the bench displays three: the game's own creed, "a board tells the
trade and the count — no more," broken by its first close-up, teaching
players the boards lie. You are standing *in* the row — let the banner say
so: the Scrivener's awning-edge intruding at the left margin, the Bellmaker's
bells at the right, both dimmed as neighbors. For the count: three wares hung
bright, and a partly-open `crate_road` under the bench with a fine-type tag,
"three more, still packed from the road." Six accounted for, hierarchy
preserved.

**The selected stall loses to decoration.** The Tinker's Bench is marked by
`brightness(1.28)` and a 1px gold plate border, but the eye lands on the
Dyer's purple-checkered tent and the Scrivener's red-striped awning — the two
highest-contrast shapes on screen, both non-selected. Wayfinding should beat
ornament; currently ornament wins two to one. Don't strip the awnings —
outrank them in the fiction: the stall awaiting you shows life, a lit
`lantern_small` hung from the Tinker's crossbeam in the existing glow idiom,
the vendor's arm raised. Light is the one contrast currency the awnings don't
spend. Separately, the Dyer's checker runs at the same scale as the sky's
cloud dither, so the tent half-melts into the cloud band; close its
silhouette with a solid one-pixel-row border of `#7a4aa0`.

**Triple-stacked signage outweighs the stalls.** Each stall carries three
text layers — hanging board ("Dyes — five wares"), plate ("The Dyer's Tent"),
subtitle ("cloths & colors") — in two panel styles, producing a signage band
(y≈380–445) visually heavier than the architecture above it, with the board's
noun half-duplicating the subtitle. One shingle per stall: fold the count
into the plate as ware-pips — tiny 7x sprites of the trade good itself, three
bell pips for the Bellmaker, five dye-drops for the Dyer — strung along the
plate's top edge. The count becomes countable goods, the brown board retires,
and the fiction improves: you tally a merchant's stock by looking at it.

**The selected row collides with itself.** On `dwelling-tree`, the
highlighted "being hung…" row shares a line between the annotation "the hands
take but a breath" and the description, forcing "your lifts, weighed and
charted by / season" into a one-word wrap — two voices, one cramped line, on
the one row guaranteed to be read. The first row already solved this: "a
raven left word — v1.5.0 waits at the cart" sits on its own annotation line
with an icon. Reuse that exact pattern — status line "being hung… the hands
take but a breath" below the description, with a tiny `hand` sprite as its
icon.

**Disembodied hands.** Two flesh-toned `hand` sprites float at branch level
beside the gear while the hero stands idle 300px away at bottom-left. Static,
the hands read as two tan blobs — buns, or misplaced ornaments — and the
body-hands dissociation is quietly eerie in a cozy scene. Unite worker and
work: seat the hero on a stool beneath the gear, arms up, sleeves in his
green `#4d7a42` — the hand sprite's cuff color already matches; the
connection is drawn, just not placed. The existing trail-dots then trace box
→ hero → branch, and the still frame tells the whole story.

---

## Polish

Small fiction repairs, each a line or a word.

The paper ware-tag reads "CHARM · TIER I · no coin asked · workshop:
halvard/tinkers-ledger" — two seams in one line. "TIER I" is settings-menu
speak sitting inches below Halvard saying "first tier of trust" in his own
voice; the tag should quote the man, not the manifest. Let it read "first
tier of trust", or better, a stamped seal whose count is the tier — one seal
for cloth-and-ink, two for a charm, three for a hired hand. Tiers spoken and
stamped, never numbered Roman. The `halvard/tinkers-ledger` slug is the
honest GitHub address and players verifying trust genuinely want it, so it
stays — but "workshop:" doesn't naturalize a slash-delimited slug; render it
"maker's mark — halvard/tinkers-ledger".

"The Scrivener's Stall — doctrines & roads" collides with Wick the Scrivener,
an established, beloved NPC ("The ledger is patient, but it does prefer the
truth.", `giver.js:24-28`). A second anonymous scrivener from beyond the Vale
dilutes a named character and invites "is that Wick's stall?", which the
mockups never answer. Exploit the collision instead of ignoring it — which
way is boss call 2. (Halvard-vs-Wick ledger overlap is adjacent but
acceptable: goggles-and-craftsman's-pride is distinct from fussy archivist,
and the domain forces "ledger" into both mouths.)

"The shops fill your box" (`dwelling-tree.html:571`): the row has no shops —
it has a Tent, a Stall, a Bench, and a Cart, and the plan's own line is "the
stalls fill the ornament box." Make it "The stalls fill your box." One word.

"tap to step up" and "tap a ware to hang it" put device-speak inside fiction
copy; the desktop's "step up to the bench" needs no verb of input at all.
Drop "tap" — "step up" is already the affordance, the highlight does the rest
— and parameterize the noun per stall, since "step up to the bench" reads
wrong hovering the Tent or the Cart. Low priority; flagged so it doesn't
fossilize.

---

## Protect

Things the mockups get exactly right, listed so iteration cannot quietly
break them.

**"krrk." and update-as-mending.** One clipped corvid syllable before the
news, and "the Bellmaker has mended his Bells" — the best voice invention in
the set, extending the existing raven fiction rather than decorating it. Fix
the semver in its beak and leave everything else alone.

**Halvard's enumerated disclosure.** "It may do three things and three only:
read your training ledger, every set and weight you ever logged; … No ravens
beyond the Vale. No coin asked." Permissions as sworn plain speech, including
the negative grants — "No ravens beyond the Vale" is the most honest
rendering of "no network access" in any software, costumed or not, and does
more real security work than a permissions matrix at this scale, because it
is a character talking and will actually be read. Tear 5 moves *where* it
fires, never *whether*.

**The hands as the load mask.** "Being hung… the hands take but a breath" —
the loader's real work behind an animation the player already wants to watch,
teardown behind its rewind. Activation never shows a spinner, because the
spinner has a body and hands. Do not let implementation pressure replace it
with a progress bar; the tree only earns its keep if this beat lands.

**The paper ware-tag.** Cream `#efe6c2` card, hard 3px shadow perfectly in
the `.win` dialect, tied to the ware by a string, carrying the registry
metadata as a merchant's paper tag — the single best object in the set. Every
future ware surface should inherit it; tears 5, 6, and 8 all lean on it.

**Signboard law.** "A board tells the trade and the count — no more":
declutter-into-fiction as an explicit in-world law. The fresh-chalk mark
(tear 9) is the only addition it should ever take.

**Cross-screen object permanence.** "v1.5.0 hangs on the cart; yours is
v1.4.1" on the row becomes "a raven left word — v1.5.0 waits at the cart" on
the tree list — same voice, same courier; the box at the tree's foot shows
exactly the dyes the list marks "in the box." Rare craft; do not let
iteration break the chain.

**One postal service, one failure register.** Updates ride the existing
raven; index downtime is "the market is quiet today," not an error state. The
Bazaar adds zero new notification systems and zero new anxiety surfaces.
Defend the never-a-second-channel discipline against every future "just add a
badge" impulse — tears 1 and 4 consolidate *toward* the raven, not away.

**Dialogue chrome fidelity.** The Halvard window is indistinguishable from
real `giver.js` chrome: 128px portrait, block-cursor typewriter, the
parenthetical stage direction "(goggles up — a good sign)," the choice-line
aside "it travels packed away" in fine type. This is how mockups earn trust;
keep it pixel-for-pixel.

---

## The tree wants

Three additions the dwelling scene has earned; no more.

**Put the hearth in the Hearth Tree scene.** The scene is named for a hearth
that isn't there. A small fire beside the tub, and let its light be the
*reason* hung ornaments glow — grounding "hung = awake" in physics the player
can see. Optional second duty: ember state mirrors raven health, embers low
when "ravens delayed," so the dwelling quietly reports sync without a status
line.

**The unripe cone.** §8d's future-`api_version` state — installed, updated,
can't run yet, the most confusing state in any plugin system — has no
home-screen shape. A closed green bud on the branch: visible, owned, not yet
wakeable; on inspection, "it will open in a coming season of the Vale."

**Legible growth, and the empty hook.** Make "branches grow and the box
deepens" an event, not a gradient: a new bough sprouts at every few wares
owned, a beat worth a sparkle. And when a ware is returned — its ledger
"struck from the record" — its hook stays empty a while before the branch
closes over. Memory as furniture; the Vale already believes records have
weight.

---

## Boss calls

Seven places where two defensible designs exist. Either answer works; the
document just needs one.

**1. Versions: costumed or spoken.** Maker's mark with the number visible
everywhere — "marked 1.5.0" in fine print, honest, comparable, slightly
costumed — or full costume in speech ("his third mending") with the semver
only on the tag's reverse when the player turns the ware over. The first is
safer; the second is braver and only works if turning-over is a real
interaction.

**2. The doctrine stall.** An outland rival Wick gets to be catty about — new
character, new comedy, keeps Wick pure, and his one greeting line ("A
scrivener, they say. From beyond. Check the margins before you swear by
anything.") doubles as the trust warning, in character — or Wick's own stall
at the Bazaar, a familiar face vouching for outland scrolls, warmer but
putting the warning burden on a character who currently never warns — or
simply rename the stall (the Binder, the Chartwright; "doctrines & roads"
suggests a mapmaker).

**3. The walk home: sacred or collapsible.** The "*I'll hang it this very
hour*" bridge line fixes the dead end but slightly flattens the two-act
structure — market is where you acquire, home is where you commit — that the
trust model leans on. Either the bridge exists and the first-purchase journey
is safe but the acts blur, or the acquire beat only *points* home and the
player walks there themselves — purer, but betting the feature's first
impression on every player following a verbal signpost. Which loss do you
prefer?

**4. The merchant: gate or companion.** Bench goods directly tappable with
paper tags demotes the merchant to color during browsing — fast, spatial, but
the stall starts to resemble Pip's shop rows in fancy dress. Or all knowledge
flows through response lines ("Show me the charms, one by one") — maximally
in-register, and measurably slower on every visit. The Bazaar can be a place
with a person in it or a conversation with scenery; it can't be both at full
strength.

**5. Does the tree ever stop growing?** Unbounded growth, accepting the
summary-truth compromise of tear 8 — clusters, fans, chalked counts — or
honest finite hooks, say twelve, where a full tree is a gameplay statement:
hanging the thirteenth means lifting something down, curation forced by the
fiction the way real trees and real RAM both work. The second is bolder, more
legible, and will genuinely annoy someone in year two. Whimsy says grow;
systems honesty says hooks.

**6. What the tree is.** The Hearth Tree is, unmistakably, a Christmas tree —
conical fir, glowing baubles, sparkles. Commit to it (yule-cozy, all year;
and if seasons ever dress it — snow-dusted needles, solstice candles — accept
that seasonal art competes with ornament legibility on the screen whose whole
job is showing what's awake), or make it a stranger, older hearth-fixture:
embers glowing in a hollow of the trunk, making "hearth" literal, or at
minimum break the cone's symmetry so it stops scanning as December.

**7. Scene density, and the sky.** Stalls are 7x; the town's buildings are
canonically 5x. If the Bazaar is deliberately "closer" because you walk the
row on foot, the 4x hero must grow to match — right now he's waist-high to
the vendors. If not, drop stalls to 5x and the two scenes read as one
village. Related: behind one town row the canonical cloud dither is
atmosphere; behind four stalls, four boards, four plates, a raven, and a
notice it's load. Keep strict canon, or cut a calmer market-morning sky
variant — same palette, fewer cloud masses over the row band. Canon purity
versus legibility; both are defensible, and only one of them is yours.
