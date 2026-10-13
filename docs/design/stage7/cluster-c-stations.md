# Cluster C — Four new stations: Mapa (geolocation), Stenogram (transcript), Inne media (crossCheck), Metadane (metadata)

# Cluster C: four new stations

## 0. What the current code looks like (checked against the files)

**Station kinds and map letters**
- `stationKindSchema` is a 6-value zod enum (packages/shared/src/domain.ts:5-12). `STATION_KINDS = stationKindSchema.options` (domain.ts:50).
- Map letters live in `FIXTURE_CHARS` (packages/shared/src/sim/map.ts:37-47): C D T I A R P S L. The legend comment is at map.ts:49-56.
- Fixture ids are `<stationKind>-<n>` (map.ts:96-100).

**Work time and roles**
- `STATION_WORK_MS` is declared with `satisfies Record<StationKind, number>` (packages/shared/src/constants.ts:93-100).
- `ROLE_STATIONS` (constants.ts:104-109) is used in three places:
  - `workDurationMs` (sim/stations.ts:51-56);
  - `StationOverlay` skipsQueue (apps/client/src/stations/StationOverlay.tsx:35-38);
  - `RolePasses` "fasterAt" (screens/lobby/RolePasses.tsx:19-20).

**Station state machine** (sim/stations.ts) is kind-agnostic:
- `stampFor` (stations.ts:46-48) looks up the story's stamp for the kind.
- A station with no stamp for the story still runs the minigame and finishes without a stamp. This is pinned by the test at stations.test.ts:325.
- The seed comes from the sim RNG (stations.ts:176).
- No sim change is needed for new kinds.

**Content rules**
- `stampSchema` (packages/content/src/schema.ts:36-42). Stories allow `stamps.max(6)` and at most one stamp per station (schema.ts:76, 93-108).
- `checkStoryFitsLevel` (packages/content/src/checks.ts:325-361) requires two things:
  - every story in a level has a stamp for every level station;
  - the story is solvable by a station other than `aiScanner`.
- A stamp whose station no hosting level has is an error (checks.ts:199-215). So a level's new station and its stamps must land in the same commit.
- Validation exits 1 only on errors; warnings pass (packages/content/src/validate.ts:75-80).
- `aiScanner` is hard-coded as hint-only in two files: checks.ts:261-273, 348-353 and endless.ts:52-56.

**Levels and endless**
- l5 'Głęboka podróbka' is 20x12 with 5 stations: I S R on row 1, A P on row 10 (levels/l5-deepfake.json). It has 17 stories: 15 scheduled plus 2 bossCall. Each story has 5 stamps.
- l6 'Atak' is 22x12 with 6 stations (levels/l6-atak.json). It has 20 stories: 15 scheduled, 2 botRaid (count 4 and 5), 2 correction and 1 bossCall. Each story already has 6 stamps, the schema maximum.
- Endless uses `ENDLESS_LAYOUT` (24x14) and `ENDLESS_STATIONS` (packages/content/src/endless.ts:22-46).
- `endlessStoryPool` only takes stories that some level *schedules* (endless.ts:73-82).
- The endless room tests assert 6 stations in two places: packages/content/src/endless.test.ts:29-41 and apps/server/src/rooms/endless.test.ts:83-87.

**Client: minigames**
- The registry is `Partial<Record<StationKind, Minigame>>` (stations/minigames/types.ts:30). A missing entry silently becomes `PlaceholderMinigame`, an auto-pass (minigames/index.ts:53-55).
- The overlay passes `stamp = story.stamps.find(s => s.station === kind)` and enforces the client-side `MINIGAME_TIME_LIMIT_MS` = 20000 (StationOverlay.tsx:84-88, 122-131).
- Shared UI kit (stations/kit.tsx): `STATION_ICON` is a `Record<StationKind, IconName>` (14-21). Also `KeyHints` (returns null for an empty list, 29-52), `TaskLine`, `Mistakes`, `OutcomeBanner`.
- Pattern to copy: dataLibrary.
  - Pure logic: dataLibrary.logic.ts. It mixes the seed with `hashText(headline|stamp.text)` (63-70, 235) and calls `cardHasFlags` (sourceRegistry.logic.ts:54-67).
  - Component: DataLibrary.tsx.
  - Nav intents: only up, down, left, right, confirm, back and alt (Q/Tab/pad north) exist (input/ui-nav.ts:9-29).

**Client: maps that must cover every kind**
- Compile-enforced by `Record<StationKind>`:
  - `pl.vocab.stations` (strings/pl.ts:225-232)
  - `pl.vocab.signs` (245-254)
  - `pl.guidance.stationShort` (806-813)
  - `BUILDERS` (scene/station-models.ts:284-291)
  - `STATION_ICON`
  - `MINIGAME_BASE_S` / `MINIGAME_DIFFICULTY` (tools/balance/models.ts:112-129)
- Not compile-enforced:
  - `SURFACE_HEIGHT` is `as const`, not a Record (scene/entities.ts:16-26).
  - `STATION_PURPOSE` and `ICON_FOR_STATION` (tools/contest/lib/common.ts:166-182).
  - `STATION_PL` (tools/content/review-lib.ts:125).
- Icons: icon-coverage.test.ts requires an icon *named exactly like each StationKind* (ui/icons/icon-coverage.test.ts:23-27).
- Cues: `CueId` comes from fx/cues.ts. Captions are an exhaustive map; minigame cues use `skip('own-action')` (a11y/captions.ts:114-145).

**Scene: lights and camera**
- The sun is a directionalLight at (4,12,6). Its target is the default origin, with a fixed shadow box of ±14 / ±10 (scene/GameCanvas.tsx:81-91).
- In the light's frame a floor point (x,0,z) maps to:
  - x_ls = 0.832·x − 0.555·z
  - y_ls = −0.475·x − 0.713·z
- So in today's 20x12 rooms every tile with 0.475x + 0.713z > 10 is outside the shadow box: the front-right part of the room, e.g. tile (20,12) gives y_ls = −18.1. This bug exists already. A 24x14 room makes it worse.
- The camera (scene/CameraRig.tsx:54-83) is in fit mode when min(W/(w+1.5), H/((h+5)·sin58°)) ≥ 40 px (MIN_TILE_PX).

**Perf budget**
- Measured 35 / 37 / 53 draw calls on low / medium / high, with a 3-station room (docs/performance.md:118-122).
- Every station is one non-instanced merged mesh (scene/Fixtures.tsx:71-86).

## 1. Shared contract changes

### 1.1 domain.ts
```ts
export const stationKindSchema = z.enum([
  'imageSearch','archive','sourceRegistry','phone','aiScanner','dataLibrary',
  'geolocation','transcript','crossCheck','metadata',
]);
/** Stations whose stamp is a hint, never decisive alone (agents/content-authoring.md). */
export const HINT_ONLY_STATIONS = ['aiScanner'] as const satisfies readonly StationKind[];
export function isHintOnly(kind: StationKind): boolean { return (HINT_ONLY_STATIONS as readonly string[]).includes(kind); }
```
- Replace the hard-coded `'aiScanner'` in checks.ts:261-273 and 348-353 and in endless.ts:52-56 with `isHintOnly`. The messages stay the same, so the fixtures in __fixtures__/broken.ts still pass.
- None of the four new stations is probabilistic, so `HINT_ONLY_STATIONS` stays `['aiScanner']` and each new station may be decisive on its own:
  - Mapa: a geometric landmark match.
  - Stenogram: a text match.
  - Inne media: counting independent reports.
  - Metadane: comparing file facts with the claim. The "stripped" case is neutral by design (see 2.4).

### 1.2 map.ts
- Add four letters to `FIXTURE_CHARS`:
  - `G: geolocation`
  - `Q: transcript` (Q for quote)
  - `X: crossCheck`
  - `E: metadata` (E for EXIF)
- Update the legend comment.
- Fixture ids become `geolocation-0`, `transcript-0`, `crossCheck-0`, `metadata-0`.
- hud-model.ts:86-88 detects stations by prefix in `STATION_KINDS`, so it needs no change.

### 1.3 constants.ts (balance values only)
```ts
STATION_WORK_MS = { ...existing, geolocation: 4000, transcript: 5000, crossCheck: 4000, metadata: 4000 }
// --- S7-C: Map (geolocation) minigame ---
export const GEOLOCATION_MAX_MISTAKES = 2;
export const GEOLOCATION_MAP = { columns: 4, rows: 3 } as const;      // 12 district tiles
/** Without a geolocation stamp: chance the photo is not from the captioned place. */
export const GEOLOCATION_PROBLEM_CHANCE = 0.5;
/** A photo not from the captioned place comes from another district (else another town). */
export const GEOLOCATION_OTHER_DISTRICT_SHARE = 0.5;
// --- S7-C: Transcript (Stenogram) minigame ---
export const TRANSCRIPT_MAX_MISTAKES = 2;
export const TRANSCRIPT_LINES = 4;            // fits 640x360 as a 2x2 grid of ≥48 px lines
export const TRANSCRIPT_PROBLEM_CHANCE = 0.5;
// --- S7-C: Other media (crossCheck) minigame ---
export const CROSS_CHECK_MAX_MISTAKES = 1;    // three answers; like aiScanner/phone one wrong pick fails
export const CROSS_CHECK_CARDS = 5;
/** Independent confirmations needed for „Potwierdzają”. */
export const CROSS_CHECK_CONFIRMATIONS = 2;
// --- S7-C: Metadata (Metadane) minigame ---
export const METADATA_MAX_MISTAKES = 2;
export const METADATA_FIELDS = 4;             // taken, device, software, place
/** Without a metadata stamp: outcome weights. */
export const METADATA_NO_STAMP_WEIGHTS = { consistent: 0.4, contradiction: 0.4, stripped: 0.2 } as const;
```
- `ROLE_STATIONS` is **owned by the roles cluster**; this cluster only proposes values (see open points).
- `PROTOCOL_VERSION` bumps by one: `stationKindSchema` is on the wire in `stationSchema.kind` and in `minigameStarted.station`. Coordinate with the other clusters so it bumps once per release.

