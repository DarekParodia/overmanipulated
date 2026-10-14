# Glossary (Polish design doc → English code)

Use these names in code, schemas, file names and docs. Player-facing text stays Polish.

## Core concepts

| Polish (design doc) | English (code) | Notes |
| --- | --- | --- |
| Zgłoszenie | `story` | Content unit: the claim/material to verify (data) |
| Teczka | `folder` | In-world object carrying one story; has position, holder, stamps, deadline |
| Klucz teczki | `spawnKey` | Where a folder came from: `s<scheduleIndex>` or `e<eventIndex>.<waveIndex>`. The same in every newsroom of a match, unlike the per-sim folder id `f<n>` |
| Ziarno rozgrywki | `seed` (`GameState.seed`) | Constant for one level run; minigame seeds are derived from it |
| Ziarno minigry | `minigameSeed` (`minigameSeedFor`, `drawMinigameSeed`) | Derived from (seed, spawnKey, station kind, attempt); the client builds the puzzle from it |
| Podejście | `attempt` (`minigameAttempts`, key `spawnKey:kind`) | Minigame rounds of one station kind on one folder that ended without a stamp (failure or cancel) |
| Ta sama karta | stable-seed station (`MINIGAME_STABLE_SEED_STATIONS`) | `sourceRegistry`: attempts are not counted, so a retry shows the same Kartoteka card |
| Pamięć karty | retry memory (`useRetryMemory`, `stations/minigames/retry-memory.ts`) | Client only, per minigame seed: the circled fields and, after a cancel, the clock left (`remainingMs`, at least `KARTOTEKA_RESUME_MIN_MS`); reset on `gameStarted` |
| Pieczątka | `stamp` | Result of a station on a folder |
| Stanowisko | `station` | Verification workstation with a minigame |
| Stół redakcyjny | `editorialDesk` (`desk`) | Where verdicts are made |
| Taśma (przy wejściu) | `conveyor` | Where new folders spawn |
| Werdykt | `verdict` | `publish` / `reject` / `publishWithContext` |
| Publikuj / Odrzuć / Publikuj z kontekstem | `publish` / `reject` / `publishWithContext` | |
| Wiarygodność | `credibility` | Starts at 100, level lost at 0 |
| Punkty | `score` | |
| Gwiazdki | `stars` | 0–3 |
| Waga: zwykły / ważny / pilny | `priority`: `normal` / `important` / `urgent` | |
| Licznik czasu | `deadline` / `timeLeftMs` | |
| Premia za tempo | `speedBonus` | Balance value `SCORE.speedBonus`; on a folder result it is `bonuses.speed` |
| Premie | `bonuses` (`speed`, `multiStamp`, `bossCall`) | Points on top of a folder's base points; base = `scoreDelta − Σ bonuses` |
| Premia za komplet dowodów | `multiStampBonus` | Balance value `SCORE.multiStampBonus`, paid per proof beyond the first; on a folder result it is `bonuses.multiStamp` |
| Teczka z kilkoma dowodami | multi-stamp folder | Its story has `requiredStamps` > 1; spawns with `MULTI_STAMP_EXTRA_DEADLINE_MS` more per extra proof (`multiStampExtraMs`), schedule and event folders alike; content warns before level `MULTI_STAMP_FIRST_LEVEL` |
| Przeterminowane | `expired` | |
| Wynik teczki | `folderResult` (`FolderResult`) | Outcome, reason, deltas, cited stamps and bonuses of one folder |
| Powód wyniku | `reason` (`FolderReason`) | Why a folder ended the way it did; 14 values, each belongs to one outcome. Its title `pl.outcome.title[reason]` is shared by the toast, the desk and the Kolegium |
| Niedokończona (nie zdążyliście) | `unfinished` | Folder still in play when the level ends; 0 points |
| Słaby dowód | `weakProof` | Reason: a cited stamp is not valid proof; half points |
| Za mało dowodów | `incompleteProof` | Reason: fewer countable proofs than required, e.g. only the AI scanner cited; half points |
| Wskazane dowody | `justifyingStampIds` | Stamps cited at the desk with a verdict (1–3) |
| Wymagane dowody | `requiredStamps` | Distinct justifying, non-hint stamps a story needs; 1 unless set |
| Rozwiązywalna historia | solvable story (`proofCount`) | The level's stations give at least `requiredStamps` proofs: `proofCount(story, stations)` counts distinct justifying, non-hint stamps from those stations; checked by `checkStoryFitsLevel` and endless `isSolvable` |
| Stanowisko-podpowiedź | hint-only station (`HINT_ONLY_STATIONS`, `isHintOnly`) | `aiScanner`: its stamp may justify, but never counts as proof (`countsAsProof`) |
| Stanowisko rozstrzygające (Rozstrzyga) | deciding station (`decidingStations`, S7-20) | A station on the level's map with a justifying, non-hint stamp of the story; the desk result names it after „Rozstrzyga:” |
| Linie wyniku werdyktu | `deskResultLines` (`DeskResultLine`) | At most two lines under the desk result: `proof`, `weakProof`, `tooFewProofs`, `hintOnly`, `decidedBy`, `correctVerdict`, `proofInFolder`, `notChecked`; the same on every difficulty |
| Wybór dowodów | evidence pick (`toggleEvidence`, `verdictReady`, `evidenceShortfall` in `stations/desk-model.ts`) | Stamps cited at the desk: one replaces the other for a one-proof story; up to N toggled, in order, for a multi-stamp folder; the verdict opens at `min(N, collected)` |
| Za mało dowodów (na stole) | `evidenceShortfall` | The folder holds fewer stamps than its story needs proofs; the desk shows an amber line and still allows the verdict |
| Znaczek dowodów | evidence badge (`evidenceBadge`) | Chip on a multi-stamp folder card: „k/N” proofs with hints on, „×N” without |
| Zebrane dowody | `justifyingCount` (`hasEnoughProofs`) | Distinct stamps on a folder that count as proof; guidance sends the folder to the desk once it reaches `requiredStamps` |
| Powód porażki | `lossReason` (`credibility` / `score`) | Why a level was lost; null when won |
| Progi gwiazdek | `starThresholds` | Scores for two and three stars, sent with `levelEnd` |
| Udziały gwiazdek | `STAR_SHARES` (level override `starShares`) | Star thresholds of a generated run as shares of its `maxScore`, rounded to `STAR_THRESHOLD_STEP` |
| Worek stanowisk | station bag (`bag`, constants `BAG_*`) | Run generation: folders are dealt in shuffled rounds over the stations that decide the level's stories |
| Stanowisko rozstrzygające | deciding station (`decidingStations`) | A station decides a story when the story has a justifying, non-hint stamp from it (`proofCount`); a decisive stamp that does not justify decides nothing. The one rule for the bag, validation and guidance |
| Stanowiska worka | bag stations (`bagStations`) | The level stations that decide at least one pool story |
| Historia przypięta / elastyczna | pinned / flex story (`isPinned`, `pinnedCounts`) | Pinned: exactly one deciding station and one required proof. Every other decidable story is flex; multi-stamp stories are always flex |
| Losowanie z worka | `bagDrawer` | Whole shuffled rounds over a list, never the same item twice in a row; deals the station sequence and endless stories |
| Kolejka stanowisk | station sequence (`stationSequence`) | The station designated for each folder slot of a run: whole shuffled rounds over the bag stations |
| Terminy teczek w worku | slot times (`bagSlotTimes`) | `firstAtS + i × gapS × spawnGapFactor` up to `lastSpawnS`, rounded to 0.1 s; harder difficulties get more slots |
| Dobór historii | story matching (`matchStories`, `assignStories`) | Distinct pool stories for the slots, each decidable at its slot's station (Kuhn's maximum matching with opening and multi-stamp preferences); `assignStories` fills what the pool cannot cover with the least-used story |
| Pula historii | pool (`bag.pool`, `levelBagSchema`) | The stories a bag level may deal onto the conveyor; event stories stay in `events` |
| Plik poziomu / poziom rozwiązany | level file (`LevelFile`, `levelFileSchema`) / resolved level (`Level`, `levelSchema`) | A file has a `schedule` with `stars` or a `bag`; a resolved level always has a schedule and stars (bag levels keep their `bag`) |
| Podgląd poziomu z workiem | bag preview (`resolveLevel`, `BAG_PREVIEW_SEED`) | The Normal run `LEVELS` and `getLevel` serve for a bag level (lobby, briefing, tools) |
| Rozgrywka (przygotowana) | prepared run (`prepareRun`, `prepareLevelRun`, `PreparedRun`) | The level a room plays for one run seed and difficulty: dealt schedule, deadlines, stars, stories, `maxScore` |
| Ziarno rozgrywki | run seed (`RunOptions.seed`) | Picks the dealt stations and stories; drawn by the server per briefing, separate from the sim seed |
| Podsumowanie rozgrywki | run summary (`runSummary`, `RunSummary`) | `{folders, maxScore, stars}` of a prepared run; stars null in endless; `roomState.run` from the briefing through the results, null in the lobby |
| Stanowisko z worka (teczki) | bag station (`folder.bagStation`, schedule entry `station`) | The station the bag slot designated for a dealt folder, copied from its schedule entry at spawn; absent on event folders and authored schedules. Guidance names it first among the stations it would suggest anyway (S7-24) |
| Rozdanie z worka | `generateBagLevel` (`bagDeadlineS`) | One run of a bag level: slot times, station sequence, matched stories, scaled and clamped deadlines, stars from the run maximum |
| Skalowanie terminów | `scaledDeadlineS`, `applyDifficulty` | Deadline × `deadlineFactor`, rounded to whole seconds (Normal unchanged); `applyDifficulty` scales a fixed schedule's deadlines only |
| Historie poziomu | `levelStoryIds` | The pool of a bag level, otherwise the scheduled ids; never event stories |
| Talia stanowiska (tryb nieskończony) | station deck (`endlessDecks`) | Endless stories one station can decide; each endless slot draws from its station's deck with `bagDrawer`; should hold at least `ENDLESS_MIN_DECK` (validator warning) |
| Obciążenie stanowisk | station load (`stationBusyShare`, `loadSpread` in `tools/balance`) | Balance harness: share of level time each station holds a folder or an operator, and the busiest / least busy ratio (the M2 exit measure) |
| Stanowisko dominujące | dominant station (`dominantStation`, `DOMINANT_BUSY_SHARE`, `DOMINANT_SPREAD`) | Balance harness: a station busy over half the level and over twice the least busy one for an average crew of 3 or 4; the duplicate-station rule (S7-35) adds a second copy only for such a station |
| Najlepszy możliwy wynik | `maxScore` | Score of a perfect team on the level, sent with `levelEnd` |
| Za co punkty (podsumowanie punktów) | `resultTotals` (`TotalsRow`) | Results-screen totals: outcome rows with base points and credibility (`correct`, `correction`, `weakProof`, `wrong`, `expired`, `unfinished`), bonus rows (`speed`, `proofs` = multi-stamp, `bossCall`), and an `other` row („Inne”) for results the server capped; Σ rows = Σ `scoreDelta` |
| Do następnej gwiazdki | `starProgress` (`StarProgress`) | Next star and missing points of a won level, plus thresholds as shares of `maxScore` |
| Karta Kolegium | `kolegiumCards` (`KolegiumCard`) | One debrief card per folder (campaign, versus); in endless one per story with `count` („×N”), `tally` per outcome and summed points. Folders still in play at the end (`unfinished`) come last, with the hourglass |
| Uzasadnienie wyniku (karta Kolegium) | `cardWhy` (`pl.outcome.why`) | The Kolegium card's one-line reason: why the folder ended that way, its base points and the bonus suffixes („tempo”, „dowody”, „szef”); a grouped endless card lists its folders per outcome |
| Dowód, który rozstrzygał | `proof` (`ProofRow`, `ProofStatus`) | Kolegium section on a folder that did not end `correct`: the story's justifying, non-hint stamps with where each was — „wskazany” (`cited`), „w teczce” (`collected`), „nie sprawdzono” (`missing`) |
| Kolejność odsłaniania | `revealPlan` (`RevealStep`) | Results reveal timing: stars → progress line → totals rows → Kolegium marks |
| Podsumowanie (wyniki) | `ResultsSummary` (`summaryPage`) | Results summary: stars with what each takes (`starRule`), the progress line (`toNext` / `allStars` / `starsNeedWin`), „Skąd te progi?” and the „Za co punkty” table; the left column on desktop, the Kolegium's first page on phones |
| Następna teczka | `nextFolder` (`NextFolder`, `nextScheduledSpawn`) | Next scheduled folder in the snapshot: `{atMs, sinceMs}` (due time, previous due time), null when the schedule is used up; event folders are never announced. Shown as the dashed ghost card in a free queue slot (`queueView` ghost `'next'`, `pl.hud.next`) and as the conveyor sign's blue ring with „za N s” (`conveyorIndicator` kind `'incoming'`) |
| Taśma pełna | `conveyorFull` (`conveyorBlocked`) | Snapshot flag: a scheduled folder is due but waits, because every conveyor tile holds a folder. The ghost card (`'full'`) and the conveyor sign („Pełna”, kind `'full'`) turn orange; cue `folder.beltFull` on the rising edge |
| Status prawdziwości | `truth` | |
| Prawda / Fałsz / Zwodnicze / Satyra / Niepotwierdzalne | `true` / `false` / `misleading` / `satire` / `unverifiable` | |
| Poziom | `level` | |
| Kampania | `campaign` | |
| Tryb nieskończony | `endlessMode` | |
| Pokój, kod pokoju | `room`, `roomCode` | |
| Pas HUD | `hudBand` (`hud/hud-band.ts`: `bandBottom`, `useHudBand`, `useHudBandMeasure`; CSS `--hud-band`, `--hud-pill-right`) | How far down the top-of-screen HUD reaches: the lowest edge of the elements marked `data-hud-band` (pill, folder queue, menu button, endless tempo chip) that start in the upper half of the screen, capped at `HUD_BAND_MAX_SHARE` of its height. Captions, event banners and verdict toasts start under it; the follow camera frames the room below it (S7-12) |
| Kadr kamery (cała redakcja / za graczem) | `framing` (`scene/camera-framing.ts`: `computeFraming`, `placeCamera`; fit mode / follow mode) | How the angled camera frames the room: the whole room when its tiles would be at least `MIN_TILE_PX` (40 px), otherwise it follows the local player, clamped to the room and framed under the HUD band with a view offset of half the band (S7-12) |
| Menu gry | `gameMenu` (`hud/GameMenu.tsx`, `GameMenuButton.tsx`, `useGameMenu`, `pl.gameMenu`) | The in-game menu: one top-right button (Esc, Start) opening a sheet with „Wróć do gry”, settings, fullscreen, room code and „Wyjdź z redakcji” (two presses within `LEAVE_CONFIRM_MS`). Replaces the tool buttons and the room chip |
| Pauza | `paused` (snapshot, `GameStore.paused`), lobby action `setPaused` | A solo player's open menu holds the level: the registry skips stepping the room. Only while playing with exactly one connected player; anyone joining or reconnecting clears it. With teammates the menu shows „Gra trwa dalej” and nothing pauses |
| Gospodarz | `host` | |
| Pseudonim | `nickname` | |
| Gotowość | `ready` | |
| Sygnał (Q) | `ping` | Quick team signal |
| Briefing redakcyjny | `briefing` | |
| Kolegium redakcyjne | `debrief` | Post-level summary screen |
| Wpadka dnia | `blunderOfTheDay` | Debrief vote |
| Encyklopedia technik | `encyclopedia` | Unlockable technique/tool cards |
| Technika manipulacji | `technique` | |
| Nowe Brzegi | Nowe Brzegi | Proper name, not translated |

