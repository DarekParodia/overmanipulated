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

## Roles (`RoleId`)

Passives and abilities live in `ROLE_PERKS` (`RolePerk`, S7-36): `fasterAt` × `workFactor` is the
passive, `ability` the active one (R / RB / the fourth touch button).

| Polish | English | Bonus (passive) | Ability |
| --- | --- | --- | --- |
| Fotoedytor | `photoEditor` | `imageSearch`, `aiScanner`, `geolocation` and `metadata` 40% faster | Ekspertyza (`image` family) |
| Archiwista | `archivist` | `archive` and `transcript` 40% faster | Ekspertyza (`documents` family) |
| Reporter | `reporter` | `phone` and `crossCheck` 40% faster; skips the `phone` queue | Telefon z terenu |
| Redaktor prowadzący | `managingEditor` | — | Przedłużenie |

## Abilities (`Ability`, Stage 7)

| Polish | English | Notes |
| --- | --- | --- |
| Zdolność (roli) | ability (`abilitySchema`, `ABILITY`, `abilityOf`) | A role's active power, sent as the target-free `useAbility` command; the server resolves the target |
| Odnowienie | cooldown (`ABILITY[a].cooldownMs`, `abilityReadyAtMs`) | Time until the ability is ready again; starts when the effect happens, not when armed |
| Uzbrojona | armed (`abilityArmed`, stage `armed`) | Ekspertyza and Druga szansa wait for their trigger; a second press disarms |
| Ekspertyza | `expertise` | The next minigame at a station of the role's family is solved at once |
| Telefon z terenu | `fieldCall` (`FieldCall`) | The carried folder gets its phone stamp after a call while walking |
| Przedłużenie | `extendDeadline` (`pickExtendTarget`, `extendFolders`) | +20 s for an auto-picked folder: the carried one, else the one on the operated desk, else the most urgent; a botRaid wave moves together. Recorded in `extendedMs`; the speed bonus ignores the added time |
| Druga szansa | `secondChance` | A failed minigame reopens without the lockout |
| Podaj teczkę | `passFolder` | The carried folder goes to the nearest free teammate |
| Koło ratunkowe | `rescue` (passive; `rescuesLeft`, `RESCUE_ADD_MS`, `folderRescued`) | A folder that reaches its deadline in the rescuer's hands gets +20 s, once per level |
| Podgląd zdolności | ability preview (`abilityPreview`, `AbilityPreview`, `AbilityView`, `AbilityEnv`) | What a press would do now (`none`, `calling`, `armed`, `cooling`, `blocked`, `arm`, `now` with its target); one function for the sim, the HUD and the bots |
| Etap zdolności | ability stage (`abilityStageSchema`) | `armed`, `disarmed`, `started`, `done`, `cancelled` in the `ability` event |
| Stan zdolności załogi | crew ability state (`AbilityState`, `snapshot.crew`, `crewSnapshot`) | `abilityReadyAtMs`, `abilityArmed`, `fieldCall`, `rescuesLeft` per player |
| Użycie zdolności | ability press (`KEY_BINDINGS.ability` R, `PAD.rb` RB, `touchInput.pressAbility`, nav intent `ability`, `abilityPressOutcome`) | One press sends `useAbility`, or is refused on the client with the `ability.denied` cue (no role, cooling) |
| Źródło pieczątki | stamp source (`stampSourceSchema`, `stampApplied.via`) | `minigame`, `expertise` or `fieldCall` |

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
| Station help (Pomoc stanowiska) | `stationHelp` (`pl.stationHelp.kinds[kind]`) | Per station: `purpose`, `proves`, 2–3 `steps` per device, `realWorld`; one source for the help card, practice, lobby details and contest legends |
| Polish plural | `pluralPl(n, one, few, many)` | Polish noun form for a count (`strings/plural.ts`) |
| Audio bus | `AudioBus`: `music` / `sfx` / `ui` / `voice` | Each bus has its own volume slider; effective volume is `busVolume(settings, bus)` (`fx/audio/mix.ts`) |
| Lektor (intro voiceover) | `voice` bus, `voiceVolume`, `fx/audio/voice.ts` (`loadVoice`, `playVoice`, `voiceStatus`) | Narrator lines of the intro; its own slider 'Lektor'; dips the music to `DUCK_TUNING.voiceDepth` (0.3); silent and skipped when muted, not loaded or locked |
| Music duck | `Ducker`, `musicDucker`, `DUCK_TUNING` (`fx/audio/duck.ts`) | Short dip of the music bus under a stinger (`depth` 0.45) or a voice line (`voiceDepth` 0.3); the lowest active depth wins |

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
| Konfiguracja serwera | `serverConfig` (`serverConfigSchema`, `ServerConfig`, `config/config.json`) | Operator's product settings in `apps/server/src/config.ts`: `site`, `features`, `motd`, `rooms`, `ads`, `csp`. Strict (unknown keys refused); an invalid file stops the start and never replaces a running config |
| Magazyn konfiguracji | `ConfigStore` (`createConfigStore`, `staticConfigStore`) | Holds the running config; reloads on file changes (`fs.watch` on the directory, 250 ms debounce) and on `SIGHUP`; `revision` +1 per reload that changed a value; `source` `file` / `defaults` |
| Zgoda na reklamy | `ads.signOff` (`{by, date}`) | Supervisor or legal sign-off recorded in config.json; `ads.enabled: true` is refused without it, also when forced by `ADS_ENABLED` |
| Ustawienia pokoi | `RoomSettings` (`RegistryOptions.settings()`, `roomSettings`) | `maxRooms`, `defaultDifficulty` and the feature flags, read by the registry at every room creation, so a reload applies to the next room |

Missing a term? Add it here in the same commit that introduces it.