### 1.4 content schema
- In `storySchema.stamps`, change `.max(6)` to `.max(STATION_KINDS.length)` (10). l6 needs 8 stamps per story.
- No other schema change.

## 2. The four stations

Shared rules for all four minigames:
- Pure `*.logic.ts` file plus a React component and a CSS module. Copy the dataLibrary contract: `generatePuzzle(seed, story, stamp)`, `initialState`, a `reduce(state, action) → [state, Effect|null]`, and `onDone` called exactly once after `RESULT_HOLD_MS = { success: 1000, failure: 1400 }`.
- Touch-first: every choice is a ≥48 px button using `onMouseDown(preventDefault)` and no hover. The cursor (`data-focused`) shows only when `device !== 'touch'`.
- No yellow answer buttons: a yellow button would hint at the answer, and design-rules §1.1 allows one yellow per screen. No green/red colour-coding of answers; icon plus word only.
- At ≤430 px height the foot moves into a right-hand column, as in the Kartoteka pattern (SourceRegistry.module.css:251-300).
- On failure the minigame reveals the answer, as dataLibrary does (`data-revealed`). This is gated by the difficulty cluster's `revealAnswer` prop when it lands (Ekspert = no reveal); the default is to reveal.
- Seeds: each minigame XORs its own salt into the seed, together with `hashText(`${story.headline}|${stamp?.text ?? ''}`)`, as dataLibrary.logic.ts:235 does. Salts: `0x5eed_0008` geolocation, `0x5eed_0009` transcript, `0x5eed_000a` crossCheck, `0x5eed_000b` metadata.

### 2.0 Shared helper (new) `apps/client/src/stations/minigames/evidence.ts`
```ts
export type Rng = ReturnType<typeof createRng>;
/** Stamp-driven "does this station show a problem": decisive → story untrue; misleading → story true;
 *  irrelevant → false; no stamp → null (caller rolls its own chance). Pure, consumes no RNG. */
export function problemFromStamp(story: Pick<Story,'truth'>, stamp: Stamp | undefined): boolean | null;
export function hashText(text: string): number;          // moved from dataLibrary.logic.ts:63-70
export function shuffled<T>(rng: Rng, items: readonly T[]): T[];
export function pick<T>(rng: Rng, items: readonly T[]): T;
```
- Rewrite `cardHasFlags` as `problemFromStamp(story, stamp) ?? rng.next() >= SOURCE_REGISTRY_CLEAN_CHANCE`. This consumes the RNG exactly as today, so the existing sourceRegistry and dataLibrary tests must pass unchanged. That is the proof that no puzzle changes.
- dataLibrary.logic.ts re-exports `hashText`.
- The Kartoteka stable-seed cluster may later move the FNV hash into shared/sim/rng.ts; this helper re-exports it, so that move is cheap.

### 2.1 Mapa — `geolocation`, letter G
| | |
|---|---|
| Names | vocab.stations 'Mapa', signs 'Mapa', guidance.stationShort 'Mapa' |
| STATION_WORK_MS | 4000 |
| Real-world analogue | geolocation with maps and street imagery |
| Model surface | SURFACE_HEIGHT 0.76 |

**Minigame**
- Left: the photo from the folder, a paper-cut SVG in the imageSearch style. It shows 2 landmarks large, plus seeded houses and trees, with a caption chip 'Podpis: {district}'.
- Right: a 4×3 map of Nowe Brzegi. Each tile shows a district name (≤9 characters) and its 2 landmark glyphs.
- The player taps the tile whose two landmarks both appear in the photo, or presses 'Nie ma na mapie'.
- Task line: **'Znajdź na mapie miejsce ze zdjęcia'** (6 words).

**Logic** (`geolocation.logic.ts`)
```ts
export type Landmark = 'clockTower'|'archBridge'|'fountain'|'tramStop'|'twinChurch'|'waterTower'|'portCrane'|'windmill'|'lighthouse'|'monument';
export type MapTile = { district: string; landmarks: readonly [Landmark, Landmark] };
export type GeoOutcome = 'match' | 'otherDistrict' | 'otherTown';
export type GeoPuzzle = { tiles: readonly MapTile[]; claimed: number; photo: readonly [Landmark, Landmark]; answer: number | null; outcome: GeoOutcome };
export function geolocationOutcome(story: Pick<Story,'truth'>, stamp: Stamp|undefined, rng: Rng): GeoOutcome
//  p = problemFromStamp(...) ?? rng.next() < GEOLOCATION_PROBLEM_CHANCE; !p → 'match';
//  p → rng.next() < GEOLOCATION_OTHER_DISTRICT_SHARE ? 'otherDistrict' : 'otherTown'
export function tileShows(tile: MapTile, photo: readonly Landmark[]): boolean;   // both landmarks
export function generatePuzzle(seed: number, story: Story, stamp: Stamp|undefined): GeoPuzzle
```

Generation algorithm:
1. Shuffle all 45 landmark pairs (10 choose 2). The first 12 become the tiles, so every pair is unique and a photo matches at most one tile.
2. Pick 12 shuffled district names from `pl.minigames.geolocation.districts`.
3. `claimed = rng.int(12)`.
4. Set the photo by outcome:
   - `match`: photo = tiles[claimed]; answer = claimed.
   - `otherDistrict`: t = a random tile other than claimed; photo = tiles[t]; answer = t.
   - `otherTown`: photo = an unused pair that shares exactly one landmark with some tile (a decoy, which always exists); answer = null.

Actions and failure:
- Actions: `move(dRow,dCol)`, `pick(index)`, `notHere`, `confirm`. Cursor 0..11 are tiles; 12 is the 'Nie ma na mapie' button.
- A wrong tile is struck through (it cannot be picked again) and counts as a mistake. A wrong 'Nie ma na mapie' also counts.
- `GEOLOCATION_MAX_MISTAKES` = 2 mistakes means failure. Timeout means failure.

Outcome banner:
- Success: title 'Namierzone!' with one reason line:
  - `match`: 'Zdjęcie z miejsca z podpisu.'
  - `otherDistrict`: `To nie ${claimed} – to ${district}.`
  - `otherTown`: 'Tych miejsc nie ma w Nowych Brzegach.'
- Failure: 'Pudło!' plus the same reason, and the reveal pin if `revealAnswer` is on.

Controls:
- Keyboard: Strzałki = wybierz, Spacja = tu!, Q = nie ma na mapie.
- Gamepad: Krzyżak, A, Y.
- Touch: tap a tile, or tap 'Nie ma na mapie'.

Layout:
- Desktop: photo above, map below.
- 640x360: photo about 130 px wide on the left, grid of 4 × ~80 px by 3 × 56 px, the button in the right foot column.
- Landmark glyphs are 10 SVG silhouettes in a new `landmarks.tsx`, using tokens only. They are told apart by **shape**, never by colour alone.

### 2.2 Stenogram — `transcript`, letter Q
| | |
|---|---|
| Names | vocab 'Stenogram', sign 'Stenogram', short 'Stenogram' |
| STATION_WORK_MS | 5000 |
| Real-world analogue | full transcripts and recordings of statements |

**Minigame**
- Left: the clip from the folder, shown big in Polish quotes.
- Right: the full record, `TRANSCRIPT_LINES` = 4 numbered lines with a setting chip (e.g. 'Sesja rady miasta').
- The game has two phases:
  - **find**: tap the line the clip comes from, or 'Nie ma w zapisie'.
  - **judge** (only after the right line): 'Czy cięcie zmienia sens?' with two buttons, 'Sens ten sam' and 'Sens zmieniony'. In this phase the line before and after the clip are highlighted.
- Task line: **'Znajdź cytat w zapisie i oceń sens'** (7 words).

**Logic** (`transcript.logic.ts`)
```ts
export type TranscriptVariant = 'fair' | 'cut' | 'absent';
export type TranscriptPuzzle = { setting: string; clip: string; lines: readonly string[]; answerLine: number | null; variant: TranscriptVariant };
export function transcriptVariant(story: Pick<Story,'truth'>, stamp: Stamp|undefined, rng: Rng): TranscriptVariant
//  p = problemFromStamp ?? rng.next() < TRANSCRIPT_PROBLEM_CHANCE; !p → 'fair';
//  p && (truth === 'false' || truth === 'unverifiable') → 'absent'; else → 'cut'
export function generatePuzzle(seed, story, stamp): TranscriptPuzzle
export type Phase = 'find' | 'judge';
// GameState { puzzle, phase, cursor, struckLines: boolean[], absentStruck, judgeStruck: {same, changed}, mistakes, outcome }
// Action: move(delta) | pickLine(index) | notInTranscript | judge(changed: boolean) | confirm
// Effect: 'move' | 'found' | 'right' | 'mistake' | 'failed' | 'blocked'
```

