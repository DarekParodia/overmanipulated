import { describe, expect, it } from 'bun:test';
import { DEFAULT_PUBLIC_CONFIG, type PublicConfig } from '@redakcja/shared';
import { fetchPublicConfig } from '../net/api.ts';
import {
  createPublicConfigStore,
  PUBLIC_CONFIG_REFRESH_MS,
  readEmbeddedConfig,
} from './public-config.ts';

const SERVER_CONFIG: PublicConfig = {
  revision: 3,
  siteOrigin: 'https://bronsie.drkp.dev',
  features: { roomBrowser: true, versus: true, spectators: false, intro: true },
  defaultDifficulty: 'easy',
  motd: { id: 'witamy', text: 'Nowy poziom już jest!', tone: 'info' },
  ads: { enabled: false },
};

function fakeDoc(text: string | null): Pick<Document, 'getElementById'> {
  return {
    getElementById: (id: string) =>
      id === 'redakcja-config' && text !== null ? ({ textContent: text } as HTMLElement) : null,
  };
}

describe('readEmbeddedConfig', () => {
  it('parses the JSON the shell embeds', () => {
    expect(readEmbeddedConfig(fakeDoc(JSON.stringify(SERVER_CONFIG)))).toEqual(SERVER_CONFIG);
  });

  it('gives null for a missing element, invalid JSON or a wrong shape', () => {
    expect(readEmbeddedConfig(fakeDoc(null))).toBeNull();
    expect(readEmbeddedConfig(fakeDoc('{"revision":'))).toBeNull();
    expect(readEmbeddedConfig(fakeDoc('{"revision":-1}'))).toBeNull();
    expect(readEmbeddedConfig(fakeDoc(''))).toBeNull();
  });
});

describe('fetchPublicConfig', () => {
  const fetchJson = (body: unknown, status = 200) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('returns the validated server config', async () => {
    expect(await fetchPublicConfig(fetchJson(SERVER_CONFIG))).toEqual(SERVER_CONFIG);
  });

  it('returns null on a network error, an HTTP error or a wrong shape', async () => {
    const failing = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await fetchPublicConfig(failing)).toBeNull();
    expect(await fetchPublicConfig(fetchJson(SERVER_CONFIG, 502))).toBeNull();
    expect(await fetchPublicConfig(fetchJson({ ads: { enabled: true } }))).toBeNull();
  });
});

describe('public config store', () => {
  function setup(results: (PublicConfig | null | Error)[], embedded: PublicConfig | null = null) {
    let time = 1000;
    let calls = 0;
    const store = createPublicConfigStore({
      embedded,
      now: () => time,
      fetchConfig: async () => {
        const next = results[calls] ?? null;
        calls += 1;
        if (next instanceof Error) throw next;
        return next;
      },
    });
    return {
      store,
      calls: () => calls,
      advance: (ms: number) => {
        time += ms;
      },
    };
  }

  it('starts from the safe defaults: ads off, room browser off', () => {
    const { store } = setup([]);
    expect(store.getState().config).toEqual(DEFAULT_PUBLIC_CONFIG);
    expect(store.getState().config.ads).toEqual({ enabled: false });
    expect(store.getState().config.features.roomBrowser).toBe(false);
    expect(store.getState().source).toBe('default');
  });

  it('starts from the embedded config when the page has one', () => {
    const { store } = setup([], SERVER_CONFIG);
    expect(store.getState().config).toEqual(SERVER_CONFIG);
    expect(store.getState().source).toBe('embedded');
  });

  it('takes the server config on a successful refresh', async () => {
    const { store } = setup([SERVER_CONFIG]);
    await store.getState().refresh(true);
    expect(store.getState().config).toEqual(SERVER_CONFIG);
    expect(store.getState().source).toBe('server');
    expect(store.getState().fetchedAt).toBe(1000);
  });

  it('falls back to the defaults when the fetch fails', async () => {
    const { store } = setup([null, new Error('boom')]);
    await store.getState().refresh(true);
    expect(store.getState().config).toEqual(DEFAULT_PUBLIC_CONFIG);
    expect(store.getState().source).toBe('default');
    await store.getState().refresh(true);
    expect(store.getState().config).toEqual(DEFAULT_PUBLIC_CONFIG);
    expect(store.getState().fetchedAt).toBeNull();
  });

  it('keeps the previous config when a later refresh fails', async () => {
    const { store } = setup([SERVER_CONFIG, null]);
    await store.getState().refresh(true);
    await store.getState().refresh(true);
    expect(store.getState().config).toEqual(SERVER_CONFIG);
    expect(store.getState().source).toBe('server');
  });

  it('throttles a non-forced refresh to one per 60 s', async () => {
    expect(PUBLIC_CONFIG_REFRESH_MS).toBe(60_000);
    const { store, calls, advance } = setup([SERVER_CONFIG, SERVER_CONFIG, SERVER_CONFIG]);
    await store.getState().refresh();
    expect(calls()).toBe(1);
    advance(59_999);
    await store.getState().refresh();
    expect(calls()).toBe(1);
    await store.getState().refresh(true);
    expect(calls()).toBe(2);
    advance(60_000);
    await store.getState().refresh();
    expect(calls()).toBe(3);
  });

  it('shares a refresh already in flight', async () => {
    const { store, calls } = setup([SERVER_CONFIG]);
    const first = store.getState().refresh(true);
    const second = store.getState().refresh(true);
    await Promise.all([first, second]);
    expect(calls()).toBe(1);
  });
});
