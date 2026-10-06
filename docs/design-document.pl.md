# Redakcja na Ostatnią Chwilę — dokument projektowy

Oct 6, 2026 · @KamilWida

## Koncepcja i cel gry

**Redakcja na Ostatnią Chwilę** to kooperacyjna gra zręcznościowo-logiczna dla 3–4 graczy, działająca w całości w przeglądarce. Każdy gracz siedzi przy swoim laptopie. Gracze prowadzą newsroom, do którego bez przerwy spływają zgłoszenia: zdjęcia, cytaty, screeny postów, nagrania i statystyki. Zespół musi biegać między stanowiskami weryfikacji, zbierać dowody i przed upływem czasu zdecydować: publikujemy, odrzucamy albo publikujemy z kontekstem.

Gra łączy chaos i presję czasu znane z Overcooked z rzetelną pracą fact-checkera. Napięcie między „szybko” a „rzetelnie” jest tu osią rozgrywki, a nie dodatkiem. To samo napięcie wykorzystują twórcy dezinformacji w prawdziwej sieci.

**Temat konkursowy:** Krytyczne myślenie i odporność cyfrowa.

**Grupa docelowa:** licealiści (15–19 lat), rozgrywka 3–4 osób, poziom trwa 6–8 minut, sesja z omówieniem około 30–40 minut. Długość pasuje do jednej lekcji.

**Cel edukacyjny:** gracz wychodzi z gry z nawykiem „zatrzymaj się i sprawdź”, zanim uwierzy lub udostępni. Zna też konkretne techniki weryfikacji i wie, kiedy których użyć. Struktura stanowisk odwzorowuje metodę SIFT (Stop, Investigate the source, Find better coverage, Trace claims) i czytanie lateralne, stosowane przez zawodowych fact-checkerów.

**Kompetencje rozwijane przez grę:**

1. Rozpoznawanie typowych form dezinformacji: stare zdjęcie podpisane jako nowe, zmyślony cytat, wyrwanie z kontekstu, fałszywe konto, zmanipulowana statystyka, satyra brana na serio, materiał wygenerowany przez AI.
2. Dobór właściwego narzędzia weryfikacji do typu materiału: wyszukiwanie obrazem, sprawdzenie daty i archiwum, sprawdzenie autora i domeny, dotarcie do źródła pierwotnego.
3. Odporność na presję czasu i emocji. Gra nagradza zatrzymanie się, a karze publikowanie „na wszelki wypadek”.
4. Rozumienie ograniczeń narzędzi: detektor AI podaje prawdopodobieństwo, a nie dowód, więc gracz uczy się łączyć kilka przesłanek.
5. Komunikacja i podział pracy w zespole pod presją.

**Czym różni się od istniejących gier:** Bad News i Go Viral! stawiają gracza po stronie manipulatora i są jednoosobowe. Quizy typu „prawda czy fałsz” sprawdzają wiedzę, ale nie uczą procesu. Tutaj gracze wspólnie przechodzą cały proces weryfikacji, a każda decyzja ma koszt czasowy.

## Zasady i przebieg gry

Zespół wygrywa poziom, jeśli przed końcem czasu zdobędzie co najmniej 1 gwiazdkę, a wskaźnik Wiarygodności redakcji nie spadnie do zera.

### Przygotowanie

1. Jeden gracz zakłada pokój i dostaje 4-literowy kod. Pozostali wpisują go na stronie gry. Nie trzeba zakładać konta, wystarczy pseudonim.
2. Każdy wybiera rolę. Role dają premię, ale nie blokują żadnego stanowiska, więc zespół może grać w dowolnym składzie.
3. Gospodarz wybiera poziom z kampanii. Przed startem gracze widzą krótkie „briefing redakcyjny”: temat dnia i nowe mechaniki.

### Role