Content pools (authored in pl.ts, all fictional Nowe Brzegi):
- `fair: {line, clip}[]` (≥6): a shortening that keeps the meaning.
- `cut: {line, clip}[]` (≥6): the cut flips the meaning, e.g. line 'Nie obchodzą mnie plotki – obchodzą mnie problemy mieszkańców.' with clip 'Nie obchodzą mnie problemy mieszkańców.'
- `absent: {clip, decoy}[]` (≥6): the decoy shares keywords but says something else.
- `filler: string[]` (≥12).
- `settings: string[]` (≥4).

The record holds the answer line (or the decoy) plus shuffled filler.

Failure:
- A wrong line, a wrong 'Nie ma w zapisie' or a wrong judgement is a mistake. The wrong choice is struck through.
- 2 mistakes or a timeout means failure.

Banner reasons:
- fair: 'Skrót nie zmienia sensu.'
- cut: 'Cięcie odwraca sens wypowiedzi.'
- absent: 'Tych słów nikt nie powiedział.'

Controls:
- Keyboard: Strzałki = wybierz, Spacja = potwierdź, Q = nie ma w zapisie.
- Judge phase: ←/→ and Spacja.
- Gamepad: Krzyżak, A, Y.

### 2.3 Inne media — `crossCheck`, letter X
| | |
|---|---|
| Names | vocab 'Inne media', sign 'Media' (signs are one word), short 'Inne media' |
| STATION_WORK_MS | 4000 |
| Real-world analogue | SIFT "find better coverage", news agencies, lateral reading |

**Minigame**
- Top strip: the folder's claim, which is the real `story.headline`.
- Below: `CROSS_CHECK_CARDS` = 5 coverage cards, 3 + 2 in a grid. Each card shows:
  - the outlet name;
  - a kind badge: agencja / redakcja / satyra / anonim / portal-klon;
  - a stance chip: 'pisze to samo' or 'zaprzecza';
  - a source line, either 'Źródło: własny reporter' or 'za: post z grupy'.
- Echo cards look like confirmations. Only the source line and the kind badge show they are copies; spotting that is the lesson.
- Three answer buttons: 'Potwierdzają', 'Zaprzeczają', 'Nikt nie potwierdza'.
- Task line: **'Co mówią niezależne media?'** (4 words).

**Logic** (`crossCheck.logic.ts`)
```ts
export type OutletKind = 'agency'|'newsroom'|'satire'|'anonymous'|'junk';
export type Stance = 'confirms'|'denies'|'echoes';
export type CoverageCard = { outlet: string; kind: OutletKind; stance: Stance; line: string; via: string | null };
export type Conclusion = 'confirmed'|'denied'|'unconfirmed';
export type CrossCheckPuzzle = { claim: string; cards: readonly CoverageCard[]; conclusion: Conclusion };
export function isIndependent(c: CoverageCard): boolean   // (agency|newsroom) && stance !== 'echoes'
export function conclude(cards): Conclusion   // any independent deny → 'denied'; ≥CROSS_CHECK_CONFIRMATIONS independent confirms → 'confirmed'; else 'unconfirmed'
export function crossCheckOutcome(story: Pick<Story,'truth'>, stamp: Stamp|undefined, rng: Rng): Conclusion
```

`crossCheckOutcome` has its own table, because media coverage speaks to *truth*, not to the source:

| stamp | true | false | misleading | satire | unverifiable |
|---|---|---|---|---|---|
| decisive | confirmed | denied | denied | unconfirmed | unconfirmed |
| misleading / irrelevant | unconfirmed | unconfirmed | unconfirmed | unconfirmed | unconfirmed |
| no stamp (seeded) | confirmed or unconfirmed | denied or unconfirmed | denied or unconfirmed | unconfirmed | unconfirmed |

Generation and failure:
- The generator builds cards for the wanted conclusion:
  - confirmed: 2-3 independent confirms plus echoes;
  - denied: 1-2 independent denials plus 2-3 echo or junk 'pisze to samo' cards;
  - unconfirmed: 0-1 independent confirm plus echoes, satire and anonymous cards.
- It asserts `conclude(cards) === wanted`; this is a loop guard, as in dataLibrary's diagnose.
- `CROSS_CHECK_MAX_MISTAKES` = 1: the first wrong answer fails. Timeout also fails.

Banner reasons:
- confirmed: 'Dwa niezależne źródła to potwierdzają.'
- denied: 'Niezależne źródło temu zaprzecza.'
- unconfirmed: 'Same kopie – nikt tego nie sprawdził.'
- After the round, echo cards fade and get a 'kopia' stamp. That teaches the rule whether the player won or lost.

Controls:
- Keyboard: A/D or ←/→ choose the answer, Spacja confirms.
- Gamepad: Krzyżak, A.
- Cards are not interactive: no hover, no flip.

### 2.4 Metadane — `metadata`, letter E
| | |
|---|---|
| Names | vocab 'Metadane', sign 'Metadane', short 'Metadane' |
| STATION_WORK_MS | 4000 |
| Real-world analogue | reading EXIF / file metadata; platforms strip metadata |

**Minigame**
- Left: 'Opis w teczce'. Four claim chips, for example 'dziś, ok. 14:00', 'zdjęcie z telefonu świadka', 'bez obróbki', 'Nowe Brzegi, Rynek'. The media word follows `story.type`: photo → zdjęcie, recording → nagranie, otherwise → zrzut ekranu.
- Right: 'Dane pliku' as a 2×2 grid of `METADATA_FIELDS` = 4 tappable fields: Wykonano, Urządzenie, Program, Miejsce (GPS).
- Foot: 'Zgadza się' and 'Brak danych'.
- Task line: **'Porównaj dane pliku z opisem'** (5 words).

**How it differs from Kartoteka:**
- Kartoteka circles *every* red flag (0-3) on a *source profile* (who posts), then files the card.
- Metadane is one *comparison* of claim against file. Either exactly one field contradicts the claim, or none does.
- It has a third, neutral answer, 'Brak danych'. It teaches that missing metadata proves nothing, because social sites strip it.

**Logic** (`metadata.logic.ts`)
```ts
export type MetadataField = 'taken'|'device'|'software'|'place';
export type MetadataOutcome = 'consistent'|'contradiction'|'stripped';
export type MetadataPuzzle = { mediaKind: 'photo'|'recording'|'screenshot'; claim: Record<MetadataField,string>; file: Record<MetadataField,string|null>; outcome: MetadataOutcome; contradiction: MetadataField|null };
export function metadataOutcome(story: Pick<Story,'truth'>, stamp: Stamp|undefined, rng: Rng): MetadataOutcome
//  irrelevant → 'stripped'; decisive → true ? 'consistent' : 'contradiction';
//  misleading → true ? 'contradiction' : 'consistent'; no stamp → weighted METADATA_NO_STAMP_WEIGHTS
export type Answer = { kind:'field'; field: MetadataField } | { kind:'matches' } | { kind:'noData' };
export function isRight(p: MetadataPuzzle, a: Answer): boolean
```

Generation:
- Contradiction kinds are seeded. Each one makes the file value contradict the matching claim chip:
  - `taken`: the file is years older;
  - `device`: 'brak – plik wygenerowany';
  - `software`: 'Edytor zdjęć – zapisano 3 razy' or 'Program do montażu';
  - `place`: an invented other town.
- `stripped` shows '—' in every field, with the note 'usunięte przez serwis'.

Failure:
- A wrong field, or a wrong foot button, is a mistake and gets struck through.
- 2 mistakes or a timeout means failure.

Banner reasons:
- consistent: 'Dane pliku zgadzają się z opisem.'
- taken: 'Plik jest starszy niż opis.'
- device: 'To nie zdjęcie z aparatu.'
- software: 'Plik obrabiano w programie.'
- place: 'Zrobione w innym miejscu.'
- stripped: 'Serwis usunął dane – to nic nie dowodzi.'

Controls:
- Keyboard: Strzałki move over the 2×2 grid and the foot row, Spacja confirms, Q = zgadza się.
- Gamepad: Krzyżak, A, Y.

### 2.5 Strings (`pl.minigames.<kind>`)

Every namespace has:
- `task`, `right`, `wrong`;
- `reasons` as a `Record<outcome, string>` (callable where it needs a district);
- `keys` as KeyHints for keyboard, gamepad and touch. Touch is filled for the how-to cluster, e.g. `[{keys:['Stuknij'],label:'dzielnicę'}]`;
- `purpose` and `howTo: string[]` (2-3 steps) for the how-to cluster;
- the content pools.

Purpose lines:
- geolocation: 'Gdzie naprawdę zrobiono zdjęcie?'
- transcript: 'Czy wycięty cytat znaczy to samo co całość?'
- crossCheck: 'Co podają niezależne redakcje i agencje?'
- metadata: 'Kiedy, czym i gdzie powstał plik?'

