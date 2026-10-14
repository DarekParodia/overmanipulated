# Materiały konkursowe

| Materiał | Plik |
| --- | --- |
| Opis projektu i mapowanie na kryteria | [criteria-mapping.pl.md](criteria-mapping.pl.md) |
| Jak zagrać (przewodnik dla jury) | [how-to-play.pl.md](how-to-play.pl.md) |
| Zrzuty ekranu (komputer i telefon) | [screenshots/README.md](screenshots/README.md) |
| Plany redakcji (poziomy 0–6, SVG i PNG) | [maps/l1-burza.png](maps/l1-burza.png), [maps/l6-atak.png](maps/l6-atak.png) |
| Karty ról (do druku, 2 strony A4) | [cards/role-cards.html](cards/role-cards.html), [PDF](cards/role-cards.pdf), [PNG](cards/role-cards.png) |
| Przykładowe teczki (do druku, A4) | [cards/folders.html](cards/folders.html) |
| Nagranie rozgrywki | `gameplay.webm` (generowane, zob. niżej) |

## Generowanie (dla zespołu)

Wszystko powstaje ze skryptów w `tools/contest/` na podstawie danych gry (układ poziomów, treści teczek, stałe ról), więc po zmianach w interfejsie lub treściach wystarczy uruchomić ponownie.

```
bun run contest:build                  # plany, karty ról, karty teczek (szybko, bez serwera)
bun run contest:build -- --screenshots # zrzuty ekranu (sam uruchamia serwer i podgląd)
bun run contest:build -- --video       # nagranie gameplay.webm/.mp4 + klatki w storyboard/
bun run contest:build -- --all         # wszystko
```

Skrypty zrzutów i nagrania potrzebują Chromium z Playwright (`PW_CHROMIUM_PATH` lub `/opt/pw-browsers/chromium`). `CONTEST_BASE_URL=http://localhost:4173` użyje już działającej gry, `CONTEST_REBUILD=1` przebuduje klienta, `CONTEST_VIDEO_SPEED=2` przyspieszy nagranie.

Zdarzenia, stanowiska, stół i podsumowanie na zrzutach (oraz koniec poziomu w nagraniu) są ustawiane uchwytem `?debug` (`window.__game`), bo prawdziwy poziom trwa kilka minut. Stan jest taki sam jak ten wysyłany przez serwer.
