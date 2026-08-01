# ExerciseDB spike

Checked 2026-07-31. This is a research result, not an import design. No
application or frontend files were changed.

## Verdict

**Technically recommend the `bootstrapping-lab/exercisedb-api` V1 source, pinned
to a reviewed commit and self-hosted, not a hosted ExerciseDB endpoint.** It has
the exact 1,500-record V1 JSON in its repository, is operationally independent
after a snapshot, and is the only candidate here with a practical bulk export.

There is a licensing gate before even that recommendation can become an import:
the repository is marked AGPL-3.0, but its README links to the commercial
ExerciseDB Terms of Use. Those terms prohibit persistent storage, bulk
collection, and caches beyond one hour. I did not resolve that conflict by
assuming that an AGPL repository grants a separate data licence. Get written
permission/clarification for the data before importing it. Until then, the
right decision is **do not import any ExerciseDB data**.

If a cleared, pinned self-hosted snapshot later disappears upstream, the game
does not break at runtime: the local stripped catalog remains sufficient for
names and groups. What is lost is refreshes, corrections, and the ability to
recreate the snapshot from its source. Hosted GIF URLs are a separate upstream
dependency and should not be used.

## Live-candidate audit

The same name currently identifies several incompatible things. HTTP results
below are direct checks on 2026-07-31; counts marked *observed* came from a
real response or a fetched source file, rather than marketing copy.