## Story types (`StoryType`)

| Polish | English |
| --- | --- |
| zdjęcie | `photo` |
| cytat | `quote` |
| post | `post` |
| nagranie | `recording` |
| statystyka | `statistic` |
| artykuł | `article` |

## Stations (`StationKind`)

`stationKindSchema` / `STATION_KINDS`. Layout letters in `sim/map.ts`: `I A R P S L` and, from
Stage 7 (S7-48), `G Q X E`. The one-word 3D sign is `pl.vocab.signs`, the hint name
`pl.guidance.stationShort`.

| Polish | English | Real-world analogue |
| --- | --- | --- |
| Lupa obrazu | `imageSearch` | Reverse image search |
| Archiwum | `archive` | Wayback Machine, metadata |
| Kartoteka źródeł | `sourceRegistry` | Domain/account checks, lateral reading |
| Telefon | `phone` | Contacting the original source |
| Skaner AI | `aiScanner` | AI/edit detectors |
| Biblioteka danych | `dataLibrary` | Official statistics, source reports |
| Mapa | `geolocation` (letter `G`) | Geolocation with maps and street imagery |
| Stenogram | `transcript` (letter `Q`, for quote) | Full transcripts and recordings of statements |
| Inne media (sign: Media) | `crossCheck` (letter `X`) | SIFT „find better coverage”, news agencies, lateral reading |
| Metadane | `metadata` (letter `E`, for EXIF) | Reading EXIF / file metadata; platforms strip it |