| Rola | Premia | Typowe zadanie |
| --- | --- | --- |
| Fotoedytor | Analiza obrazu 40% szybciej | Wyszukiwanie obrazem, wykrywanie edycji i AI |
| Archiwista | Archiwum i kalendarz 40% szybciej | Sprawdzanie dat, starych wersji stron, kontekstu |
| Reporter | Telefon do źródła bez kolejki | Dotarcie do źródła pierwotnego i świadków |
| Redaktor prowadzący | Może przedłużyć termin jednego zgłoszenia na poziom | Decyzje na stole redakcyjnym, koordynacja |

Przy 3 graczach rolę Redaktora prowadzącego przejmuje dowolny gracz przy stole redakcyjnym, bez premii.

### Sterowanie

WASD lub strzałki to ruch, E to podniesienie i odłożenie teczki, Spacja to praca na stanowisku (przytrzymanie), Q to szybki sygnał dla zespołu („Potrzebuję Archiwum!”, „Fałszywka!”, „Biorę to”). Obsługiwany jest też gamepad.

### Pętla rozgrywki

1. **Zgłoszenie wpada.** Na taśmie przy wejściu pojawia się teczka. Ma typ (zdjęcie, cytat, post, nagranie, statystyka, artykuł), wagę (zwykły / ważny / pilny) i licznik czasu.
2. **Gracz podnosi teczkę i niesie ją na stanowisko.** Każde stanowisko to minigra trwająca 3–8 sekund (patrz niżej). Po ukończeniu na teczce pojawia się pieczątka z wynikiem, np. „Zdjęcie znalezione w sieci w 2019 r.”.
3. **Zbieranie dowodów.** Do pewnego werdyktu potrzebne są zwykle 2–3 pieczątki. Nie każde stanowisko pomaga przy każdym typie materiału. Zły dobór narzędzia kosztuje czas, a nie punkty.
4. **Stół redakcyjny.** Gracz kładzie teczkę na stole i wybiera werdykt: Publikuj, Odrzuć albo Publikuj z kontekstem. Przy werdykcie musi wskazać pieczątkę, która go uzasadnia. To blokuje zgadywanie.
5. **Wynik.** Gra natychmiast pokazuje efekt. Przy błędzie pokazuje też, co dokładnie przeoczono.

### Stanowiska weryfikacji

| Stanowisko | Co sprawdza | Minigra | Odpowiednik w realnym świecie |
| --- | --- | --- | --- |
| Lupa obrazu | Czy zdjęcie pojawiło się wcześniej i gdzie | Dopasowanie fragmentów zdjęcia do wyników wyszukiwania | Wyszukiwanie obrazem (Google Lens, TinEye) |
| Archiwum | Daty, poprzednie wersje stron, usunięte treści | Przewijanie osi czasu i zatrzymanie na właściwej dacie | Wayback Machine, metadane |
| Kartoteka źródeł | Autor, domena, historia konta | Porównanie profilu z sygnałami ostrzegawczymi | Sprawdzanie domeny, wiek konta, czytanie lateralne |
| Telefon | Źródło pierwotne, świadek, ekspert | Wybranie właściwego numeru, potem czekanie w kolejce | Kontakt ze źródłem, oryginalny raport |
| Skaner AI | Ślady generowania lub edycji | Odczyt wyniku w procentach, z marginesem błędu | Detektory AI, analiza artefaktów |
| Biblioteka danych | Czy statystyka zgadza się ze źródłem | Porównanie liczby z oryginalną tabelą | GUS, Eurostat, raporty źródłowe |

### Werdykty

- **Publikuj:** materiał prawdziwy i potwierdzony.
- **Odrzuć:** materiał fałszywy, zmyślony lub niemożliwy do potwierdzenia przy wysokiej wadze.
- **Publikuj z kontekstem:** materiał prawdziwy, ale wprowadzający w błąd (stare zdjęcie, wyrwany cytat, satyra). Ten werdykt daje najwięcej punktów, bo wymaga najlepszego zrozumienia.

### Punktacja