| Candidate | Current state and auth | Free limit / count | Bulk or pagination | Can a one-time cache be assumed permitted? |
| --- | --- | --- | --- | --- |
| [Official OSS V1](https://oss.exercisedb.dev/api/v1/exercises?limit=2) | **Live, HTTP 200, direct and unauthenticated.** The official V1 page calls this free hosted V1. | 1,500 records observed; free V1 documentation says 1,500 and 180p GIFs. The rate-limit guide says free plans allow 1,000 requests/hour per API key, although this endpoint needs no key. A `limit=100` request returned only 25 records, so plan for 60 cursor pages, not a one-call dump. | Yes: `after` cursor, `meta.nextCursor`; the two-record sample supplies the first cursor. | **No.** The cache guide says caching requires an explicitly allowed plan; the Terms say no persistent storage, bulk collection, or cache over one hour. |
| Official enhanced V1, `edb-with-gifs-and-images-by-ascendapi.p.rapidapi.com` | **Live commercial product, RapidAPI account/key and subscription required.** I did not sign up or call it. | The public V1 page calls the direct host free and this RapidAPI version paid; it does not publish a free V1 quota. It describes the enhanced catalog as 2,000+ records, not a verified response. | Yes: the published shared pagination guide uses cursors. | **No assumption permitted.** Same cache guide/Terms conflict; the required plan feature was not visible without subscribing. |
| Official V2, `edb-with-videos-and-images-by-ascendapi.p.rapidapi.com` | **Live commercial product, RapidAPI account/key and subscription required.** V2 docs name this host and require both RapidAPI headers. | Docs claim 11,000+ exercises, 20,000+ images, and 15,000+ videos. A free RapidAPI tier exists with watermarked media; public docs give the generic 1,000 requests/hour rate, but do not disclose its record quota on the public page. | Yes: cursor pagination is documented. | **No.** Persistent storage/bulk download needs an explicitly caching-enabled plan, while the Terms prohibit it outright. Ask the vendor in writing; do not infer permission from a free tier. |
| [bootstrapping-lab V1 source](https://github.com/bootstrapping-lab/exercisedb-api) | **Reachable public repository; self-hostable, no vendor auth at runtime.** Its fetched `src/data/exercises.json` contains 1,500 records (1,318,979 bytes on disk). | No provider free tier or rate limit: it is user-hosted code/data. The repository is AGPL-3.0. | Yes: a checked-in 1.3 MB JSON array is a literal bulk export. Its API code also exposes offset/limit pages (maximum 100). | **Unclear and blocking.** The repository licence covers the repository, but the README links to the restrictive ExerciseDB Terms. Treat this as a data-rights question requiring clarification, not a loophole. |
| `bryanprimus/exercisedb-api` / `exercisedb-api-navy.vercel.app` | The GitHub repository now returns **HTTP 451** (`Repository access blocked`, DMCA). Its old Vercel deployment still returned **HTTP 200** direct for `/api/v1/exercises?limit=2`, with `totalExercises: 1500`. | No published supported free quota. The old README explicitly calls playground endpoints exploratory, strictly rate limited, and potentially unstable. | Its old API exposes offset/limit pages, maximum 100 records. | **No.** It is an unsupported deployment of DMCA-blocked source and is subject to the same published storage prohibition. Do not use it. |
| `exercisedb-api.vercel.app` | **Dead: HTTP 402, `DEPLOYMENT_DISABLED`.** | None. | None. | No. |

The legacy `https://exercisedb.p.rapidapi.com/exercises?limit=1` endpoint also
returned HTTP 401 without RapidAPI credentials. Current official documentation
instead names the two `edb-with-…-by-ascendapi` hosts above; they are not safe
to substitute path-for-path.

Sources: [V1 overview](https://docs.ascendapi.com/products/edb-v1/overview),
[V2 overview](https://docs.ascendapi.com/products/edb-v2/overview),
[pagination](https://docs.ascendapi.com/guides/pagination),
[rate limiting](https://docs.ascendapi.com/guides/ratelimiting),
[caching guide](https://docs.ascendapi.com/guides/caching), and the
[Terms of Use](https://exercisedb.notion.site/ExerciseDB-API-Terms-of-Use-226983b728ca8090bf7be79564e4b356).

## Record shape, verified from the live free endpoint

The recommended technical source is the V1 dataset, but it serves the **plural
array shape**, not the old singular `bodyPart` / `target` / `equipment` shape:
`exerciseId`, `name`, `gifUrl`, `bodyParts[]`, `equipments[]`,
`targetMuscles[]`, `secondaryMuscles[]`, and `instructions[]`.

`docs/exercisedb-sample.json` is the unmodified-value, two-record payload from
the unauthenticated official OSS endpoint. These are the two records verbatim
(no media was downloaded):

```json
{
  "exerciseId": "01qpYSe",
  "name": "upward facing dog",
  "gifUrl": "https://static.exercisedb.dev/media/01qpYSe.gif",
  "bodyParts": ["back"],
  "equipments": ["body weight"],
  "targetMuscles": ["spine"],
  "secondaryMuscles": ["shoulders", "chest"],
  "instructions": [
    "Step:1 Lie face down on the floor with your legs extended behind you.",
    "Step:2 Place your hands on the floor next to your lower ribs, fingers pointing forward.",
    "Step:3 Press your hands firmly into the floor and straighten your arms, lifting your torso and thighs off the ground.",
    "Step:4 Roll your shoulders back and down, opening your chest and lifting your gaze towards the ceiling.",
    "Step:5 Hold this position for a few breaths, then slowly lower your body back down to the starting position.",
    "Step:6 Repeat for the desired number of repetitions."
  ]
}
```

```json
{
  "exerciseId": "03lzqwk",
  "name": "assisted hanging knee raise",
  "gifUrl": "https://static.exercisedb.dev/media/03lzqwk.gif",
  "bodyParts": ["waist"],
  "equipments": ["assisted"],
  "targetMuscles": ["abs"],
  "secondaryMuscles": ["hip flexors"],
  "instructions": [
    "Step:1 Hang from a pull-up bar with your arms fully extended and your palms facing away from you.",
    "Step:2 Engage your core muscles and lift your knees towards your chest, bending at the hips and knees.",
    "Step:3 Pause for a moment at the top of the movement, squeezing your abs.",
    "Step:4 Slowly lower your legs back down to the starting position.",
    "Step:5 Repeat for the desired number of repetitions."
  ]
}
```

I fetched the whole JSON from the self-hostable source for analysis, then
cross-checked its first 25 current OSS records by ID and full content against a
live 25-record OSS page: all 25 were present and identical. The live endpoint
rate-limited a fast full-page sweep after 10 requests with Cloudflare error
1015, so the source snapshot is the full-catalog basis for the exact counts
below; the live response supplies current shape and sample evidence.

## Seven-group fold

Method: enumerate every observed string across `targetMuscles`,
`secondaryMuscles`, and `bodyParts` in the 1,500 records, then classify it
against Iron Vale's exact `exercises.GROUPS`: `legs`, `posterior`, `chest`,
`back`, `shoulders`, `arms`, `core`. `targetMuscles` should be the primary
attribution input. `bodyParts` is descriptive context, not a second vote that
can override it. Secondary muscle use is a later policy decision.

### Clean one-group values: 43 of 57

| Iron Vale group | Vendor values that fold cleanly to it |
| --- | --- |
| `legs` | `abductors`, `adductors`, `ankle stabilizers`, `ankles`, `calves`, `groin`, `inner thighs`, `lower legs`, `quadriceps`, `quads`, `shins`, `soleus` |
| `posterior` | `glutes`, `hamstrings` |
| `chest` | `chest`, `pectorals`, `upper chest` |
| `back` | `back`, `latissimus dorsi`, `lats`, `rhomboids`, `upper back` |
| `shoulders` | `deltoids`, `delts`, `rear deltoids`, `rotator cuff`, `shoulders` |
| `arms` | `biceps`, `brachialis`, `forearms`, `grip muscles`, `hands`, `lower arms`, `triceps`, `upper arms`, `wrist extensors`, `wrist flexors`, `wrists` |
| `core` | `abdominals`, `abs`, `core`, `lower abs`, `obliques` |

### Genuinely ambiguous values: 8 of 57

These must not be averaged across groups or silently assigned. Keep the
original label and require an explicit curation decision if it is used.

| Vendor value | Competing Iron Vale groups |
| --- | --- |
| `hip flexors` | `legs` / `core` |
| `levator scapulae` | `shoulders` / `back` |
| `lower back` | `posterior` / `back` |
| `serratus anterior` | `chest` / `core` |
| `spine` | `posterior` / `back` |
| `trapezius` | `shoulders` / `back` |
| `traps` | `shoulders` / `back` |
| `upper legs` | `legs` / `posterior` |

### Values that map to nothing: 6 of 57

| Vendor value | Treatment |
| --- | --- |
| `cardio`, `cardiovascular system` | No heatmap muscle credit. Do not make cardio become a fabricated muscle group. |
| `feet` | No seven-group attribution. It is a supporting anatomical region, not a game muscle group. |
| `neck`, `sternocleidomastoid` | No matching group; omit from heatmap attribution. |
| `waist` | Never use as a fallback group. All 195 `waist` records in this sample also target `abs`, which folds cleanly to `core`; without a clear target, omit it. |

There is no `stretching` or `rehab` field value in this vocabulary. There are
67 names containing `stretch` and no names containing `rehab`. Name text should
not invent a muscle group: use a clean primary target when one exists, otherwise
omit the record from muscle attribution.

### Ambiguity exposure

The fraction depends on whether a future importer uses only primary targets or
also treats secondary/body-part labels as muscle credit:

| Basis | Affected records | Fraction of 1,500 |
| --- | ---: | ---: |
| Any ambiguous value in any of the three fields | 494 | 32.9% |
| Ambiguous primary target or body-part token | 302 | 20.1% |
| Ambiguous primary target only | 45 | 3.0% |

The 20.1% figure is mostly the broad `upper legs` body-part label (257
records); it is not a reason to discard their clearer primary targets. The
conservative V1 rule is therefore: fold a clean primary target, do not use a
broad body part as a second attribution, and surface ambiguous primary targets
for curation.

## Existing 26-exercise sanity check

I used a strict mechanical name join: case, spaces, hyphens, and punctuation
are ignored, but no semantic aliases or "close enough" variants are invented.
Five of the 26 existing names match a vendor record; one agrees and the four
disagreements are the finding:

| Iron Vale name | Vendor primary target -> fold | Iron Vale hand groups | Result |
| --- | --- | --- | --- |
| `Kettlebell Swing` | `glutes` -> `posterior` | `posterior`, `core` | **Disagrees:** vendor-primary fold omits `core`. |
| `Dumbbell Bench Press` | `pectorals` -> `chest` | `chest`, `arms` | **Disagrees:** vendor-primary fold omits `arms`. |
| `Pull-Up` | `lats` -> `back` | `back`, `arms` | **Disagrees:** vendor-primary fold omits `arms`. |
| `Push-Up` | `pectorals` -> `chest` | `chest`, `arms` | **Disagrees:** vendor-primary fold omits `arms`. |
| `Hanging Leg Raise` | `abs` -> `core` | `core` | Agrees. |

This is not a claim that the other 21 movements have no related vendor variant.
It is deliberately not a fuzzy automatic crosswalk. Related records already
show why: `kettlebell goblet squat` names `glutes`, `farmers walk` names
`quads`, and `ring dips` names `triceps`. Choosing one variant as the same
exercise would create further silent group changes.

## Requested movement coverage

All findings are from the fetched 1,500-record V1 JSON. Body part and equipment
are included because they reveal several misleading labels.

| Requested movement | Found? | Vendor name and muscles |
| --- | --- | --- |
| Ring row | No | No record naming a ring row; the only record containing `ring` is `ring dips`. |
| Ring dip | Yes | `ring dips`: `triceps`; body part `upper arms`; equipment incorrectly/generalistically `body weight`, not rings. |
| Slider hamstring curl | No | No `slider` record or slider equipment. |
| Slider pike | No | No `slider` record or slider equipment. |
| Band work | Yes, 77 records | 67 use `band`, 10 use `resistance band`. Examples: `band underhand pulldown with classic` -> `lats`; `resistance band seated chest press` -> `pectorals`; `band step-up` -> `glutes`. |
| Ab-wheel rollout | Yes, under another name | `wheel rollerout` and `standing wheel rollerout`: `abs`; body part `waist`; equipment `wheel roller`. A `band assisted wheel rollerout` also exists. |
| Calf raise | Yes | `bodyweight standing calf raise`: `calves`; body part `lower legs`; equipment `body weight`. Many variants exist. |
| Step-up | Yes | `dumbbell step-up`: `glutes`; body part `upper legs`; equipment `dumbbell`. `barbell step-up` and `band step-up` also target `glutes`; lunge variants target `quads`. |
| Hip thrust | Yes, narrow variant | `resistance band seated hip thrusts on knees (female)`: `glutes`; body part `upper legs`; equipment `resistance band`. |
| Hamstring curl | Yes, but data quality is mixed | Literal `exercise ball one legged diagonal kick hamstring curl` is labelled `glutes`, not hamstrings. Conventional alternatives such as `lever lying leg curl`, `lever seated leg curl`, and `inverse leg curl (on pull-up cable machine)` are labelled `hamstrings`. |

## Fields we do not get

The full 1,500-record source has exactly these record keys:
`bodyParts`, `equipments`, `exerciseId`, `gifUrl`, `instructions`, `name`,
`secondaryMuscles`, and `targetMuscles`. It has **zero** `scheme`, `reps`, or
`sets` fields. That is a hard integration gap: `quests.py:210` unpacks
`EXERCISES[name]["scheme"]` for every generated set. An imported movement
cannot enter quest generation without a separate, consciously chosen scheme
policy; the dataset supplies no basis for one.

The instructions are generic numbered prose (4–11 strings per record, mean
5.82), as the live sample shows. They are usable as reference material, but not
as Iron Vale's in-world `how` copy; that field remains authored work.

For this V1 snapshot, every record carries one `gifUrl`; there are no image or
video fields. Compact JSON is 1,167,893 bytes, and removing all URL fields
makes it 1,079,393 bytes: about **88.5 KB / 7.6%** is GIF URL text and JSON
syntax, not downloaded media. The stripped records still contain everything
needed for a catalog/reference decision: stable ID, name, primary/secondary
muscles, body parts, equipment, and instructions. They do not contain the
quest scheme or in-world coaching voice.

V2 carries multiple image/GIF URLs and a video URL, but I did not obtain an
authenticated record or download media. Its published docs also say media URLs
rotate weekly, reinforcing that they should not be a runtime dependency for
this pixel-art app.

## Deliberate non-decisions

- No importer, migration, endpoint, dependency, or application/static edit was
  made.
- No account was created, no payment details entered, and no terms were
  accepted.
- No images, GIFs, or videos were downloaded.
- This spike does not propose changing
  `GIVER_ARCHETYPES["strength"]["modalities"]`; equipment ownership remains a
  separate decision.
