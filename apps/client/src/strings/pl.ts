// All player-facing Polish text. Keys are English; wording follows agents/design-rules.md §9:
// a gruff, warm editor-in-chief — short, concrete, newsroom vocabulary, no marketing voice.
import type {
  ErrorCode,
  FolderOutcome,
  PingKind,
  Priority,
  Role,
  StationKind,
  StoryType,
  Verdict,
} from '@redakcja/shared';
import type { InputDevice as Device } from '../store/app.ts';

/** Key-cap hints shown under a minigame, per input device (empty: no hint). */
export type KeyHint = { keys: readonly string[]; label: string };
type KeyHints = Record<Device, readonly KeyHint[]>;

export const pl = {
  masthead: {
    paper: 'Kurier Nowobrzeski',
    edition: (n: number) => `Wydanie nr ${n}`,
  },
  menu: {
    /** The game logo; also the main menu's heading (e2e looks for it). */
    titleTop: 'Redakcja',
    titleBottom: 'na Ostatnią Chwilę',
    tagline: 'Sprawdź, zanim puścisz do druku!',
    bylineLabel: 'Twój podpis',
    bylinePlaceholder: 'np. Zośka',
    createAction: 'Otwórz pokój',
    or: 'albo dołącz',
    joinCodeLabel: 'Kod pokoju',
    joinCodePlaceholder: 'ABCD',
    joinAction: 'Dołącz',
    settings: 'Ustawienia',
    needByline: 'Najpierw wpisz podpis.',
    needCode: 'Kod ma cztery litery.',
    pressDown: 'Serwer gry nie odpowiada.',
  },
  lobby: {
    codeLabel: 'Kod pokoju',
    copy: 'Skopiuj kod',
    copied: 'Skopiowano!',
    host: 'Gospodarz',
    you: 'Ty',
    disconnected: 'Rozłączony',
    emptySlot: 'Wolne miejsce',
    start: 'Do składu!',
    waitingForHost: 'Gospodarz zaraz zaczyna.',
    leave: 'Wyjdź',
    playersCount: (n: number, max: number) => `${n} z ${max} przy biurkach`,
  },
  game: {
    room: 'Pokój',
    ping: (ms: number) => `${ms} ms`,
    leave: 'Wyjdź z redakcji',
    fullscreen: 'Pełny ekran',
    settings: 'Ustawienia',
    rotate: 'Obróć telefon poziomo',
    rotateHint: 'Gra działa tylko poziomo.',
    reconnecting: 'Łączymy ponownie…',
    loading: 'Wczytujemy redakcję…',
  },
  touch: {
    interact: 'Podnieś',
    work: 'Pracuj',
    ping: 'Sygnał',
    joystick: 'Ruch',
  },
  connection: {
    connecting: 'Łączenie…',
    online: 'Połączono',
    reconnecting: 'Łączymy ponownie…',
    offline: 'Brak połączenia',
    room: (code: string) => `Pokój ${code}`,
  },
  errors: {
    invalidMessage: 'Coś poszło nie tak w łączności. Spróbuj jeszcze raz.',
    protocolMismatch: 'Masz starą wersję gry. Odśwież stronę.',
    invalidNickname: 'Ten podpis nie przejdzie. Od 1 do 16 znaków.',
    roomNotFound: 'Nie ma redakcji z takim kodem.',
    roomFull: 'W tej redakcji wszystkie biurka zajęte.',
    reconnectFailed: 'Twoje miejsce już przepadło. Dołącz od nowa.',
    notHost: 'Wydanie otwiera tylko gospodarz.',
    notInRoom: 'Nie jesteś w żadnej redakcji.',
    notReady: 'Nie wszyscy są gotowi.',
    unknownLevel: 'Nie ma takiego wydania.',
    connectionLost: 'Zerwane połączenie z redakcją.',
  } satisfies Record<ErrorCode | 'connectionLost', string>,
  settings: {
    title: 'Ustawienia',
    sound: 'Dźwięk',
    master: 'Głośność',
    music: 'Muzyka',
    sfx: 'Efekty',
    ui: 'Przyciski',
    mute: 'Wycisz wszystko',
    display: 'Obraz',
    quality: 'Jakość grafiki',
    qualityLow: 'Niska',
    qualityMedium: 'Średnia',
    qualityHigh: 'Wysoka',
    qualityAuto: 'Auto',
    textScale: 'Wielkość tekstu',
    access: 'Dostępność',
    reducedMotion: 'Mniej ruchu',
    noFlash: 'Bez migania',
    haptics: 'Wibracje',
    leftHanded: 'Sterowanie dla leworęcznych',
    hints: 'Podpowiedzi „co dalej”',
    tutorialAgain: 'Pokaż samouczek jeszcze raz',
    tutorialQueued: 'Samouczek w następnej grze',
    close: 'Gotowe',
    closeIcon: 'Zamknij',
  },
  styleguide: {
    title: 'Styl gry',
    subtitle: 'Kreskówkowa redakcja – kolory, pismo, przyciski',
    colours: 'Kolory',
    meaningColours: 'Kolor = znaczenie',
    baseColours: 'Tło i neutralne',
    playerColours: 'Gracze',
    meanings: {
      yellow: 'Zrób to teraz',
      green: 'Prawda, gotowe',
      red: 'Fałsz, błąd',
      orange: 'Kontekst, uwaga',
      blue: 'Informacja, wybór',
      purple: 'Pomoc',
    },
    type: 'Pismo',
    buttons: 'Przyciski',
    panel: 'Panel',
    panelText: 'Biały panel z grubym konturem i twardym cieniem.',
    inputs: 'Pola i przełączniki',
    icons: 'Ikony',
    stamps: 'Pieczątki',
    stampAgain: 'Przybij jeszcze raz',
    minigames: 'Minigry',
  },
  // --- Stage 2 gameplay. Shared vocabulary first, then one namespace per feature. ----------
  vocab: {
    storyTypes: {
      photo: 'Zdjęcie',
      quote: 'Cytat',
      post: 'Post',
      recording: 'Nagranie',
      statistic: 'Statystyka',
      article: 'Artykuł',
    } satisfies Record<StoryType, string>,
    priorities: {
      normal: 'Zwykły',
      important: 'Ważny',
      urgent: 'Pilny',
    } satisfies Record<Priority, string>,
    verdicts: {
      publish: 'Publikuj',
      reject: 'Odrzuć',
      publishWithContext: 'Publikuj z kontekstem',
    } satisfies Record<Verdict, string>,
    stations: {
      imageSearch: 'Lupa obrazu',
      archive: 'Archiwum',
      sourceRegistry: 'Kartoteka źródeł',
      phone: 'Telefon',
      aiScanner: 'Skaner AI',
      dataLibrary: 'Biblioteka danych',
    } satisfies Record<StationKind, string>,
    roles: {
      photoEditor: 'Fotoedytor',
      archivist: 'Archiwista',
      reporter: 'Reporter',
      managingEditor: 'Redaktor prowadzący',
    } satisfies Record<Role, string>,
    pings: {
      needArchive: 'Potrzebuję Archiwum!',
      fake: 'Fałszywka!',
      mine: 'Biorę to',
    } satisfies Record<PingKind, string>,
    /** One-word signs floating over interactive fixtures in the 3D newsroom. */
    signs: {
      imageSearch: 'Lupa',
      archive: 'Archiwum',
      sourceRegistry: 'Kartoteka',
      phone: 'Telefon',
      aiScanner: 'Skaner',
      dataLibrary: 'Dane',
      conveyor: 'Wejście',
      desk: 'Stół',
    } satisfies Record<StationKind | 'conveyor' | 'desk', string>,
  },
  /** Lobby: roles, readiness, level select (S2-10). */
  lobbyRoles: {
    passesTitle: 'Wybierz rolę',
    noRole: 'Bez roli',
    noRoleBonus: 'Bez premii',
    /** Speed bonus line built from ROLE_STATIONS and ROLE_WORK_TIME_FACTOR. */
    fasterAt: (stations: readonly string[], percent: number) =>
      `${stations.join(' i ')} +${percent}%`,
    /** Roles whose bonus is not (only) speed get their own line. */
    specialBonuses: {
      reporter: 'Telefon bez kolejki',
      managingEditor: 'Raz przedłuża termin',
    } satisfies Partial<Record<Role, string>>,
    noEditorNote: 'Bez redaktora przy stole decyduje każdy.',
    ready: 'Gotowy',
    readyDone: 'Gotowy!',
    readyHint: 'Zaznacz, gdy możesz grać.',
    readyState: 'Gotowy',
    notReady: 'Czeka',
    levelKicker: 'Poziom',
    levelPick: 'Wybierz poziom',
    levelHostOnly: 'Poziom wybiera gospodarz.',
    levelMinutes: (minutes: number) => `${minutes} min`,
    levelFolders: (folders: number) =>
      `${folders} ${folders === 1 ? 'teczka' : folders % 10 >= 2 && folders % 10 <= 4 && (folders % 100 < 12 || folders % 100 > 14) ? 'teczki' : 'teczek'}`,
    startOffline: 'Brak połączenia z serwerem.',
    startWaiting: (names: readonly string[]) => `Czekamy na: ${names.join(', ')}.`,
    allReady: 'Wszyscy gotowi!',
  },
  /** In-game HUD and level-end plate (S2-09). */
  hud: {
    queueLabel: 'Teczki do sprawdzenia',
    queueEmpty: 'Czekamy na teczki',
    queueMore: (n: number) => `Jeszcze ${n} w kolejce`,
    timer: 'Czas do końca',
    score: 'Punkty',
    credibility: 'Wiarygodność',
    credibilityLow: 'Wiarygodność spada!',
    timeLeftLabel: (clock: string) => `zostało ${clock}`,
    location: {
      carriedBy: (nickname: string) => `niesie ${nickname}`,
      carried: 'w rękach',
      conveyor: 'na taśmie',
      desk: 'na biurku',
      table: 'na stole',
      floor: 'na podłodze',
    },
    untitled: 'Teczka bez opisu',
    toast: {
      correct: 'Dobrze!',
      wrongJustification: 'Prawie!',
      fakePublished: 'Fałszywka!',
      truthRejected: 'To była prawda!',
      wrong: 'Pudło!',
      expired: 'Przepadło',
      credibility: (delta: string) => `wiarygodność ${delta}`,
    },
  },
  /** Station overlay and work progress (S2-03). */
  station: {
    leave: 'Odejdź',
    /** Key cap for "back" on each device; touch uses the close button. */
    backKey: { keyboard: 'Esc', gamepad: 'B', touch: '' } satisfies Record<Device, string>,
    timeLeft: (s: number) => `Zostało ${s} s`,
    hold: 'Trzymaj',
    workKey: { keyboard: 'Spacja', gamepad: 'X', touch: '' } satisfies Record<Device, string>,
    /** Touch has an on-screen button instead of a key. */
    holdTouch: 'Trzymaj „Pracuj”',
    failed: 'Pudło!',
    wait: 'Czekaj',
    seconds: (s: number) => `${s} s`,
    noFolder: 'Brak teczki na stanowisku.',
    unknownStory: 'Nieznana teczka.',
  },
  desk: {
    title: 'Stół redakcyjny',
    close: 'Odłóż teczkę',
    source: 'Od:',
    deadline: 'Termin',
    overdue: 'Po terminie',
    stepEvidence: 'Wybierz dowód',
    stepVerdict: 'Wybierz werdykt',
    pickStamp: 'Stuknij pieczątkę – to twój dowód',
    pickVerdict: 'Teraz werdykt!',
    sending: 'Wysyłam…',
    noStamps: 'Pusta teczka. Zanieś ją na stanowisko.',
    verdictsLabel: 'Werdykt',
    /** Short visible labels; the full name (`vocab.verdicts`) stays the accessible name. */
    verdictShort: {
      publish: 'Publikuj',
      reject: 'Odrzuć',
      publishWithContext: 'Z kontekstem',
    } satisfies Record<Verdict, string>,
    next: 'Dalej',
    outcomes: {
      correct: 'Dobrze!',
      wrongJustification: 'Werdykt dobry, dowód nie',
      wrong: 'Zły werdykt',
      expired: 'Teczka przepadła',
    } satisfies Record<FolderOutcome, string>,
    points: (n: string) => `${n} pkt`,
    credibility: (n: string) => `Wiarygodność ${n}`,
    speedBonus: 'Premia za tempo',
    missed: 'Zabrakło:',
    unknownStory: 'Nieznana teczka.',
    /** The managing editor's one deadline extension per level. */
    extend: 'Przedłuż termin',
    extendAmount: (s: number) => `+${s}\u00a0s`,
    extendLabel: (s: number) => `Przedłuż termin o\u00a0${s}\u00a0s`,
    extended: (s: number) => `Termin +${s}\u00a0s!`,
  },
  minigames: {
    /** Shared by every minigame. */
    common: {
      mistakes: (n: number, of: number) => `Pomyłki: ${n} z ${of}`,
      failure: 'Pudło!',
    },
    imageSearch: {
      task: 'Znajdź wynik ze wszystkimi kółkami',
      submitted: 'Nadesłane zdjęcie',
      results: 'Wyniki wyszukiwania',
      fragment: (n: number, of: number) => `${n}/${of}`,
      nextFragment: 'Następny fragment',
      result: (n: number) => `Wynik ${n}`,
      published: (site: string, date: string) => `${site}, ${date}`,
      found: 'Wcześniejsza publikacja!',
      checked: 'Sprawdzone!',
      foundFallback: 'Znaleziono wcześniejszą kopię zdjęcia.',
      done: 'Gotowe',
      keys: {
        keyboard: [
          { keys: ['Strzałki'], label: 'wybierz' },
          { keys: ['Spacja'], label: 'sprawdź' },
          { keys: ['Q'], label: 'lupa' },
        ],
        gamepad: [
          { keys: ['Krzyżak'], label: 'wybierz' },
          { keys: ['A'], label: 'sprawdź' },
          { keys: ['Y'], label: 'lupa' },
        ],
        touch: [],
      } satisfies KeyHints,
    },
    archive: {
      task: 'Znajdź najstarszą kartę z hasłem',
      /** Topics printed on the index cards; fictional Nowe Brzegi local news. */
      topics: [
        'zalany rynek',
        'nocny autobus',
        'remont mostu',
        'festyn nad rzeką',
        'nowa biblioteka',
        'awaria wodociągu',
        'dzik na osiedlu',
        'targ rybny',
        'mecz juniorów',
        'budowa ronda',
        'zegar na ratuszu',
        'koncert w parku',
      ],
      earlier: 'Wcześniej',
      later: 'Później',
      pull: 'Wyjmij',
      foundFallback: 'Pierwsza wzmianka odnaleziona w archiwum.',
      firstMention: (date: string) => `Pierwsza wzmianka: ${date}`,
      failed: 'Szuflada zamknięta',
      keys: {
        keyboard: [
          { keys: ['←', '→'], label: 'przewijaj' },
          { keys: ['Spacja'], label: 'stop / wyjmij' },
        ],
        gamepad: [
          { keys: ['Krzyżak'], label: 'przewijaj' },
          { keys: ['A'], label: 'stop / wyjmij' },
        ],
        touch: [],
      } satisfies KeyHints,
    },
    sourceRegistry: {
      kinds: { account: 'Konto', website: 'Strona' },
      task: 'Zakreśl podejrzane wpisy, potem odłóż kartę',
      file: 'Odłóż kartę',
      marked: (n: number) => (n === 0 ? 'Nic nie zakreślone' : `Zakreślone: ${n}`),
      notThis: 'W porządku',
      missing: 'Czegoś brakuje!',
      revealed: 'Przerywane: tego szukaliśmy',
      filed: 'Sprawdzone!',
      failed: 'Źle zakreślone',
      clean: 'Źródło w porządku',
      flagged: 'Źródło podejrzane',
      keys: {
        keyboard: [
          { keys: ['W', 'S'], label: 'wybierz' },
          { keys: ['E'], label: 'zakreśl' },
          { keys: ['Q'], label: 'odłóż' },
        ],
        gamepad: [
          { keys: ['Krzyżak'], label: 'wybierz' },
          { keys: ['A'], label: 'zakreśl' },
          { keys: ['Y'], label: 'odłóż' },
        ],
        touch: [],
      } satisfies KeyHints,
      /**
       * Card fields. Each has a label, believable values (`clean`) and warning signs
       * (`flagged`). Everything is invented: Nowe Brzegi, no real people, brands or platforms.
       */
      fields: {
        account: {
          identity: {
            label: 'Nazwa i login',
            clean: [
              'Kasia Wróblewska · @kwroblewska',
              'Fotoklub Nadrzecze · @fotoklub_nadrzecze',
              'Marek Sowa · @marek.sowa',
              'Piekarnia Pod Mostem · @piekarnia_podmostem',
            ],
            flagged: [
              'Urząd Miasta Nowe Brzegi · @nb_news_2481',
              'Policja Nowe Brzegi · @xx_prawda_xx',
              'Kurier Nowobrzeski · @kurier_nb_0ficjalny',
            ],
          },
          created: {
            label: 'Konto założone',
            clean: ['w marcu 2019 r.', '6 lat temu', 'w 2016 r.', 'jesienią 2020 r.'],
            flagged: ['3 dni temu', 'wczoraj wieczorem', 'przedwczoraj'],
          },
          history: {
            label: 'Wcześniejsze wpisy',
            clean: [
              'ok. 1200, głównie zdjęcia z okolicy',
              'od lat sprawy osiedla i remonty',
              'zapowiedzi wystaw, relacje z klubu',
            ],
            flagged: [
              'brak, to pierwszy wpis',
              'wszystko sprzed tygodnia usunięte',
              'tylko ten jeden post, udostępniany',
            ],
          },
          avatar: {
            label: 'Zdjęcie profilowe',
            clean: [
              'zdjęcie znad rzeki, to samo od lat',
              'logo jak na szyldzie przy rynku',
              'zwykły portret, kilka starszych wersji',
            ],
            flagged: [
              'z banku zdjęć, znane z reklam',
              'herb miasta wycięty z cudzej strony',
              'twarz wygenerowana, rozmyte uszy',
            ],
          },
          followers: {
            label: 'Obserwujący',
            clean: ['312, głównie sąsiedzi', '1450 osób z regionu', '86 znajomych'],
            flagged: ['15 000 w dwa dni, konta bez zdjęć', '9800 kont założonych jednego dnia'],
          },
          activity: {
            label: 'Aktywność',
            clean: ['kilka wpisów w tygodniu', 'raz, dwa razy dziennie', 'zwykle wieczorami'],
            flagged: [
              '60 wpisów w godzinę',
              'ten sam tekst w 40 grupach',
              'co minutę, także w nocy',
            ],
          },
          place: {
            label: 'Miejscowość',
            clean: [
              'Nowe Brzegi, Nadrzecze',
              'Nowe Brzegi, Stare Miasto',
              'okolice Nowych Brzegów',
            ],
            flagged: ['zmieniana pięć razy w miesiącu', 'Nowe Brzegi, ale konto z innego kraju'],
          },
        },
        website: {
          address: {
            label: 'Adres',
            clean: ['nowe-brzegi.pl', 'mpk.nowe-brzegi.pl', 'kurier-nowobrzeski.pl'],
            flagged: [
              'nowe-brzegi-gov.info',
              'nowe-brzegl.pl',
              'kurier-nowobrzeski.pilne-wiesci.top',
            ],
          },
          registered: {
            label: 'Domena zarejestrowana',
            clean: ['w 2004 r.', 'w 2011 r.', 'w 1999 r.'],
            flagged: ['5 dni temu', 'wczoraj', 'tydzień temu'],
          },
          owner: {
            label: 'Właściciel domeny',
            clean: ['instytucja, dane jawne w rejestrze', 'firma z Nowych Brzegów, dane jawne'],
            flagged: ['dane ukryte, pośrednik za granicą', 'osoba prywatna, inna niż w stopce'],
          },
          contact: {
            label: 'Kontakt',
            clean: ['adres, telefon, godziny pracy', 'ul. Ratuszowa 1, sekretariat'],
            flagged: ['tylko formularz, brak adresu', 'mail na darmowej skrzynce'],
          },
          archive: {
            label: 'Inne artykuły',
            clean: ['archiwum komunikatów od 2010 r.', 'setki wpisów, ostatni wczoraj'],
            flagged: ['jeden, właśnie ten', 'pięć, wszystkie z dzisiaj'],
          },
          look: {
            label: 'Wygląd',
            clean: ['logo i układ jak w wersji drukowanej', 'herb zgodny z oficjalnym'],
            flagged: ['herb rozmyty, skopiowany', 'logo prawie jak oryginał, inna czcionka'],
          },
          links: {
            label: 'Linki',
            clean: ['prowadzą do źródeł i dokumentów', 'działają, do stron gminy'],
            flagged: ['wszystkie prowadzą do sklepu', 'puste, nigdzie nie prowadzą'],
          },
        },
      },
    },
  },
  /** Ping picker (S2-11). Ping labels live in `vocab.pings`. */
  pings: {
    title: 'Sygnał',
    close: 'zamknij',
    closeTouch: 'Stuknij „Sygnał”, by zamknąć',
    closeKeys: { keyboard: ['Esc', 'Q'], gamepad: ['B'], touch: [] } satisfies Record<
      Device,
      readonly string[]
    >,
  },
  /** Level events (S4-05..S4-09): banners, folder badges, hints, the correction sheet. */
  events: {
    /** Big banner when an event starts: a short title and one short line. */
    banner: {
      viral: { title: 'To już wszędzie jest!', line: 'Najpierw sprawdź' },
      bossCall: { title: 'Telefon od szefa!', line: 'Żąda publikacji' },
      botRaid: { title: 'Nalot botów!', line: 'Jeden werdykt na wszystkie' },
      outage: { title: 'Awaria!', line: (station: string) => `${station} nie działa` },
      correction: { title: 'Sprostowanie!', line: 'Zanieś na stół' },
    },
    /** Short banners when something is over or solved. */
    done: {
      outage: { title: 'Naprawione', line: (station: string) => `${station} działa` },
      raid: { title: 'Nalot odparty!', line: 'Wszystkie fałszywki z głowy' },
    },
    /** Accessible names of the badges (the badges themselves show an icon and a number). */
    badge: {
      shares: (n: string) => `${n} udostępnień`,
      bossCall: (s: number) => `Szef czeka jeszcze ${s} s`,
      bossCallOver: 'Szef się rozłączył',
      raid: (n: number) => `Nalot botów: ${n} teczek`,
      correction: 'Sprostowanie',
      down: 'Awaria',
    },
    /** One-line hints (guidance bubble) for tagged folders. */
    hint: {
      viral: 'Viral! Sprawdź, zanim urośnie',
      bossCall: 'Szef dzwoni — sprawdź najpierw!',
      botRaid: 'Nalot! Jeden werdykt na wszystkie',
      correction: 'Sprostowanie — zanieś na stół!',
      stationDown: 'Stanowisko nie działa — zaczekaj',
    },
    /** Station overlay refused on a station that is down. */
    stationDown: 'Awaria!',
    /** Desk sheet for a correction folder. */
    correction: {
      title: 'Sprostowanie',
      line: 'Opublikowany materiał był zmanipulowany',
      button: 'Opublikuj sprostowanie',
      recover: (n: number) => `Odzyskasz ${n} Wiarygodności`,
    },
  },
  /** Level results (S2-08/S2-09). */
  results: {
    wonHeadline: 'Wydanie gotowe!',
    lostHeadline: 'Wydanie przepadło',
    wonLede: 'Gazeta idzie do druku.',
    lostLede: 'Za dużo wpadek i spóźnień.',
    stars: (n: number) => `${n} z 3 gwiazdek`,
    score: 'Punkty',
    credibility: 'Wiarygodność',
    scoreDelta: (delta: string) => `${delta} pkt`,
    credibilityDelta: (delta: string) => `wiarygodność ${delta}`,
    folders: 'Teczki',
    noFolders: 'Żadna teczka nie dostała werdyktu.',
    outcomes: {
      correct: 'Trafnie',
      wrongJustification: 'Słaby dowód',
      wrong: 'Błąd',
      expired: 'Przepadła',
    } satisfies Record<FolderOutcome, string>,
    backToLobby: 'Wróć do redakcji',
    waitingForHost: 'Czekamy na gospodarza…',
  },
  /** "What next" hint bubble and the first-game tutorial. */
  guidance: {
    /** Key names in the accusative, after „Trzymaj” / „Wciśnij”. */
    workKey: {
      keyboard: 'Spację',
      gamepad: 'X',
      touch: '„Pracuj”',
    } satisfies Record<'keyboard' | 'gamepad' | 'touch', string>,
    /** Short station names for hints: „Zanieś do: Lupa / Archiwum”. */
    stationShort: {
      imageSearch: 'Lupa',
      archive: 'Archiwum',
      sourceRegistry: 'Kartoteka',
      phone: 'Telefon',
      aiScanner: 'Skaner',
      dataLibrary: 'Dane',
    } satisfies Record<StationKind, string>,
    hint: {
      pickupConveyor: 'Weź teczkę z taśmy',
      pickupWaiting: 'Weź czekającą teczkę',
      pickupHere: {
        keyboard: 'Podnieś: E',
        gamepad: 'Podnieś: A',
        touch: 'Wciśnij „Podnieś”',
      } satisfies Record<'keyboard' | 'gamepad' | 'touch', string>,
      dropHere: {
        keyboard: 'Odłóż: E',
        gamepad: 'Odłóż: A',
        touch: 'Odłóż: wciśnij „Podnieś”',
      } satisfies Record<'keyboard' | 'gamepad' | 'touch', string>,
      toStation: (names: string) => `Zanieś do: ${names}`,
      work: (key: string) => `Trzymaj ${key}`,
      working: 'Trzymaj, sprawdzamy!',
      minigame: 'Rozwiąż zadanie',
      /** Facing a locked station that holds a folder: take the folder elsewhere. */
      lockout: 'Weź teczkę gdzie indziej',
      toDesk: 'Gotowe – zanieś na stół!',
      openDesk: (key: string) => `Werdykt: trzymaj ${key}`,
      verdict: 'Wybierz werdykt',
      wait: 'Czekaj na nową teczkę',
    },
    bubbleLabel: 'Podpowiedź',
    tutorial: {
      label: 'Samouczek',
      step: (n: number, total: number) => `Krok ${n} z ${total}`,
      skip: 'Pomiń samouczek',
      /** Before the drawn key: „lub Esc”, „lub B B”. */
      skipOr: 'lub',
      move: {
        keyboard: 'Ruszaj się: WASD',
        gamepad: 'Ruszaj się: lewa gałka',
        touch: 'Ruszaj się: przesuń kciukiem',
      } satisfies Record<'keyboard' | 'gamepad' | 'touch', string>,
      pickup: {
        keyboard: 'Podnieś teczkę z taśmy: E',
        gamepad: 'Podnieś teczkę z taśmy: A',
        touch: 'Przy taśmie wciśnij „Podnieś”',
      } satisfies Record<'keyboard' | 'gamepad' | 'touch', string>,
      work: (key: string) => `Zanieś ją na stanowisko, trzymaj ${key}`,
      minigame: 'Rozwiąż zadanie na stanowisku',
      verdict: 'Zanieś teczkę na stół, wybierz werdykt',
      done: 'Super! Tak trzymaj!',
    },
  },
  /** Editorial briefing before a level (S3-03). */
  briefing: {
    label: 'Briefing redakcyjny',
    levelNumber: (n: number) => `Poziom ${n}`,
    training: 'Trening',
    topic: 'Temat dnia:',
    newToday: 'Nowe dziś:',
    ready: 'Gotowy!',
    waiting: 'Czekamy na resztę',
    countdownLabel: (seconds: number) => `Start za ${seconds} s`,
    readyCount: (ready: number, total: number) => `Gotowi: ${ready} z ${total}`,
    playerReady: (nickname: string) => `${nickname}: gotowy`,
    playerWaiting: (nickname: string) => `${nickname}: czyta`,
    skipIntro: 'Pomiń animację',
  },
  /** Campaign map in the lobby (S3-04). */
  campaign: {
    title: 'Wybierz poziom',
    training: 'Trening',
    locked: 'Zamknięty',
    tileLabel: (title: string, number: string, stars: number, locked: boolean) =>
      `${number}: ${title}, ${locked ? 'zamknięty' : `${stars} z 3 gwiazdek`}`,
  },
  /** Debrief (Kolegium) after a level: one card per story. Longer text is allowed only here. */
  debrief: {
    title: 'Kolegium',
    cardsLabel: 'Teczki tego wydania',
    count: (n: number) =>
      n === 1
        ? '1 teczka'
        : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)
          ? `${n} teczki`
          : `${n} teczek`,
    untitled: 'Teczka bez tytułu',
    yourVerdict: 'Wasz werdykt',
    correctVerdict: 'Właściwy',
    expired: 'Przepadła',
    sections: {
      what: 'Co to było',
      technique: 'Jak działa ta sztuczka',
      tool: 'Co to wykryło',
      realWorld: 'Gdzie to się zdarza',
    },
    missed: 'Zabrakło pieczątek',
    vote: 'Wpadka dnia?',
    voted: 'Twój głos',
    leader: 'Wpadka dnia!',
    votes: (n: number) =>
      n === 1
        ? '1 głos'
        : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)
          ? `${n} głosy`
          : `${n} głosów`,
    voteFor: (headline: string) => `Wpadka dnia: ${headline}`,
    prev: 'Poprzednia teczka',
    next: 'Następna teczka',
    position: (n: number, total: number) => `${n} z ${total}`,
  },
} as const;

export type Strings = typeof pl;
