// The five panes of the settings screen. Each reads and writes the settings store directly.
import type { CSSProperties } from 'react';
import { useState } from 'react';
import { useGuidance } from '../guidance/store.ts';
import { resetTutorial } from '../guidance/tutorial-store.ts';
import { HudGlyph } from '../hud/HudGlyph.tsx';
import { KeyCap } from '../stations/kit.tsx';
import { useApp } from '../store/app.ts';
import { type QualityPreset, qualityPresets, useSettings } from '../store/settings.ts';
import { pl } from '../strings/pl.ts';
import { Button } from '../ui/Button.tsx';
import { Checkbox } from '../ui/Checkbox.tsx';
import { Icon, type IconName } from '../ui/icons/Icon.tsx';
import { Slider } from '../ui/Slider.tsx';
import styles from './SettingsPanel.module.css';
import {
  type ControlDevice,
  controlRows,
  formatPercent,
  qualityNote,
  sliderSpecs,
} from './settings-model.ts';

const qualityLabel: Record<QualityPreset | 'auto', string> = {
  auto: pl.settings.qualityAuto,
  low: pl.settings.qualityLow,
  medium: pl.settings.qualityMedium,
  high: pl.settings.qualityHigh,
};

export function SoundTab() {
  const s = useSettings();
  const spec = sliderSpecs.volume;
  return (
    <div className={styles.stack}>
      <Slider
        label={pl.settings.master}
        value={s.masterVolume}
        {...spec}
        onChange={(v) => s.update({ masterVolume: v })}
      />
      <Slider
        label={pl.settings.music}
        value={s.musicVolume}
        {...spec}
        onChange={(v) => s.update({ musicVolume: v })}
      />
      <Slider
        label={pl.settings.sfx}
        value={s.sfxVolume}
        {...spec}
        onChange={(v) => s.update({ sfxVolume: v })}
      />
      <Slider
        label={pl.settings.ui}
        value={s.uiVolume}
        {...spec}
        onChange={(v) => s.update({ uiVolume: v })}
      />
      <Checkbox
        label={pl.settings.mute}
        checked={s.muted}
        onChange={(v) => s.update({ muted: v })}
      />
    </div>
  );
}

export function DisplayTab() {
  const s = useSettings();
  const choices: (QualityPreset | null)[] = [null, ...qualityPresets];
  return (
    <div className={styles.stack}>
      <div className={styles.choice} role="radiogroup" aria-labelledby="settings-quality">
        <span id="settings-quality">{pl.settings.quality}</span>
        <div className={styles.options}>
          {choices.map((preset) => (
            <label key={preset ?? 'auto'} className={styles.option}>
              <input
                className={styles.native}
                type="radio"
                name="quality"
                checked={s.quality === preset}
                onChange={() => s.update({ quality: preset })}
              />
              <span>{qualityLabel[preset ?? 'auto']}</span>
            </label>
          ))}
        </div>
        <p className={styles.note} aria-live="polite">
          {qualityNote(s.quality)}
        </p>
      </div>
      <Slider
        label={pl.settings.textScale}
        value={s.textScale}
        {...sliderSpecs.textScale}
        format={formatPercent}
        onChange={(v) => s.update({ textScale: v })}
      />
    </div>
  );
}

export function AccessTab() {
  const s = useSettings();
  const hintsEnabled = useGuidance((g) => g.hintsEnabled);
  const setHintsEnabled = useGuidance((g) => g.setHintsEnabled);
  const [tutorialReset, setTutorialReset] = useState(false);
  return (
    <div className={styles.stack}>
      <Checkbox
        label={pl.settings.reducedMotion}
        checked={s.reducedMotion}
        onChange={(v) => s.update({ reducedMotion: v })}
      />
      <Checkbox
        label={pl.settings.noFlash}
        checked={s.noFlash}
        onChange={(v) => s.update({ noFlash: v })}
      />
      <Checkbox
        label={pl.settings.captions}
        checked={s.captions}
        onChange={(v) => s.update({ captions: v })}
      />
      <Checkbox label={pl.settings.hints} checked={hintsEnabled} onChange={setHintsEnabled} />
      <div>
        <Button
          variant="secondary"
          disabled={tutorialReset}
          onClick={() => {
            resetTutorial();
            setTutorialReset(true);
          }}
        >
          {tutorialReset ? pl.settings.tutorialQueued : pl.settings.tutorialAgain}
        </Button>
      </div>
    </div>
  );
}

