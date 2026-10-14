# Content authoring

Rules for writing stories (submissions), levels and debrief texts. Content is in **Polish**;
field names are English.

## Hard rules

1. **Fictional world only.** Everything happens in the fictional city of **Nowe Brzegi**. No real
   politicians, public figures, companies, brands, institutions' real accounts, or real tragedies.
2. **Images**: self-made, generated for the game, or CC0. No photos of real victims or real
   people. Record source and licence for every image.
3. **Every story is grounded**: it has an explanation shown in the debrief, names the manipulation
   technique, the verification tool that exposes it, and a real-world mechanism (described
   generically, without naming real people).
4. **Every story is solvable** with the stations available in its level, and the correct verdict
   is justified by at least one stamp that a station can produce.
5. **Age-appropriate** for 15–19 year olds; no graphic content, no partisan political messaging —
   the fictional mayoral election must not mirror real parties.
6. Content is reviewed by the subject-matter supervisor (civics / IT teacher) before release.
   Mark each story `reviewed: false` until that happens.

## Story model (summary — the Zod schema in `packages/content/src` is authoritative)

| Field | Meaning |
| --- | --- |
| `id` | `l<level>-<slug>`, kebab-case, unique |
| `type` | `photo`, `quote`, `post`, `recording`, `statistic`, `article` |
| `priority` | `normal`, `important`, `urgent` |
| `truth` | `true`, `false`, `misleading`, `satire`, `unverifiable` |
| `correctVerdict` | derived from `truth` + `priority` (see table below), validated |
| `headline`, `body`, `media` | What players see on the folder |
| `stamps` | Per station: the result text players get (e.g. "Zdjęcie znalezione w sieci w 2019 r.") and whether it is decisive, misleading-but-true, or irrelevant |
| `justifyingStamps` | Which station stamps validly justify the correct verdict |
| `requiredStamps` | Distinct proofs the desk must cite (1–3, default 1); see *Proofs* below |
| `technique` | Manipulation technique id (links to the encyclopedia) |
| `debrief` | Explanation: what it was, technique, which tool caught it, real-world analogue |
| `reviewed` | Supervisor sign-off |

### Truth → verdict

| Truth | Correct verdict |
| --- | --- |
| `true` | publish |
| `false` | reject |
| `misleading` | publishWithContext |
| `satire` | publishWithContext |
| `unverifiable` | reject if `urgent`; otherwise letting it expire carries no penalty |

## Proofs and deciding stations

- **Proof.** A stamp is a proof when it is in `justifyingStamps` and does not come from a
  hint-only station. The AI scanner (`HINT_ONLY_STATIONS`) is hint-only: its stamp may justify a
  verdict next to another proof, but it never counts as one. A story needs `requiredStamps`
  distinct proofs from its level's stations; a verdict citing fewer is `incompleteProof` (half
  points), and citing only the AI scanner is always too few.
- **Deciding station.** A station *decides* a story when the story has a proof from it
  (`decidingStations`). This one rule drives the bag, coverage, pinned counts, guidance and the
  desk's „Rozstrzyga:” line. A stamp marked `decisive` that is not in `justifyingStamps` decides
  nothing; the validator warns about it, so either list it as justifying or lower its relevance.
- **Multi-stamp stories** (`requiredStamps` 2–3) start at level `MULTI_STAMP_FIRST_LEVEL`; each
  proof beyond the first adds `MULTI_STAMP_EXTRA_DEADLINE_MS` to the folder time and
  `SCORE.multiStampBonus` to a correct verdict.

## Levels: authored schedule or station bag

A level file has **either** a `schedule` with `stars` **or** a `bag` (never both, and a bag level
has no `stars`). Event stories always stay in `events`, never in the pool.