| Sytuacja | Punkty | Wiarygodność |
| --- | --- | --- |
| Trafny werdykt, materiał zwykły | +10 | bez zmian |
| Trafny werdykt, materiał ważny lub pilny | +20 | +5 |
| Trafny werdykt „Publikuj z kontekstem” | +30 | +5 |
| Premia za tempo (ponad połowa czasu w zapasie) | +5 | bez zmian |
| Opublikowana fałszywka | −20 | −25 |
| Odrzucony prawdziwy materiał | −10 | −10 |
| Przeterminowane zgłoszenie (nikt nie zdążył) | −5 | −5 |

Wiarygodność startuje od 100. Gdy spadnie do 0, redakcja traci zaufanie czytelników i poziom kończy się porażką. Kara za opublikowaną fałszywkę jest celowo największa, a kara za przeterminowanie najmniejsza. Gra uczy w ten sposób, że lepiej się spóźnić niż podać nieprawdę.

Gwiazdki: 1 gwiazdka za przetrwanie z dodatnim wynikiem, 2 i 3 gwiazdki za progi punktowe ustalone dla każdego poziomu.

### Zdarzenia losowe

W trakcie poziomu pojawiają się zdarzenia, które symulują realne techniki presji:

- **„To już wszędzie jest!”** Zgłoszenie z licznikiem udostępnień, który rośnie na oczach graczy. Kusi, żeby opublikować bez sprawdzania.
- **Telefon od szefa.** Naczelny żąda natychmiastowej publikacji. Ustąpienie daje punkty tylko wtedy, gdy materiał był prawdziwy.
- **Nalot botów.** Na taśmę wpada fala niemal identycznych zgłoszeń. Wystarczy rozpoznać jedno, ale trzeba to zauważyć.
- **Awaria.** Jedno stanowisko przestaje działać na 20 sekund i zespół musi improwizować.
- **Sprostowanie.** Wcześniej opublikowany materiał okazuje się zmanipulowany. Kto pierwszy zaniesie teczkę do stołu i opublikuje sprostowanie, odzyskuje połowę straconej Wiarygodności.

### Kolegium redakcyjne (omówienie po poziomie)

Po każdym poziomie gracze widzą ekran podsumowania. Każde zgłoszenie jest tam opisane: co to było, jaka technika manipulacji, jakie narzędzie to wykrywało, gdzie podobny przypadek zdarzył się w rzeczywistości. Gracze głosują też na „wpadkę dnia”, czyli materiał, który najbardziej ich zmylił. To element najmocniej punktowany w kryterium potencjału edukacyjnego, bo zamienia doświadczenie z gry w nazwaną wiedzę.

## Treści i poziomy

Gra ma kampanię z 6 poziomów i tryb nieskończony. Akcja toczy się w fikcyjnym mieście Nowe Brzegi. Dzięki temu treści są oparte na prawdziwych mechanizmach dezinformacji, ale nie dotyczą realnych polityków, firm ani tragedii. Unika to sporów i problemów z prawami do zdjęć.

### Kampania

| Poziom | Temat dnia | Nowa mechanika | Główne techniki manipulacji |
| --- | --- | --- | --- |
| 1. Pierwszy dzień | Burza nad miastem | Lupa obrazu, Kartoteka, stół | Stare zdjęcie jako nowe, fałszywe konto instytucji |
| 2. Wybory samorządowe | Kampania na prezydenta miasta | Archiwum, werdykt „z kontekstem” | Zmyślony cytat, wyrwanie z kontekstu, fałszywy sondaż |
| 3. Afera w szkole | Viral o dyrektorze liceum | Telefon do źródła, zdarzenie „To już wszędzie jest!” | Plotka bez źródła, screen bez linku, presja społeczna |
| 4. Zdrowie | Nowy suplement i „cudowne badanie” | Biblioteka danych | Zmanipulowana statystyka, fałszywy ekspert, korelacja jako przyczyna |
| 5. Głęboka podróbka | Nagranie burmistrza | Skaner AI, zdarzenie „Telefon od szefa” | Deepfake audio i wideo, obraz z AI |
| 6. Atak | Skoordynowana kampania przed referendum | Nalot botów, sprostowania | Sieć botów, astroturfing, hashtag tworzony sztucznie |

