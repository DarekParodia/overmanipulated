# Weryfikacja merytoryczna historii: instrukcja dla recenzenta

Każda historia w grze musi zostać zatwierdzona przez nauczyciela przedmiotu (WOS / informatyka),
zanim gra trafi na lekcję. Zatwierdzenie to pole `reviewed: true` w plikach z historiami.
Do tej pory **żadna historia nie jest zatwierdzona**.

## Pliki

| Plik | Do czego |
| --- | --- |
| `stories-for-review.md` | Do czytania: wszystkie 110 historii poziomami (0–6, razem ze zdarzeniami), z tabelą na początku każdego poziomu i kartą każdej historii |
| `stories-for-review.csv` | Do wypełniania w Excelu / Arkuszach Google. Kolumny: nagłówek, treść, źródło, typ, prawdziwość, waga, poprawny werdykt, pieczątki (z oznaczeniem rozstrzygających), technika, cztery pola wyjaśnienia, użycie w poziomie oraz **Zatwierdzam (TAK/NIE)** i **Uwagi recenzenta** |

Oba pliki powstają z plików gry poleceniem `bun run review:export`. Nie edytuj ich w repozytorium;
wypełnione CSV odeślij osobie technicznej.

## Na co zwrócić uwagę

1. **Zgodność merytoryczna mechanizmu.** Czy opisana manipulacja naprawdę tak działa? Czy
   „narzędzie”, które ją ujawnia (wyszukiwanie obrazem, archiwum, kartoteka źródeł, telefon,
   skaner AI, biblioteka danych), rzeczywiście by tu pomogło? Czy poprawny werdykt
   (publikuj / odrzuć / publikuj z kontekstem) jest obroniony przez pieczątki, a pieczątki
   „zwodnicze” faktycznie zwodzą, nie będąc zwykłym błędem?
2. **Żadnych prawdziwych osób, firm i wydarzeń.** Wszystko dzieje się w fikcyjnych Nowych
   Brzegach. Sprawdź nazwy instytucji, marek, programów, nazwisk i dat, czy nie przypominają
   zbyt mocno realnych (także lokalnych) i czy nie nawiązują do prawdziwych tragedii.
3. **Wiek odbiorców (15–19 lat).** Brak drastycznych szczegółów, wulgaryzmów, treści
   upokarzających konkretne osoby, stygmatyzujących grupy.
4. **Poziom 4 (zdrowie): szczególna ostrożność.** Żadna historia nie może brzmieć jak porada
   medyczna, polecać ani odradzać realnej terapii czy leku. Wymyślone „badanie” i „suplement”
   muszą być wyraźnie fikcyjne, a wyjaśnienie nie może oceniać realnych metod leczenia.
5. **Poziomy 2 i 6 (wybory, referendum): neutralność polityczna.** Żadna strona ani opcja nie
   może przypominać realnej partii, kandydata ani sporu i żadna nie jest „słuszna”. Manipulacje
   mają być pokazane symetrycznie.
6. **Błędy w tekście.** Literówki, interpunkcja, polska typografia (spójniki na końcu wiersza,
   cudzysłowy „ ”), długość: czy treść da się przeczytać w biegu. Sprawdź też, czy
   wyjaśnienie na kolegium jest zrozumiałe dla ucznia, bez żargonu.
7. **Spójność.** Czy typ materiału zgadza się z treścią (zdjęcie ma opis zdjęcia, nagranie
   dotyczy nagrania), a technika z jej nazwą w Encyklopedii.

## Jak zatwierdzać

1. Otwórz `stories-for-review.csv` (rozdzielacz `;`, kodowanie UTF-8: w Excelu użyj Dane →
   Z tekstu/CSV; w Arkuszach Google: Plik → Importuj).
2. W kolumnie **Zatwierdzam (TAK/NIE)** wpisz `TAK` przy każdej historii, którą zatwierdzasz.
   Wszystko inne (`NIE`, puste pole) oznacza „jeszcze nie”.
3. Przy historii do poprawy wpisz `NIE` i opisz problem w kolumnie **Uwagi recenzenta**.
   Historia z uwagą i `TAK` też zostanie przyjęta, ale narzędzie ostrzeże, że uwaga istnieje.
4. Zapisz plik jako CSV (UTF-8) i odeślij.

## Wczytanie decyzji (osoba techniczna)

```sh
bun run review:apply -- wypelniony.csv           # próbny przebieg: pokazuje, co się zmieni
bun run review:apply -- wypelniony.csv --write   # zapisuje reviewed: true przy zatwierdzonych
bun run validate:content                         # kontrola treści po zmianie
```

- Domyślnie narzędzie niczego nie zapisuje.
- Zmienia wyłącznie `"reviewed": false` na `true` przy historiach z `TAK`; formatowanie
  plików zostaje bez zmian. Nigdy nie cofa wcześniejszych zatwierdzeń.
- Przed zapisem sprawdza, że zmieniło się tylko to pole, a treść przechodzi walidację. Przy
  nieznanym lub powtórzonym ID, albo przy błędzie, nie zapisuje nic.
- Po wczytaniu uruchom ponownie `bun run review:export`, aby odświeżyć pliki w tym katalogu
  (zatwierdzone historie dostaną `TAK` i ☑), i zatwierdź zmiany w gicie.
- Historie z uwagami popraw w `packages/content/stories/`, wyeksportuj ponownie i poproś o
  ponowną kontrolę.
