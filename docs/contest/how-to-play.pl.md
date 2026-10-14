# Jak zagrać: krótki przewodnik dla jury

## Jak otworzyć

1. Otwórz adres gry w przeglądarce (komputer lub telefon, bez instalacji i konta): **[uzupełnić adres wdrożenia]**. Lokalnie: `bun install`, `bun run dev:server`, `bun run dev:client`, potem `http://localhost:5173`.
2. Wpisz pseudonim w polu „Twój podpis”.
3. Jedna osoba wybiera **„Otwórz pokój”** i dostaje czteroliterowy kod. Pozostałe wpisują kod w polu „Kod pokoju” i wybierają **„Dołącz”**. Najlepiej grać w 3–4 osoby; można też zacząć w 2 osoby (np. dwie karty przeglądarki).

## Ścieżka na 2 minuty

1. W poczekalni wybierz rolę (np. Redaktor prowadzący), poziom 1 („Pierwszy dzień”) i zaznacz „Gotowy”. Gospodarz może zmienić **poziom trudności** (na start „Normalny”, dla pierwszej gry klasy „Łatwy”) i klika **„Do składu!”**.
2. Przeczytaj briefing i kliknij **„Gotowy!”**. Samouczek poprowadzi przez pierwsze kroki.
3. Weź teczkę z taśmy przy wejściu i zanieś ją do **Lupy obrazu** lub **Kartoteki źródeł**. Przytrzymaj przycisk pracy, potem rozwiąż krótką minigrę. Gdy teczce kończy się czas, Redaktor prowadzący naciska **R**: Przedłużenie daje jej 20 sekund więcej.
4. Zanieś teczkę na **stół redakcyjny**. Wskaż pieczątkę, która uzasadnia werdykt (albo kilka, gdy teczka ich wymaga), i wybierz: **Publikuj**, **Publikuj z kontekstem** albo **Odrzuć**.
5. Po poziomie zajrzyj do **Kolegium** (omówienie każdej teczki) i do **Encyklopedii technik** w menu głównym.

Wskazówka: nie każda teczka jest fałszywa, a „pilne” nie znaczy „prawdziwe”.

## Punkty, dowody i poziom trudności

- **Punkty.** Trafny werdykt daje +10 (teczka zwykła), +20 (ważna lub pilna) albo +30 („z kontekstem”), a szybki werdykt (ponad połowa czasu w zapasie) jeszcze +5. Opublikowana fałszywka kosztuje −20 punktów i −25 Wiarygodności, przeterminowana teczka −5 i −5. Gdy Wiarygodność spadnie do 0, poziom jest przegrany.
- **Dowody.** Przy werdykcie wskazuje się pieczątkę, która rozstrzyga sprawę. Pieczątka, która niczego nie dowodzi, albo sam Skaner AI dają tylko połowę punktów: skaner podaje prawdopodobieństwo, nie dowód.
- **Teczki z kilkoma dowodami.** Od poziomu 4 niektóre teczki wymagają 2–3 dowodów z różnych stanowisk (znaczek „1/2” na karcie). Mają 20 sekund więcej na każdy dodatkowy dowód, a pełny komplet daje +10 za każdy dowód ponad pierwszy.
- **Gwiazdki.** Jedna za przetrwanie z dodatnim wynikiem, dwie i trzy za 55% i 80% najlepszego wyniku możliwego w danym rozdaniu. Teczki rozdaje worek stanowisk, więc każda rozgrywka jest inna; briefing pokazuje liczbę teczek i progi.
- **Poziom trudności.** „Łatwy”: więcej czasu, łagodniejsze kary, dodatkowa pomyłka w minigrach. „Normalny”: tak, jak zaprojektowaliśmy. „Trudny”: mniej czasu, więcej teczek, wyższe kary. „Ekspert”: jeszcze ciaśniej, bez podpowiedzi i bez pokazywania odpowiedzi po nieudanej minigrze. Postęp i tablica wyników liczą się osobno dla każdego poziomu trudności.

