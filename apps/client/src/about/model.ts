// „O grze” (S7-103), the pure parts: fetching and parsing the asset credits, the voice credit
// line from the intro's voice sprite, and the pad's scroll step for the text panels.
import { type MdBlock, parseMarkdownLite } from '@redakcja/shared';
import type { VoiceLicence, VoiceSprite } from '../intro/voice-sprite.ts';
import { pl } from '../strings/pl.ts';

/**
 * Where the asset credits are served (`apps/client/public/assets/CREDITS.md`). Fetched at
 * runtime, never bundled: the file stays one source for the repo and the game.
 */
export const CREDITS_URL = '/assets/CREDITS.md';

export type CreditsState =
  | { status: 'loading' }
  | { status: 'ready'; blocks: MdBlock[] }
  | { status: 'error' };

/** What `loadCredits` needs from `fetch`; tests pass a fake. */
export type TextResponse = { ok: boolean; contentType: string; text: string };
export type FetchText = (url: string) => Promise<TextResponse>;

const fetchText: FetchText = async (url) => {
  const response = await fetch(url, { headers: { accept: 'text/markdown, text/plain' } });
  return {
    ok: response.ok,
    contentType: response.headers.get('content-type') ?? '',
    text: response.ok ? await response.text() : '',
  };
};

/**
 * The credits as markdown-lite blocks, or the error state: offline, a 404, or an HTML page in
 * its place (a dev server's or a proxy's fallback page is never shown as credits). Never throws.
 */
export async function loadCredits(get: FetchText = fetchText): Promise<CreditsState> {
  try {
    const response = await get(CREDITS_URL);
    const text = response.text.trimStart();
    if (!response.ok || /html/i.test(response.contentType) || text.startsWith('<')) {
      return { status: 'error' };
    }
    const blocks = parseMarkdownLite(text);
    return blocks.length > 0 ? { status: 'ready', blocks } : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}

/** How a voice licence id reads in the credits. */
export const VOICE_LICENCE_LABEL: Readonly<Record<VoiceLicence, string>> = {
  'CC0-1.0': 'CC0 1.0',
  'CC-BY-4.0': 'CC BY 4.0',
  MIT: 'MIT',
  'self-recorded-CC0': 'CC0 1.0',
};

/**
 * The intro voice's credit line: who spoke it (the sprite's `credit`, else its `voice` label)
 * and the licence, read from the generated sprite; without a sprite the voice is still pending.
 */
export function voiceCreditLine(sprite: VoiceSprite | null): string {
  if (sprite === null) {
    return pl.about.voicePending;
  }
  return pl.about.voiceCredit(sprite.credit ?? sprite.voice, VOICE_LICENCE_LABEL[sprite.licence]);
}

/** One pad press scrolls this share of the panel's visible height. */
export const ABOUT_SCROLL_SHARE = 0.6;

/**
 * Where one pad press up (-1) or down (+1) scrolls a panel, or null when it is already at that
 * end (the press then moves the focus instead).
 */
export function scrollTarget(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  direction: 1 | -1,
): number | null {
  const max = Math.max(0, scrollHeight - clientHeight);
  const atEnd = direction > 0 ? scrollTop >= max - 1 : scrollTop <= 1;
  if (atEnd) {
    return null;
  }
  const next = scrollTop + direction * Math.max(1, Math.round(clientHeight * ABOUT_SCROLL_SHARE));
  return Math.min(max, Math.max(0, next));
}
