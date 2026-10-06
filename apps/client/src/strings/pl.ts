// All player-facing Polish text. Keys are English; wording follows agents/design-rules.md §9:
// a gruff, warm editor-in-chief — short, concrete, newsroom vocabulary, no marketing voice.
import type {
  ErrorCode,
  PingKind,
  Priority,
  Role,
  StationKind,
  StoryType,
  Verdict,
} from '@redakcja/shared';

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
  lobbyRoles: {},
  /** In-game HUD and level-end plate (S2-09). */
  hud: {},
  /** Station overlay and work progress (S2-03). */
  station: {},
  /** Editorial desk and verdict sheet (S2-07). */
  desk: {},
  /** Minigames, one sub-namespace each (S2-04..S2-06). */
  minigames: {
    imageSearch: {},
    archive: {},
    sourceRegistry: {},
  },
  /** Ping picker (S2-11). */
  pings: {},
  /** Level results (S2-08/S2-09). */
  results: {},
} as const;

export type Strings = typeof pl;
