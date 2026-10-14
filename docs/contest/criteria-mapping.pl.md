# Redakcja na Ostatnią Chwilę: materiały konkursowe

Temat konkursowy: **Krytyczne myślenie i odporność cyfrowa.** Odnośniki prowadzą do plików w tym katalogu. Zrzuty i karty są generowane poleceniem `bun run contest:build` (zob. [README.md](README.md)).

## Opis projektu (jedna strona)

**Redakcja na Ostatnią Chwilę** to kooperacyjna gra przeglądarkowa dla 3–4 osób (licealiści, 15–19 lat). Gracze prowadzą newsroom fikcyjnego miasta Nowe Brzegi. Na taśmę wpadają teczki ze zgłoszeniami: zdjęcia, cytaty, posty, nagrania i statystyki. Zespół biega między stanowiskami weryfikacji, zbiera pieczątki z dowodami i przy stole redakcyjnym decyduje: **publikuj, odrzuć albo publikuj z kontekstem**. Czas ucieka, więc napięcie między „szybko” a „rzetelnie” jest osią rozgrywki. To samo napięcie wykorzystują twórcy dezinformacji.

- **Czego uczy:** nawyku „zatrzymaj się i sprawdź” (metoda SIFT, czytanie lateralne), rozpoznawania typowych form dezinformacji (stare zdjęcie jako nowe, zmyślony cytat, wyrwanie z kontekstu, fałszywe konto, zmanipulowana statystyka, satyra brana na serio, deepfake) oraz doboru narzędzia do rodzaju materiału.
- **Jak:** sześć stanowisk to sześć realnych metod (wyszukiwanie obrazem, archiwum, sprawdzanie źródła, telefon do źródła, detektor AI, porównanie z danymi). Kara za opublikowaną fałszywkę jest największa, a za spóźnienie najmniejsza: lepiej się spóźnić niż skłamać.
- **Struktura:** kampania z 6 poziomów (6–8 minut każdy), trening, tryb bez końca z tablicą wyników. Sześć ról (Fotoedytor, Archiwista, Reporter, Redaktor prowadzący, Wszechstronny, Ratownik) daje premie i po jednej zdolności pod klawiszem R (np. Ekspertyza, Przedłużenie, Podaj teczkę), ale nie blokuje stanowisk.
- **Po grze:** Kolegium redakcyjne omawia każdą teczkę (co to było, jak działa sztuczka, co ją wykryło, gdzie zdarza się w świecie), a Encyklopedia technik zbiera odkryte triki jako karty.
- **Technika:** działa w przeglądarce na komputerze i telefonie (klawiatura, pad, dotyk), bez konta i instalacji. Serwer jest autorytatywny, treści są fikcyjne i bezpieczne (brak prawdziwych osób, firm i tragedii).

Pełny opis: [dokument projektowy](../design-document.pl.md).

## Mapowanie na kryteria

| Kryterium | Jak gra je spełnia | Dowód w grze |
| --- | --- | --- |
| **I.a Trafność problematyki** | Każda teczka opiera się na realnym mechanizmie dezinformacji, a stanowiska to prawdziwe metody fact-checkingu. | [Przykładowe teczki](cards/folders.html) (technika, narzędzie i realny odpowiednik w każdej), [Encyklopedia](screenshots/desktop/encyklopedia.png), [stanowiska](screenshots/desktop/stanowisko-lupa-obrazu.png) |
| **I.b Potencjał edukacyjny** | Nazwane kompetencje, metoda SIFT odwzorowana w stanowiskach, Kolegium z wyjaśnieniem każdej teczki, Encyklopedia technik. Pieczątka uzasadniająca werdykt blokuje zgadywanie. | [Kolegium](screenshots/desktop/kolegium.png), [błędny werdykt](screenshots/desktop/stol-wynik-blad.png), [wybór dowodu](screenshots/desktop/stol-dowod.png), [Encyklopedia: karta](screenshots/desktop/encyklopedia-karta.png) |
| **II.a Kreatywność** | Kooperacja pod presją czasu zamiast quizu. Gracz przechodzi proces weryfikacji, a nie zgaduje odpowiedzi. | [Rozgrywka](screenshots/desktop/rozgrywka.png), [nagranie](gameplay.webm) |
| **II.b Spójność formy i treści** | Presja czasu w grze to ta sama presja, której używa dezinformacja. Zdarzenia (telefon od szefa, „To już wszędzie jest!”, nalot botów) są lekcją, nie dodatkiem. | [Telefon od szefa](screenshots/desktop/zdarzenie-telefon-od-szefa.png), [wszędzie](screenshots/desktop/zdarzenie-wszedzie.png), [nalot botów](screenshots/desktop/zdarzenie-nalot-botow.png) |
| **III.a Jasność zasad** | Jeden cel, trzy werdykty, tabela punktacji, gwiazdki, warunek porażki (Wiarygodność do zera). Samouczek przy pierwszej grze i podpowiedzi „co dalej”. | [Samouczek](screenshots/desktop/samouczek-ruch.png), [briefing](screenshots/desktop/briefing.png), [werdykt](screenshots/desktop/stol-werdykt.png), [sterowanie](screenshots/desktop/ustawienia-sterowanie.png), [jak zagrać](how-to-play.pl.md) |
| **III.b Atrakcyjność mechaniki** | Dynamiczny co-op, role ze zdolnościami, zdarzenia losowe, sześć minigier, tryb bez końca z wynikami. | [Role](cards/role-cards.png), [zdolność roli](screenshots/desktop/rozgrywka-zdolnosc.png), [sześć stanowisk](screenshots/README.md), [tryb bez końca](screenshots/desktop/bez-konca-wyniki.png), [wyniki](screenshots/desktop/wyniki.png) |
| **V.a Kompletność wizualizacji** | Plan redakcji, zrzuty wszystkich ekranów, karty ról, przykładowe teczki, nagranie. | [Plan poz. 1](maps/l1-burza.png), [plan poz. 6](maps/l6-atak.png), [zrzuty](screenshots/README.md), [karty ról](cards/role-cards.html), [teczki](cards/folders.html), [nagranie](gameplay.webm) |
| **V.b Estetyka i spójność** | Jednolity styl komiksowy: jasne płaskie kolory, grube granatowe kontury, twarde cienie, czcionki Baloo 2 i Nunito, jedna żółta akcja na ekran. Pieczątki i teczki spójne z tematem redakcji. | [Menu](screenshots/desktop/menu.png), [rozgrywka poz. 6](screenshots/desktop/rozgrywka-poziom-6.png), [karty](cards/role-cards.png) |

## Co jest sprawdzone, a co czeka na ludzi

- Playtest z uczniami: **[uzupełnić po pierwszym playteście]** (liczba osób, wiek, wnioski, zmiany po testach).
- Weryfikacja merytoryczna zgłoszeń przez opiekuna: **[uzupełnić po przeglądzie merytorycznym]** (treści mają obecnie status `reviewed: false`).
- Test na szkolnej sieci i na urządzeniach uczniów: **[uzupełnić po teście na miejscu]** (lista kontrolna w `docs/playtests/`).