## Stanowiska

Każde stanowisko to jedna technika weryfikacji i jedna krótka minigra. Kampania odsłania je po kolei, a tryb bez końca ma wszystkie dziesięć w jednej sali.

| Stanowisko | Co sprawdza | Od poziomu |
| --- | --- | --- |
| Lupa obrazu | Czy zdjęcie pojawiło się wcześniej i gdzie | 1 |
| Kartoteka źródeł | Autor, domena, historia konta | 1 |
| Archiwum | Daty, poprzednie wersje stron, usunięte treści | 2 |
| Telefon | Źródło pierwotne, świadek, ekspert | 3 |
| Biblioteka danych | Czy statystyka zgadza się ze źródłem | 4 |
| Skaner AI | Ślady generowania lub edycji (tylko wskazówka, nie dowód) | 5 |
| Stenogram | Czy cytat nie jest wycięty | 5 |
| Metadane | Kiedy, czym i gdzie powstał plik | 5 |
| Mapa | Gdzie zrobiono zdjęcie | 6 |
| Inne media | Co podają niezależne redakcje (kopia to nie potwierdzenie) | 6 |

Poziomy 5 i 6 dzieją się w większej sali (24×14): poziom 5 ma siedem stanowisk, poziom 6 osiem. Gdy ktoś pierwszy raz otwiera stanowisko, gra pokazuje kartę z jego opisem; później wraca ona pod przyciskiem „?” (klawisz H).

## Role i zdolności

W poczekalni każdy wybiera jedną z sześciu ról albo „Bez roli”. Role się nie wykluczają: dwie osoby mogą mieć tę samą. Rola daje stałą **premię** i jedną **zdolność**, którą włącza się klawiszem **R** (pad: **RB**, telefon: czwarty przycisk). Po użyciu zdolność odnawia się przez 60 sekund. Cel wybiera gra, a karta teczki, której dotyczy zdolność, ma niebieski przerywany obrys.

| Rola | Premia | Zdolność |
| --- | --- | --- |
| Fotoedytor | Lupa obrazu, Skaner AI, Mapa i Metadane 40% szybciej | **Ekspertyza:** minigra przy obrazie rozwiązana od razu |
| Archiwista | Archiwum i Stenogram 40% szybciej | **Ekspertyza:** minigra przy dokumentach (Archiwum, Biblioteka danych, Stenogram) rozwiązana od razu |
| Reporter | Telefon i Inne media 40% szybciej, Telefon bez kolejki | **Telefon z terenu:** pieczątka Telefonu dla niesionej teczki po 6 sekundach rozmowy |
| Redaktor prowadzący | brak | **Przedłużenie:** +20 sekund dla teczki w ręce albo najpilniejszej |
| Wszechstronny | każde stanowisko 20% szybciej | **Druga szansa:** po nieudanej minigrze od razu jeszcze raz, bez kary czasu |
| Ratownik | **Koło ratunkowe:** raz na poziom +20 sekund dla teczki, której czas kończy się w jego rękach | **Podaj teczkę:** niesiona teczka trafia do najbliższej wolnej osoby |

Ekspertyzę i Drugą szansę można uzbroić z wyprzedzeniem: zadziałają przy najbliższej okazji. Panel roli w poczekalni mówi, czy premia i zdolność działają na wybranym poziomie (na przykład na poziomie 1 nie ma Telefonu). Do druku: [karty ról](cards/role-cards.html).

## Sterowanie

| Akcja | Klawiatura | Pad | Dotyk |
| --- | --- | --- | --- |
| Ruch | WASD lub strzałki | lewa gałka | drążek na ekranie |
| Podnieś / odłóż teczkę | E | A | przycisk „Podnieś” |
| Praca na stanowisku, stół (trzymaj) | Spacja | X | przycisk „Pracuj” |
| Zdolność roli | R | RB | czwarty przycisk (nazwa zdolności, np. „Podaj”) |
| Szybki sygnał dla zespołu | Q | (zob. Ustawienia) | przycisk „Sygnał” |
| Wyjście z okna stanowiska | Esc | B | przycisk zamknięcia |
| Menu i minigry | strzałki, Enter | krzyżak, A | stuknięcie |