Minigame evidence terms (`stations/minigames/evidence.ts`, `metadata.logic.ts`, `transcript.logic.ts`, `geolocation.logic.ts`, `crossCheck.logic.ts`):

| Polish | English | Notes |
| --- | --- | --- |
| Problem na stanowisku | `problemFromStamp(story, stamp)` | Whether a station's puzzle shows a problem: decisive stamp → the story is untrue; misleading → the story is true; irrelevant → no; no stamp → `null` (the minigame rolls its own chance). Shared by every minigame from S7-52 |
| Opis w teczce / Dane pliku | `MetadataPuzzle.claim` / `MetadataPuzzle.file` | Metadane: what the folder says about a file (when, device, editing, place) / the file's own four fields (`METADATA_FIELD_IDS`: `taken`, `device`, `software`, `place`) |
| Sprzeczność | `contradiction` (`MetadataOutcome`) | Exactly one file field contradicts the description |
| Zgadza się | `consistent` (`MetadataOutcome`; answer `matches`) | No field contradicts the description |
| Dane usunięte (Brak danych) | `stripped` (`MetadataOutcome`; answer `noData`) | A social site stripped the file data; missing data proves nothing. An irrelevant Metadane stamp always means this |
| Cytat w teczce / Pełny zapis | `TranscriptPuzzle.clip` / `TranscriptPuzzle.lines` | Stenogram: the quote in the folder / the full record of what was said (`TRANSCRIPT_LINES` numbered lines, with a setting chip) |
| Skrót (Sens ten sam) | `fair` (`TranscriptVariant`; judgement `same`) | The clip leaves out only filler; the meaning holds |
| Wycięty cytat (Sens zmieniony) | `cut` (`TranscriptVariant`; judgement `changed`) | The left-out words were the point; the cut flips the meaning. The cut words are `cutWords(line, clip)` |
| Nie ma w zapisie | `absent` (`TranscriptVariant`; action `notInTranscript`) | Nobody said the clip; a decoy line shares its words but says something else |
| Szukanie / Ocena | `Phase`: `find` / `judge` | Stenogram's two phases: find the clip's line, then judge the cut |
| Podpis / Dzielnica / Obiekt | `GeoPuzzle.claimed` / `MapTile` (`district`) / `Landmark` | Mapa: the district the photo's caption names / one of the 12 districts of the town map (`GEOLOCATION_MAP`, 4×3), each with a unique pair of landmarks / one of the ten landmark glyphs (`LANDMARKS`, `landmarks.tsx`), told apart by shape alone |
| Zgodne miejsce / Inna dzielnica / Inne miasto (Nie ma na mapie) | `match` / `otherDistrict` / `otherTown` (`GeoOutcome`; answer `NOT_HERE` for `otherTown`) | Mapa: the photo is from the captioned district / from another district on the map / from off the map; an off-map photo shares one landmark with a district (a decoy) |
| Relacja (agencja, redakcja, satyra, anonim, portal-klon) | `CoverageCard` (`OutletKind`: `agency`, `newsroom`, `satire`, `anonymous`, `junk`) | Inne media: what another outlet says about the folder's claim, with its stance (`confirms`, `denies`, `echoes`) and source line |
| Kopia (pisze to samo, za: …) | `echoes` (`Stance`) | Repeats someone else's post: looks exactly like a confirmation, counts for nothing; gets the „kopia” stamp after the round |
| Niezależne źródło | `isIndependent(card)` | An agency or newsroom card with its own reporter (not an echo). Only these count |
| Potwierdzają / Zaprzeczają / Za mało źródeł | `confirmed` / `denied` / `unconfirmed` (`Conclusion`, `conclude(cards)`) | Any independent denial → denied; ≥ `CROSS_CHECK_CONFIRMATIONS` (2) independent confirmations → confirmed; else unconfirmed |

