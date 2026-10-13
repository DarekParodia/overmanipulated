import { describe, expect, it } from 'bun:test';
import { EventEmitter } from 'node:events';
import {
  applyOverrides,
  ConfigError,
  type ConfigStoreOptions,
  changedPaths,
  createConfigStore,
  DEFAULT_SERVER_CONFIG,
  parseConfigText,
  reloadOnSignal,
  type ServerConfig,
  type SignalSource,
  serverConfigSchema,
  staticConfigStore,
} from './config.ts';
import { roomSettings } from './public-config.ts';

const SIGN_OFF = { by: 'Anna Nowak, opiekunka projektu', date: '2026-10-01' };
const ADS_ON = {
  enabled: true,
  client: 'ca-pub-1234567890123456',
  slots: { menu: '1111111111' },
  domains: ['bronsie.drkp.dev'],
  signOff: SIGN_OFF,
};

function expectInvalid(text: string): string {
  const result = parseConfigText(text);
  if (result.ok) throw new Error('expected the config to be refused');
  return result.error;
}

function expectValid(text: string, adsEnabled?: boolean): ServerConfig {
  const result = parseConfigText(text, { adsEnabled });
  if (!result.ok) throw new Error(result.error);
  return result.config;
}

describe('serverConfigSchema', () => {
  it('fills literal defaults from an empty file', () => {
    expect(DEFAULT_SERVER_CONFIG).toEqual({
      site: { operator: {} },
      features: { roomBrowser: false, versus: true, spectators: true, intro: true },
      motd: null,
      rooms: { maxRooms: 300, defaultDifficulty: 'normal' },
      ads: {
        enabled: false,
        verification: false,
        mode: 'limited',
        slots: {},
        domains: [],
        ageTreatment: 'teen',
        adsTxt: [],
      },
      csp: { extra: {}, adsExtra: {} },
    });
    expect(expectValid('{}')).toEqual(DEFAULT_SERVER_CONFIG);
  });

  it('fills inner defaults of a partly written section', () => {
    const config = expectValid('{"features": {"versus": false}, "rooms": {"maxRooms": 40}}');
    expect(config.features).toEqual({
      roomBrowser: false,
      versus: false,
      spectators: true,
      intro: true,
    });
    expect(config.rooms).toEqual({ maxRooms: 40, defaultDifficulty: 'normal' });
  });

  it('refuses unknown keys, so a typo is never ignored', () => {
    expect(expectInvalid('{"rooms": {"maxRoom": 40}}')).toContain('maxRoom');
    expect(expectInvalid('{"feature": {}}')).toContain('feature');
  });

  it('refuses maxRooms outside 1..5000', () => {
    expectInvalid('{"rooms": {"maxRooms": 0}}');
    expectInvalid('{"rooms": {"maxRooms": 5001}}');
    expect(expectValid('{"rooms": {"maxRooms": 5000}}').rooms.maxRooms).toBe(5000);
  });

  it('refuses ads.enabled without a sign-off', () => {
    const { signOff: _signOff, ...withoutSignOff } = ADS_ON;
    const error = expectInvalid(JSON.stringify({ ads: withoutSignOff }));
    expect(error).toContain('ads.signOff');
    expect(expectValid(JSON.stringify({ ads: ADS_ON })).ads.signOff).toEqual(SIGN_OFF);
  });

  it('refuses a sign-off without a name or with a date that is not YYYY-MM-DD', () => {
    expectInvalid(JSON.stringify({ ads: { ...ADS_ON, signOff: { by: ' ', date: '2026-10-01' } } }));
    expectInvalid(JSON.stringify({ ads: { ...ADS_ON, signOff: { by: 'A', date: '1.10.2026' } } }));
  });

  it('refuses ads.enabled without a client, a domain or a slot', () => {
    expect(expectInvalid(JSON.stringify({ ads: { ...ADS_ON, client: undefined } }))).toContain(
      'ads.client',
    );
    expect(expectInvalid(JSON.stringify({ ads: { ...ADS_ON, domains: [] } }))).toContain(
      'ads.domains',
    );
    expect(expectInvalid(JSON.stringify({ ads: { ...ADS_ON, slots: {} } }))).toContain('ads.slots');
  });

  it('accepts only limited ads while the audience is teen or child', () => {
    expect(
      expectInvalid(JSON.stringify({ ads: { ...ADS_ON, mode: 'nonPersonalized' } })),
    ).toContain('ads.mode');
    expectInvalid(
      JSON.stringify({ ads: { ...ADS_ON, mode: 'nonPersonalized', ageTreatment: 'child' } }),
    );
    expect(
      expectValid(
        JSON.stringify({
          ads: { ...ADS_ON, mode: 'nonPersonalized', ageTreatment: 'unspecified' },
        }),
      ).ads.mode,
    ).toBe('nonPersonalized');
    // Also while ads are off: the file never holds a mode it could not run with.
    expectInvalid('{"ads": {"mode": "nonPersonalized"}}');
  });

  it('refuses a personalised ads mode', () => {
    expectInvalid('{"ads": {"mode": "personalized", "ageTreatment": "unspecified"}}');
  });

  it('needs a client for the verification meta tag', () => {
    expectInvalid('{"ads": {"verification": true}}');
    expect(
      expectValid('{"ads": {"verification": true, "client": "ca-pub-1234567890123456"}}').ads
        .verification,
    ).toBe(true);
  });

  it('checks ads.txt lines and CSP sources', () => {
    expectValid(
      '{"ads": {"adsTxt": ["google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0", "# note"]}}',
    );
    expectInvalid('{"ads": {"adsTxt": ["<html>"]}}');
    expectValid('{"csp": {"extra": {"img-src": ["https://*.example.org"]}}}');
    expectInvalid('{"csp": {"extra": {"img-src": ["*"]}}}');
    expectInvalid('{"csp": {"extra": {"default-src": ["https:"]}}}');
  });

  it('defaults the MOTD tone and orders from before until', () => {
    const config = expectValid('{"motd": {"id": "m1", "text": "Przerwa o 12:00"}}');
    expect(config.motd).toEqual({ id: 'm1', text: 'Przerwa o 12:00', tone: 'info' });
    expectInvalid(
      '{"motd": {"id": "m1", "text": "x", "from": "2026-10-02T00:00:00Z", "until": "2026-10-01T00:00:00Z"}}',
    );
  });

  it('reduces site.publicOrigin to its origin', () => {
    expect(
      expectValid('{"site": {"publicOrigin": "https://Bronsie.drkp.dev/menu"}}').site.publicOrigin,
    ).toBe('https://bronsie.drkp.dev');
  });

  it('reports invalid JSON with a config.json prefix', () => {
    expect(expectInvalid('{"rooms": ')).toStartWith('config.json: invalid JSON:');
  });
});