Pool data and its shape:
- `geolocation.districts`: 12 names, each ≤9 characters: Rynek, Port, Dworzec, Lipowa, Klonowa, Młyny, Zatoka, Wzgórze, Park, Nadrzecze, Stocznia, Błonia.
- `geolocation.landmarks`: `Record<Landmark, string>`, used for aria labels.
- `crossCheck.outlets: {name, kind}[]`, reusing invented brands: Agencja Prasowa Nadrzecze, Radio Nadrzecze, Kurier Nowobrzeski, TV Brzegi, Brzeski Szpikulec (satire), nb-prawda24.top (junk), Grupa „Nowe Brzegi Info” (anonymous).
- `crossCheck.lines: Record<Stance,string[]>`.
- `metadata.devices`, `metadata.software`, `metadata.places`: local places plus invented other towns.

Every string goes through `typeset()` when rendered.

### 2.6 Cues and captions (game-feel rows go in the same commit)

| CueId | Sound | Haptic | DOM animation (respects reduced motion) |
|---|---|---|---|
| `geolocation.found` | stamp, ui 0.7, jitter 0.05 | thud | pin drops onto the tile |
| `geolocation.miss` | back, ui | error | red pencil strike plus NUDGE shake |
| `transcript.find` | click, ui 0.8 | tick | highlighter sweeps the line |
| `transcript.right` | stamp, ui 0.7 | thud | 'Sprawdzone' stamp |
| `transcript.miss` | back, ui | error | line struck through, shake |
| `crossCheck.right` | stamp, ui 0.7 | thud | answer stamps, echo cards fade with a 'kopia' mark |
| `crossCheck.wrong` | back, ui | error | answer struck through |
| `metadata.right` | stamp, ui 0.7 | thud | field flips red ✗, or every field gets ✓ |
| `metadata.mistake` | back, ui | error | field struck through, nudge |

- `move` uses the existing `ui.hover` cue.
- Every new cue is `skip('own-action')` in a11y/captions.ts.
- None of these cues has particles; the minigames are DOM overlays, matching the existing rows at game-feel.md:89-94.
- Severity is ● for all of them.

### 2.7 Icons (Icon.tsx; the icon name equals the StationKind id)
- `geolocation`: a folded map in three panels (tint) with a solid pin.
- `transcript`: a page (tint), 3 text lines and one solid highlighted bar.
- `crossCheck`: two overlapping newspapers (tint), each with lines.
- `metadata`: a luggage tag (tint) with a solid hole dot and two tick lines. It must not look like `article`.
- Path data follows the 24×24 / 2.5 px stroke rules (design-rules §6).
- Add each to `STATION_ICON`; icon-coverage.test.ts then covers them automatically.

### 2.8 3D models (station-models.ts; one merged mesh each; top centre 0.6×0.45 kept clear)

All four have `SURFACE_HEIGHT` 0.76.
- **geolocation:**
  - `deskBody()`.
  - A back-edge map board, 0.88×0.5 at z −0.45, y about 1.0, with green park, blue river stripe and orange block patches.
  - A big red push-pin (cyl head and stem) above the board.
  - Front: a folded paper map hanging over the edge with a river stripe and a red dot.
  - Detail level adds a yellowDark compass disc.
- **transcript:**
  - `deskBody()`.
  - A low stenotype machine on the back edge (textSoft block with key rows).
  - A white paper roll (a cylinder along x) on two posts.
  - Front: a hanging paper strip with 5 outline text bars and one yellow highlighted bar.
- **crossCheck:**
  - `deskBody()`.
  - Front: a rack of 3 tilted newspapers with blue, red and green mastheads.
  - Back edge: a small TV (textSoft) with a sky-coloured screen and a V antenna, plus an orange radio.
- **metadata:**
  - `deskBody()`.
  - Back-left: a camera (outline body, sky lens cylinder).
  - Back-right: a monitor showing green and blue data rows.
  - Front corner: a yellowDark luggage tag on a string.
  - No purple and no gantry, so it cannot be confused with aiScanner.

Also update the header comment in station-models.ts with the four new silhouettes.

**Draw-call cost:** each station adds 1 call, plus 1 in the shadow pass on high, and roughly 1.5-3k triangles.
- Endless with 10 stations against the measured 3-station room: +7 calls, about 60 on high (shadow included), 44 on medium/mobile, about 35k triangles.
- That is well under the 150 desktop / 100 mobile / 100k budgets.

## 3. Content

### 3.1 Layouts (24x14)
- Conveyor stays top-left. All four spawns are kept. Station signs on the same row are ≥3 columns apart, and the first station is ≥5 columns from the belt-sign centre.
- One desk run, 4 tables.
- Camera fit at 1280x720: min(1280/25.5, 720/(19·sin58°)) = **44.7 px** ≥ 40, so the camera stays in fit mode with no CameraRig change.

```
l5 'Głęboka podróbka' (I S R Q back row; A P E front row)
########################
#CCCCC..=I==S==R==Q=...#
#......................#
#..T...1........2...T..#
#......................#
#........T=DD=T........#
#..==.....====.....==..#
#......................#
#....3............4....#
#......................#
#..=A=....=P=....=E=...#
#......................#
#.==................==.#
########################
l6 'Atak' (I A R P back; S L G X front; botRaid 5 ≤ 5 belt tiles)
########################
#CCCCC..=I==A==R==P=...#
  (rows 2-9 as l5)
#..=S=..=L=..=G=..=X=..#
#......................#
#.==................==.#
########################
endless (10 stations; back I A R Q E at cols 9,12,15,18,21; front P S L G X at 3,7,11,15,19)
########################
#CCCCCC.=I==A==R==Q==E=#
#......................#
#..T....1......2....T..#
#......................#
#.......T==DD==T.......#
#..==....====....==....#
#......................#
#...3..............4...#
#......................#
#.=P=.=S=.=L=.=G=.=X=..#
#......................#
#.==................==.#
########################
```
- l6 keeps all 6 old stations and adds G and X, so it has **8 stations**.
- `ENDLESS_STATIONS = [...STATION_KINDS]`.
- briefingPoints:
  - l5: ['Skaner AI: tylko podpowiedź, może się mylić.', 'Stenogram: czy cięcie zmienia sens?', 'Metadane: kiedy i czym zrobiono plik.']
  - l6: ['Nalot botów: wystarczy rozpoznać jedną kopię.', 'Mapa: skąd naprawdę jest zdjęcie?', 'Inne media: licz źródła, nie kopie.']. The correction rule moves into the `briefing` text.

### 3.2 Stamp count
- **l5:** 17 existing stories × 2 new stamps (Q, E) = 34. Plus 4 new stories × 7 stamps = 28. Total **62**.
- **l6:** 20 existing stories × 2 (G, X) = 40. Plus 5 new stories × 8 stamps = 40. Total **80**.
- **142 new stamp texts** (≤120 characters, Polish typography).
- Edits to existing stories: 4 l5 retargets and 9 l6 retargets, each with relevance, justifyingStamps and debrief.tool rewrites. Everything stays `reviewed:false`.

### 3.3 Decisive allocation under the station bag (cluster A)
Content target for every station that can be decisive (not hint-only) in a level's pool: **≥2 stories where it is the only non-AI decisive station, and ≥3 where it is decisive at all**. This should be enforced by S7-A's balance validator, or by a content test here if A does not add one.

