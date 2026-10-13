# Prywatność w grze „Redakcja na Ostatnią Chwilę”

Krótka informacja dla nauczycieli, uczniów i rodziców. Gra jest zaprojektowana tak, żeby
zbierać jak najmniej danych: **bez kont, bez e-maili, bez śledzenia.**

## W skrócie

- Nie ma rejestracji ani logowania. Gracz wpisuje tylko **pseudonim** (1–16 znaków).
- Prosimy uczniów, by **nie używali imienia i nazwiska** ani żadnych danych pozwalających
  ich rozpoznać. Wystarczy przezwisko lub wymyślony podpis, np. „Reporter7”.
- Gra nie używa ciasteczek reklamowych, narzędzi analitycznych ani zewnętrznych usług
  (czcionki, dźwięki i grafiki są serwowane z tej samej strony).
- Wyniki w trybie bez końca (tablica wyników) są przechowywane **90 dni**, potem usuwane
  automatycznie.

## Jakie dane trafiają na serwer

| Dane | Po co | Jak długo |
| --- | --- | --- |
| Pseudonim gracza | Pokazanie go w pokoju, na biurku i w tablicy wyników | Tylko na czas rozgrywki. Do bazy trafia wyłącznie po zakończeniu przebiegu w trybie bez końca (patrz niżej) |
| Wynik drużyny w trybie bez końca: kod pokoju, pseudonimy graczy, liczba punktów, czas przetrwania, data | Tablica wyników (globalna i klasowa) | **90 dni**, potem automatyczne usunięcie (sprawdzane co godzinę) |
| Głosy „Wpadka dnia” po omówieniu poziomu: który poziom i która wiadomość zmyliła | Statystyki dla nauczyciela. Głos nie jest powiązany z pseudonimem | **90 dni** |
| Stan gry w trakcie poziomu (pozycje, teczki, punkty) | Działanie rozgrywki | Tylko w pamięci serwera. Znika po zamknięciu pokoju, nigdy nie trafia do bazy |
| Adres IP | Ochrona serwera przed nadużyciami (limit prób dołączania do pokoi) | Tylko chwilowo w pamięci serwera; **nie jest zapisywany** w bazie ani w logach |

Serwer nie zapisuje dzienników dostępu z adresami IP. Dzienniki techniczne zawierają kody
pokoi i nazwy zdarzeń (np. „pokój utworzony”), ale nie zawierają pseudonimów.

Pseudonimy w tablicy wyników są widoczne dla wszystkich, którzy ją otworzą (tablica globalna
pokazuje wyniki z wielu klas). Dlatego pseudonim nie powinien zdradzać tożsamości.

## Co zostaje w przeglądarce ucznia

Gra zapisuje w przeglądarce (pamięć lokalna, nie ciasteczka), na urządzeniu ucznia:

- ostatnio użyty pseudonim, ustawienia gry (np. dźwięk, animacje),
- postęp: najlepsze wyniki poziomów, odblokowane karty w Encyklopedii manipulacji,
- tymczasowy znak pozwalający wrócić do pokoju po chwilowej utracie połączenia.

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
- Administrator serwera (do uzupełnienia przed pierwszą lekcją): **[imię i nazwisko / szkoła /
  organizacja, adres e-mail]**.
- Serwer działa na wynajętym serwerze VPS w **[kraj / dostawca – do uzupełnienia]**; połączenie
  jest szyfrowane (HTTPS).

## Uwaga dla nauczyciela

Zanim uczniowie zagrają, powiedz im jednym zdaniem: „Wpisz wymyślony pseudonim, nie swoje
imię i nazwisko.” W razie wątpliwości co do zgodności z regulaminem szkoły lub RODO
skonsultuj się z inspektorem ochrony danych w szkole; ta informacja opisuje, jakie dane gra
faktycznie zbiera.