## Roles (`RoleId`)

Passives and abilities live in `ROLE_PERKS` (`RolePerk`, S7-36): `fasterAt` × `workFactor` is the
passive, `ability` the active one (R / RB / the fourth touch button).

| Polish | English | Bonus (passive) | Ability |
| --- | --- | --- | --- |
| Fotoedytor | `photoEditor` | `imageSearch`, `aiScanner`, `geolocation` and `metadata` 40% faster | Ekspertyza (`image` family) |
| Archiwista | `archivist` | `archive` and `transcript` 40% faster | Ekspertyza (`documents` family) |
| Reporter | `reporter` | `phone` and `crossCheck` 40% faster; skips the `phone` queue | Telefon z terenu |
| Redaktor prowadzący | `managingEditor` | — | Przedłużenie |
| Wszechstronny | `generalist` | Every station 20% faster (`workFactor` 0.8) | Druga szansa |
| Ratownik | `rescuer` | Koło ratunkowe: once per level (`rescuesPerLevel` 1) | Podaj teczkę |

| Polish | English | Notes |
| --- | --- | --- |
| Premia (roli) | passive (`RoleSummary.passive`, `pl.lobbyRoles.passiveLabel`) | A role's always-on bonus; „Bez premii” for a role without one or without a role |
| Przepustki ról | role passes (`RolePasses`, `data-testid="role-pass-<role>"`) | The lobby's 7 native radios (6 roles + „Bez roli”), with the marks of the teammates who picked each (`role-pass-dots`) |
| Panel roli | role detail panel (`data-testid="role-detail"`, `roleSummary`, `roleSummaryNote`) | Under the passes: the checked (or hovered / pad-focused) role's passive with its stations on the level, the ability with the device's key and cooldown, and „Ta premia / Ta zdolność nie działa na tym poziomie.” when a perk does nothing there |

## Abilities (`Ability`, Stage 7)

