// Player settings, persisted per browser. Every FX cue reads these (agents/game-feel.md).
import { z } from 'zod';
import { create } from 'zustand';
import { readStored, writeStored } from './safe-storage.ts';

export const qualityPresets = ['low', 'medium', 'high'] as const;
export type QualityPreset = (typeof qualityPresets)[number];

const unit = z.number().min(0).max(1);

const settingsSchema = z.object({
  masterVolume: unit.catch(0.8),
  musicVolume: unit.catch(0.6),
  sfxVolume: unit.catch(0.9),
  uiVolume: unit.catch(0.7),
  muted: z.boolean().catch(false),
  /** null = choose automatically from the device. */
  quality: z.enum(qualityPresets).nullable().catch(null),
  textScale: z.number().min(1).max(1.4).catch(1),
  reducedMotion: z.boolean().catch(prefersReducedMotion()),
  noFlash: z.boolean().catch(false),
  haptics: z.boolean().catch(true),
  leftHanded: z.boolean().catch(false),
});

export type Settings = z.infer<typeof settingsSchema>;

const STORAGE_KEY = 'redakcja.settings.v1';

function prefersReducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

export function loadSettings(raw: string | null): Settings {
  let data: unknown = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }
  }
  const parsed = settingsSchema.safeParse(data);
  return parsed.success ? parsed.data : settingsSchema.parse({});
}

type SettingsStore = Settings & {
  update(patch: Partial<Settings>): void;
};

export const useSettings = create<SettingsStore>((set, get) => ({
  ...loadSettings(readStored('local', STORAGE_KEY)),
  update(patch) {
    set(patch);
    const { update: _update, ...values } = { ...get() };
    writeStored('local', STORAGE_KEY, JSON.stringify(values));
  },
}));

/** Reflects settings that CSS needs onto the document root. */
export function applySettingsToDocument(settings: Settings): void {
  const root = globalThis.document?.documentElement;
  if (!root) {
    return;
  }
  root.style.setProperty('--text-scale', String(settings.textScale));
  root.dataset.reducedMotion = String(settings.reducedMotion);
  root.dataset.noFlash = String(settings.noFlash);
}