- **Bag** (`bag`): `pool` (ids of this level's stories), `firstAtS`, `gapS` and `lastSpawnS`
  (Normal slot times; harder difficulties shorten the gap and get more slots), `deadlineS` per
  priority (Normal; scaled by the difficulty and cut so a folder ends with the level, never below
  `BAG_MIN_DEADLINE_S`), and an optional `starShares` override of `STAR_SHARES`.
- **Each run deals anew.** The server draws a run seed per briefing; the folders go in shuffled
  rounds over the *bag stations* (the level stations that decide at least one pool story), and each
  slot gets a distinct pool story its station decides. Stars are shares of that run's maximum
  score, rounded to `STAR_THRESHOLD_STEP`. The lobby, the briefing and the tools show the Normal
  preview run (`BAG_PREVIEW_SEED`).
- **Pinned vs flex.** A *pinned* story has exactly one deciding station and needs one proof; every
  other decidable story is *flex* (multi-stamp stories always are). Pinned stories keep each
  station busy; aim for at least ⌈Normal slots / bag stations⌉ pinned stories per bag station.
- **Opening folders.** The first `BAG_OPENING_SLOTS` folders get single-proof, non-urgent stories
  and multi-stamp stories come from slot `BAG_MULTI_STAMP_MIN_SLOT` on, whenever the pool allows.
- **Coverage.** The pool must give every slot a distinct story on every difficulty, for every
  way the last partial round can fall; the validator names the station that runs short.
- **Balance after a pool or timing change.** Changing `gapS`, `lastSpawnS`, `deadlineS` or
  `starShares` changes every difficulty's folder count and thresholds: re-run `bun run balance`
  for that level on all four difficulties (`--levels <id> --difficulty easy,normal,hard,expert
  --crew-sizes 3` is a quick pass) and keep the intent checks in `docs/balance.md` green. Keep
  `lastSpawnS` + the longest `deadlineS` within `durationS`, so no Normal folder is cut short.
- **Endless** deals the same way from every campaign level's stories (schedule or pool, the
  greybox left out): shuffled rounds over the endless stations that decide a story, and each slot
  draws from its station's *deck* (the stories that station decides; a flex story sits in several
  decks), never the previous folder's story. Keep every non-hint endless deck at
  `ENDLESS_MIN_DECK` stories or more, so a station does not repeat itself.

## Writing guidance

- Mirror the SIFT method: the stamps should reward *investigating the source*, *finding better
  coverage* and *tracing the claim to its origin*.
- Irrelevant stations should return a plausible but non-decisive stamp ("Brak wcześniejszych
  wystąpień w archiwum"), so choosing the wrong tool costs time, not points.
- AI scanner results are probabilities with a margin of error and must never be decisive alone.
- Keep folder text short — players read it while running. Headline ≤ 80 chars, body ≤ 200 chars.
- Aim for a mix per level: roughly 30–40% true, the rest spread across the level's techniques.
- Target volume: ~15 stories per campaign level, ~120 total including the endless-mode pool.

### Stamps for the Stage 7 stations

A story in a level with one of these stations needs a stamp for it like any other station. The
stamp's relevance also picks the minigame's puzzle (`problemFromStamp` in
`apps/client/src/stations/minigames/evidence.ts`), so the text must agree with what the player
just saw. None of the four stations is hint-only.

- **Stenogram** (`transcript`) is decisive only for `quote` and `recording` stories: a decisive
  stamp quotes or describes the full record (a cut on a misleading story, an invented quote on a
  false one, the same words on a true one). On other story types, or when there is no record to
  compare with, write an `irrelevant` stamp such as „Brak wypowiedzi do porównania.” A
  `misleading` stamp on a true story reports the cut the puzzle shows, which looks suspicious
  but proves nothing about the story („Klip skrócono o pytania dziennikarzy.”); on an untrue
  story it says the words match a record (the puzzle shows a fair cut).
- **Metadane** (`metadata`): an `irrelevant` stamp *means* the metadata was stripped, and its
  text says so: „Serwis usunął metadane – nic z nich nie wynika.” A decisive stamp on an untrue
  story shows the field that contradicts the description. The puzzle takes that field from the
  story's technique when it implies one (`TECHNIQUE_FIELD` in `metadata.logic.ts`: an old photo
  under a new caption → the date, an AI image → the device, a deepfake video → the editing
  program) and from the seed otherwise, so name a field only when the technique fixes it („Dane
  pliku: zdjęcie zrobiono lata temu…”) and otherwise say only that the data contradict the
  description; never quote an exact date or device, the puzzle draws them from its own pools. A
  real file (any story that is not `false`) only ever contradicts on time or place, never as
  „generated” or „photomontage”. A decisive stamp may be the only proof of a true story only
  when the claim is about the time, place or device of the shot. A `misleading` stamp gives a
  harmless reason for a wrong time or place on a true story, or says the data match on an
  untrue one (metadata are easy to edit).