/** A miniature of the on-screen controls that follows size, opacity and handedness live. */
function TouchPreview() {
  const { touchScale, touchOpacity, leftHanded } = useSettings();
  const style = { '--pv-scale': touchScale, '--pv-opacity': touchOpacity } as CSSProperties;
  return (
    <div
      className={`${styles.stage} ${leftHanded ? styles.stageMirrored : ''}`}
      style={style}
      role="img"
      aria-label={pl.settings.touchPreview}
      data-testid="touch-preview"
    >
      <div className={styles.pvStick}>
        <div className={styles.pvKnob} />
      </div>
      <div className={styles.pvButtons}>
        <span className={`${styles.pvButton} ${styles.pvPing}`}>
          <Icon name="ping" size={18} />
        </span>
        <span className={`${styles.pvButton} ${styles.pvWork}`}>
          <HudGlyph name="work" size={22} fill="var(--surface)" />
        </span>
        <span className={`${styles.pvButton} ${styles.pvInteract}`}>
          <HudGlyph name="hand" size={26} fill="var(--surface)" />
        </span>
      </div>
    </div>
  );
}

export function TouchTab() {
  const s = useSettings();
  return (
    <div className={styles.split}>
      <div className={styles.stack}>
        <TouchPreview />
        <Checkbox
          label={pl.settings.leftHanded}
          checked={s.leftHanded}
          onChange={(v) => s.update({ leftHanded: v })}
        />
      </div>
      <div className={styles.stack}>
        <Slider
          label={pl.settings.touchScale}
          value={s.touchScale}
          {...sliderSpecs.touchScale}
          format={formatPercent}
          onChange={(v) => s.update({ touchScale: v })}
        />
        <Slider
          label={pl.settings.touchOpacity}
          value={s.touchOpacity}
          {...sliderSpecs.touchOpacity}
          format={formatPercent}
          onChange={(v) => s.update({ touchOpacity: v })}
        />
        <Checkbox
          label={pl.settings.haptics}
          checked={s.haptics}
          onChange={(v) => s.update({ haptics: v })}
        />
        <Slider
          label={pl.settings.rumble}
          value={s.rumbleIntensity}
          {...sliderSpecs.rumbleIntensity}
          format={formatPercent}
          onChange={(v) => s.update({ rumbleIntensity: v })}
        />
      </div>
    </div>
  );
}

const DEVICE_ICON: Record<ControlDevice, IconName> = {
  keyboard: 'desk',
  gamepad: 'gamepad',
  touch: 'hand',
};
const DEVICES: readonly ControlDevice[] = ['keyboard', 'gamepad', 'touch'];

export function ControlsTab() {
  const current = useApp((s) => s.inputDevice);
  return (
    <div className={styles.cards}>
      {DEVICES.map((device) => (
        <section
          key={device}
          className={`${styles.card} ${device === current ? styles.cardCurrent : ''}`}
          aria-labelledby={`controls-${device}`}
        >
          <h3 id={`controls-${device}`} className={styles.cardTitle}>
            <Icon name={DEVICE_ICON[device]} size={24} />
            {pl.settings.devices[device]}
          </h3>
          <dl className={styles.bindings}>
            {controlRows(device).map((row) => (
              <div key={row.action} className={styles.binding}>
                <dt>{pl.settings.actions[row.action]}</dt>
                <dd>
                  {row.options.map((caps) => (
                    <span key={caps.join()} className={styles.caps}>
                      {caps.map((cap) => (
                        <KeyCap key={cap}>{cap}</KeyCap>
                      ))}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <p className={styles.note}>{pl.settings.controlsMenuNote}</p>
    </div>
  );
}
