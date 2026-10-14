[← Wróć do gry](/)

# Prywatność w grze „Redakcja na Ostatnią Chwilę”

<!-- Served at /prywatnosc (S7-75); syntax and blocks: packages/shared/src/markdown-lite.ts and apps/server/src/shell/privacy-page.ts. Keep the text in line with what the game does. -->

Krótka informacja dla nauczycieli, uczniów i rodziców. Gra jest zaprojektowana tak, żeby
zbierać jak najmniej danych: **bez kont, bez e-maili, bez śledzenia.**

## W skrócie

- Nie ma rejestracji ani logowania. Gracz wpisuje tylko **pseudonim** (1–16 znaków).
- Prosimy uczniów, by **nie używali imienia i nazwiska** ani żadnych danych pozwalających
  ich rozpoznać. Wystarczy przezwisko lub wymyślony podpis, np. „Reporter7”.
- Gra nie używa narzędzi analitycznych. Czcionki, dźwięki i grafiki są serwowane z tej samej
  strony.
- Wyniki w trybie bez końca (tablica wyników) są przechowywane **90 dni**, potem usuwane
  automatycznie.
- Każdy pokój jest **prywatny**: wchodzi się do niego tylko z kodem. Mecz mogą oglądać widzowie
  tylko wtedy, gdy gospodarz otworzy Widownię, a gracze zawsze widzą, że ktoś dołączył.

<!-- no-ads -->
**Pod tym adresem nie ma reklam.** Gra nie używa ciasteczek ani zewnętrznych usług.
<!-- /no-ads -->
<!-- ads -->
**Pod tym adresem gra pokazuje reklamy Google** (opis niżej, w części „Reklamy”). To jedyna
zewnętrzna usługa w grze. Gracz nie widzi reklam w trakcie rozgrywki nigdy.
<!-- /ads -->

## Jakie dane trafiają na serwer

| Dane | Po co | Jak długo |
| --- | --- | --- |
| Pseudonim gracza | Pokazanie go w pokoju (graczom i widzom), na biurku i w tablicy wyników; podpis gospodarza pokoju publicznego także na liście pokoi | Tylko na czas rozgrywki. Do bazy trafia wyłącznie po zakończeniu przebiegu w trybie bez końca w trybie „Razem” (patrz niżej) |
| Nazwa pokoju (nieobowiązkowa, nadaje ją gospodarz) | Pokazanie jej w poczekalni, a pokoju publicznego także na liście pokoi | Tylko w pamięci serwera, do zamknięcia pokoju; **nie jest zapisywana** w bazie ani w logach |
| Ustawienia i skład pokoju: tryb gry, pokój prywatny lub publiczny, otwarta Widownia, kto gra w której redakcji, kto ogląda | Działanie pokoju | Tylko w pamięci serwera, do zamknięcia pokoju |
| Statystyki meczu: liczba werdyktów (trafnych i chybionych), pieczątek, nieudanych zadań i użytych zdolności każdego gracza | Statystyki dla widzów w trakcie meczu i ekran wyników | Tylko w pamięci serwera, do zamknięcia pokoju; **nie są zapisywane** w bazie |
| Wynik drużyny w trybie bez końca: kod pokoju, pseudonimy graczy, liczba punktów, poziom trudności, czas przetrwania, data | Tablica wyników (globalna i klasowa, osobna dla każdego poziomu trudności) | **90 dni**, potem automatyczne usunięcie (sprawdzane co godzinę) |
| Głosy „Wpadka dnia” po omówieniu poziomu: który poziom i która wiadomość zmyliła | Statystyki dla nauczyciela. Głos nie jest powiązany z pseudonimem | **90 dni** |
| Stan gry w trakcie poziomu (pozycje, teczki, punkty) | Działanie rozgrywki | Tylko w pamięci serwera. Znika po zamknięciu pokoju, nigdy nie trafia do bazy |
| Wybrany kolor i dodatek postaci (z profilu) | Pokazanie postaci innym graczom w pokoju | Tylko w pamięci serwera, do zamknięcia pokoju; **nie jest zapisywany** w bazie ani w logach |
| Losowy identyfikator przeglądarki (ciąg przypadkowych znaków, bez danych o graczu) | Gdy gospodarz usunie kogoś z pokoju, ta sama przeglądarka nie wróci do tego pokoju przez 10 minut | Serwer zna go tylko w czasie połączenia z pokojem; identyfikator osoby usuniętej pamięta 10 minut, najdłużej do zamknięcia pokoju. **Nie jest zapisywany** w bazie ani w logach |
| Adres IP | Ochrona serwera przed nadużyciami (limit prób dołączania do pokoi, zakładania nowych i pobierania listy pokoi) | Tylko chwilowo w pamięci serwera; **nie jest zapisywany** w bazie ani w logach |