Tryb nieskończony losuje zgłoszenia ze wszystkich poziomów i przyspiesza z każdą minutą. Ma tablicę wyników dla pokoju.

### Rodzaje materiałów

Każde zgłoszenie ma ukryty status prawdziwości, który gracze muszą odkryć:

- **Prawda:** potwierdzone, publikujemy.
- **Fałsz:** zmyślone lub zmanipulowane, odrzucamy.
- **Zwodnicze:** prawdziwy materiał w fałszywym kontekście, publikujemy z kontekstem.
- **Satyra:** prawdziwy żart brany na serio, publikujemy z kontekstem.
- **Niepotwierdzalne:** nie da się sprawdzić. Przy wadze „pilny” odrzucamy, przy wadze „zwykły” można przeczekać do końca licznika bez kary.

### Przykładowe zgłoszenia

**Zdjęcie zalanej ulicy.** Post: „Tak teraz wygląda centrum Nowych Brzegów!”. Lupa obrazu pokazuje, że zdjęcie krąży w sieci od 2019 r. i pochodzi z innego kraju. Werdykt: Publikuj z kontekstem (burza jest prawdziwa, zdjęcie nie).

**Cytat kandydata.** Grafika z cytatem: „Młodzież nie powinna mieć prawa głosu”. Archiwum pokazuje pełne nagranie debaty, w którym kandydat cytuje to zdanie, żeby z nim polemizować. Werdykt: Odrzuć jako zmanipulowany cytat.

**Komunikat straży miejskiej.** Post z konta „StrazMiejska\_NoweBrzegi”. Kartoteka źródeł pokazuje, że konto założono 2 dni temu i nie ma znacznika weryfikacji, a prawdziwe konto ma inną nazwę. Werdykt: Odrzuć.

**„9 na 10 lekarzy poleca”.** Biblioteka danych pokazuje, że ankietę przeprowadził producent suplementu wśród 10 osób. Werdykt: Odrzuć.

**Nagranie burmistrza.** Skaner AI daje 62% prawdopodobieństwa generowania, więc nie przesądza. Telefon do biura burmistrza potwierdza, że w dniu nagrania był na urlopie za granicą. Werdykt: Odrzuć. Lekcja: jeden wynik detektora to nie dowód, trzeba go połączyć z innym źródłem.

### Zasady tworzenia treści

- Każde zgłoszenie ma uzasadnienie i odniesienie do prawdziwego mechanizmu, widoczne na Kolegium.
- Zdjęcia: własne, wygenerowane do gry lub z licencji CC0. Żadnych zdjęć realnych ofiar ani realnych osób publicznych.
- Treści przegląda opiekun merytoryczny (nauczyciel WOS lub informatyki) przed oddaniem.
- Na start potrzeba około 120 zgłoszeń (6 poziomów po około 15, plus pula do trybu nieskończonego).

## Interfejs i wizualizacja

Gra wygląda jak makieta redakcji widziana z góry pod kątem: 3D w stylu low-poly, z interfejsem 2D nałożonym na scenę. Taki styl dobrze działa na słabszych szkolnych laptopach i jest czytelny przy szybkiej rozgrywce.

### Styl graficzny

- **Świat:** low-poly, ciepłe kolory papieru i drewna, akcenty w czerwieni redakcyjnej. Teczki mają kolor zależny od typu materiału, a ikona na wierzchu pokazuje, co jest w środku.
- **Postacie:** proste, przerysowane figurki redaktorów z akcesorium roli (aparat, okulary archiwisty, notes, krawat).
- **Interfejs:** motyw gazetowy, czcionka szeryfowa w nagłówkach i bezszeryfowa w treści, pieczątki jako główny element wizualny.
- **Dźwięk:** szum redakcji, dzwonek nowego zgłoszenia, stuk pieczątki, alarm przy kończącym się czasie.
- **Dostępność:** paleta bezpieczna dla daltonistów (typ materiału rozpoznawalny też po ikonie, nie tylko kolorze), skalowanie tekstu, tryb bez migania.