Pełna ściąga jest w **Ustawienia → Sterowanie**. Na telefonie gra działa tylko poziomo. Ustawienia dostępności: mniej ruchu, bez migania, napisy do dźwięków, sterowanie dla leworęcznych.

## Na punkty i Widownia (opcjonalnie)

Gra jest przede wszystkim kooperacyjna. Dwa dodatki pozwalają jednak zagrać całą klasą:

- **Na punkty.** Gospodarz przełącza w poczekalni „Tryb gry” na „Na punkty”. Gracze dzielą się na dwie redakcje, **Kurier** (granatowa tarcza z literą K) i **Głos** (biała pieczęć z literą G), po 1–4 osoby. Obie grają ten sam poziom z tym samym rozdaniem teczek, każda w swojej sali. Żeton pod punktami pokazuje wynik rywali. Wygrywa więcej punktów, a redakcja, której Wiarygodność spadnie do zera albo która opuści mecz, przegrywa od razu. Równe punkty to remis. Pojedynek w trybie bez końca trwa 10 minut. Pojedynek nie zapisuje gwiazdek ani tablicy wyników. W Kolegium przy każdej teczce widać werdykt własny i werdykt rywali. W trakcie meczu nowi gracze nie dołączają: mogą oglądać.
- **Widownia.** Gospodarz zaznacza w poczekalni „Widownia otwarta”. Kto ma kod, wpisuje go w menu i wybiera oko obok „Dołącz” („Oglądaj pokój o tym kodzie”); w pokoju jest do 8 miejsc dla widzów. Gracze widzą komunikat „Widz dołączył”. Widz widzi obie redakcje obok siebie (telefon: jedną, przełączaną stuknięciem), tablicę wyników, relację „Na żywo” i statystyki graczy; strzałki ← / → (pad: krzyżak albo RB, dotyk: znaczek gracza na tabliczce redakcji) włączają śledzenie gracza, Esc (pad: B) je kończy, a Q (pad: Y, dotyk: „Statystyki”) otwiera statystyki. W pojedynku widz poznaje wynik werdyktu dopiero wtedy, gdy obie redakcje zamkną tę samą teczkę, więc nie może podpowiadać.
- **Szybka próba w jednej przeglądarce:** karta 1 otwiera pokój i wybiera „Na punkty”, karta 2 dołącza kodem (trafia do Głosu), gospodarz zaznacza „Widownia otwarta”, karta 3 wpisuje kod i wybiera oko. Gospodarz klika „Do składu!”.
- **Publiczne pokoje.** Pokój jest zawsze prywatny (tylko z kodem). Lista publicznych pokoi w menu jest domyślnie wyłączona; pojawia się tylko, gdy włączy ją operator serwera. Wtedy gospodarz może oznaczyć pokój jako publiczny i nadać mu nazwę.

## Dla prowadzącego

- Poziom trwa 6–8 minut, sesja z omówieniem 30–40 minut (jedna lekcja).
- Nauczyciel może prowadzić mecz z projektora: otwiera pokój, przełącza się „Na widownię” i oddaje miejsca przy biurkach uczniom (gospodarzem pozostaje i to on startuje). W opcjach gracza może kogoś przenieść, przekazać rolę gospodarza albo usunąć osobę z pokoju (ta przeglądarka nie wróci do pokoju przez 10 minut).
- Materiały do druku i prezentacji: [karty ról](cards/role-cards.html), [przykładowe teczki](cards/folders.html), [plany redakcji](maps/l1-burza.png), [zrzuty ekranu](screenshots/README.md), [nagranie](gameplay.webm).
