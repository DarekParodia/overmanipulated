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

## Writing guidance

- Mirror the SIFT method: the stamps should reward *investigating the source*, *finding better
  coverage* and *tracing the claim to its origin*.
- Irrelevant stations should return a plausible but non-decisive stamp ("Brak wcześniejszych
  wystąpień w archiwum"), so choosing the wrong tool costs time, not points.
- AI scanner results are probabilities with a margin of error and must never be decisive alone.
- Keep folder text short — players read it while running. Headline ≤ 80 chars, body ≤ 200 chars.
- Aim for a mix per level: roughly 30–40% true, the rest spread across the level's techniques.
- Target volume: ~15 stories per campaign level, ~120 total including the endless-mode pool.

## Automated checks (`bun run validate:content`)

Errors fail the command, warnings are printed but pass. Rules beyond the Zod schemas
(`packages/content/src/checks.ts`):

**Errors**

- The AI scanner is never decisive alone: a story must not be justified only by `aiScanner`
  stamps, and an `aiScanner` stamp may be `decisive` only if a justifying stamp from another
  station exists.
- Every story spawned by a level (schedule **or** `events`) exists, belongs to the level number,
  has a stamp for each level station and is solvable with a non-scanner station of that level.
- A story's stamps may only use stations that exist in at least one level that schedules it.
- `correction` events need a story whose truth is `false` or `misleading` (`bossCall` and
  `viral` accept any truth).
- `botRaid` `count` must not exceed the number of conveyor tiles (`C`) in the layout.
- `outage` stations must be in the level's `stations` (and so placed in the layout).
- Two events of the same kind must be at least 10 s apart.
- `stars.three` must not exceed the maximum score (schedule plus events: viral/bossCall/botRaid
  stories score like scheduled ones, a true `bossCall` adds the bonus, a correction adds
  `correctionScore`).

**Warnings**

- `stars.two` above 90% of the maximum score; star thresholds outside the aim ranges.
- An `outage` that takes down every station of the level (e.g. a single-station level).
- Levels `l1` and later without `topic` / `briefingPoints`.
- Deadlines running past the end of the level, an unbalanced share of true stories, unscheduled
  stories, typography slips (three dots, hanging single-letter words).
