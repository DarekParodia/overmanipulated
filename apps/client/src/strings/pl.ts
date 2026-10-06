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
    motto: 'Najpierw sprawdzamy, potem drukujemy',
    edition: (n: number) => `Wydanie nr ${n}`,
    price: 'Cena 2,50 zł',
  },
  menu: {
    headline: 'Redakcja na Ostatnią Chwilę',
    lede: 'Teczki spływają, czas leci, naczelny krzyczy. Sprawdź, zanim puścisz do druku.',
    bylineLabel: 'Twój podpis',
    bylinePlaceholder: 'np. Zośka',
    bylineHint: 'Tak podpiszemy cię w składzie. Bez konta, bez maila.',
    createKicker: 'Nowa redakcja',
    createTitle: 'Otwierasz pokój i rozdajesz kod',
    createAction: 'Otwórz pokój',
    joinKicker: 'Dołączasz do zespołu',
    joinTitle: 'Masz kod od gospodarza?',
    joinCodeLabel: 'Kod pokoju',
    joinAction: 'Dołącz',
    sideKicker: 'Z ostatniej chwili',
    sideText:
      'W Nowych Brzegach burza, wybory i plotka o dyrektorze liceum. Do redakcji wpadają zdjęcia, cytaty i screeny. Część jest prawdziwa. Część nie.',
    settings: 'Ustawienia',
    needByline: 'Najpierw podpis.',
    needCode: 'Kod ma cztery litery.',
    pressDown: 'Drukarnia nie odpowiada. Serwer gry jest niedostępny.',
  },
  lobby: {
    boardTitle: 'Grafik dyżurów',
    codeLabel: 'Kod pokoju',
    codeHint: 'Podaj ten kod reszcie zespołu.',
    copy: 'Skopiuj kod',
    copied: 'Skopiowano',
    host: 'gospodarz',
    you: 'ty',
    disconnected: 'rozłączony',
    emptySlot: 'wolne biurko',
    start: 'Do składu!',
    waitingForHost: 'Czekamy, aż gospodarz otworzy wydanie.',
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
    rotateHint: 'Redakcja mieści się tylko na szerokim ekranie.',
    reconnecting: 'Łączymy ponownie…',
    loading: 'Składamy redakcję…',
  },
  touch: {
    interact: 'Podnieś',
    work: 'Pracuj',
    ping: 'Sygnał',
    joystick: 'Ruch',
  },
  connection: {
    connecting: 'Łączenie…',
    online: 'Na łączach',
    reconnecting: 'Łączymy ponownie…',
    offline: 'Brak połączenia',
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
    formNo: 'Formularz R-1',
    sound: 'Dźwięk',
    master: 'Głośność ogólna',
    music: 'Muzyka',
    sfx: 'Efekty',
    ui: 'Interfejs',
    mute: 'Wycisz wszystko',
    display: 'Obraz',
    quality: 'Jakość grafiki',
    qualityLow: 'Oszczędna',
    qualityMedium: 'Średnia',
    qualityHigh: 'Wysoka',
    textScale: 'Wielkość tekstu',
    access: 'Dostępność',
    reducedMotion: 'Mniej ruchu (bez wstrząsów i podskoków)',
    noFlash: 'Bez migania',
    haptics: 'Wibracje',
    leftHanded: 'Sterowanie dotykowe dla leworęcznych',
    close: 'Zamknij',
  },
  styleguide: {
    title: 'Księga makiety',
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
  },
  /** Lobby: roles, readiness, level select (S2-10). */
  lobbyRoles: {
    passesTitle: 'Legitymacje prasowe',
    passesHint:
      'Rola przyspiesza pracę, ale nie zamyka żadnego stanowiska. Tę samą może mieć kilka osób.',
    passHeader: 'Prasa · Kurier',
    noRole: 'Bez przydziału',
    noRoleBonus: 'Bez premii. Wszędzie zwykłe tempo.',
    /** Speed bonus line built from ROLE_STATIONS and ROLE_WORK_TIME_FACTOR. */
    fasterAt: (stations: readonly string[], percent: number) =>
      `${stations.join(' i ')} o ${percent}% szybciej.`,
    /** Roles whose bonus is not (only) speed get their own line. */
    specialBonuses: {
      reporter: 'Telefon do źródła bez kolejki.',
      managingEditor: 'Raz na wydanie przedłuża termin jednej teczki.',
    } satisfies Partial<Record<Role, string>>,
    noEditorNote: 'Nikt nie ma roli redaktora prowadzącego: przy stole decyduje każdy, bez premii.',
    ready: 'Gotowy',
    readyHint: 'Zaznacz, gdy możesz zaczynać.',
    readyStamp: 'Gotowy',
    notReady: 'czeka',
    levelKicker: 'Dzisiejsze wydanie',
    levelPick: 'Wybierz wydanie',
    levelHostOnly: 'Wydanie wybiera gospodarz.',
    levelMeta: (minutes: number, folders: number) =>
      `${minutes} min · ${folders} ${folders === 1 ? 'teczka' : folders % 10 >= 2 && folders % 10 <= 4 && (folders % 100 < 12 || folders % 100 > 14) ? 'teczki' : 'teczek'}`,
    levelStations: 'Stanowiska',
    startOffline: 'Brak połączenia z redakcją.',
    startWaiting: (names: readonly string[]) => `Czekamy na: ${names.join(', ')}.`,
    allReady: 'Wszyscy gotowi. Można zaczynać.',
  },
  /** In-game HUD and level-end plate (S2-09). */
  hud: {
    queueLabel: 'Teczki na szpikulcu',
    queueEmpty: 'Taśma pusta. Na razie.',
    queueMore: 'w kolejce',
    timer: 'Do zamknięcia numeru',
    score: 'Punkty',
    credibility: 'Wiarygodność',
    credibilityLow: 'spada',
    stamps: (n: number) => `${n} piecz.`,
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
      correct: 'Trafny werdykt',
      wrongJustification: 'Trafny werdykt, słabe uzasadnienie',
      fakePublished: 'Opublikowana fałszywka',
      truthRejected: 'Odrzucona prawdziwa wiadomość',
      wrong: 'Chybiony werdykt',
      expired: 'Przeterminowane',
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
  /** Level results (S2-08/S2-09). */
  results: {
    kicker: 'Wydanie zamknięte',
    wonHeadline: 'Numer poszedł do druku',
    lostHeadline: 'Nakład wstrzymany',
    wonLede: 'Czytelnicy dostaną sprawdzone wiadomości. Naczelny kiwa głową.',
    lostLede: 'Za dużo wpadek i spóźnień. Jutro gazeta wyjdzie z przeprosinami.',
    stars: (n: number) => `Ocena naczelnego: ${n} z 3`,
    score: 'Punkty',
    credibility: 'Wiarygodność',
    scoreDelta: (delta: string) => `${delta} pkt`,
    credibilityDelta: (delta: string) => `${delta} wiar.`,
    folders: 'Co trafiło na biurko',
    noFolders: 'Żadna teczka nie doczekała werdyktu.',
    outcomes: {
      correct: 'Trafnie',
      wrongJustification: 'Trafnie, złe uzasadnienie',
      wrong: 'Błąd',
      expired: 'Przeterminowana',
    } satisfies Record<FolderOutcome, string>,
    backToLobby: 'Wróć do redakcji',
    waitingForHost: 'Czekamy na gospodarza',
  },
} as const;

export type Strings = typeof pl;