Serwer pośredniczący przed grą przekazuje jej prawdziwy adres IP gracza, żeby limity
dotyczyły jednej sieci, a nie wszystkich graczy naraz. Adres służy tylko do liczenia prób
w pamięci serwera i nie trafia nigdzie dalej. Serwer gry ani jego serwer pośredniczący nie
zapisują dzienników dostępu z adresami IP. Dzienniki techniczne zawierają kody pokoi i nazwy
zdarzeń (np. „pokój utworzony”), ale nie zawierają pseudonimów.

Pseudonimy w tablicy wyników są widoczne dla wszystkich, którzy ją otworzą (tablica globalna
pokazuje wyniki z wielu klas). Dlatego pseudonim nie powinien zdradzać tożsamości.

## Pokoje, lista pokoi i Widownia

Każdy pokój jest **prywatny**: dołącza się do niego tylko z czteroliterowym kodem, który
gospodarz podaje swojej grupie.

<!-- no-room-browser -->
Na tym serwerze **lista publicznych pokoi jest wyłączona**, więc żadnego pokoju nie widać
z zewnątrz.
<!-- /no-room-browser -->
<!-- room-browser -->
Na tym serwerze działa **lista publicznych pokoi**. Gospodarz może oznaczyć swój pokój jako
publiczny. Wtedy każdy, kto otworzy grę, widzi na liście: kod pokoju, nazwę pokoju, podpis
gospodarza, poziom, tryb gry, poziom trudności, liczbę graczy i widzów, czy trwa gra i od ilu
minut pokój jest otwarty. Podpisów pozostałych graczy lista nie pokazuje. Z listy można dołączyć
do pokoju albo go oglądać, tak jak z kodem. Pokój znika z listy, gdy gospodarz z powrotem
zmieni go na prywatny albo gdy nikt w nim nie jest połączony.
<!-- /room-browser -->

- **Filtr nazw.** Nazwy pokoi i podpisy gospodarzy na liście pokoi przechodzą przez filtr
  wulgaryzmów: niedozwolonej nazwy nie da się ustawić, a niedozwolony podpis lista zastępuje
  gwiazdkami.
- **Widownia.** Gospodarz może otworzyć Widownię (domyślnie jest zamknięta): wtedy do 8 osób
  z kodem pokoju może oglądać grę bez grania. Gospodarz może też sam oglądać, np. z projektora.
  Widzowie widzą podpisy graczy, ich postacie i pracę w redakcji, ich statystyki w trakcie
  meczu i wyniki po meczu. Gracze zawsze wiedzą, że ktoś ogląda: wejście widza ogłasza
  komunikat „Widz dołączył”, a poczekalnia pokazuje listę widzów z ich podpisami.
- **Usunięcie z pokoju.** Gospodarz może usunąć gracza albo widza. Serwer pamięta wtedy losowy
  identyfikator jego przeglądarki przez 10 minut, tylko dla tego pokoju i tylko w pamięci.
  Gra nie blokuje adresów IP, bo cała klasa ma zwykle jeden adres.

