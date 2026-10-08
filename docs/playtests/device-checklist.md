# Lista kontrolna sprzętu i sieci

Do sprawdzenia **dzień przed lekcją** (z informatykiem szkolnym, jeśli to możliwe) i jeszcze raz
**15 minut przed lekcją** w tej samej sali.

## Sieć szkolna

- [ ] Gra działa pod adresem `https://<adres-gry>` (HTTPS, zielona kłódka, bez ostrzeżeń).
- [ ] Cały ruch idzie przez **port 443**: strona i połączenie gry (`wss://<adres-gry>/ws`). Inne
      porty nie są potrzebne — jeśli szkoła blokuje wszystko poza 443, gra i tak działa.
- [ ] Filtr treści szkoły nie blokuje domeny gry ani WebSocketów. Test: otwórz grę na
      szkolnym komputerze, załóż pokój, dołącz z drugiego urządzenia — obie osoby widzą się
      w lobby.
- [ ] Wi-Fi w sali wytrzyma 30 urządzeń naraz (zapytaj informatyka; gra przesyła mało danych,
      ale pierwsze ładowanie to do ~10 MB na urządzenie).
- [ ] Plan B: telefony uczniów na danych komórkowych (pierwsze ładowanie ~10 MB) albo hotspot
      prowadzącego dla 1–2 zespołów.
- [ ] Opóźnienie: w lobby nie ma ostrzeżeń o połączeniu; postać rusza się płynnie.

## Laptopy szkolne

- [ ] Przeglądarka: aktualny Chrome, Edge lub Firefox (nie Internet Explorer, nie bardzo stary
      Safari).
- [ ] Gra uruchamia się bez rozszerzeń blokujących skrypty; WebGL włączony (gra pokazuje scenę
      3D, a nie czarny ekran).
- [ ] Płynność: otwórz grę z `?debug` (albo F3) i sprawdź licznik FPS w poziomie — ≥ 30 FPS
      wystarczy, 60 FPS to cel. Jeśli mniej, w ustawieniach ustaw „Jakość grafiki: Niska”.
- [ ] Laptopy podłączone do prądu (tryb oszczędzania baterii obniża płynność).
- [ ] Klawiatura działa (WASD / strzałki, E, Spacja, Q). Myszka nie jest potrzebna w grze.
- [ ] Ekran ≥ 1280×720; powiększenie przeglądarki 100%.

## Telefony uczniów

- [ ] Orientacja **pozioma** (gra prosi o obrót telefonu); blokada obrotu wyłączona.
- [ ] Przeglądarka systemowa (Chrome na Androidzie, Safari na iPhonie) — nie przeglądarka
      wbudowana w Instagram / Messengera.
- [ ] Pełny ekran: przycisk pełnego ekranu w grze (na iPhonie: „Dodaj do ekranu
      początkowego”, jeśli pasek adresu przeszkadza).
- [ ] Bateria ≥ 30% albo dostęp do ładowarki; tryb oszczędzania energii wyłączony.
- [ ] Powiadomienia wyciszone (tryb „Nie przeszkadzać”), żeby nie zasłaniały przycisków.
- [ ] Bardzo małe telefony (ekran ~640×360): sprawdzić, czy da się trafić w przyciski.
      Jeśli nie — ta osoba gra na laptopie w parze.

## Pady (opcjonalnie)

- [ ] Pad podłączony przed otwarciem gry; po naciśnięciu dowolnego przycisku gra pokazuje
      podpowiedzi dla pada.
- [ ] Samouczek da się pominąć z pada: **B dwa razy** albo przytrzymanie **Wstecz/Select**.

## Dźwięk

- [ ] Przy 8 zespołach w jednej sali dźwięk z głośników zagłusza rozmowę: **na laptopach głośność
      niska albo wyciszona**, na telefonach głośność ~30%. Rozmowa w zespole jest ważniejsza.
- [ ] Jeśli są słuchawki — jedno ucho wolne, żeby słyszeć zespół.
- [ ] W ustawieniach gry działają „Wycisz wszystko”, „Mniej ruchu”, „Bez migania” i „Wielkość
      tekstu” — pokaż je uczniom, którzy tego potrzebują.

## Sala

- [ ] Zespoły siedzą razem, twarzami do siebie (gra wymaga rozmowy).
- [ ] Adres gry na tablicy; kody pokojów zespoły zapisują na kartce.
- [ ] Gniazdka / przedłużacze dla laptopów.
- [ ] Miejsce dla obserwatorów obok zespołów (widzą ekrany, nie przeszkadzają).