describe('env overrides', () => {
  it('ADS_ENABLED=false turns ads off whatever the file says', () => {
    const config = expectValid(JSON.stringify({ ads: ADS_ON }), false);
    expect(config.ads.enabled).toBe(false);
  });

  it('ADS_ENABLED=true cannot bypass the sign-off', () => {
    const { signOff: _signOff, enabled: _enabled, ...rest } = ADS_ON;
    const result = parseConfigText(JSON.stringify({ ads: rest }), { adsEnabled: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('ads.signOff');
  });

  it('writes the override into the raw value and leaves odd shapes for the schema', () => {
    expect(applyOverrides({}, { adsEnabled: false })).toEqual({ ads: { enabled: false } });
    expect(applyOverrides({ ads: 'x' }, { adsEnabled: false })).toEqual({ ads: 'x' });
    expect(applyOverrides([], { adsEnabled: false })).toEqual([]);
    expect(applyOverrides({ a: 1 }, {})).toEqual({ a: 1 });
  });
});

describe('changedPaths', () => {
  it('lists dotted leaf paths and compares arrays whole', () => {
    const prev = serverConfigSchema.parse({});
    const next = serverConfigSchema.parse({
      rooms: { maxRooms: 10 },
      features: { roomBrowser: true },
      ads: { domains: ['a.pl'] },
    });
    expect(changedPaths(prev, next)).toEqual([
      'ads.domains',
      'features.roomBrowser',
      'rooms.maxRooms',
    ]);
    expect(changedPaths(prev, prev)).toEqual([]);
    expect(changedPaths({ motd: null }, { motd: { id: 'a' } })).toEqual(['motd']);
  });
});

/** A config store over an in-memory file, a fake directory watch and a manual debounce timer. */
function fakeStore(initial: string | null, options: Partial<ConfigStoreOptions> = {}) {
  const file = { text: initial };
  const watchers: Array<(filename: string | null) => void> = [];
  const timers: Array<{ fn: () => void; ms: number; cancelled: boolean }> = [];
  let watchedDir: string | null = null;
  let stopped = 0;
  const store = createConfigStore({
    path: '/etc/redakcja/config.json',
    readFile: () => file.text,
    watchDir: (dir, onEvent) => {
      watchedDir = dir;
      watchers.push(onEvent);
      return () => {
        stopped += 1;
      };
    },
    setTimer: (fn, ms) => {
      const timer = { fn, ms, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    ...options,
  });
  return {
    store,
    file,
    emit: (filename: string | null) => {
      for (const watcher of watchers) watcher(filename);
    },
    flushTimers: () => {
      for (const timer of timers.splice(0)) if (!timer.cancelled) timer.fn();
    },
    pendingTimers: () => timers.filter((t) => !t.cancelled),
    watchedDir: () => watchedDir,
    stopped: () => stopped,
  };
}

describe('createConfigStore', () => {
  it('uses the defaults when the file is missing', () => {
    const { store } = fakeStore(null);
    expect(store.source).toBe('defaults');
    expect(store.revision).toBe(0);
    expect(store.get()).toEqual(DEFAULT_SERVER_CONFIG);
  });

  it('loads a valid file', () => {
    const { store } = fakeStore('{"rooms": {"maxRooms": 12}}');
    expect(store.source).toBe('file');
    expect(store.get().rooms.maxRooms).toBe(12);
  });

  it('throws ConfigError at startup on an invalid file', () => {
    expect(() => fakeStore('{"rooms": {"maxRooms": -1}}')).toThrow(ConfigError);
    expect(() => fakeStore('not json')).toThrow(ConfigError);
  });

  it('throws ConfigError at startup when ADS_ENABLED=true meets a file without a sign-off', () => {
    expect(() => fakeStore('{}', { overrides: { adsEnabled: true } })).toThrow(ConfigError);
  });

  it('throws ConfigError when the file cannot be read', () => {
    expect(() =>
      fakeStore('{}', {
        readFile: () => {
          throw new Error('EACCES');
        },
      }),
    ).toThrow(ConfigError);
  });

  it('reloads a changed file, bumps the revision and notifies subscribers once', () => {
    const { store, file } = fakeStore('{}');
    const seen: Array<[number, string[]]> = [];
    store.subscribe((config, changed) => seen.push([config.rooms.maxRooms, changed]));
    file.text = '{"rooms": {"maxRooms": 7}}';
    expect(store.reload('manual')).toEqual({ ok: true, changed: ['rooms.maxRooms'] });
    expect(store.revision).toBe(1);
    expect(store.get().rooms.maxRooms).toBe(7);
    // An unchanged file is a no-op: same revision, no notification.
    expect(store.reload('manual')).toEqual({ ok: true, changed: [] });
    expect(store.revision).toBe(1);
    expect(seen).toEqual([[7, ['rooms.maxRooms']]]);
  });

  it('keeps notifying when one subscriber throws', () => {
    const { store, file } = fakeStore('{}');
    const seen: number[] = [];
    store.subscribe(() => {
      throw new Error('listener bug');
    });
    store.subscribe((config) => seen.push(config.rooms.maxRooms));
    file.text = '{"rooms": {"maxRooms": 4}}';
    expect(store.reload('watch')).toEqual({ ok: true, changed: ['rooms.maxRooms'] });
    expect(seen).toEqual([4]);
    expect(store.revision).toBe(1);
  });

  it('keeps the old config when the file turns invalid at reload', () => {
    const { store, file } = fakeStore('{"rooms": {"maxRooms": 9}}');
    file.text = '{"rooms": {"maxRooms": "lots"}}';
    const result = store.reload('manual');
    expect(result.ok).toBe(false);
    expect(store.get().rooms.maxRooms).toBe(9);
    expect(store.revision).toBe(0);
    file.text = '{"rooms": ';
    expect(store.reload('manual').ok).toBe(false);
    expect(store.get().rooms.maxRooms).toBe(9);
  });

  it('keeps the old config when ads are enabled without a sign-off at reload', () => {
    const { store, file } = fakeStore('{}');
    const { signOff: _signOff, ...withoutSignOff } = ADS_ON;
    file.text = JSON.stringify({ ads: withoutSignOff });
    expect(store.reload('manual').ok).toBe(false);
    expect(store.get().ads.enabled).toBe(false);
  });

  it('keeps the old config when the file goes missing at reload', () => {
    const { store, file } = fakeStore('{"features": {"roomBrowser": true}}');
    file.text = null;
    expect(store.reload('manual').ok).toBe(false);
    expect(store.get().features.roomBrowser).toBe(true);
    expect(store.source).toBe('file');
  });

  it('keeps the old config when the file cannot be read at reload', () => {
    let fail = false;
    const { store } = fakeStore(null, {
      readFile: () => {
        if (fail) throw new Error('EACCES');
        return '{"rooms": {"maxRooms": 5}}';
      },
    });
    fail = true;
    expect(store.reload('manual').ok).toBe(false);
    expect(store.get().rooms.maxRooms).toBe(5);
  });

  it('picks up a file created after a start on defaults', () => {
    const { store, file } = fakeStore(null);
    file.text = '{"rooms": {"defaultDifficulty": "hard"}}';
    expect(store.reload('manual')).toEqual({ ok: true, changed: ['rooms.defaultDifficulty'] });
    expect(store.source).toBe('file');
  });

  it('applies the env override on every reload', () => {
    const { store, file } = fakeStore('{}', { overrides: { adsEnabled: false } });
    file.text = JSON.stringify({ ads: ADS_ON });
    expect(store.reload('manual').ok).toBe(true);
    expect(store.get().ads.enabled).toBe(false);
    expect(store.get().ads.client).toBe('ca-pub-1234567890123456');
  });

  it('reloads on a watch event for its file after a 250 ms debounce', () => {
    const fake = fakeStore('{}');
    expect(fake.watchedDir()).toBe('/etc/redakcja');
    fake.file.text = '{"rooms": {"maxRooms": 3}}';
    fake.emit('config.json');
    fake.emit('config.json');
    fake.emit(null);
    // One pending reload: each event restarts the debounce.
    expect(fake.pendingTimers().map((t) => t.ms)).toEqual([250]);
    expect(fake.store.get().rooms.maxRooms).toBe(300);
    fake.flushTimers();
    expect(fake.store.get().rooms.maxRooms).toBe(3);
    expect(fake.store.revision).toBe(1);
  });

  it('ignores watch events for other files in the directory', () => {
    const fake = fakeStore('{}');
    fake.file.text = '{"rooms": {"maxRooms": 3}}';
    fake.emit('config.example.json');
    fake.emit('.config.json.swp');
    expect(fake.pendingTimers()).toEqual([]);
  });

  it('stops watching on close and drops a pending reload', () => {
    const fake = fakeStore('{}');
    fake.emit('config.json');
    fake.store.close();
    fake.store.close();
    expect(fake.stopped()).toBe(1);
    expect(fake.pendingTimers()).toEqual([]);
  });

  it('does not watch when asked not to', () => {
    const fake = fakeStore('{}', { watch: false });
    expect(fake.watchedDir()).toBeNull();
  });
});

describe('reloadOnSignal', () => {
  it('reloads on SIGHUP until stopped', () => {
    const fake = fakeStore('{}');
    const signals = new EventEmitter();
    const target: SignalSource = signals;
    const stop = reloadOnSignal(fake.store, target);
    fake.file.text = '{"features": {"intro": false}}';
    signals.emit('SIGHUP');
    expect(fake.store.get().features.intro).toBe(false);
    expect(fake.store.revision).toBe(1);
    stop();
    expect(signals.listenerCount('SIGHUP')).toBe(0);
  });
});

describe('staticConfigStore', () => {
  it('parses its input with the schema defaults', () => {
    const store = staticConfigStore({ rooms: { maxRooms: 2 } });
    expect(store.get().rooms).toEqual({ maxRooms: 2, defaultDifficulty: 'normal' });
    expect(store.source).toBe('defaults');
    expect(store.revision).toBe(0);
  });

  it('refuses an invalid input', () => {
    expect(() => staticConfigStore({ ads: { enabled: true } })).toThrow(ConfigError);
  });
});

describe('roomSettings', () => {
  it('reads maxRooms, the default difficulty and the feature flags', () => {
    expect(roomSettings(DEFAULT_SERVER_CONFIG)).toEqual({
      maxRooms: 300,
      defaultDifficulty: 'normal',
      features: { roomBrowser: false, versus: true, spectators: true, intro: true },
    });
  });
});
