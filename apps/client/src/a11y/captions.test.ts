import { describe, expect, it } from 'bun:test';
import { type Cue, type CueId, cueIds, cues } from '../fx/cues.ts';
import { createFeedback } from '../fx/feedback.ts';
import { loadSettings } from '../store/settings.ts';
import { iconNames } from '../ui/icons/Icon.tsx';
import {
  emptyCaptions,
  MAX_VISIBLE_CAPTIONS,
  nextExpiry,
  pruneCaptions,
  pushCaption,
} from './caption-model.ts';
import { captionFor, captionTable } from './captions.ts';

const SKIP_REASONS = ['ui', 'own-action', 'visual-elsewhere', 'decorative'];

describe('caption table', () => {
  it('decides for every cue that makes a sound', () => {
    const missing = cueIds.filter((id) => (cues[id] as Cue).sound && !(id in captionTable));
    expect(missing).toEqual([]);
  });

  it('has no entry for cues that do not exist', () => {
    const stale = Object.keys(captionTable).filter((id) => !(id in cues));
    expect(stale).toEqual([]);
  });

  it('gives every informative sound a caption of at most three words', () => {
    for (const id of cueIds) {
      const entry = captionTable[id];
      if ('skip' in entry) {
        expect(SKIP_REASONS).toContain(entry.skip);
        continue;
      }
      const { caption } = entry;
      const texts = [caption.text, caption.remote?.text].filter((t): t is string => !!t);
      for (const text of texts) {
        expect(text.split(/\s+/).length).toBeLessThanOrEqual(3);
        expect(text.length).toBeGreaterThan(0);
      }
      expect(iconNames).toContain(caption.icon);
    }
  });

  it('captions the audio-only alerts the design calls out', () => {
    const must: CueId[] = [
      'folder.deadlineWarning',
      'folder.deadlineTick',
      'level.lastSeconds',
      'ping.needArchive',
      'ping.fake',
      'ping.mine',
      'event.bossCall.start',
      'event.outage.start',
      'event.correction.start',
      'event.botRaid.start',
      'desk.open',
      'minigame.fail',
    ];
    for (const id of must) {
      expect('caption' in captionTable[id]).toBe(true);
    }
  });

  it('shows the desk caption only for someone else, and a teammate-specific mistake', () => {
    expect(captionFor('desk.open', false)).toBeNull();
    expect(captionFor('desk.open', true)?.text).toBe('Biurko zajęte');
    expect(captionFor('minigame.fail', false)?.text).toBe('Błąd!');
    expect(captionFor('minigame.fail', true)?.text).toBe('Ktoś się pomylił');
    expect(captionFor('ui.click', false)).toBeNull();
  });

  it('keeps muted-by-design decorative cues out of the stack', () => {
    expect(captionFor('ambience.phone', false)).toBeNull();
    expect(captionFor('player.step', false)).toBeNull();
  });
});

describe('caption model', () => {
  const warn = {
    icon: 'hourglass',
    text: 'Termin blisko',
    tone: 'warn',
    group: 'deadline',
  } as const;

  it('adds, expires and reports the next expiry', () => {
    let state = pushCaption(emptyCaptions, { ...warn, ttlMs: 1000 }, 0);
    expect(state.chips.length).toBe(1);
    expect(nextExpiry(state)).toBe(1000);
    expect(pruneCaptions(state, 999)).toBe(state);
    state = pruneCaptions(state, 1000);
    expect(state.chips.length).toBe(0);
    expect(nextExpiry(state)).toBeNull();
  });

  it('refreshes a group instead of stacking ticks', () => {
    let state = pushCaption(emptyCaptions, { ...warn, ttlMs: 1000 }, 0);
    const id = state.chips[0]?.id;
    state = pushCaption(state, { ...warn, ttlMs: 1000 }, 800);
    state = pushCaption(state, { ...warn, ttlMs: 1000 }, 1500);
    expect(state.chips.length).toBe(1);
    expect(state.chips[0]?.id).toBe(id);
    expect(state.chips[0]?.expiresAt).toBe(2500);
    // Nothing visible changed, so the pop animation is not restarted.
    expect(state.chips[0]?.rev).toBe(0);
  });

  it('restarts the pop when a group changes its words', () => {
    let state = pushCaption(
      emptyCaptions,
      { icon: 'blunder', text: 'Błąd!', tone: 'warn', group: 'mistake' },
      0,
    );
    state = pushCaption(
      state,
      { icon: 'blunder', text: 'Ktoś się pomylił', tone: 'warn', group: 'mistake' },
      10,
    );
    expect(state.chips.length).toBe(1);
    expect(state.chips[0]?.rev).toBe(1);
  });

  it('merges identical words and caps the stack, dropping the oldest', () => {
    let state = emptyCaptions;
    const texts = ['Awaria!', 'Atak botów', 'Sprostowanie!', 'Telefon dzwoni'];
    for (const [index, text] of texts.entries()) {
      state = pushCaption(state, { icon: 'bolt', text, tone: 'danger' }, index);
    }
    expect(state.chips.length).toBe(MAX_VISIBLE_CAPTIONS);
    expect(state.chips.map((c) => c.text)).toEqual(texts.slice(1));
    state = pushCaption(state, { icon: 'bolt', text: 'Atak botów', tone: 'danger' }, 10);
    expect(state.chips.length).toBe(MAX_VISIBLE_CAPTIONS);
  });
});

describe('captions follow the feedback bus', () => {
  it('reports every cue to listeners, muted or not', () => {
    const settings = { ...loadSettings(null), muted: true };
    const feedback = createFeedback(
      () => settings,
      () => 'medium',
    );
    const heard: string[] = [];
    const stop = feedback.onCue((id, context) => heard.push(`${id}:${context.remote === true}`));
    feedback.emit('event.outage.start');
    feedback.emit('desk.open', { remote: true });
    stop();
    feedback.emit('ui.click');
    expect(heard).toEqual(['event.outage.start:false', 'desk.open:true']);
  });
});
