// Settings dialog: one white panel with three simple groups (Dźwięk / Obraz / Dostępność),
// big sliders, ticks and pill choices; one yellow "Gotowe" button closes it.
import { useEffect, useRef } from 'react';
import { useApp } from '../store/app.ts';
import { type QualityPreset, qualityPresets, useSettings } from '../store/settings.ts';
import { pl } from '../strings/pl.ts';
import { Button } from '../ui/Button.tsx';
import { Checkbox } from '../ui/Checkbox.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import { Slider } from '../ui/Slider.tsx';
import styles from './SettingsPanel.module.css';

const qualityLabel: Record<QualityPreset, string> = {
  low: pl.settings.qualityLow,
  medium: pl.settings.qualityMedium,
  high: pl.settings.qualityHigh,
};

export function SettingsPanel() {
  const open = useApp((s) => s.settingsOpen);
  const setOpen = useApp((s) => s.setSettingsOpen);
  const settings = useSettings();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) {
      return;
    }
    if (open && !element.open) {
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      onClose={() => setOpen(false)}
      aria-labelledby="settings-title"
    >
      <form method="dialog" className={`panel ${styles.sheet}`}>
        <header className={styles.header}>
          <h2 id="settings-title" className={styles.title}>
            <Icon name="settings" size={32} />
            {pl.settings.title}
          </h2>
          <Button
            type="submit"
            back
            icon={<Icon name="reject" size={24} label={pl.settings.closeIcon} />}
          />
        </header>

        <div className={styles.groups}>
          <fieldset className={styles.group}>
            <legend className={styles.legend}>{pl.settings.sound}</legend>
            <Slider
              label={pl.settings.master}
              value={settings.masterVolume}
              onChange={(v) => settings.update({ masterVolume: v })}
            />
            <Slider
              label={pl.settings.sfx}
              value={settings.sfxVolume}
              onChange={(v) => settings.update({ sfxVolume: v })}
            />
            <Slider
              label={pl.settings.ui}
              value={settings.uiVolume}
              onChange={(v) => settings.update({ uiVolume: v })}
            />
            <Slider
              label={pl.settings.music}
              value={settings.musicVolume}
              onChange={(v) => settings.update({ musicVolume: v })}
            />
            <Checkbox
              label={pl.settings.mute}
              checked={settings.muted}
              onChange={(v) => settings.update({ muted: v })}
            />
          </fieldset>

          <fieldset className={styles.group}>
            <legend className={styles.legend}>{pl.settings.display}</legend>
            <div className={styles.choice} role="radiogroup" aria-labelledby="settings-quality">
              <span id="settings-quality">{pl.settings.quality}</span>
              <div className={styles.options}>
                {qualityPresets.map((preset) => (
                  <label key={preset} className={styles.option}>
                    <input
                      className={styles.native}
                      type="radio"
                      name="quality"
                      checked={settings.quality === preset}
                      onChange={() => settings.update({ quality: preset })}
                    />
                    <span>{qualityLabel[preset]}</span>
                  </label>
                ))}
                <label className={styles.option}>
                  <input
                    className={styles.native}
                    type="radio"
                    name="quality"
                    checked={settings.quality === null}
                    onChange={() => settings.update({ quality: null })}
                  />
                  <span>Auto</span>
                </label>
              </div>
            </div>
            <Slider
              label={pl.settings.textScale}
              value={settings.textScale}
              min={1}
              max={1.4}
              step={0.1}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => settings.update({ textScale: v })}
            />
          </fieldset>

          <fieldset className={styles.group}>
            <legend className={styles.legend}>{pl.settings.access}</legend>
            <Checkbox
              label={pl.settings.reducedMotion}
              checked={settings.reducedMotion}
              onChange={(v) => settings.update({ reducedMotion: v })}
            />
            <Checkbox
              label={pl.settings.noFlash}
              checked={settings.noFlash}
              onChange={(v) => settings.update({ noFlash: v })}
            />
            <Checkbox
              label={pl.settings.haptics}
              checked={settings.haptics}
              onChange={(v) => settings.update({ haptics: v })}
            />
            <Checkbox
              label={pl.settings.leftHanded}
              checked={settings.leftHanded}
              onChange={(v) => settings.update({ leftHanded: v })}
            />
          </fieldset>
        </div>

        <footer className={styles.footer}>
          <Button type="submit" variant="primary" big back>
            {pl.settings.close}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
