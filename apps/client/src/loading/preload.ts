// Preloads what the first match needs and reports measured progress to the loading store:
// fonts (the exact faces the HUD uses), the lazy game chunk (three.js + scene), the SFX sprite
// (bytes, then Howler's decode) and the two level music layers (bytes; Howler decodes them when
// the level starts). Called once the player leaves the main menu, so the briefing time pays for
// it; the loading screen only appears when the player is faster than the network.
import { preloadSfx } from '../fx/audio/audio-manager.ts';
import { loadGameScreen } from './game-chunk.ts';
import { type TaskId, useLoading } from './progress.ts';

/** Faces used on the game screen; each is requested with Polish text so the latin-ext subset loads. */
const FONT_FACES = [
  '800 1em "Baloo 2 Variable"',
  '700 1em "Nunito Variable"',
  '400 1em "Nunito Variable"',
] as const;
const FONT_SAMPLE = 'Ąę łóżźćńś Redakcja 0123';

const SFX_BASE = '/assets/audio/sfx';
const MUSIC_TRACKS = ['calm', 'pressure'] as const;

function audioExtension(): 'webm' | 'mp3' {
  try {
    const probe = document.createElement('audio');
    return probe.canPlayType('audio/webm; codecs="opus"') !== '' ? 'webm' : 'mp3';
  } catch {
    return 'mp3';
  }
}

/**
 * Reads a response body chunk by chunk and reports bytes so far. Resolves with the byte count;
 * rejects on network errors or non-2xx. Falls back to "all or nothing" without streams.
 */
export async function fetchWithProgress(
  url: string,
  onProgress: (loaded: number, total: number) => void,
  fetcher: typeof fetch = fetch,
): Promise<number> {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`${url}: ${response.status}`);
  }
  const header = Number(response.headers.get('content-length'));
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = (await response.arrayBuffer()).byteLength;
    onProgress(bytes, bytes);
    return bytes;
  }
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    loaded += value.byteLength;
    onProgress(loaded, header > 0 ? header : 0);
  }
  onProgress(loaded, loaded);
  return loaded;
}

/** Downloads several files in parallel as one task; the task weight becomes their real size. */
async function downloadTask(id: TaskId, urls: readonly string[]): Promise<void> {
  const { start, report } = useLoading.getState();
  start(id);
  const loaded = urls.map(() => 0);
  const totals = urls.map(() => 0);
  const update = () => {
    const total = totals.reduce((a, b) => a + b, 0);
    const done = loaded.reduce((a, b) => a + b, 0);
    // Until every header is in we don't know the total: keep the estimate and report nothing.
    if (totals.every((t) => t > 0)) {
      report(id, done / total, total);
    }
  };
  await Promise.all(
    urls.map((url, i) =>
      fetchWithProgress(url, (l, t) => {
        loaded[i] = l;
        totals[i] = t;
        update();
      }),
    ),
  );
}

async function preloadFonts(): Promise<void> {
  const { start, report, finish } = useLoading.getState();
  start('fonts');
  if (!('fonts' in document)) {
    finish('fonts');
    return;
  }
  let done = 0;
  try {
    await Promise.all(
      FONT_FACES.map(async (face) => {
        await document.fonts.load(face, FONT_SAMPLE);
        done++;
        report('fonts', done / FONT_FACES.length);
      }),
    );
    finish('fonts');
  } catch {
    finish('fonts', false);
  }
}

async function preloadGame(): Promise<void> {
  const { start, finish } = useLoading.getState();
  start('game');
  try {
    await loadGameScreen();
    finish('game');
  } catch {
    finish('game', false);
  }
}

async function preloadSfxSprite(): Promise<void> {
  const { finish } = useLoading.getState();
  try {
    await downloadTask('sfx', [`${SFX_BASE}.${audioExtension()}`]);
    await preloadSfx();
    finish('sfx');
  } catch {
    finish('sfx', false);
  }
}

async function preloadMusic(): Promise<void> {
  const { finish } = useLoading.getState();
  const ext = audioExtension();
  try {
    await downloadTask(
      'music',
      MUSIC_TRACKS.map((track) => `/assets/audio/music/${track}.${ext}`),
    );
    finish('music');
  } catch {
    finish('music', false);
  }
}

let started = false;

/** Starts all downloads once; later calls are no-ops. Never throws. */
export function startPreload(): void {
  if (started) {
    return;
  }
  started = true;
  void Promise.allSettled([preloadGame(), preloadFonts(), preloadSfxSprite(), preloadMusic()]);
}
