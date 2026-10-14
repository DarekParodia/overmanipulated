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

<!-- no-ads -->
**Pod tym adresem nie ma reklam.** Gra nie używa ciasteczek ani zewnętrznych usług.
<!-- /no-ads -->
<!-- ads -->
**Pod tym adresem gra pokazuje reklamy Google** (opis niżej, w części „Reklamy”). To jedyna
zewnętrzna usługa w grze. W trakcie rozgrywki reklam nie ma nigdy.
<!-- /ads -->

## Jakie dane trafiają na serwer

| Dane | Po co | Jak długo |
| --- | --- | --- |
| Pseudonim gracza | Pokazanie go w pokoju, na biurku i w tablicy wyników | Tylko na czas rozgrywki. Do bazy trafia wyłącznie po zakończeniu przebiegu w trybie bez końca (patrz niżej) |
| Wynik drużyny w trybie bez końca: kod pokoju, pseudonimy graczy, liczba punktów, poziom trudności, czas przetrwania, data | Tablica wyników (globalna i klasowa, osobna dla każdego poziomu trudności) | **90 dni**, potem automatyczne usunięcie (sprawdzane co godzinę) |
| Głosy „Wpadka dnia” po omówieniu poziomu: który poziom i która wiadomość zmyliła | Statystyki dla nauczyciela. Głos nie jest powiązany z pseudonimem | **90 dni** |
| Stan gry w trakcie poziomu (pozycje, teczki, punkty) | Działanie rozgrywki | Tylko w pamięci serwera. Znika po zamknięciu pokoju, nigdy nie trafia do bazy |
| Adres IP | Ochrona serwera przed nadużyciami (limit prób dołączania do pokoi i zakładania nowych) | Tylko chwilowo w pamięci serwera; **nie jest zapisywany** w bazie ani w logach |

Serwer pośredniczący przed grą przekazuje jej prawdziwy adres IP gracza, żeby limity
dotyczyły jednej sieci, a nie wszystkich graczy naraz. Adres służy tylko do liczenia prób
w pamięci serwera i nie trafia nigdzie dalej. Serwer gry ani jego serwer pośredniczący nie
zapisują dzienników dostępu z adresami IP. Dzienniki techniczne zawierają kody pokoi i nazwy
zdarzeń (np. „pokój utworzony”), ale nie zawierają pseudonimów.

Pseudonimy w tablicy wyników są widoczne dla wszystkich, którzy ją otworzą (tablica globalna
pokazuje wyniki z wielu klas). Dlatego pseudonim nie powinien zdradzać tożsamości.

Administrator może pokazać w menu głównym **komunikat redakcji** (np. o przerwie
technicznej). Komunikat jest taki sam dla wszystkich i nie zbiera żadnych danych.

<!-- ads -->
## Reklamy

- Reklamy Google AdSense pojawiają się tylko w **menu głównym, w lobby i na ekranie wyników**,
  w osobnej ramce z napisem „Reklama”, z dala od przycisków gry. **Nigdy w trakcie gry**,
  w odprawie, przy stanowiskach ani w oknach dialogowych i **nigdy na telefonach**.
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
- oznaczenie, że samouczek i film wprowadzający zostały już obejrzane,
- oznaczenie zamkniętego komunikatu redakcji, żeby ten sam komunikat nie pokazywał się znowu,
- tymczasowy znak pozwalający wrócić do pokoju po chwilowej utracie połączenia (tylko do
  zamknięcia karty przeglądarki).

Te dane nigdy nie opuszczają urządzenia, poza pseudonimem wysyłanym do pokoju. Można je
usunąć, czyszcząc dane witryny w przeglądarce.

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
