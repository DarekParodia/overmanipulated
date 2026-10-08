# Dziennik wyników testów

Szablon do wypełnienia po każdej lekcji testowej. Skopiuj sekcję „Test nr …” na koniec pliku
(najnowszy test na dole) i wypełnij w dniu testu, zanim szczegóły wylecą z głowy.

Każde ustalenie musi skończyć się **decyzją**: zadanie w planie, notatka o balansie, zmiana
treści albo świadome „zostawiamy”. Ustalenie bez decyzji nie jest skończone.

## Jak zamieniać obserwacje w pracę

| Rodzaj ustalenia | Gdzie trafia | Przykład |
| --- | --- | --- |
| Błąd lub brak w grze | Nowe zadanie w `docs/implementation-plan.md` (właściwy etap) | „Przycisk Odłóż za mały na 640×360” |
| Liczby (czas, punkty, terminy) | Notatka o balansie niżej + zmiana w `packages/shared/src/constants.ts` | „Termin teczki zwykłej 60 s → 75 s” |
| Treść teczki (myląca, za łatwa, błędna) | Zgłoszenie do autora treści; `reviewed: false` do poprawki | „Teczka l1-… — pieczątka Kartoteki zdradza werdykt” |
| Zasady / samouczek / podpowiedzi | Zadanie w planie (guidance, tutorial) | „Krok »praca« — 5/8 zespołów nie przytrzymuje Spacji” |
| Sprzęt / sieć szkoły | `docs/playtests/device-checklist.md` | „Filtr X blokuje WebSocket — dopisać do listy” |

Priorytet ustalenia: **P1** = blokuje grę lub naukę (naprawić przed kolejnym testem),
**P2** = wyraźnie przeszkadza (ten etap), **P3** = drobiazg (lista życzeń).

---

## Test nr __ — RRRR-MM-DD

**Szkoła / klasa:** ______  **Liczba uczniów:** __  **Zespołów:** __ (3-os.: __, 4-os.: __)
**Prowadzący:** ______  **Obserwatorzy:** ______
**Wersja gry (commit):** `_______`  **Poziomy:** rozgrzewka, poziom 1

### Urządzenia

| Laptopy | Telefony | Tablety | Pady | Rozłączenia | Urządzenia, które nie działały (model, przeglądarka) |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

### Liczby z gry

| Zespół | Czas do 1. werdyktu | Werdykty (dobre / złe dowody / złe) | Teczki przepadłe | Wynik | Gwiazdki | Wiarygodność na końcu | Wpadka dnia |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |

Głosy na wpadkę dnia (z `/api/stats/blunders`): ______

### Ankieta (średnie, n = __)

| P1 podoba się | P2 wiem co robić | P3 sterowanie | P4 za mało czasu* | P5 rozumiem werdykt | P6 zespół | P7 umiem sprawdzić | P8 chcę dalej |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |

\* odwrócone: cel 2,5–3,5.

Odpowiedzi otwarte (pogrupowane, z liczbą wystąpień):

- Najbardziej mylące: …
- Co sprawdzę następnym razem: …

### Najczęstsze punkty zamieszania (z arkuszy obserwacji)

| Punkt zamieszania | Ile zespołów | Cytat |
| --- | --- | --- |
| | __ / __ | |

### Ustalenia → decyzje

| # | Ustalenie | Priorytet | Decyzja | Gdzie (zadanie / plik) | Kto |
| --- | --- | --- | --- | --- | --- |
| 1 | | P1 / P2 / P3 | zadanie / balans / treść / zostawiamy | | |
| 2 | | | | | |
| 3 | | | | | |

### Notatki o balansie

| Stała w `constants.ts` | Było | Proponuję | Dlaczego (dane z testu) |
| --- | --- | --- | --- |
| | | | |

### Co poszło dobrze (zachować)

-

### Na następny test zmieniamy

-