- **Mapa** (`geolocation`) is decisive only for photos and video with a place claim. An
  `irrelevant` stamp shows a photo from the captioned district (the minigame always has a photo),
  so its text says the place matches the caption but settles nothing: „Miejsce z podpisu się
  zgadza, ale godzin mapa nie sprawdzi.” Never „no photo” or „nothing to look for on the map”.
- **Inne media** (`crossCheck`): `irrelevant` and `misleading` stamps read as „no independent
  coverage”, e.g. „Nikt jeszcze o tym nie pisze.” or „Trzy portale to powtarzają – same kopie
  wpisu.”
- A decisive stamp from any of them belongs in `justifyingStamps` (the validator warns
  otherwise), so add one only where the station really settles the story.
- Encyclopedia cards (`techniques/techniques.json`) list at most 4 stations, most useful first,
  and the `detect` text names each Stage 7 station it lists (S7-65). A new technique id for an
  existing trick goes into that card's `aliases` (e.g. `zdjecie-z-innego-miejsca` on
  `stare-zdjecie-nowy-podpis`), not onto a new card.

## Automated checks (`bun run validate:content`)

Errors fail the command, warnings are printed but pass. Rules beyond the Zod schemas
(`packages/content/src/checks.ts`):

**Errors**

- The AI scanner is never decisive alone: a story must not be justified only by `aiScanner`
  stamps, and an `aiScanner` stamp may be `decisive` only if a justifying stamp from another
  station exists.
- Every story spawned by a level (schedule, bag `pool` **or** `events`) exists, belongs to the
  level number, has a stamp for each level station and gets `requiredStamps` proofs from that
  level's stations (hint-only stamps never count).
- A level has a `schedule` with `stars` or a `bag`, never both; bag `pool` ids are unique and not
  event stories; `firstAtS ≤ lastSpawnS < durationS`; `starShares.three > starShares.two`.
- Bag coverage: on every difficulty the pool gives every slot a distinct story its station
  decides, however the last partial round falls.
- A story's stamps may only use stations that exist in at least one level that schedules it.
- `correction` events need a story whose truth is `false` or `misleading` (`bossCall` and
  `viral` accept any truth).
- `botRaid` `count` must not exceed the number of conveyor tiles (`C`) in the layout.
- `outage` stations must be in the level's `stations` (and so placed in the layout).
- Two events of the same kind must be at least 10 s apart.
- Layout reachability: walking over floor tiles (4 neighbours) from spawn 1 must reach every
  other spawn and a floor tile next to every fixture (conveyor, desk, table, station). Checked
  for every level and for the endless room (reported under `endless`).
- `stars.three` must not exceed the maximum score (schedule plus events: viral/bossCall/botRaid
  stories score like scheduled ones, a true `bossCall` adds the bonus, a correction adds
  `correctionScore`).

**Warnings**

- `stars.two` above 90% of the maximum score; star thresholds outside the aim ranges.
- An `outage` that takes down every station of the level (e.g. a single-station level).
- Levels `l1` and later without `topic` / `briefingPoints`.
- Deadlines running past the end of the level, an unbalanced share of true stories (scheduled or
  pooled), unscheduled stories, typography slips (three dots, hanging single-letter words).
- A `decisive` stamp from a non-hint station that is not in `justifyingStamps` (it decides
  nothing).
- Bag levels: a bag station with fewer pinned stories than ⌈Normal slots / bag stations⌉; a level
  station that decides no pool story (it stays idle); `lastSpawnS` plus the longest Normal
  deadline (with the multi-stamp extra) past `durationS` (late folders are cut); `starShares`
  outside the star aim ranges.
- Layout: two stations on the same row less than `STATION_SIGN_MIN_GAP_COLUMNS` (3) columns
  apart, because their signs overlap on a 640×360 phone.
- Endless: a non-hint endless station whose deck holds fewer than `ENDLESS_MIN_DECK` stories
  (reported under `endless`, only when a campaign level feeds the endless pool).
