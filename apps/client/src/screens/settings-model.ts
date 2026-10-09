// Pure logic behind the settings screen: slider specs and stepping (for gamepad nudges), the
// quality explanation and the real control bindings read from input/.
import { PAD } from '../input/gamepad.ts';
import { KEY_BINDINGS } from '../input/keyboard.ts';
import type { QualityPreset } from '../store/settings.ts';
import { pl } from '../strings/pl.ts';

export type SliderSpec = { min: number; max: number; step: number };

/** Ranges mirror the store schema (store/settings.ts); the schema clamps whatever arrives. */
export const sliderSpecs = {
  volume: { min: 0, max: 1, step: 0.05 },
  textScale: { min: 1, max: 1.4, step: 0.1 },
  rumbleIntensity: { min: 0, max: 1, step: 0.1 },
  touchScale: { min: 0.8, max: 1.4, step: 0.1 },
  touchOpacity: { min: 0.4, max: 1, step: 0.05 },
} as const satisfies Record<string, SliderSpec>;

/** Moves a slider value one step up (+1) or down (-1), clamped and free of float drift. */
export function stepSlider(value: number, direction: 1 | -1, spec: SliderSpec): number {
  const steps = Math.round((value - spec.min) / spec.step) + direction;
  const next = spec.min + steps * spec.step;
  const clamped = Math.min(spec.max, Math.max(spec.min, next));
  return Math.round(clamped * 1000) / 1000;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** The one-line explanation under the quality choice. `null` is automatic. */
export function qualityNote(quality: QualityPreset | null): string {
  return quality === null ? pl.settings.qualityNoteAuto : pl.settings.qualityNote[quality];
}

export type SettingsTab = 'sound' | 'display' | 'access' | 'touch' | 'controls';
export const settingsTabs: readonly SettingsTab[] = [
  'sound',
  'display',
  'access',
  'touch',
  'controls',
];

/** Cycles through the tabs; used by the gamepad shortcut. */
export function nextTab(tab: SettingsTab, direction: 1 | -1): SettingsTab {
  const index = settingsTabs.indexOf(tab) + direction;
  return settingsTabs[(index + settingsTabs.length) % settingsTabs.length] ?? 'sound';
}

const KEY_LABELS: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Space: pl.settings.keySpace,
};

/** Physical key code → what is printed on the key cap ("KeyW" → "W"). */
export function keyLabel(code: string): string {
  return KEY_LABELS[code] ?? code.replace(/^Key/, '');
}

export type ControlAction = 'move' | 'interact' | 'work' | 'ping';
export const controlActions: readonly ControlAction[] = ['move', 'interact', 'work', 'ping'];
export type ControlDevice = 'keyboard' | 'gamepad' | 'touch';

/** Each row lists alternatives; each alternative is the set of caps pressed for it. */
export type ControlRow = { action: ControlAction; options: readonly (readonly string[])[] };

/** Face-button names of the standard gamepad mapping, keyed by the button index in `PAD`. */
const PAD_FACE: Readonly<Record<number, string>> = {
  [PAD.south]: 'A',
  [PAD.west]: 'X',
  [PAD.north]: 'Y',
};

type Direction = 'up' | 'left' | 'down' | 'right';
const DIRECTIONS: readonly Direction[] = ['up', 'left', 'down', 'right'];

function directionCaps(alternative: 0 | 1): string[] {
  return DIRECTIONS.map((direction) => keyLabel(KEY_BINDINGS[direction][alternative] ?? ''));
}

/** The bindings of one device, built from the real tables so the help never drifts. */
export function controlRows(device: ControlDevice): readonly ControlRow[] {
  switch (device) {
    case 'keyboard':
      return [
        { action: 'move', options: [directionCaps(0), directionCaps(1)] },
        { action: 'interact', options: [[keyLabel(KEY_BINDINGS.interact[0])]] },
        { action: 'work', options: [[keyLabel(KEY_BINDINGS.work[0])]] },
        { action: 'ping', options: [[keyLabel(KEY_BINDINGS.ping[0])]] },
      ];
    case 'gamepad':
      return [
        { action: 'move', options: [[pl.settings.padStick], [pl.settings.padDpad]] },
        { action: 'interact', options: [[PAD_FACE[PAD.south] ?? '']] },
        { action: 'work', options: [[PAD_FACE[PAD.west] ?? '']] },
        { action: 'ping', options: [[PAD_FACE[PAD.north] ?? '']] },
      ];
    case 'touch':
      return [
        { action: 'move', options: [[pl.settings.touchStick]] },
        { action: 'interact', options: [[pl.touch.interact]] },
        { action: 'work', options: [[pl.touch.work]] },
        { action: 'ping', options: [[pl.touch.ping]] },
      ];
  }
}
