// AdSense side effects (S7-73): the lazy loader, the per-slot push, the pause guard and the
// consent revocation link. Nothing runs until the first AdSlot mounts, which happens only on an
// ad screen, so a reload straight into a match never loads Google's script and its consent
// dialog never covers play. The flags in AD_QUEUE_FLAGS are on the queue before the script tag
// exists. A blocked or failing script (ad blocker, offline, timeout) only turns the state to
// 'blocked': no console error from our code and no "turn off your ad blocker" message.
import { create } from 'zustand';
import { AD_QUEUE_FLAGS, loaderUrl } from './ads-model.ts';
import { ADS_LOAD_TIMEOUT_MS } from './placements.ts';

export type AdLoaderState = 'idle' | 'loading' | 'ready' | 'blocked';

/**
 * `window.adsbygoogle`: an array until the script loads, then Google's own object. Either way
 * `push({})` fills the next unfilled `<ins>`, and the flags are read from it.
 */
export type AdsQueue = {
  push(entry: object): unknown;
  requestNonPersonalizedAds?: number;
  pauseAdRequests?: number;
};

/** `window.googlefc`: Google's consent message (CMP) API, served by the AdSense tag. */
export type GoogleFc = {
  callbackQueue?: Array<Record<string, () => void>>;
  showRevocationMessage?: () => void;
};

export type AdsGlobals = { adsbygoogle?: AdsQueue; googlefc?: GoogleFc };

/** What the loader needs from the page; tests pass a fake. */
export type AdSenseEnv = {
  globals: AdsGlobals;
  /** Appends `<script async crossorigin="anonymous" src nonce>` with the two handlers. */
  appendScript(
    script: { src: string; nonce: string | null },
    onLoad: () => void,
    onError: () => void,
  ): void;
  /** The page's CSP nonce (`<meta property="csp-nonce">` written by Vite), if any. */
  cspNonce(): string | null;
  /** Starts a timer; returns its cancel function. */
  setTimer(run: () => void, ms: number): () => void;
};

/** An `<ins class="adsbygoogle">`; Google marks one it has handled with `data-adsbygoogle-status`. */
export type AdSlotElement = Pick<Element, 'hasAttribute'>;

export function createAdSense(env: AdSenseEnv, timeoutMs: number = ADS_LOAD_TIMEOUT_MS) {
  const useLoader = create<{ state: AdLoaderState }>(() => ({ state: 'idle' }));
  const pushed = new WeakSet<AdSlotElement>();
  let loading: Promise<boolean> | null = null;

  function queue(): AdsQueue {
    env.globals.adsbygoogle ??= [];
    return env.globals.adsbygoogle;
  }

  /**
   * Loads the AdSense script once per page; resolves true when it loaded and false when it was
   * blocked, failed or timed out. Later calls share the first one (whatever their client).
   */
  function ensureAdSense(client: string): Promise<boolean> {
    if (loading) {
      return loading;
    }
    Object.assign(queue(), AD_QUEUE_FLAGS);
    useLoader.setState({ state: 'loading' });
    loading = new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        cancelTimer();
        useLoader.setState({ state: ok ? 'ready' : 'blocked' });
        resolve(ok);
      };
      const cancelTimer = env.setTimer(() => finish(false), timeoutMs);
      env.appendScript(
        { src: loaderUrl(client), nonce: env.cspNonce() },
        () => finish(true),
        () => finish(false),
      );
    });
    return loading;
  }

  /**
   * Asks Google to fill one `<ins>`. An element already pushed, or one Google has handled, is
   * skipped, so React StrictMode's double effect never requests twice. Google's errors (for
   * example an unsized slot) are swallowed: an empty rail hides itself.
   */
  function pushSlot(ins: AdSlotElement): void {
    if (pushed.has(ins) || ins.hasAttribute('data-adsbygoogle-status')) {
      return;
    }
    pushed.add(ins);
    try {
      queue().push({});
    } catch {
      // Ads are optional; nothing to tell the player.
    }
  }

  /**
   * The pause guard: while not on an ad screen no ad request goes out, even if Auto ads or an
   * anchor unit were switched on in the AdSense UI by mistake. Does nothing before the loader ran.
   */
  function setAdRequestsPaused(paused: boolean): void {
    const ads = env.globals.adsbygoogle;
    if (ads) {
      ads.pauseAdRequests = paused ? 1 : 0;
    }
  }

  /** Opens Google's consent message again ('Zgody reklamowe', the required revocation link). */
  function openConsentSettings(): void {
    env.globals.googlefc ??= {};
    const fc = env.globals.googlefc;
    fc.callbackQueue ??= [];
    fc.callbackQueue.push({ CONSENT_DATA_READY: () => fc.showRevocationMessage?.() });
  }

  return { useLoader, ensureAdSense, pushSlot, setAdRequestsPaused, openConsentSettings };
}

export type AdSense = ReturnType<typeof createAdSense>;

/** What an AdSlot does once its `<ins>` is in the page: load the script, then fill the slot. */
export async function fillSlot(
  adsense: AdSense,
  client: string,
  ins: AdSlotElement,
): Promise<void> {
  if (await adsense.ensureAdSense(client)) {
    adsense.pushSlot(ins);
  }
}

const browserEnv: AdSenseEnv = {
  get globals(): AdsGlobals {
    return globalThis as typeof globalThis & AdsGlobals;
  },
  appendScript({ src, nonce }, onLoad, onError) {
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    if (nonce) {
      script.nonce = nonce;
    }
    script.onload = onLoad;
    script.onerror = onError;
    script.src = src;
    document.head.appendChild(script);
  },
  cspNonce() {
    // Under a CSP the browser hides the nonce attribute; the property keeps it (as Vite reads it).
    const meta = document.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]');
    return meta?.nonce || meta?.getAttribute('nonce') || null;
  },
  setTimer(run, ms) {
    const handle = setTimeout(run, ms);
    return () => clearTimeout(handle);
  },
};

export const adsense = createAdSense(browserEnv);
export const useAdLoader = adsense.useLoader;
export const { ensureAdSense, pushSlot, setAdRequestsPaused, openConsentSettings } = adsense;