Administrator może pokazać w menu głównym **komunikat redakcji** (np. o przerwie
technicznej). Komunikat jest taki sam dla wszystkich i nie zbiera żadnych danych.

<!-- ads -->
## Reklamy

- Reklamy Google AdSense pojawiają się tylko w **menu głównym, w lobby i na ekranie wyników**,
  a u widzów w panelu statystyk i w wynikach meczu, zawsze w osobnej ramce z napisem „Reklama”,
  z dala od przycisków gry. **Nigdy w trakcie gry** gracza, w odprawie, przy stanowiskach, obok
  podglądu redakcji ani w innych oknach dialogowych i **nigdy na telefonach**.
- Skrypt reklam wczytuje się dopiero na ekranie z reklamą. Na telefonie i na małym ekranie
  gra nie łączy się z Google wcale.
- Bloker reklam nie przeszkadza w grze.

<!-- ads-limited -->
**Tylko reklamy ograniczone.** Każde zapytanie o reklamę jest oznaczone jako pochodzące od
osoby poniżej wieku zgody, więc Google pokazuje wyłącznie reklamy ograniczone: **bez ciasteczek
reklamowych i bez zapisu w pamięci przeglądarki**, bez profilowania i bez reklam
spersonalizowanych.
<!-- /ads-limited -->
<!-- ads-minors -->
Zapytania są też oznaczone jako pochodzące od osób niepełnoletnich, co włącza dodatkowe
ograniczenia treści reklam.
<!-- /ads-minors -->
<!-- ads-cookies -->
**Reklamy niespersonalizowane.** Google nie profiluje graczy, ale może używać ciasteczek,
np. do ograniczania liczby wyświetleń tej samej reklamy i wykrywania nadużyć, jeśli zgodzisz
się na to w oknie zgód (niżej). Ten tryb jest dostępny tylko dla dorosłych odbiorców.
<!-- /ads-cookies -->