### Ekrany

| Ekran | Co zawiera |
| --- | --- |
| Menu główne | Graj, Dołącz kodem, Encyklopedia technik, Ustawienia |
| Lobby | Kod pokoju, lista graczy, wybór roli i koloru postaci, przycisk gotowości |
| Wybór poziomu | Mapa kampanii z gwiazdkami, opis tematu dnia |
| Briefing | Krótka zapowiedź poziomu i nowej mechaniki, 15–20 sekund |
| Rozgrywka | Scena 3D redakcji; u góry kolejka zgłoszeń z licznikami czasu; z boku wskaźnik Wiarygodności i punkty; nad graczami ikony sygnałów |
| Minigra stanowiska | Nakładka 2D na pół ekranu, scena w tle dalej żyje i reszta zespołu się porusza |
| Stół redakcyjny | Teczka z pieczątkami, trzy przyciski werdyktu, wskazanie uzasadniającej pieczątki |
| Kolegium redakcyjne | Lista zgłoszeń z poziomu, wyjaśnienia, głosowanie na „wpadkę dnia”, gwiazdki |
| Encyklopedia technik | Odblokowywane karty technik manipulacji i narzędzi weryfikacji, z przykładami z gry |

### Materiały do zgłoszenia konkursowego

Na potrzeby kryterium wizualizacji warto przygotować: zrzuty z każdego ekranu, plan redakcji z podpisanymi stanowiskami, karty postaci i ról, 3–4 przykładowe teczki z pieczątkami oraz 60–90-sekundowe nagranie rozgrywki.

## Architektura techniczna

Całość to monorepo w TypeScript na Bunie: klient w React + three.js (przez React Three Fiber) i autorytatywny serwer gry na natywnych WebSocketach Buna. Logika gry siedzi we wspólnym pakiecie, więc serwer i klient liczą ją tym samym kodem.

&#91;embedded content: architektura · przeglądarka, Caddy, serwer gry, wspólny pakiet\]

Przeglądarka łączy się wyłącznie przez Caddy na porcie 443, co omija blokady w szkolnych sieciach; serwer gry nie jest wystawiony bezpośrednio.

### Stack

| Warstwa | Technologia | Po co |
| --- | --- | --- |
| Runtime i menedżer pakietów | Bun | Workspaces, uruchamianie serwera, testy, skrypty |
| Język | TypeScript (strict) | Wspólne typy protokołu dla klienta i serwera |
| Bundler klienta | Vite | Szybki dev server z HMR, build statyczny |
| UI | React 19 | Menu, lobby, nakładki, minigry, Kolegium |
| Scena 3D | three.js + @react-three/fiber + @react-three/drei | Redakcja, postacie, teczki, kamera |
| Stan klienta | Zustand | Stan UI i ostatni snapshot z serwera |
| Sieć | Bun.serve z WebSocket (pub/sub na pokój) | Pokoje, synchronizacja stanu, bez dodatkowych bibliotek |
| Walidacja | Zod | Wiadomości sieciowe i pliki treści |
| Dźwięk | Howler.js | Efekty i muzyka, obsługa blokady autoplay |
| Modele 3D | Blender → glTF (.glb), optymalizacja gltf-transform | Lekkie modele, jeden format |
| Bazowe assety | Kenney (CC0) + własne | Szybki start bez problemów licencyjnych |
| Jakość kodu | Biome | Lint i formatowanie w jednym narzędziu |
| Testy | bun test + Playwright | Logika gry jednostkowo, multiplayer end-to-end w kilku kartach przeglądarki |
| CI/CD | Forgejo Actions | Lint, typecheck, testy, build, obraz Dockera, deploy |
| Hosting | Docker Compose: Caddy + serwer Bun | Statyczny klient, reverse proxy, automatyczny TLS (wymagany dla wss) |