**l5 pool** (19 stories, 6 stations; about 2.5 folders per station per run)
- Q only-decisive: l5-wyciety-cytat (archive's stamp becomes irrelevant, transcript stamp holds the full quote), NEW l5-cytat-z-sesji, NEW l5-wywiad-skrocony. Also decisive in l5-wywiad-radio (P/Q).
- E only-decisive: NEW l5-zdjecie-czytelnika, NEW l5-film-z-montazu. Also decisive in l5-burmistrz-na-jachcie (R/E, plus AI) and l5-zdjecie-sprzed-lat (I/A/E).
- P only-decisive: nagranie-podatek, glosowka-przelew, wideo-ewakuacja, glosowka-radnej.
- A only-decisive: przemowa-na-rynku, tlum-na-wiecu. Also decisive in wolne-tempo and zdjecie-sprzed-lat.
- I only-decisive: przecinanie-wstegi, wideo-obietnica. Also decisive in the same two.
- R only-decisive: komunikat-budzet, parodia-rap. Also decisive in burmistrz-na-jachcie.

**l6 pool** (20 stories, 7 stations; about 2.1 per station)
- G only-decisive: NEW l6-most-zamkniety (otherTown), NEW l6-kolejka-do-lokalu (match). Also decisive in fotka-urny (I/R/G).
- X only-decisive: NEW l6-agencja-dementuje (denied), NEW l6-relacja-z-debaty (confirmed). Also decisive in referendum-w-poniedzialek (A/R/X), anonimowa-komisja (R/X) and autobusy-w-niedziele (R/P/X).
- A only-decisive: wyrwany-cytat-radnej, nagranie-zastepcy (phone stamp demoted).
- P only-decisive: apel-mieszkancow (archive stamp demoted), dowoz-seniorow (registry stamp demoted).
- L only-decisive: sonda-w-grupie, frekwencja-w-poludnie (registry stamp demoted).
- I only-decisive: tlum-przed-ratuszem, NEW l6-plakat-sprzed-lat.
- R only-decisive: godziny-lokali, satyra-linia-12.

**New stories** (fictional, each with debrief, technique and real-world analogue)

| id | type | truth | priority | technique | decisive station | outcome |
|---|---|---|---|---|---|---|
| l5-cytat-z-sesji | quote | false | important | zmyslony-cytat | Q | absent |
| l5-wywiad-skrocony | recording | misleading | important | tania-podrobka-wyciecie | Q | cut |
| l5-zdjecie-czytelnika | photo | true | important | none | E | consistent |
| l5-film-z-montazu | recording | false | urgent | deepfake-wideo | E | software contradiction (AI stamp misleading) |
| l6-most-zamkniety | photo | false | urgent | zdjecie-z-innego-miejsca | G | otherTown |
| l6-kolejka-do-lokalu | photo | true | important | none | G | match |
| l6-agencja-dementuje | post | false | urgent | plotka-bez-zrodla | X | denied |
| l6-relacja-z-debaty | article | true | normal | none | X | confirmed |
| l6-plakat-sprzed-lat | photo | misleading | important | stare-zdjecie-nowy-podpis | I | — |

`zdjecie-z-innego-miejsca` is a new alias on the `stare-zdjecie-nowy-podpis` card.

### 3.4 Authoring rules (add to agents/content-authoring.md)
- **Stenogram** is decisive only for quote and recording stories. On other story types, write an irrelevant stamp, e.g. 'Brak wypowiedzi do porównania.'
- **Metadane:** an `irrelevant` stamp *means* stripped metadata. Its text must say so, e.g. 'Serwis usunął metadane – nic z nich nie wynika.' It may be the sole decisive stamp for a true story only when the claim is about the time, place or device of the shot.
- **Mapa** is decisive only for photos and video with a place claim.
- **Inne media:** `irrelevant` and `misleading` stamps must read as "no independent coverage", e.g. 'Nikt jeszcze o tym nie pisze.' or 'Trzy portale to powtarzają – same kopie wpisu.'
- None of the four new stations is hint-only.

### 3.5 Techniques (techniques.json; each list ≤4 stations; update `detect` text too)
- wyrwane-z-kontekstu → [transcript, archive, phone]
- zmyslony-cytat → [transcript, archive, sourceRegistry, phone]
- tania-podrobka → [archive, transcript, aiScanner, imageSearch]
- obraz-wygenerowany-ai → [aiScanner, metadata, imageSearch, sourceRegistry]
- deepfake-audio → [aiScanner, phone, metadata, sourceRegistry]
- stare-zdjecie-nowy-podpis (+alias zdjecie-z-innego-miejsca) → [imageSearch, geolocation, metadata, archive]
- plotka-bez-zrodla → [crossCheck, sourceRegistry, archive, phone]
- podszywanie-sie-pod-instytucje → [sourceRegistry, phone, crossCheck]
- siec-botow → [sourceRegistry, crossCheck, aiScanner, dataLibrary]
- satyra-brana-na-powaznie → [sourceRegistry, crossCheck, archive]
- none → [crossCheck, sourceRegistry, phone, archive]

`card-icons.ts` needs no change: every id is mapped explicitly.

### 3.6 What this means for endless
- Endless runs all 10 stations.
- Stories from l1-l4 have no stamp for the 4 new stations. At those stations the minigame still plays and success adds nothing. This is today's rule (stations.test.ts:325), and guidance never points there (guidance/next-step.ts:119-136).
- Only l5 stories can be decided at Q and E, and only l6 stories at G and X. Under the endless station bag this gives Q 4, E 4, G 3 and X 5 eligible stories, so they repeat more often than old-station stories. `storyDrawer` already prevents back-to-back repeats.
- `endlessStoryPool` must include S7-A's level pools, not only `schedule`. Otherwise the new stories never reach endless.

### 3.7 Layout validation (checks.ts, pure; add tests to __fixtures__/broken.ts)
- New `STATION_SIGN_MIN_GAP_COLUMNS = 3`, a content rule (not balance) that lives in checks.ts like `EVENT_MIN_GAP_S`. Two station fixtures on the same row closer than 3 columns give a **warning**: 'station signs overlap on phones'.
- New reachability check: BFS over floor tiles from spawn 1. A fixture with no reachable 4-neighbour floor tile gives an **error**. Every spawn must also be reachable.

## 4. Scene: sun light and camera
- New pure module `apps/client/src/scene/sun.ts`:
  ```ts
  export const SUN_OFFSET = { x: 4, y: 12, z: 6 }; export const SUN_MARGIN = 1; export const SUN_TALLEST_PROP = 1.4;
  export function sunFrame(width: number, height: number): { target: [number,number,number]; position: [number,number,number]; half: { x: number; y: number } }
  ```
- How it works:
  - The target is the room centre (W/2, 0, H/2).
  - The position is target + SUN_OFFSET, so the light direction is unchanged.
  - The light-space axes are z = normalize(offset), x = normalize(up×z), y = z×x.
  - The half-extents are the maximum |projection| of the 8 room-box corners (height 0..1.4), plus 1.
  - Expected values: 20×12 gives half {x 12.65, y 10.75}; 24×14 gives {14.87, 12.42}. At a shadow map of 1024² the texel size stays about 0.029 tiles, the same as today.
- New `SunLight.tsx` replaces the inline light in GameCanvas.tsx:81-91 and mounts inside `<group key={levelId}>`:
  - it reads `runtime.map` and places an `Object3D` target via `<primitive>`;
  - its shadow camera uses left/right = ∓half.x and top/bottom = ±half.y.
- This fixes the missing shadows in the front-right of every room on High.
- Camera: no change. 24×14 fits at 44.7 px at 1280x720.
  - With browser chrome (about 633 px of viewport) it drops to follow mode at 39.3 px. That is acceptable and listed under risks.
  - The mobile-HUD cluster owns follow-mode changes.

## 5. Tools
- tools/balance/models.ts:
  - `MINIGAME_BASE_S`: geolocation 10, transcript 11, crossCheck 8, metadata 8.
  - `MINIGAME_DIFFICULTY`: 1.1, 1.1, 1.2, 1.0.
  - Re-run `bun run balance` after S7-A, for l5, l6 and endless.
- tools/contest/lib/common.ts: `STATION_PURPOSE` gets the 4 purpose lines above, and `ICON_FOR_STATION` gets 4 entries. Change both to `satisfies Record<StationKind, …>` so a future kind is a compile error.
- tools/contest/screenshots.ts: add 4 `defineShot` entries ('stanowisko-mapa', 'stanowisko-stenogram', 'stanowisko-inne-media', 'stanowisko-metadane') and 4 `stationShots` rows. Change the README text 'wszystkie sześć stanowisk' (screenshots.ts:762) to 'wszystkie dziesięć'.
- tools/content/review-lib.ts `STATION_PL`: add 4 names.
- `bun run contest:build` regenerates docs/contest/maps for l5 and l6, plus the screenshots.

## 6. Client files, one by one
- `stations/minigames/`:
  - new: `evidence.ts`, plus `{Geolocation,Transcript,CrossCheck,Metadata}.tsx`, `.module.css`, `{geolocation,transcript,crossCheck,metadata}.logic.ts`, `.test.ts`, and `landmarks.tsx`;
  - `index.ts`: register the 4 new minigames;
  - `types.ts`: `MinigameRegistry` becomes a full `Record<StationKind, Minigame>` (no longer Partial), so a missing minigame no longer compiles;
  - `sourceRegistry.logic.ts` and `dataLibrary.logic.ts` use `evidence.ts`.
- `stations/kit.tsx`: `STATION_ICON` +4.
- `ui/icons/Icon.tsx`: +4 icons.
- `scene/station-models.ts`: +4 builders. `scene/entities.ts`: `SURFACE_HEIGHT` +4.
- `scene/sun.ts` and `scene/SunLight.tsx` are new; `scene/GameCanvas.tsx` uses `SunLight`.
- `strings/pl.ts`: vocab.stations, vocab.signs, guidance.stationShort, and `minigames.geolocation`, `transcript`, `crossCheck`, `metadata`.
- `fx/cues.ts` +9 cues; `a11y/captions.ts` +9 entries.
- Each minigame root carries `data-answer` (tile index, line index, conclusion or field) for e2e.

## 7. Tests (literal values)

**Shared**
- map.test: `parseLayout(['#####','#GQXE','#1234'… ])` gives ids `geolocation-0`, `transcript-0`, `crossCheck-0`, `metadata-0`.
- protocol.test: a snapshot with station kind 'metadata' parses; 'foo' is rejected; `PROTOCOL_VERSION` equals the new literal.
- domain: `isHintOnly('aiScanner') === true` and `isHintOnly('metadata') === false`.

**Content**
- `stamps.max`: 10 stamps accepted, 11 rejected.
- Layout checks: a gap of 2 warns; a walled-in station errors.
- endless.test: 10 stations placed, and `level.stations` equals `STATION_KINDS`.
- New `l5-l6-stations.test.ts`: for l5 and l6, every non-hint station has ≥2 only-decisive and ≥3 decisive stories in the pool; every story has a stamp for every level station.

**Server**
- apps/server/src/rooms/endless.test.ts: `new Set(kinds).size === STATION_KINDS.length` (10) and `snapshot.stations` length is 10.

**Client unit tests**
- `evidence.test`:
  - `problemFromStamp` table: decisive+false → true, decisive+true → false, misleading+true → true, misleading+false → false, irrelevant → false, no stamp → null;
  - `hashText('') === -2128831035`.
- `metadata.test`:
  - `metadataOutcome` table: irrelevant → 'stripped' for every truth; decisive+true → 'consistent'; decisive+false → 'contradiction'; misleading+true → 'contradiction'; misleading+false → 'consistent';
  - over 200 seeds: exactly 1 contradicting field when `contradiction`; all `null` when stripped; 4 fields;
  - reduce: the right field → success; a consistent field → mistakes 1 and struck; 2 mistakes → 'failure'; 'matches' on stripped → mistake; 'noData' on stripped → success.
- `transcript.test`:
  - variant table (decisive+false → absent, decisive+misleading → cut, decisive+true → fair, irrelevant → fair);
  - `lines.length === 4`;
  - `answerLine` is non-null exactly for fair and cut; the absent puzzle contains its decoy;
  - right line → phase 'judge'; right judgement → success; a wrong line twice → failure.
- `crossCheck.test`:
  - the outcome table in 2.3 row by row;
  - `conclude`: 2 agency/newsroom confirms + 3 echoes → confirmed; 1 confirm + 4 echoes → unconfirmed; 1 newsroom deny + 4 junk 'confirms' → denied;
  - for 200 seeds, `conclude(cards) === puzzle.conclusion` and there are 5 cards;
  - one wrong answer → failure.
- `geolocation.test`:
  - 12 tiles with unique pairs;
  - match: `answer === claimed`; otherDistrict: `answer !== claimed` and `tileShows(tiles[answer], photo)`; otherTown: no tile shows the photo and some tile shares one landmark;
  - reduce: wrong tile twice → failure;
  - determinism: the same seed, story and stamp give an equal puzzle.
- `station-models.test`: for every `STATION_KINDS` kind, no vertex with |x|<0.3 and |z|<0.225 lies above `SURFACE_HEIGHT[kind]` + 0.03, and every vertex has |x|,|z| ≤ 0.55.
- `sun.test`: `sunFrame(20,12).half` ≈ {12.65, 10.75} and `sunFrame(24,14).half` ≈ {14.87, 12.42}; the target is (W/2, 0, H/2).
- captions and icon-coverage tests pass automatically through the exhaustive Records.

**e2e** — new `e2e/minigames.spec.ts`
- Opens `/?styleguide` on DESKTOP and at a 640x360 viewport.
- For each new kind it picks the kind in the MinigameBench and asserts:
  - the root testid is visible;
  - every button's bounding box is ≥48×48;
  - there is no horizontal overflow;
  - clicking the `data-answer` target shows the success banner.

**Performance**
- Extend e2e/performance.spec.ts with a case where the host selects endless (10 stations, 24×14) and asserts the same budgets.
- Re-measure and update docs/performance.md.

## 8. Docs
- design-document.pl.md:
  - 4 rows in the 'Stanowiska weryfikacji' table:
    - Mapa | Gdzie zrobiono zdjęcie | Dopasowanie miejsc ze zdjęcia do mapy | Geolokalizacja: mapy i zdjęcia ulic
    - Stenogram | Czy cytat nie jest wycięty | Odszukanie cytatu w pełnym zapisie | Stenogramy, pełne nagrania
    - Inne media | Co podają niezależne redakcje | Odróżnianie relacji od kopii | SIFT „find better coverage”, agencje
    - Metadane | Kiedy, czym i gdzie powstał plik | Porównanie danych pliku z opisem | Odczyt EXIF
  - Campaign table: l5 'Stenogram, Metadane'; l6 'Mapa, Inne media'.
- agents/glossary.md: fix the heading to `StationKind`; add 4 station rows and the terms 'kopia (echo)', 'niezależne źródło', 'dane usunięte (stripped)'.
- agents/game-feel.md: 4 cue rows.
- agents/content-authoring.md: the rules in 3.4.
- docs/implementation-plan.md: the Stage 7 cluster C tasks plus Decision log rows for:
  - the 4 new stations and where they appear;
  - 24×14 maps for l5 and l6, with l6 at 8 stations;
  - stamps max raised to 10;
  - `HINT_ONLY_STATIONS`;
  - the sun light fit;
  - generic seeded minigame pools.
- docs/balance.md: re-run results. docs/performance.md: new numbers.

## 9. Contracts shared with other clusters
1. **stationKindSchema / PROTOCOL_VERSION:** every cluster changes the wire; bump once per release.
2. **ROLE_STATIONS / STATION_FAMILY:** the roles cluster (Ekspertyza families) owns these; values proposed in the open points.
3. **Station bag and level pools (S7-A):**
   - the counting rule for stories decided by one station versus by several;
   - the pool field, which the new stories need in order to be drawn;
   - `endlessStoryPool` must read the pools;
   - adaptive star thresholds.
4. **Difficulty cluster:** a `revealAnswer` prop on `MinigameProps`, and `MINIGAME_TIME_LIMIT_MS` scaling.
5. **Kartoteka stable-seed cluster:** a possible move of `hashText` into shared rng.
6. **Station how-to cluster:** the shape of `pl.minigames.<kind>.purpose` / `howTo` / `keys.touch`.
7. **Mobile HUD / CameraRig cluster:** bigger maps mean more follow-mode scrolling on phones.
8. **Multi-stamp desk:** l6 folders can now carry up to 8 stamps, so the evidence list is longer (DeskOverlay.module.css:82-100).
9. **Versus / spectator split screen:** two 24×14 rooms side by side at 1280x720 will not fit at ≥40 px per tile.
10. **RolePasses `fasterAt`:** it joins full station names, which overflows with 4 stations.


## Contract changes

- packages/shared/src/domain.ts: stationKindSchema adds 'geolocation','transcript','crossCheck','metadata' (wire enum, used by stationSchema.kind and minigameStarted.station); new HINT_ONLY_STATIONS = ['aiScanner'] and isHintOnly(kind)
- packages/shared/src/constants.ts: PROTOCOL_VERSION +1 (coordinate a single bump per release); STATION_WORK_MS += { geolocation: 4000, transcript: 5000, crossCheck: 4000, metadata: 4000 }; new blocks GEOLOCATION_MAX_MISTAKES=2, GEOLOCATION_MAP={columns:4,rows:3}, GEOLOCATION_PROBLEM_CHANCE=0.5, GEOLOCATION_OTHER_DISTRICT_SHARE=0.5, TRANSCRIPT_MAX_MISTAKES=2, TRANSCRIPT_LINES=4, TRANSCRIPT_PROBLEM_CHANCE=0.5, CROSS_CHECK_MAX_MISTAKES=1, CROSS_CHECK_CARDS=5, CROSS_CHECK_CONFIRMATIONS=2, METADATA_MAX_MISTAKES=2, METADATA_FIELDS=4, METADATA_NO_STAMP_WEIGHTS={consistent:0.4,contradiction:0.4,stripped:0.2}; ROLE_STATIONS additions proposed only (owned by roles cluster)
- packages/shared/src/sim/map.ts: FIXTURE_CHARS adds G=geolocation, Q=transcript, X=crossCheck, E=metadata; legend comment updated; fixture ids geolocation-0 etc.
- packages/content/src/schema.ts: storySchema.stamps .max(6) -> .max(STATION_KINDS.length) (10)
- packages/content/src/checks.ts: aiScanner hard-codes replaced by isHintOnly; new layout checks: STATION_SIGN_MIN_GAP_COLUMNS=3 (warning) and unreachable-fixture/spawn BFS (error)
- packages/content/src/endless.ts: ENDLESS_LAYOUT rewritten (24x14, 10 stations, back row I A R Q E, front row P S L G X); ENDLESS_STATIONS = [...STATION_KINDS]; isSolvable uses isHintOnly; endlessStoryPool must include S7-A level pools (shared with cluster A)
- packages/content/levels/l5-deepfake.json: 24x14 layout, stations += transcript, metadata; briefingPoints rewritten
- packages/content/levels/l6-atak.json: 24x14 layout, stations += geolocation, crossCheck (8 total); briefingPoints/briefing rewritten
- packages/content/stories/l5-deepfake.json: +2 stamps on 17 stories, 4 retargets, +4 new stories (7 stamps each); stories/l6-atak.json: +2 stamps on 20 stories, 9 retargets, +5 new stories (8 stamps each); all reviewed:false
- packages/content/techniques/techniques.json: stations/detect updated on 11 cards; new alias 'zdjecie-z-innego-miejsca' on stare-zdjecie-nowy-podpis
- apps/client/src/stations/minigames/types.ts: MinigameRegistry becomes full Record<StationKind, Minigame> (no longer Partial); MinigameProps unchanged here (revealAnswer prop owned by the difficulty cluster)
- apps/client/src/strings/pl.ts: vocab.stations/signs/guidance.stationShort +4 each; new namespaces pl.minigames.geolocation|transcript|crossCheck|metadata (task, reasons, keys incl. touch, purpose, howTo, content pools)
- apps/client/src/fx/cues.ts: new CueIds geolocation.found, geolocation.miss, transcript.find, transcript.right, transcript.miss, crossCheck.right, crossCheck.wrong, metadata.right, metadata.mistake; a11y/captions.ts entries (skip own-action)
- apps/client/src/ui/icons/Icon.tsx: icons 'geolocation','transcript','crossCheck','metadata'; stations/kit.tsx STATION_ICON +4; scene/entities.ts SURFACE_HEIGHT +4 (0.76); scene/station-models.ts BUILDERS +4
- apps/client/src/scene/GameCanvas.tsx: directional light replaced by SunLight (scene/sun.ts sunFrame) inside the per-level group; target = room centre, shadow box fitted to the map
- tools: balance/models.ts MINIGAME_BASE_S/MINIGAME_DIFFICULTY +4; contest/lib/common.ts STATION_PURPOSE/ICON_FOR_STATION +4 and satisfies Record<StationKind>; contest/screenshots.ts +4 shots; content/review-lib.ts STATION_PL +4
- No REST route, DB schema or Drizzle migration changes

## Cluster tasks (superseded by `tasks.md`)

- **S7-C00 — Plan entries and Decision log for the four new stations** (S; depends on —). docs/implementation-plan.md: Stage 7 cluster C task list S7-C01..C16. Decision log rows: four new stations and where they appear; l5/l6 grow to 24x14 and l6 has 8 stations; stamps.max raised to 10; HINT_ONLY_STATIONS (only aiScanner); sun-light shadow fit; generic seeded minigame pools tied to stamp relevance and truth. *Done when:* The plan lists every S7-C task with its id and dependencies, the Decision log rows are in, the commit is chore(plan) and bun run check passes.
- **S7-C01 — Station kinds: shared contract and every compile-enforced map** (M; depends on S7-C00). Shared, content and test changes:
- domain.ts: the 4 new kinds, HINT_ONLY_STATIONS and isHintOnly.
- map.ts: letters G/Q/X/E and the legend.
- constants.ts: STATION_WORK_MS entries and the 4 minigame constant blocks; bump PROTOCOL_VERSION.
- schema.ts: stamps.max(STATION_KINDS.length).
- checks.ts and endless.ts: use isHintOnly.
- Tests: map.test (new fixture ids), protocol.test (new kind accepted), checks.test (10 stamps ok, 11 rejected).

Client and tool maps:
- pl.vocab.stations/signs and guidance.stationShort: final Polish names.
- Icon.tsx: 4 icons; STATION_ICON; SURFACE_HEIGHT.
- BUILDERS: a temporary plainStation(accent) builder, replaced in C02.
- tools/balance/models.ts, contest common.ts (with satisfies Record<StationKind>), review-lib STATION_PL.

Docs:
- agents/glossary.md: the 4 station rows, plus fix the 'StationId' heading to StationKind.
- design-document.pl.md: the 4 station table rows.

No level uses the new kinds yet. *Done when:* bun run check passes, parseLayout maps G/Q/X/E to geolocation-0/transcript-0/crossCheck-0/metadata-0, icon-coverage.test covers 10 stations, and PROTOCOL_VERSION is bumped with its literal asserted in protocol.test.
- **S7-C02 — 3D models for Mapa, Stenogram, Inne media, Metadane** (M; depends on S7-C01). station-models.ts:
- 4 builders (map board with pin, stenotype with highlighted paper strip, newspaper rack with TV, camera with data monitor and tag).
- Remove plainStation.
- Update the header comment.

Tests and review:
- New station-models.test.ts for all 10 kinds: folder area clear above SURFACE_HEIGHT + 0.03, footprint within ±0.55.
- Visual check in /?styleguide icon/scene sections on desktop and at 640x360. *Done when:* Each model is one merged mesh, readable by silhouette from the game camera and distinct from aiScanner; station-models.test passes; bun run check passes.
- **S7-C03 — Minigame evidence helpers and the Metadane minigame** (M; depends on S7-C01). Helper:
- New minigames/evidence.ts: problemFromStamp, hashText (moved and re-exported), shuffled, pick.
- sourceRegistry.logic.ts and dataLibrary.logic.ts use it with identical RNG consumption.

Minigame:
- metadata.logic.ts (metadataOutcome table, generatePuzzle, isRight, reduce), Metadata.tsx, Metadata.module.css (2x2 grid, foot column at ≤430 px), metadata.test.ts.
- pl.minigames.metadata: task, reasons, keys incl. touch, purpose, howTo, pools.

Feedback and registration:
- Cues metadata.right and metadata.mistake, captions, a game-feel.md row.
- Register in index.ts; root carries data-answer. *Done when:* The existing sourceRegistry and dataLibrary tests pass unchanged, the metadata.test literal outcome table and reduce tests pass, the minigame plays in MinigameBench with keyboard, gamepad and touch at 640x360, and bun run check passes.
- **S7-C04 — Stenogram (transcript) minigame** (M; depends on S7-C03). - transcript.logic.ts: variant rule, generatePuzzle with TRANSCRIPT_LINES = 4, and the find and judge phases in reduce.
- Transcript.tsx and CSS: clip card plus 2x2 lines on phones.
- transcript.test.ts.
- pl.minigames.transcript: task, reasons, keys, purpose, howTo, and authored pools (fair ≥6, cut ≥6, absent ≥6 with decoys, filler ≥12, settings ≥4).
- Cues transcript.find, transcript.right and transcript.miss, plus captions and a game-feel row.
- Register in index.ts; data-answer on the root. *Done when:* Unit tests prove exactly one answer line for fair and cut and none for absent, and the phase transitions and failure after 2 mistakes work; the minigame is playable on all three devices at 640x360; bun run check passes.
- **S7-C05 — Inne media (crossCheck) minigame** (M; depends on S7-C03). - crossCheck.logic.ts: isIndependent, conclude, the crossCheckOutcome truth/relevance table, and a generator asserting conclude(cards) === wanted.
- CrossCheck.tsx and CSS: claim strip from story.headline, 3+2 card grid, 3 answers in the right column on phones, 'kopia' reveal after the round.
- crossCheck.test.ts.
- pl.minigames.crossCheck: outlets, lines, answers, reasons, keys, purpose, howTo.
- Cues crossCheck.right and crossCheck.wrong, plus captions and a game-feel row.
- Register in index.ts. *Done when:* The literal outcome table and conclude cases pass, 200 seeds give consistent conclusions with 5 cards, one wrong answer fails, the minigame is playable on all devices at 640x360, and bun run check passes.
- **S7-C06 — Mapa (geolocation) minigame with landmark glyphs** (L; depends on S7-C03). - geolocation.logic.ts: unique landmark pairs, claimed tile, the match/otherDistrict/otherTown generator, reduce.
- landmarks.tsx: 10 token-only SVG silhouettes.
- Geolocation.tsx and CSS: paper-cut photo with caption chip, 4x3 district grid, 'Nie ma na mapie' button.
- geolocation.test.ts.
- pl.minigames.geolocation: districts (≤9 characters each), landmark names, keys, reasons, purpose, howTo.
- Cues geolocation.found and geolocation.miss, plus captions and a game-feel row.
- Register in index.ts. *Done when:* Unit tests pass (unique pairs, answer semantics per outcome, decoy present for otherTown, failure at 2 mistakes); landmarks are told apart by shape; the minigame is playable at 640x360 with ≥48 px tiles; bun run check passes.
- **S7-C07 — Make the minigame registry complete; e2e and contest shots** (S; depends on S7-C04, S7-C05, S7-C06). - MinigameRegistry becomes a full Record<StationKind, Minigame>.
- New e2e/minigames.spec.ts: /?styleguide bench on DESKTOP and at 640x360 for the 4 kinds, with a touch-target ≥48 px check, a no-overflow check, and a solve via data-answer.
- tools/contest/screenshots.ts: 4 defineShot entries and 4 stationShots rows. *Done when:* Forgetting a minigame is a compile error, the e2e passes in both Playwright projects, and bun run check passes.
- **S7-C08 — Fit the sun light to the room so shadows cover it** (S; depends on —). - New scene/sun.ts: sunFrame(width, height) with SUN_OFFSET, SUN_MARGIN and SUN_TALLEST_PROP.
- New scene/SunLight.tsx: Object3D target at the room centre, shadow camera bounds from sunFrame, mounted inside the per-level group.
- GameCanvas.tsx uses SunLight.
- sun.test.ts with the literal half-extents for 20x12 and 24x14. *Done when:* On the high preset, shadows render over the whole room for l1, l6 and endless (checked in screenshots), the draw-call budget e2e still passes, and bun run check passes.
- **S7-C09 — Layout validation: sign spacing and reachability** (S; depends on —). checks.ts:
- STATION_SIGN_MIN_GAP_COLUMNS = 3: same-row stations closer than 3 columns give a warning.
- BFS from spawn 1 over floor tiles: an unreachable fixture or spawn is an error.

Tests: new __fixtures__/broken.ts cases and checks.test.ts expectations. *Done when:* All current levels and endless validate with no new errors, the fixtures prove one warning and one error, and bun run check passes.
- **S7-C10 — l5 'Głęboka podróbka': 24x14 room with Stenogram and Metadane, plus stamps** (L; depends on S7-C02, S7-C03, S7-C04, S7-C09). Level file (one commit, because the stamps and the level's stations must land together):
- New layout from the design; stations += transcript, metadata; new briefingPoints.

Stories:
- 34 new stamps (Q and E) on all 17 l5 stories, including both bossCall stories.
- Retargets with justifyingStamps and debrief.tool rewrites: wyciety-cytat (decisive moves to transcript), wywiad-radio (+Q), burmistrz-na-jachcie (+E), zdjecie-sprzed-lat (+E).

Docs: the content-authoring.md rules for the new stations; the design doc campaign row for l5. *Done when:* validate:content has 0 errors, every l5 story has stamps for all 7 stations, l5 sign spacing passes, the l5 room plays end to end in 2 tabs without placeholders, and bun run check passes.
- **S7-C11 — l6 'Atak': 24x14 room with Mapa and Inne media, plus stamps** (L; depends on S7-C02, S7-C05, S7-C06, S7-C09). Level file:
- New layout (I A R P back row, S L G X front row); stations += geolocation, crossCheck; briefingPoints and briefing.

Stories:
- 40 new stamps (G and X) on all 20 l6 stories, including events.
- Retargets: demote the second decisive stamp in wyrwany-cytat-radnej, nagranie-zastepcy, apel-mieszkancow, dowoz-seniorow and frekwencja-w-poludnie; add a G or X decisive stamp to fotka-urny, referendum-w-poniedzialek, anonimowa-komisja and autobusy-w-niedziele. Rewrite debrief.tool for each.

Docs: the design doc campaign row for l6. *Done when:* validate:content has 0 errors, every l6 story has 8 stamps, botRaid count ≤ 5 conveyor tiles, the room plays in 2 tabs, and bun run check passes.
- **S7-C12 — l5 new stories for Stenogram and Metadane** (M; depends on S7-C10, S7-A:bag-pool). 4 stories with 7 stamps each, with debrief, technique and realWorld, reviewed:false: l5-cytat-z-sesji, l5-wywiad-skrocony, l5-zdjecie-czytelnika, l5-film-z-montazu. Add them to the l5 pool as S7-A defines it. *Done when:* The l5 pool meets the target for every non-hint station (at least 2 stories it decides alone, at least 3 where it is decisive), checked by the S7-A validator or a new l5-l6-stations.test.ts; 0 validation errors; bun run check passes.
- **S7-C13 — l6 new stories for Mapa, Inne media and Lupa** (M; depends on S7-C11, S7-A:bag-pool). 5 stories with 8 stamps each, reviewed:false: l6-most-zamkniety, l6-kolejka-do-lokalu, l6-agencja-dementuje, l6-relacja-z-debaty, l6-plakat-sprzed-lat. Add them to the l6 pool. *Done when:* The l6 pool meets the decisive targets for all 7 non-hint stations, the true-story share stays within CONTENT_TRUE_STORY_SHARE, and bun run check passes.
- **S7-C14 — Endless mode with all 10 stations** (S; depends on S7-C07, S7-C09). - endless.ts: ENDLESS_LAYOUT for 10 stations at 24x14; ENDLESS_STATIONS = [...STATION_KINDS]; update the comments.
- Tests: content endless.test (10 stations placed) and server rooms/endless.test.ts (STATION_KINDS.length).
- Check that the bag pool includes the new l5 and l6 stories once S7-A lands. *Done when:* Endless starts with 10 stations in a 2-tab manual test, the tests assert 10, and bun run check passes.
- **S7-C15 — Encyclopedia technique cards for the new stations** (S; depends on S7-C10, S7-C11). techniques.json:
- stations and detect texts on 11 cards (≤4 stations each, typography checked);
- alias zdjecie-z-innego-miejsca;
- confirm card-icons needs no change. *Done when:* validateTechniques shows no errors and no new warnings, the encyclopedia renders the new station names and icons on the cards, and bun run check passes.
- **S7-C16 — Balance, performance and contest pass** (M; depends on S7-C12, S7-C13, S7-C14, S7-C08). - bun run balance for l5, l6 and endless with the S7-A bag; update docs/balance.md.
- Extend e2e/performance.spec.ts with an endless case; update docs/performance.md numbers.
- bun run contest:build to regenerate the l5 and l6 maps and the station screenshots; update the screenshots README text to say ten stations. *Done when:* Endless on high stays ≤150 desktop / ≤100 mobile draw calls and ≤100k triangles, balance docs are updated, the contest artefacts are regenerated, and bun run check passes.

## Risks

- Content volume: 142 new stamp texts, 9 new stories and about 13 story retargets (relevance changes and debrief.tool rewrites). Everything is reviewed:false, so the supervisor's S6-02 review load roughly doubles for l5 and l6.
- A new level station and its stamps must land in one commit. checks.ts:199-215 and 341-346 turn either half on its own into a validation error, so tasks C10 and C11 are large, atomic content commits.
- The Stenogram 'cut changes meaning' pairs and the Inne media card lines are subtle Polish copy. A badly authored pair teaches the wrong lesson, so the pools need the same supervisor review as stories.
- Generic seeded puzzles can visibly differ from the story: the clip in the minigame is not the story's own quote, and the map district is not the stamp's district. Existing minigames accept this, but players may notice it more at Stenogram.
- Metadane 'irrelevant' always means stripped metadata. Authors must write matching stamp texts, or the minigame and the stamp contradict each other. The authoring rule and supervisor review are the only guard.
- Inne media 'unconfirmed' on a true story (an irrelevant or misleading stamp) can push players toward rejecting a true story. This is intended as the 'no coverage is not proof of falsehood' lesson, but it must be explained in the debrief and howTo.
- Bigger maps (24x14): fit mode holds at a full 1280x720 viewport (44.7 px tiles), but laptops with browser chrome (about 633 px viewport) drop to follow mode. On phones the camera scrolls more, and front-row stations (row 10) sit near the touch controls.
- In endless, l1-l4 stories have no stamps at the 4 new stations. Players can waste a full minigame that yields no stamp (an existing rule, now 4 stations more likely to happen).
- The station bag needs stories that only one station decides. Demoting a second decisive stamp on 5 l6 stories changes their solving paths and their balance numbers in docs/balance.md.
- The PROTOCOL_VERSION bump means clients and server must deploy together; several clusters bump in the same release.
- The shadow fix changes how every level looks on the high preset: more shadowed casters and slightly more shadow-pass work. The draw-call budget needs re-measuring.
- RolePasses and contest role cards join full station names from ROLE_STATIONS. If the roles cluster adds the new stations to ROLE_STATIONS, the text overflows at 640x360 unless it switches to family labels.
- l6 folders can carry up to 8 stamps. The desk evidence list (DeskOverlay) and the folder sheet get long on phones, and the multi-stamp multi-select from S7-A makes this worse.
- The l6 back wall is crowded with conveyor plus 4 stations, so decor falls back to signReach 0 (decor-layout.ts:57-60). The endless back wall has no free decor columns at all.

## Open points (defaults chosen)

- Should l6 keep Stenogram and Metadane from l5? Default: no. l6 = 6 old stations + Mapa + Inne media (8 stamps per story). Only endless has all 10.
- Map letters: default G = Mapa (geolocation), Q = Stenogram (quote/transcript), X = Inne media (crossCheck), E = Metadane (EXIF/metadata).
- Polish names: default vocab.stations 'Mapa' / 'Stenogram' / 'Inne media' / 'Metadane'. The one-word 3D signs are 'Mapa' / 'Stenogram' / 'Media' / 'Metadane'.
- ROLE_STATIONS and the families for Ekspertyza are owned by the roles cluster. Proposed: photoEditor [imageSearch, aiScanner, geolocation, metadata]; archivist [archive, transcript, crossCheck]; reporter [phone]. STATION_FAMILY: image = imageSearch, aiScanner, geolocation, metadata; documents = archive, sourceRegistry, dataLibrary, transcript, crossCheck; phone = phone.
- Answer reveal on failure in the new minigames. Default: reveal like dataLibrary, gated by the difficulty cluster's revealAnswer prop (off on Ekspert). The Kartoteka-only no-reveal and no-reroll rules stay with that cluster.
- Puzzle text. Default: generic seeded pools in pl.ts, consistent with stamp relevance and story truth only. A story-specific clip or district (an optional stamp field) is deferred.
- In endless, a station with no stamp for the folder still runs a stamp-less minigame. Default: keep the sim rule (stations.test.ts:325). A follow-up could make such stations refuse work, or show a hint.
- The decisive-count target is ≥2 stories decided by the station alone and ≥3 in total, per station that can decide on its own. Default: follow it unless S7-A's bag rule needs different counts; if so, C12/C13 retune the allocation.
- Second editorial desk on the 24x14 maps. Default: none. Revisit after S7-A's multi-stamp balance run; rows 7-9 have space for another 'DD'.
- Endless room size with 10 stations. Default: stay at 24x14 (dense but fits and keeps the camera untouched). Alternative: 26x14, which still fits at 1280x720 (46.5 / 44.7 px).
- l6 briefingPoints keep 3 lines. Default: bot raid + Mapa + Inne media lines; the correction rule moves into the briefing text.
