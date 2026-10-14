import { describe, expect, it } from 'bun:test';
import { type AdSenseEnv, type AdsGlobals, createAdSense, fillSlot } from './adsense.ts';

type AppendedScript = {
  src: string;
  nonce: string | null;
  /** The queue flags as they were when the script tag was appended. */
  flagsAtAppend: {
    requestNonPersonalizedAds: number | undefined;
    pauseAdRequests: number | undefined;
  } | null;
  load(): void;
  fail(): void;
};

function fakeEnv(nonce: string | null = 'abc123') {
  const globals: AdsGlobals = {};
  const scripts: AppendedScript[] = [];
  const timers: Array<{ run: () => void; ms: number; cancelled: boolean }> = [];
  const env: AdSenseEnv = {
    globals,
    appendScript(script, onLoad, onError) {
      const queue = globals.adsbygoogle;
      scripts.push({
        ...script,
        flagsAtAppend: queue
          ? {
              requestNonPersonalizedAds: queue.requestNonPersonalizedAds,
              pauseAdRequests: queue.pauseAdRequests,
            }
          : null,
        load: onLoad,
        fail: onError,
      });
    },
    cspNonce: () => nonce,
    setTimer(run, ms) {
      const timer = { run, ms, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  };
  return { env, globals, scripts, timers };
}

/** A stand-in `<ins>`: Google sets data-adsbygoogle-status on one it has handled. */
function fakeIns(attributes: string[] = []) {
  return { hasAttribute: (name: string) => attributes.includes(name) };
}

const CLIENT = 'ca-pub-1234567890123456';

describe('ensureAdSense', () => {
  it('sets the limited-mode flags before the script tag exists', () => {
    const { env, scripts } = fakeEnv();
    void createAdSense(env).ensureAdSense(CLIENT);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.flagsAtAppend).toEqual({ requestNonPersonalizedAds: 1, pauseAdRequests: 0 });
    expect(scripts[0]?.src).toBe(
      'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456',
    );
    expect(scripts[0]?.nonce).toBe('abc123');
  });

  it('appends one script after 3 calls and shares the result', async () => {
    const { env, scripts } = fakeEnv();
    const adsense = createAdSense(env);
    const calls = [
      adsense.ensureAdSense(CLIENT),
      adsense.ensureAdSense(CLIENT),
      adsense.ensureAdSense(CLIENT),
    ];
    expect(scripts).toHaveLength(1);
    expect(adsense.useLoader.getState().state).toBe('loading');
    scripts[0]?.load();
    expect(await Promise.all(calls)).toEqual([true, true, true]);
    expect(adsense.useLoader.getState().state).toBe('ready');
  });

  it('turns blocked on a script error', async () => {
    const { env, scripts, timers } = fakeEnv();
    const adsense = createAdSense(env);
    const loading = adsense.ensureAdSense(CLIENT);
    scripts[0]?.fail();
    expect(await loading).toBe(false);
    expect(adsense.useLoader.getState().state).toBe('blocked');
    expect(timers[0]?.cancelled).toBe(true);
    // A later slot does not try again.
    expect(await adsense.ensureAdSense(CLIENT)).toBe(false);
    expect(scripts).toHaveLength(1);
  });

  it('turns blocked when the script neither loads nor fails within 8000 ms', async () => {
    const { env, scripts, timers } = fakeEnv();
    const adsense = createAdSense(env);
    const loading = adsense.ensureAdSense(CLIENT);
    expect(timers[0]?.ms).toBe(8000);
    timers[0]?.run();
    expect(await loading).toBe(false);
    expect(adsense.useLoader.getState().state).toBe('blocked');
    // A late load event does not flip it back.
    scripts[0]?.load();
    expect(adsense.useLoader.getState().state).toBe('blocked');
  });

  it('passes no nonce when the page has none', () => {
    const { env, scripts } = fakeEnv(null);
    void createAdSense(env).ensureAdSense(CLIENT);
    expect(scripts[0]?.nonce).toBeNull();
  });
});

describe('pushSlot', () => {
  it('pushes once per element', () => {
    const { env, globals } = fakeEnv();
    const adsense = createAdSense(env);
    const pushes: object[] = [];
    globals.adsbygoogle = { push: (entry) => pushes.push(entry) };
    const ins = fakeIns();
    adsense.pushSlot(ins);
    adsense.pushSlot(ins);
    adsense.pushSlot(fakeIns());
    expect(pushes).toEqual([{}, {}]);
  });

  it('skips an element Google already handled', () => {
    const { env, globals } = fakeEnv();
    const adsense = createAdSense(env);
    const pushes: object[] = [];
    globals.adsbygoogle = { push: (entry) => pushes.push(entry) };
    adsense.pushSlot(fakeIns(['data-adsbygoogle-status']));
    expect(pushes).toEqual([]);
  });

  it('swallows an error thrown by Google', () => {
    const { env, globals } = fakeEnv();
    const adsense = createAdSense(env);
    globals.adsbygoogle = {
      push: () => {
        throw new Error('adsbygoogle.push() error: No slot size');
      },
    };
    expect(() => adsense.pushSlot(fakeIns())).not.toThrow();
  });

  it('pushes once under StrictMode (mount, unmount, mount on the same element)', async () => {
    const { env, globals, scripts } = fakeEnv();
    const adsense = createAdSense(env);
    // Before the real script, adsbygoogle is a plain array: every push stays in it.
    const queue: object[] = [];
    globals.adsbygoogle = queue;
    const ins = fakeIns();
    const first = fillSlot(adsense, CLIENT, ins);
    const second = fillSlot(adsense, CLIENT, ins);
    scripts[0]?.load();
    await Promise.all([first, second]);
    expect(queue).toEqual([{}]);
    expect(globals.adsbygoogle?.requestNonPersonalizedAds).toBe(1);
    expect(scripts).toHaveLength(1);
  });

  it('pushes nothing when the loader is blocked', async () => {
    const { env, globals, scripts } = fakeEnv();
    const adsense = createAdSense(env);
    const queue: object[] = [];
    globals.adsbygoogle = queue;
    const filling = fillSlot(adsense, CLIENT, fakeIns());
    scripts[0]?.fail();
    await filling;
    expect(queue).toEqual([]);
  });
});

describe('setAdRequestsPaused', () => {
  it('does nothing before the loader ran', () => {
    const { env, globals } = fakeEnv();
    createAdSense(env).setAdRequestsPaused(true);
    expect(globals.adsbygoogle).toBeUndefined();
  });

  it('pauses and resumes requests once loaded', () => {
    const { env, globals } = fakeEnv();
    const adsense = createAdSense(env);
    void adsense.ensureAdSense(CLIENT);
    adsense.setAdRequestsPaused(true);
    expect(globals.adsbygoogle?.pauseAdRequests).toBe(1);
    adsense.setAdRequestsPaused(false);
    expect(globals.adsbygoogle?.pauseAdRequests).toBe(0);
  });
});

describe('openConsentSettings', () => {
  it('queues the revocation message for when consent data is ready', () => {
    const { env, globals } = fakeEnv();
    createAdSense(env).openConsentSettings();
    let shown = 0;
    const fc = globals.googlefc;
    expect(fc?.callbackQueue).toHaveLength(1);
    if (fc) {
      fc.showRevocationMessage = () => {
        shown += 1;
      };
    }
    fc?.callbackQueue?.[0]?.CONSENT_DATA_READY?.();
    expect(shown).toBe(1);
  });
});