### Struktura repozytorium

```
redakcja/
├── package.json            # bun workspaces: apps/*, packages/*
├── biome.json
├── tsconfig.base.json
├── docker-compose.yml      # caddy + server
├── Caddyfile
├── .forgejo/workflows/ci.yml
├── apps/
│   ├── client/             # Vite + React + R3F
│   │   ├── src/
│   │   │   ├── scene/      # redakcja, postacie, teczki, kamera
│   │   │   ├── stations/   # minigry stanowisk (komponenty 2D)
│   │   │   ├── screens/    # menu, lobby, briefing, kolegium
│   │   │   ├── net/        # klient WebSocket, interpolacja, predykcja
│   │   │   ├── input/      # klawiatura, gamepad
│   │   │   └── store/      # zustand
│   │   └── public/assets/  # .glb, tekstury, dźwięki
│   └── server/             # Bun.serve
│       └── src/
│           ├── rooms/      # tworzenie pokoi, kody, dołączanie
│           ├── loop.ts     # pętla 20 ticków na sekundę
│           └── index.ts
├── packages/
│   ├── shared/             # logika gry wspólna dla obu stron
│   │   ├── sim/            # ruch, kolizje, stanowiska, punktacja
│   │   ├── protocol.ts     # typy i schematy zod wiadomości
│   │   └── constants.ts    # czasy, punkty, balans
│   └── content/            # treści gry
│       ├── schema.ts       # schemat zgłoszenia i poziomu
│       ├── levels/         # level-1.json … level-6.json
│       ├── stories/        # zgłoszenia (JSON) + obrazy
│       └── validate.ts     # skrypt sprawdzający treści w CI
├── tools/
│   └── level-editor/       # prosty edytor układu redakcji (opcjonalny)
└── docs/                   # dokumentacja konkursowa, zrzuty ekranu
```

### Model sieciowy

- **Serwer jest autorytatywny.** Klient wysyła tylko wejście gracza (kierunek ruchu, akcja). Serwer liczy stan i rozsyła go do pokoju. Dzięki temu nikt nie oszuka punktacji, a stan jest spójny u wszystkich.
- **Tick 20 Hz po stronie serwera, render 60 FPS po stronie klienta.** Klient przewiduje ruch własnej postaci od razu, a pozycje innych graczy interpoluje między snapshotami z opóźnieniem około 100 ms. Gra jest grywalna przy pingu do około 150 ms.
- **Kolizje na siatce.** Redakcja składa się z kafli, więc wystarczą proste kolizje prostokątów zamiast silnika fizyki.
- **Pokoje w pamięci.** Do 4 graczy w pokoju, kod 4 litery. Po rozłączeniu gracz ma 60 sekund na powrót na swoje miejsce. Baza danych nie jest potrzebna; opcjonalnie bun:sqlite dla tablicy wyników.
- **Bez kont i danych osobowych.** Tylko pseudonim, co upraszcza sprawy RODO w szkole.

### Protokół wiadomości

| Kierunek | Wiadomość | Zawartość |
| --- | --- | --- |
| Klient → serwer | join | Kod pokoju, pseudonim |
| Klient → serwer | lobby | Wybór roli, gotowość, wybór poziomu (gospodarz) |
| Klient → serwer | input | Numer sekwencji, wektor ruchu, akcje (podnieś, pracuj, sygnał) |
| Klient → serwer | verdict | Id teczki, werdykt, id uzasadniającej pieczątki |
| Serwer → klient | snapshot | Tick, pozycje graczy i teczek, stany stanowisk, liczniki |
| Serwer → klient | event | Nowe zgłoszenie, wynik werdyktu, zdarzenie losowe, sygnał gracza |
| Serwer → klient | levelEnd | Wynik, gwiazdki, dane do Kolegium |

