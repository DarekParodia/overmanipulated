// The intro script (S7-99): eleven scenes, seventeen clips, the gameplay scenes on scripted input
// tracks, every subtitle chunk within two lines at 640×360, and the lines naming the real keys.
import { describe, expect, it } from 'bun:test';
import { MAX_REQUIRED_STAMPS } from '@redakcja/shared';
import { KEY_BINDINGS } from '../input/keyboard.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import {
  fallbackMs,
  INTRO_SUBTITLE_LINE_CHARS,
  INTRO_SUBTITLE_MAX_LINES,
  subtitleChunks,
} from './intro-model.ts';
import {
  INTRO_CLIPS,
  INTRO_DEVICES,
  INTRO_SCENES,
  introClipFor,
  introClipsFor,
} from './intro-script.ts';

/** Greedy word wrap; a non-breaking space glues its words, as in the browser. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line === '' ? word : `${line} ${word}`;
    if (next.length > width && line !== '') {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  lines.push(line);
  return lines;
}

/** The key cap a keyboard binding is read as: KeyR → R. */
function keyCap(code: string): string {
  return code.replace(/^Key/, '');
}

describe('intro scenes', () => {
  it('has eleven scenes in order', () => {
    expect(INTRO_SCENES.map((scene) => scene.id)).toEqual([
      'welcome',
      'folders',
      'pickup',
      'work',
      'stations',
      'desk',
      'proof',
      'credibility',
      'roles',
      'team',
      'end',
    ]);
  });

  it('runs every gameplay scene on a named scripted input track', () => {
    expect(
      INTRO_SCENES.flatMap((scene) =>
        scene.stage.kind === 'engine' ? [[scene.id, scene.stage.track]] : [],
      ),
    ).toEqual([
      ['folders', 'conveyorArrivals'],
      ['pickup', 'pickUpFolder'],
      ['work', 'holdWork'],
      ['stations', 'earnStamp'],
      ['desk', 'citeAndVerdict'],
    ]);
  });
});

describe('intro clips', () => {
  it('has 8 shared clips and 3 × 3 device variants', () => {
    expect(INTRO_CLIPS.map((clip) => clip.id)).toEqual([
      'welcome',
      'folders',
      'pickup.keyboard',
      'pickup.gamepad',
      'pickup.touch',
      'work.keyboard',
      'work.gamepad',
      'work.touch',
      'stations',
      'desk',
      'proof',
      'credibility',
      'roles.keyboard',
      'roles.gamepad',
      'roles.touch',
      'team',
      'end',
    ]);
    expect(INTRO_CLIPS.filter((clip) => clip.device === null)).toHaveLength(8);
  });

  it('gives every device one clip per scene, its own where the scene is per device', () => {
    for (const device of INTRO_DEVICES) {
      const clips = introClipsFor(device);
      expect(clips.map((clip) => clip.scene)).toEqual(INTRO_SCENES.map((scene) => scene.id));
      for (const [index, scene] of INTRO_SCENES.entries()) {
        expect(clips[index]?.device ?? null).toBe(scene.byDevice ? device : null);
      }
    }
    expect(introClipFor('roles', 'touch').id).toBe('roles.touch');
    expect(introClipFor('desk', 'gamepad').id).toBe('desk');
  });

  it('is typeset Polish, one sentence per chunk', () => {
    for (const clip of INTRO_CLIPS) {
      expect(typeset(clip.subtitle), clip.id).toBe(clip.subtitle);
      expect(clip.subtitle, clip.id).not.toMatch(/["']| - /);
      expect(clip.subtitle, clip.id).toMatch(/^\p{Lu}.*[.!?]$/u);
    }
    expect(introClipFor('pickup', 'keyboard').subtitle).toBe(
      'Chodzisz klawiszami W, A, S i\u00a0D. Podejdź do taśmy i\u00a0weź teczkę klawiszem E.',
    );
  });

  it('fits every subtitle chunk in two lines at 640×360', () => {
    for (const clip of INTRO_CLIPS) {
      for (const chunk of subtitleChunks(clip.subtitle, 10000)) {
        const lines = wrap(chunk.text, INTRO_SUBTITLE_LINE_CHARS);
        expect(lines.length, `${clip.id}: ${chunk.text}`).toBeLessThanOrEqual(
          INTRO_SUBTITLE_MAX_LINES,
        );
      }
    }
  });

  it('runs 60–90 s on fallback timing on every device', () => {
    const totals = INTRO_DEVICES.map((device) =>
      introClipsFor(device).reduce((sum, clip) => sum + fallbackMs(clip.subtitle), 0),
    );
    expect(totals).toEqual([74800, 73600, 74800]);
    for (const total of totals) {
      expect(total).toBeGreaterThanOrEqual(60000);
      expect(total).toBeLessThanOrEqual(90000);
    }
  });

  it('names the real keys, buttons and the ability', () => {
    const keyboardPickup = introClipFor('pickup', 'keyboard').subtitle;
    expect(keyboardPickup).toContain(`klawiszem ${keyCap(KEY_BINDINGS.interact[0])}.`);
    expect(introClipFor('work', 'keyboard').subtitle).toContain('spację');
    expect(introClipFor('roles', 'keyboard').subtitle).toContain(
      `klawiszem ${keyCap(KEY_BINDINGS.ability[0])},`,
    );
    expect(introClipFor('pickup', 'gamepad').subtitle).toContain('przyciskiem A.');
    expect(introClipFor('work', 'gamepad').subtitle).toContain('przycisk X.');
    expect(introClipFor('roles', 'gamepad').subtitle).toContain('przyciskiem RB,');
    expect(introClipFor('pickup', 'touch').subtitle).toContain(`„${pl.touch.interact}”`);
    expect(introClipFor('work', 'touch').subtitle).toContain(`„${pl.touch.work}”`);
    for (const device of INTRO_DEVICES) {
      expect(introClipFor('roles', device).subtitle).toContain(
        pl.vocab.abilities.expertise.slice(0, -1),
      );
    }
  });

  it('covers the desk, the verdicts and multi-stamp folders', () => {
    const desk = introClipFor('desk', 'keyboard').subtitle;
    for (const verdict of Object.values(pl.desk.verdictShort)) {
      expect(desk).toContain(typeset(verdict));
    }
    expect(MAX_REQUIRED_STAMPS).toBe(3);
    expect(introClipFor('proof', 'keyboard').subtitle).toContain('dwóch albo trzech dowodów');
    expect(introClipFor('folders', 'keyboard').subtitle).toContain(`„${pl.hud.next.label}”`);
  });
});
