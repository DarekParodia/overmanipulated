# Materiały konkursowe

| Materiał | Plik |
| --- | --- |
| **Wizualizacja do zgłoszenia (2 strony A4)** | [wizualizacja.pdf](wizualizacja.pdf), PNG: [strona 1](wizualizacja-strona-1.png), [strona 2](wizualizacja-strona-2.png) |
| **Teksty do formularza zgłoszenia** | [zgloszenie.pl.md](zgloszenie.pl.md) |
| Opis projektu i mapowanie na kryteria | [criteria-mapping.pl.md](criteria-mapping.pl.md) |
| Jak zagrać (przewodnik dla jury) | [how-to-play.pl.md](how-to-play.pl.md) |
| Zrzuty ekranu (komputer i telefon) | [screenshots/README.md](screenshots/README.md) |
| Plany redakcji (poziomy 0–6, SVG i PNG) | [maps/l1-burza.png](maps/l1-burza.png), [maps/l6-atak.png](maps/l6-atak.png) |
| Karty ról (do druku, 2 strony A4) | [cards/role-cards.html](cards/role-cards.html), [PDF](cards/role-cards.pdf), [PNG](cards/role-cards.png) |
| Przykładowe teczki (do druku, A4) | [cards/folders.html](cards/folders.html) |
| Nagranie rozgrywki (90 s) | [gameplay.webm](gameplay.webm), [gameplay.mp4](gameplay.mp4), klatki co 8 s w [storyboard/](storyboard/klatka-01.png) |

## Generowanie (dla zespołu)

Wszystko powstaje ze skryptów w `tools/contest/` na podstawie danych gry (układ poziomów, treści teczek, stałe ról), więc po zmianach w interfejsie lub treściach wystarczy uruchomić ponownie.

```
bun run contest:build                  # plany, karty ról, karty teczek, wizualizacja (szybko, bez serwera)
bun run contest:build -- --screenshots # zrzuty ekranu (sam uruchamia serwer i podgląd)
bun run contest:build -- --video       # nagranie gameplay.webm/.mp4 + klatki w storyboard/
bun run contest:build -- --all         # wszystko
```

Serwer do zrzutów działa z `tools/contest/server-config.json` (włączona lista publicznych pokoi, która domyślnie jest wyłączona). Wprowadzenie i karty pomocy stanowisk są oznaczone jako obejrzane, poza zrzutami, które je pokazują.

Skrypty zrzutów i nagrania potrzebują Chromium z Playwright (`PW_CHROMIUM_PATH` lub `/opt/pw-browsers/chromium`). `CONTEST_BASE_URL=http://localhost:4173` użyje już działającej gry, `CONTEST_REBUILD=1` przebuduje klienta, `CONTEST_VIDEO_SPEED=2` przyspieszy nagranie.

Zdarzenia, stanowiska, stół i podsumowanie na zrzutach (oraz koniec poziomu w nagraniu) są ustawiane uchwytem `?debug` (`window.__game`), bo prawdziwy poziom trwa kilka minut. Stan jest taki sam jak ten wysyłany przez serwer.