Na start wiadomości w JSON. Jeśli ruch sieciowy okaże się za duży, można przejść na msgpack bez zmiany typów.

### Wymagania wydajnościowe

- Cel: stabilne 60 FPS na zintegrowanej grafice szkolnego laptopa (np. Intel UHD 620) w Chrome, Edge i Firefoksie.
- Budżet sceny: do 100 tys. trójkątów i około 150 wywołań rysowania; powtarzalne meble przez instancing.
- Rozmiar pierwszego pobrania: do 10 MB, assety ładowane z paskiem postępu.
- Ustawienie jakości (cienie, rozdzielczość renderowania) dla najsłabszych maszyn.

## Plan prac i kryteria oceny

Pełna gra multiplayer 3D to duży projekt, więc kolejność prac zakłada, że po każdym etapie istnieje grywalna wersja do oddania. Jeśli zabraknie czasu, oddajecie wersję z mniejszą liczbą poziomów, a nie niedokończoną całość.

### Etapy

1. **Fundament:** monorepo, CI, deploy pustej sceny, pokoje i dołączanie kodem, ruch 2–4 postaci zsynchronizowany przez sieć.
2. **Rdzeń rozgrywki:** teczki, podnoszenie, 3 stanowiska (Lupa, Archiwum, Kartoteka), stół redakcyjny, punktacja i Wiarygodność. Na szarych kostkach zamiast grafiki.
3. **Poziom 1 kompletny:** 15 zgłoszeń, Kolegium, pierwsze assety. Pierwsze testy z prawdziwymi licealistami.
4. **Pozostałe stanowiska i zdarzenia:** Telefon, Skaner AI, Biblioteka danych, zdarzenia losowe, poziomy 2–6.
5. **Oprawa:** docelowe modele, dźwięk, animacje, Encyklopedia technik, dostępność.
6. **Szlif i dokumentacja:** balans czasów i punktów po testach, materiały konkursowe, nagranie rozgrywki.

### Jak gra odpowiada na kryteria

| Kryterium | Jak gra je spełnia |
| --- | --- |
| I.a Trafność problematyki | Każde zgłoszenie to realny mechanizm dezinformacji; stanowiska to prawdziwe metody fact-checkingu |
| I.b Potencjał edukacyjny | Nazwane kompetencje, metoda SIFT, Kolegium z wyjaśnieniami, Encyklopedia technik |
| II.a Kreatywność | Kooperacja pod presją czasu zamiast quizu; gracz przechodzi proces weryfikacji, nie zgaduje odpowiedzi |
| II.b Spójność | Presja czasu w grze to ta sama presja, której używa dezinformacja; mechanika jest lekcją |
| III.a Jasność zasad | Jeden cel, trzy werdykty, tabela punktacji, gwiazdki, warunek porażki |
| III.b Atrakcyjność mechaniki | Dynamiczny co-op, role, zdarzenia losowe, tryb nieskończony z wynikami |
| V.a Kompletność wizualizacji | Plan redakcji, zrzuty wszystkich ekranów, karty ról, przykładowe teczki, nagranie |
| V.b Estetyka i spójność | Gazetowy styl UI i pieczątki spójne z tematem redakcji |

### Otwarte pytania

- Jaki jest termin oddania projektu? Od tego zależy, ile etapów realnie zmieścicie.
- Ile osób jest w zespole i kto robi grafikę 3D, a kto treści?
- Czy macie opiekuna merytorycznego, który sprawdzi zgłoszenia pod kątem poprawności?
- Czy gra ma działać w szkolnej sieci? Niektóre szkolne sieci blokują WebSockety lub nietypowe porty, więc serwer powinien działać na porcie 443.
- Czy gracze grają w jednej sali (rozmawiają na żywo), czy zdalnie? Przy grze zdalnej warto dodać czat głosowy lub zostawić to Discordowi.
- Czy jury może zagrać samo? Jeśli tak, przyda się tryb dla 1–2 graczy z botem pomocnikiem.
