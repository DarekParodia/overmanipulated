# Glossary (Polish design doc → English code)

Use these names in code, schemas, file names and docs. Player-facing text stays Polish.

## Core concepts

| Polish (design doc) | English (code) | Notes |
| --- | --- | --- |
| Zgłoszenie | `story` | Content unit: the claim/material to verify (data) |
| Teczka | `folder` | In-world object carrying one story; has position, holder, stamps, deadline |
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
| Premia za tempo | `speedBonus` | |
| Przeterminowane | `expired` | |
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

Missing a term? Add it here in the same commit that introduces it.
