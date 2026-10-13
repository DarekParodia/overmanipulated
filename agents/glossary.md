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
| Teczka z kilkoma dowodami | multi-stamp folder | Its story has `requiredStamps` > 1; spawns with `MULTI_STAMP_EXTRA_DEADLINE_MS` more per extra proof |
| Przeterminowane | `expired` | |
| Wynik teczki | `folderResult` (`FolderResult`) | Outcome, reason, deltas, cited stamps and bonuses of one folder |
| Powód wyniku | `reason` (`FolderReason`) | Why a folder ended the way it did; 14 values, each belongs to one outcome |
| Niedokończona (nie zdążyliście) | `unfinished` | Folder still in play when the level ends; 0 points |
| Słaby dowód | `weakProof` | Reason: a cited stamp is not valid proof; half points |
| Za mało dowodów | `incompleteProof` | Reason: fewer countable proofs than required, e.g. only the AI scanner cited; half points |
| Wskazane dowody | `justifyingStampIds` | Stamps cited at the desk with a verdict (1–3) |
| Wymagane dowody | `requiredStamps` | Distinct justifying, non-hint stamps a story needs; 1 unless set |
| Stanowisko-podpowiedź | hint-only station (`HINT_ONLY_STATIONS`, `isHintOnly`) | `aiScanner`: its stamp may justify, but never counts as proof (`countsAsProof`) |
| Powód porażki | `lossReason` (`credibility` / `score`) | Why a level was lost; null when won |
| Progi gwiazdek | `starThresholds` | Scores for two and three stars, sent with `levelEnd` |
| Udziały gwiazdek | `STAR_SHARES` (level override `starShares`) | Star thresholds of a generated run as shares of its `maxScore`, rounded to `STAR_THRESHOLD_STEP` |
| Worek stanowisk | station bag (`bag`, constants `BAG_*`) | Run generation: folders are dealt in shuffled rounds over the stations that decide the level's stories |
| Talia stanowiska (tryb nieskończony) | station deck | Endless stories one station can decide; should hold at least `ENDLESS_MIN_DECK` |
| Najlepszy możliwy wynik | `maxScore` | Score of a perfect team on the level, sent with `levelEnd` |
| Status prawdziwości | `truth` | |
| Prawda / Fałsz / Zwodnicze / Satyra / Niepotwierdzalne | `true` / `false` / `misleading` / `satire` / `unverifiable` | |
| Poziom | `level` | |
| Kampania | `campaign` | |
| Tryb nieskończony | `endlessMode` | |
| Pokój, kod pokoju | `room`, `roomCode` | |
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

## Stations (`StationId`)

| Polish | English | Real-world analogue |
| --- | --- | --- |
| Lupa obrazu | `imageSearch` | Reverse image search |
| Archiwum | `archive` | Wayback Machine, metadata |
| Kartoteka źródeł | `sourceRegistry` | Domain/account checks, lateral reading |
| Telefon | `phone` | Contacting the original source |
| Skaner AI | `aiScanner` | AI/edit detectors |
| Biblioteka danych | `dataLibrary` | Official statistics, source reports |

## Roles (`RoleId`)

| Polish | English | Bonus |
| --- | --- | --- |
| Fotoedytor | `photoEditor` | `imageSearch` (and `aiScanner` image work) 40% faster |
| Archiwista | `archivist` | `archive` 40% faster |
| Reporter | `reporter` | Skips the `phone` queue |
| Redaktor prowadzący | `managingEditor` | Extends one folder's deadline per level |

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
| Poziom trudności | `difficulty` | Set per room (default `DEFAULT_DIFFICULTY`); picks one `DIFFICULTY` preset |
| Łatwy / Normalny / Trudny / Ekspert | `easy` / `normal` / `hard` / `expert` | `DIFFICULTIES`, easiest first; every Normal factor is 1 |
| Ustawienia poziomu trudności | `DifficultyPreset` | Factors for deadlines, spawn gap, work time, lockout, penalties and minigame time; extra mistakes; hints; answer reveal |
| Strojenie symulacji | `SimTuning` (`simTuning`, `NORMAL_TUNING`) | The preset part the simulation applies: work time, lockout, penalties |
| Limit pomyłek | `mistakeLimit` | Mistakes a minigame allows on a difficulty; never below `MINIGAME_MIN_MISTAKES` |
| Blokada stanowiska | lockout (`failLockoutMs`) | How long a failed minigame blocks its station |
| Limit czasu minigry | `minigameTimeLimitMs` | Time for one minigame attempt; running out is a failure |

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

Missing a term? Add it here in the same commit that introduces it.