- Przy wyświetlaniu reklamy Google przetwarza adres IP oraz dane o urządzeniu i przeglądarce
  jako **niezależny administrator** danych:
  [jak Google wykorzystuje informacje z witryn partnerów](https://policies.google.com/technologies/partner-sites).
- **Okno zgód.** Przy pierwszej wizycie z Europejskiego Obszaru Gospodarczego Google może
  pokazać certyfikowane okno zgód (standard IAB TCF). Twój wybór Google zapisuje w ciasteczku
  tej strony. To jedyny wyjątek od zasady, że gra korzysta z pamięci przeglądarki, a nie
  z ciasteczek.
- **Zmiana decyzji.** Przycisk „Zgody reklamowe” pod menu głównym otwiera to okno ponownie,
  więc zgodę można w każdej chwili zmienić lub wycofać. Przycisk pojawia się, gdy skrypt
  reklam jest już wczytany.
- Szkoła może poprosić administratora o adres gry bez reklam (kontakt niżej).
<!-- /ads -->

## Co zostaje w przeglądarce ucznia

Gra zapisuje w przeglądarce (pamięć lokalna, nie ciasteczka), na urządzeniu ucznia:

- ostatnio użyty pseudonim, ustawienia gry (np. dźwięk, animacje, wyłączone podpowiedzi),
- postęp: najlepsze wyniki poziomów i trybu bez końca (osobno dla każdego poziomu trudności),
  odblokowane karty w Encyklopedii manipulacji,
- oznaczenie, że samouczek i wprowadzenie (`redakcja.intro.seen.v1`) zostały już obejrzane;
  dzięki temu wprowadzenie odtwarza się samo tylko w pierwszym pokoju treningowym,
- listę stanowisk, przy których gracz widział już kartę pomocy (`redakcja.stationHelp.v1`),
  żeby nie pokazywać jej przy każdym podejściu; przycisk „Pokaż pomoc stanowisk od nowa”
  w ustawieniach ją czyści,
- profil gracza (`redakcja.profile.v1`): liczbę rozegranych i wygranych wydań, werdyktów
  (trafnych i chybionych), zebranych pieczątek, nieudanych zadań i użytych zdolności, liczbę
  wydań w każdej roli oraz wybrany kolor i dodatek postaci; przycisk „Wyczyść statystyki”
  w oknie „Profil” usuwa liczby,
- oznaczenie zamkniętego komunikatu redakcji, żeby ten sam komunikat nie pokazywał się znowu,
- losowy identyfikator przeglądarki (`redakcja.clientId`), wspólny dla wszystkich kart; gra
  wysyła go przy wejściu do pokoju, żeby osoba usunięta przez gospodarza nie wróciła od razu
  (blokada dotyczy jednej przeglądarki, a nie całej szkolnej sieci),
- tymczasowy znak pozwalający wrócić do pokoju po chwilowej utracie połączenia (tylko do
  zamknięcia karty przeglądarki).

Te dane nigdy nie opuszczają urządzenia, poza pseudonimem, identyfikatorem przeglądarki
oraz kolorem i dodatkiem postaci wysyłanymi do pokoju. Można je
usunąć, czyszcząc dane witryny w przeglądarce.

## Głos lektora w intro

Intro gry czyta lektor: ochotnik, który nagrał 17 krótkich kwestii i oddał nagranie do domeny
publicznej (CC0). Gra nie nagrywa graczy i nie korzysta z mikrofonu. Głos ochotnika to jego dane
osobowe, dlatego:

- ochotnik nagrywa po podpisaniu formularza zgody, a osoba poniżej 18 lat także za zgodą rodzica
  lub opiekuna prawnego;
- ochotnik wybiera, czy w grze widnieje jego imię i nazwisko, pseudonim, czy podpis
  „anonimowy ochotnik”;
- oryginalne nagrania i formularz są przechowywane poza repozytorium gry, tylko tak długo, jak
  głos jest w grze;
- zgodę można wycofać w każdej chwili, pisząc do administratora (niżej). Najpóźniej w ciągu
  miesiąca nagranie i podpis znikają z bieżącej wersji gry, a oryginały są usuwane. Kopii
  pobranych wcześniej przez inne osoby (CC0) i starszych wersji w historii repozytorium projekt
  nie może usunąć.

Instrukcja nagrania i pełny tekst formularza: `docs/voice-recording.pl.md`.

## Treści w grze

Wszystkie historie w grze są **fikcyjne**: miasto Nowe Brzegi, wymyślone osoby, firmy
i wydarzenia. Gra nie odnosi się do prawdziwych osób, partii ani tragedii. Każda historia
kończy się wyjaśnieniem, jak działa dana manipulacja, oraz przykładem narzędzia, które ją
ujawnia. Treści przechodzą weryfikację merytoryczną przed użyciem na lekcji.

## Prawa i kontakt

- Skoro nie ma kont, nie da się przypisać wyniku do konkretnej osoby bez jej pseudonimu
  i kodu pokoju. Jeśli uczeń lub rodzic chce **usunąć wpis** z tablicy wyników przed upływem
  90 dni, wystarczy podać administratorowi pseudonim, przybliżoną datę gry i kod pokoju,
  a wpis zostanie usunięty ręcznie.
- Administrator serwera: **{{operator.name|[do uzupełnienia: imię i nazwisko, szkoła lub organizacja]}}**.
- Kontakt: {{operator.contact|[do uzupełnienia: adres e-mail]}}.
- Serwer: {{operator.hosting|[do uzupełnienia: kraj i dostawca]}}. Połączenie jest szyfrowane
  (HTTPS).

## Uwaga dla nauczyciela

Zanim uczniowie zagrają, powiedz im jednym zdaniem: „Wpisz wymyślony pseudonim, nie swoje
imię i nazwisko.” W razie wątpliwości co do zgodności z regulaminem szkoły lub RODO
skonsultuj się z inspektorem ochrony danych w szkole; ta informacja opisuje, jakie dane gra
faktycznie zbiera.