| Polish | English | Notes |
| --- | --- | --- |
| Zdolność (roli) | ability (`abilitySchema`, `ABILITY`, `abilityOf`) | A role's active power, sent as the target-free `useAbility` command; the server resolves the target |
| Odnowienie | cooldown (`ABILITY[a].cooldownMs`, `abilityReadyAtMs`) | Time until the ability is ready again; starts when the effect happens, not when armed |
| Uzbrojona | armed (`abilityArmed`, stage `armed`) | Ekspertyza and Druga szansa wait for their trigger; a second press disarms |
| Ekspertyza | `expertise` (`expertiseCovers`) | Solves the running minigame at a station of the role's family at once; armed, it stamps when the next covered hold ends instead of opening the minigame. Stamps with `via: 'expertise'` |
| Telefon z terenu | `fieldCall` (`FieldCall`) | The carried folder gets its phone stamp after a call while walking |
| Przedłużenie | `extendDeadline` (`pickExtendTarget`, `extendFolders`) | +20 s for an auto-picked folder: the carried one, else the one on the operated desk, else the most urgent; a botRaid wave moves together. Recorded in `extendedMs`; the speed bonus ignores the added time |
| Druga szansa | `secondChance` | At a locked station (faced, or nearest within 2.5 tiles) the minigame reopens at once for the presser; armed, the next failed minigame reopens for the same operator. No lockout and no re-hold |
| Podaj teczkę | `passFolder` (`pickPassTarget`) | The carried folder goes at once to the nearest free teammate within 6 tiles: connected (not in `SimContext.absent`), empty-handed, at no station or desk; ties by join order |
| Koło ratunkowe | `rescue` (passive; `rescuesLeft`, `RESCUE_ADD_MS`, `folderRescued`) | A folder that reaches its deadline in the rescuer's hands gets +20 s, once per level |
| Podgląd zdolności | ability preview (`abilityPreview`, `AbilityPreview`, `AbilityView`, `AbilityEnv`) | What a press would do now (`none`, `calling`, `armed`, `cooling`, `blocked`, `arm`, `now` with its target); one function for the sim, the HUD and the bots |
| Etap zdolności | ability stage (`abilityStageSchema`) | `armed`, `disarmed`, `started`, `done`, `cancelled` in the `ability` event |
| Stan zdolności załogi | crew ability state (`AbilityState`, `snapshot.crew`, `crewSnapshot`) | `abilityReadyAtMs`, `abilityArmed`, `fieldCall`, `rescuesLeft` per player |
| Użycie zdolności | ability press (`KEY_BINDINGS.ability` R, `PAD.rb` RB, `touchInput.pressAbility`, nav intent `ability`, `abilityPressOutcome`) | One press sends `useAbility`, or is refused on the client with the `ability.denied` cue when the shared preview says it does nothing (no role, cooling, blocked, a call running) |
| Żeton zdolności | ability chip (`AbilityChip`, `abilityChipModel`, `data-testid="hud-ability"`) | Bottom-left HUD chip on keyboard and gamepad: ring, key cap, one-word name, status (`ready`, `armed`, `calling`, `cooling`, `blocked`) |
| Przycisk zdolności | ability button (`AbilityButton`, grid area `ability`, `data-testid="touch-ability"`) | The 4th thumb button on touch; same ring and states as the chip, shown only with a role |
| Cel zdolności | ability target (`AbilityTarget`, `abilityTargetFolder`, `abilityTargetName`, `data-ability-target`) | What a ready press would act on: the folder card gets a dashed blue outline, a teammate or station is named on the chip |
| Pierścień postępu | progress ring (`ui/ProgressRing`, `RingTone`) | The round fill shared by the work prompt and the ability chip / button |
| Podpowiedź zdolności | ability hint (next step kind `ability`, `NextStepAbility`, `abilityHintKey`) | The hint bubble names a ready press that helps now: Przedłużenie for a warned folder in hand („R: +20 s dla teczki”), Telefon z terenu instead of the walk to the phone, Druga szansa at a locked station; the key is R / RB or the touch button's label in quotes; hidden with the other hints on Ekspert |
| Krok zdolności | tutorial ability step (`'ability'`, `ABILITY_STEP`, signal `abilityUsed`, `skipAbilityStep`) | The 6th tutorial step: the role icon and „R: Ekspertyza – …”; done by the local `ability` event (armed, started, done); skipped without a role, on a level where the ability cannot act (`abilityStepApplies`: Ekspertyza without its family's station, Telefon z terenu without a phone, Podaj teczkę without a connected teammate) or when the ability was used earlier in the run |
| Źródło pieczątki | stamp source (`stampSourceSchema`, `stampApplied.via`) | `minigame`, `expertise` or `fieldCall` |
| Znacznik zdolności | ability marker (`abilities/AbilityMarkers.tsx`, `abilityMarkers`, `AbilityMarker`, `data-testid="ability-marker"`) | World marker beside a player (hip height, clear of the name tag): `armed` (blue ring with the ability icon) or `call` (phone in a draining orange ring); `passTarget` is the dashed floor ring under the teammate the local Ratownik's Podaj teczkę would reach (S7-42) |
| Lot teczki | pass arc (`passArcPoint`, `PASS_ARC_LIFT`, `ABILITY.passFolder.flightMs`) | The cosmetic 450 ms arc of a folder handed over with Podaj teczkę; in the simulation it is in the receiver's hands at once |
| Reakcja na zdolność | ability reaction (`abilityReaction`, `ABILITY_CLIPS`: `abilityPower`, `abilityThrow`, `abilityCall`; `stopUpper`) | The upper-body clip an avatar plays for its own ability event (and the receiver's catch) |

## Station families (`StationFamily`, Stage 7)

`STATION_FAMILY` maps every station kind (`familyStations(family)` lists them back); families only gate Ekspertyza.

| Polish | English | Stations |
| --- | --- | --- |
| Obraz | `image` | `imageSearch`, `aiScanner`, `geolocation`, `metadata` |
| Dokumenty | `documents` | `archive`, `dataLibrary`, `transcript` |
| Źródła | `sources` | `sourceRegistry`, `phone`, `crossCheck` |

## Random events (`EventKind`)

| Polish | English |
| --- | --- |
| „To już wszędzie jest!” | `viral` |
| Telefon od szefa | `bossCall` |
| Nalot botów | `botRaid` |
| Awaria | `outage` |
| Sprostowanie | `correction` |

## Difficulty (`Difficulty`)

| Polish | English | Notes |
| --- | --- | --- |
| Poziom trudności | `difficulty` | Set per room (default `DEFAULT_DIFFICULTY`) by the host in the lobby (`setDifficulty`, resets ready); picks one `DIFFICULTY` preset; on `roomState` and `levelEnd` |
| Łatwy / Normalny / Trudny / Ekspert | `easy` / `normal` / `hard` / `expert` | `DIFFICULTIES`, easiest first; every Normal factor is 1 |
| Wybór poziomu trudności | `DifficultyPicker` | The host's four chips in the lobby (S7-25); guests see the read-only „Poziom: …” chip on the level card |
| To wydanie (briefing) | `briefingRun` (`BriefingRun`) | The briefing's run line: dealt folders, the two- and three-star thresholds and the share rule (thresholds as whole percent of the run's `maxScore`) |
| Ustawienia poziomu trudności | `DifficultyPreset` | Factors for deadlines, spawn gap, work time, lockout, penalties and minigame time; extra mistakes; hints; answer reveal |
| Strojenie symulacji | `SimTuning` (`simTuning`, `NORMAL_TUNING`) | The preset part the simulation applies: work time, lockout, penalties |
| Limit pomyłek | `mistakeLimit` | Mistakes a minigame allows on a difficulty; never below `MINIGAME_MIN_MISTAKES` |
| Blokada stanowiska | lockout (`failLockoutMs`, `tunedLockoutMs`) | How long a failed minigame blocks its station; announced in `minigameFailed.lockoutMs` |
| Skalowanie kar | `scalePenalty` (`penaltyFactor`) | Wrong-verdict, expiry and correction penalties × the factor, halves rounded away from zero; rewards are never scaled |
| Utrata / odzysk przy sprostowaniu | `correctionLoss` / `correctionRecover` | Credibility a correction costs (scaled) and the share of it a filed correction gives back |
| Limit czasu minigry | `minigameTimeLimitMs` | Time for one minigame attempt; running out is a failure |
| Drabinka trudności | difficulty ladder (`monotonicChecks`, `difficultyChecks`, `DIFFICULTY_TARGETS` in `tools/balance/report.ts`) | Balance checks: the average crew of 3 never wins more, scores a larger share or (endless) lasts longer on a harder difficulty; per-difficulty targets in docs/balance.md |
| Zasady rundy minigry | round rules (`roundRules`, `RoundRules`) | What the room's difficulty gives one minigame round on the client: `difficulty` (for the mistake limit), `timeLimitMs` and `revealOnFail`; passed in `MinigameProps` |
| Pokazanie odpowiedzi po porażce | answer reveal (`revealOnFail`, `revealsOnFail`) | A failed round shows the right answer (cell, result, card or reading); off on Ekspert and at stations that keep their card (`MINIGAME_STABLE_SEED_STATIONS`) |
| Podpowiedzi (efektywne) | effective hints (`effectiveHints`, `useEffectiveHints`) | The „co dalej” hints the game shows: the player setting AND `DIFFICULTY[d].hints`, so none on Ekspert; drives the hint bubble, scene markers and the evidence badge; the tutorial is unaffected |

## Screens (`ScreenId`)

| Polish | English |
| --- | --- |
| Menu główne | `mainMenu` |
| Lobby | `lobby` |
| Wybór poziomu | `levelSelect` |
| Briefing | `briefing` |
| Rozgrywka | `game` |
| Minigra stanowiska | `stationOverlay` |
| Stół redakcyjny | `deskOverlay` |
| Kolegium redakcyjne | `debrief` |
| Encyklopedia technik | `encyclopedia` |
| Ustawienia | `settings` |

## Client / game feel

| Term | Code | Notes |
| --- | --- | --- |
| Feedback cue | `cue`, `CueId` | Named feedback event mapped to animation/sound/particles in `fx/cues.ts` |
| Quality preset | `qualityPreset`: `low` / `medium` / `high` | |
| Reduced motion | `reducedMotion` | Setting; disables shake/squash, fewer particles |
| No-flash mode | `noFlash` | Setting; no blinking/strobing |
| Virtual joystick | `touchJoystick` | Touch movement control |
| Input device | `inputDevice`: `keyboard` / `gamepad` / `touch` | Last used device drives prompts |
| Key hints | `KeyHints` (`pl.minigames.<kind>.keys`) | Key-cap chips under a minigame for the device in use; on touch they name the gesture („Stuknij”, „Przesuń”) or the button |
| Station help (Pomoc stanowiska) | `stationHelp` (`pl.stationHelp.kinds[kind]`) | Per station: `purpose`, `proves`, 2–3 `steps` per device, `realWorld`; one source for the help card (`StationHelpCard`, variants `inPlay` / `full`), practice, lobby details and contest legends |
| Jak grać (how to play) | `howToPlay`: `HowToPlayDialog`, `useHowTo` (`howto/store.ts`), `HowToTab`: `intro` / `stations` / `controls` | The lazy help dialog: Wprowadzenie, Stanowiska, Sterowanie; opened from the main menu corner, the lobby and the settings (Sterowanie) |
| Dodatki (bundle) | extras route (`EXTRAS_SOURCES`, `extrasGraph`, `BUDGET.extrasMax`; `tools/perf/check-bundle.ts`) | Lazy chunks of `src/intro`, `src/howto`, `src/about`, `src/profile` and the intro voice; measured apart from menu and game, 1 MB gzip guard |
| Polish plural | `pluralPl(n, one, few, many)` | Polish noun form for a count (`strings/plural.ts`) |
| Audio bus | `AudioBus`: `music` / `sfx` / `ui` / `voice` | Each bus has its own volume slider; effective volume is `busVolume(settings, bus)` (`fx/audio/mix.ts`) |
| Lektor (intro voiceover) | `voice` bus, `voiceVolume`, `fx/audio/voice.ts` (`loadVoice`, `playVoice`, `voiceStatus`) | Narrator lines of the intro; its own slider 'Lektor'; dips the music to `DUCK_TUNING.voiceDepth` (0.3); silent and skipped when muted, not loaded or locked |
| Music duck | `Ducker`, `musicDucker`, `DUCK_TUNING` (`fx/audio/duck.ts`) | Short dip of the music bus under a stinger (`depth` 0.45) or a voice line (`voiceDepth` 0.3); the lowest active depth wins |
| Wprowadzenie (intro) | `intro` (`apps/client/src/intro/`, `pl.intro`) | The narrated walk-through of the game (60–90 s): autoplays once per browser in the training lobby, replayable from „Jak grać?” and the settings |
| Scena wprowadzenia | intro scene (`IntroScene`, `INTRO_SCENES`, `IntroSceneId`) | One of 11 steps (`welcome` … `end`); its stage is UI-kit art (`kit`) or the live sim (`engine`) |
| Klip lektora | intro clip (`IntroClip`, `INTRO_CLIPS`, `IntroClipId`) | One narrator line: 8 shared plus 3 × 3 device variants (`pickup.touch`) = 17; the id keys the voice sprite and the line export |
| Ścieżka sterowania sceny | scripted input track (`IntroTrackId`) | The inputs that drive the local sim in a gameplay scene: `conveyorArrivals`, `pickUpFolder`, `holdWork`, `earnStamp`, `citeAndVerdict` |
| Napisy lektora | subtitles (`subtitleChunks`, `SubtitleChunk`) | Always on; one sentence per chunk, timed by its share of characters, at most 2 lines at 640×360 (`INTRO_SUBTITLE_LINE_CHARS`) |
| Czas bez głosu | fallback timing (`fallbackMs`, `sceneDurationMs`, `introReducer`) | A scene without a voice lasts 400 ms per word, 2.5–12 s; with a voice it moves on 450 ms after the clip ends (at the latest the clip + 1.5 s) |
| Wprowadzenie obejrzane | intro seen flag (`redakcja.intro.seen.v1`, `introSeen`, `markIntroSeen`, `shouldAutoplayIntro`) | Set on finishing or skipping; the game starting mid-intro does not set it |
| Tekst dla lektora | TTS text (`ttsText`, `PRONOUNCE`, `tools/audio/intro-lines.ts`) | A subtitle as the voice says it: plain spaces, no quotes, key names respelled („klawiszem er”) |
| Sprite lektora | voice sprite (`VoiceSprite`, `voiceSpriteSchema`, `loadVoiceSprite`, `loadIntroVoice`; `intro/voice-sprite.ts`) | `/assets/voice/intro.json` beside `intro.{webm,mp3}`: per clip `startMs`, `durationMs`, `textSha1`; written by `tools/audio/synth_voice.py`; optional (no sprite → subtitles and fallback timing) |
| Licencja głosu | voice licence (`VOICE_LICENCES`) | `CC0-1.0`, `CC-BY-4.0`, `MIT` or `self-recorded-CC0` (a volunteer recording released under CC0); nothing non-commercial can ship |
| Nagranie lektora | voice recording (`synth_voice.py --recordings DIR`) | One take per clip, `DIR/<clipId>.wav`, released under CC0 by the volunteer; replaces TTS with one command |
| Scenariusz nagrania | voice script (`tools/audio/voice-script.ts`, `docs/voice-recording.pl.md`) | The volunteer's guide: the generated 17-clip table (file, who hears it, exact subtitle, key-name respellings, rough length), recording rules and the CC0 consent form; `voice-script.test.ts` fails while the table is stale |

## Server config and ads (Stage 7)

| Polish | English (code) | Notes |
| --- | --- | --- |
| Konfiguracja publiczna | `publicConfig` (`PublicConfig`, `publicConfigSchema`, `DEFAULT_PUBLIC_CONFIG`) | What the client may know of the server's `config.json`, derived per request host; its own schema, never a pick of the server config. Served by `GET /api/config` and embedded in the HTML shell (`PUBLIC_CONFIG_ELEMENT_ID`) |
| Flaga funkcji | `featureFlag` (`FeatureFlags`, `DEFAULT_FEATURE_FLAGS`) | `roomBrowser` (off by default), `versus`, `spectators`, `intro`; gates entry points only, running matches keep going |
| Komunikat redakcji | `motd` (`motdSchema`) | Operator message in the main menu: stable `id`, `text` ≤ `MOTD_MAX_CHARS`, `tone` `info` / `warning` |
| Reklama / miejsce reklamy | `ad` / `adPlacement` (`menu`, `lobby`, `results`, `spectator`) | Never during play; `slots` maps a placement to an AdSense ad unit |
| Odbiorcy reklam (wiek) | `ageTreatment` (`child` / `teen` / `unspecified`) | Age tag on every ad request; default `teen` (`DEFAULT_AD_AGE_TREATMENT`) |
| Reklamy ograniczone | ads mode `limited` | Google's limited ads: no cookies, no local storage, no personalisation; the only mode accepted while `ageTreatment` is `teen` or `child` (`adModeAllowed`) |
| Reklamy niespersonalizowane | ads mode `nonPersonalized` | May use cookies, so they need consent; adults only (`ageTreatment: 'unspecified'`). Personalised ads are never offered |
| Domena / host | `normalizeHost`, `hostAllowed`, `hostnameSchema` | Bare lower-case host without port; ad domains match exactly, never a parent or wildcard |
| Znacznik nonce CSP | `CSP_NONCE_PLACEHOLDER` | Placeholder Vite writes into the built `index.html`; the HTML shell swaps in a per-request nonce |
| Powłoka HTML | HTML shell (`renderShell`, `createShellRoutes`, `ShellAssets`) | The built `index.html` the game server renders per request (`apps/server/src/shell/`): nonce, embedded public config, verification meta tag, per-host CSP |
| Strona zapasowa | static fallback (Caddyfile `handle_errors 502 503 504`) | The static `index.html` of the web image that Caddy serves while the game server is down: menu without the embedded config, base CSP, `no-store`; never for `/ads.txt` or the API |
| Tryb CSP (bazowy / reklamowy) | `CspMode` (`base` / `ads`) | `base`: the strict same-origin policy, identical to the Caddyfile's; `ads`: nonce + `'strict-dynamic'` in script-src and `Referrer-Policy: strict-origin-when-cross-origin`, only on hosts where ads run |
| Konfiguracja serwera | `serverConfig` (`serverConfigSchema`, `ServerConfig`, `config/config.json`) | Operator's product settings in `apps/server/src/config.ts`: `site`, `features`, `motd`, `rooms`, `ads`, `csp`. Strict (unknown keys refused); an invalid file stops the start and never replaces a running config |
| Magazyn konfiguracji | `ConfigStore` (`createConfigStore`, `staticConfigStore`) | Holds the running config; reloads on file changes (`fs.watch` on the directory, 250 ms debounce) and on `SIGHUP`; `revision` +1 per reload that changed a value; `source` `file` / `defaults` |
| Zgoda na reklamy | `ads.signOff` (`{by, date}`) | Supervisor or legal sign-off recorded in config.json; `ads.enabled: true` is refused without it, also when forced by `ADS_ENABLED` |
| Ustawienia pokoi | `RoomSettings` (`RegistryOptions.settings()`, `roomSettings`) | `maxRooms`, `defaultDifficulty` and the feature flags, read by the registry at every room creation, so a reload applies to the next room |
| Tryb pokoju (Razem / Na punkty) | `roomMode` (`coop` / `versus`, `RoomMode`, lobby action `setMode`) | Razem: one shared newsroom. Na punkty: two newsrooms play the same run side by side; on `roomState.mode`, a new room is co-op (S7-77) |
| Redakcja w pojedynku (Kurier / Głos) | team (`teamIndex` 0 / 1, `TeamIndex`, `MAX_TEAMS`, lobby action `setTeam`) | One newsroom (one sim) of a room, up to `MAX_TEAM_PLAYERS` (4) players; co-op has team 0 only. On `roomState.players[].team`, `snapshot.team`, `event.team`, `levelEnd.team` |
| Gracz / widz | member kind (`memberKind`: `player` / `spectator`, `join.as`, lobby action `setSpectator`) | A room member plays in a team or watches; one reconnect token is exactly one member kind. `MAX_ROOM_PLAYERS` (8) players plus `MAX_SPECTATORS` (8) spectators per room |
| Widownia | `spectatorsAllowed` (lobby action `setSpectatorsAllowed`), `roomState.spectators` (`LobbySpectator`) | The room's spectator seats; off by default, the host opens them. A spectator join to a closed Widownia gets `spectatorsOff` |
| Pokój prywatny / publiczny | `roomVisibility` (`private` / `public`, lobby action `setVisibility`) | Private rooms are reached by code only (default); public ones are listed in the room browser when the `roomBrowser` flag is on |
| Nazwa pokoju | `roomName` (`roomNameSchema`, lobby action `setRoomName`) | Optional host-given name: trimmed, 1..`ROOM_NAME_MAX_LENGTH` (24), no control characters; the server's name filter answers `invalidName` |
| Identyfikator przeglądarki | `clientId` (`clientIdSchema`, `join.clientId`) | Opaque random id (16..64 characters) a browser keeps in localStorage and sends on join, so a kick cooldown follows the browser rather than a class-shared IP |
| Wynik redakcji | team score (`teamScoreSchema`, `TeamScore`, `snapshot.scoreboard`) | One newsroom's `{team, score, credibility, resolved, expired, connected}`; versus snapshots carry both, for the rival chip and the spectator scoreboard |
| Embargo na werdykty (widownia) | spectator embargo (`spectatorEvent`, `verdictMasked`, `verdictRevealed`; pure rules in `spectator-embargo.ts`: `SpectatorEmbargo`, `createEmbargo`, `openSpawnKey`, `closeSpawnKey`, `maskForSpectators`, `release`, `releaseAll`, `HeldResult`) | In versus a spectator sees a closed folder as `verdictMasked` (who, which `spawnKey`, verdict or expiry; never the verdict, outcome, reason or points) until both newsrooms closed that key or the level ended, then `verdictRevealed` with the result. Players never receive `spectatorEvent`. In co-op every event passes through |
| Statystyki meczu | match stats (`playerStatsSchema`, `PlayerStats`, `matchStats`, `levelEnd.stats`; `match-stats.ts`: `emptyPlayerStats`, `applyStatsEvent`, `teamScoreOf`) | Per player: verdicts, correct, wrong, stamps, minigame fails, abilities (stage `done`); sent to spectators at 1 Hz (`SPECTATOR_STATS_INTERVAL_TICKS`) and in `levelEnd`. `applyStatsEvent` is the only accumulator |
| Wynik pojedynku | versus summary (`versusSummarySchema`, `VersusSummary`, `levelEnd.versus`, `versusEndReason`) | `{winnerTeam (null on a draw), reason: score / credibility / forfeit / draw, teams, rivalResults}`; `rivalResults` pair with the team's own results by `spawnKey` |
| Rozstrzygnięcie pojedynku | `versusOutcome` (`TeamStanding`, `VersusResult`, `byScore`), `matchDurationMs` (`versus.ts`) | A newsroom with credibility 0 or a forfeit is out; the last one in wins (`forfeit` / `credibility`); all out on one tick or time up → higher score (`score`), equal top scores → `draw`. Endless versus lasts `VERSUS.endlessDurationS` (600 s) |
| Filtr nazw | name filter (`isAcceptableName`, `maskName`, `NAME_MASK_CHAR`, `name-filter.ts`) | Small Polish blocklist for room names (`invalidName`) and host nicknames in the room browser (masked to `*`); matched after `foldSearch` with look-alike digits, repeated letters and split letters folded |
| Lista pokojów | room browser list (`roomSummarySchema`, `RoomSummary`, `roomListQuerySchema`, `roomListResponseSchema`, `roomListStatusSchema`: `any` / `open` / `inGame`, `rooms.ts`) | What `GET /api/rooms` returns for a public room: code, name, masked host nickname, level, mode, difficulty, counts and seats, `canJoinAsPlayer`, `canSpectate`, `createdAt` |
| Wyszukiwanie bez ogonków | `foldSearch` | Lower case, diacritics stripped (`ł` → `l`), whitespace collapsed: `foldSearch('Łukasz Żółć') === 'lukasz zolc'`; the room-browser search and the name filter use it |
| Minimalny czas rozwiązania | `MINIGAME_MIN_SOLVE_MS` | Versus only: a minigame success reported sooner after the minigame opened counts as a failure (anti-cheat, enforced from S7-80) |
| Ładowarka reklam | `ensureAdSense`, `AdLoaderState` (`idle` / `loading` / `ready` / `blocked`), `useAdLoader` (`apps/client/src/ads/adsense.ts`) | Injects Google's script once, when the first `AdSlot` mounts; the request flags (`AD_QUEUE_FLAGS`) are on the queue first. An error or `ADS_LOAD_TIMEOUT_MS` without a load means `blocked`: no ads, no message |
| Ramka reklamy | `AdSlot` (`placement`) | The white "Reklama" frame around one fixed-size unit (`AD_PLACEMENTS`); renders nothing on phones, with ads off, without a unit for the placement or when the loader is blocked. No cue, never focusable |
| Ekran reklamowy | `adEligible({screen, levelEnded, spectating})`, `AD_ELIGIBLE_SCREENS` | Main menu, lobby, results of a finished level, spectator view; nowhere else |
| Wstrzymanie reklam | `useAdRequestPause`, `setAdRequestsPaused` (`pauseAdRequests`) | Pause guard mounted in `App`: ad requests are paused on every screen that is not an ad screen |
| Odstęp od reklamy | `--space-ad-gap` (9.5rem), `AD_MIN_GAP_PX` (150) | Clear space between an ad and any control (AdSense game-page guidance) |
| Znacznik wieku zgody | `data-tag-for-under-age-of-consent` (TFUA), `data-tag-for-age-treatment` (TFAT) | Per-unit tags from `adRequestAttributes`: TFUA in `limited` mode (Google serves limited ads), TFAT `1` child / `2` teen |
| Zgody reklamowe | `adConsent` (`pl.menu.adConsent`, `openConsentSettings`) | The footer link that reopens Google's consent message (`googlefc.showRevocationMessage`), required by AdSense; shown only while the ad loader is `ready` |
| Stopka menu | `MenuFooter` (`screens/menu/MenuFooter.tsx`) | Row of minor ghost-button links under the main-menu card, never yellow; renders nothing while it has no link |
| Strażnik reklam (e2e) | ad guard (`guardAdRequests`, `trackContext(context, { ads })` in `e2e/helpers.ts`) | Every e2e context without an ads config fails its test (in `closePlayers`) if it sends a request to a Google ad host; `openPlayer` and `trackContext` apply it, `guardAdRequests(page.context())` covers Playwright's own `page` fixture; only `ads.spec.ts` opts out |

Missing a term? Add it here in the same commit that introduces it.
