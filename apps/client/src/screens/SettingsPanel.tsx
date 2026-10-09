// Settings dialog (S5-06): a rail of five tabs (Dźwięk / Obraz / Ułatwienia / Dotyk / Sterowanie)
// beside the active tab; one yellow "Gotowe" button closes it. A centred panel on desktop, a
// full-screen sheet on phones. Mouse, touch, keyboard (native) and gamepad (nav intents) all
// work; opened during play it takes the input away from the world.
import { type KeyboardEvent, type RefObject, useEffect, useRef, useState } from 'react';
import { useGuidance } from '../guidance/store.ts';
import { type NavIntent, useInputCapture, useNavIntent } from '../input/ui-nav.ts';
import { useApp } from '../store/app.ts';
import { defaultSettings, useSettings } from '../store/settings.ts';
import { pl } from '../strings/pl.ts';
import { Button } from '../ui/Button.tsx';
import { Icon, type IconName } from '../ui/icons/Icon.tsx';
import styles from './SettingsPanel.module.css';
import { AccessTab, ControlsTab, DisplayTab, SoundTab, TouchTab } from './SettingsTabs.tsx';
import { nextTab, type SettingsTab, settingsTabs, stepSlider } from './settings-model.ts';

const TAB_ICON: Record<SettingsTab, IconName> = {
  sound: 'sound',
  display: 'fullscreen',
  access: 'user',
  touch: 'hand',
  controls: 'gamepad',
};

const FOCUSABLE = '[role="tab"], input:not(:disabled), button:not(:disabled)';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.closest('[hidden]') === null,
  );
}

/** Sets a range input's value the way a user would, so React's onChange runs. */
function setRangeValue(input: HTMLInputElement, value: number): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, String(value));
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Gamepad navigation over real DOM controls: up/down walk them, left/right adjust. */
function navigate(root: HTMLElement, intent: NavIntent): void {
  const list = focusables(root);
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const index = active ? list.indexOf(active) : -1;
  if (intent === 'up' || intent === 'down') {
    const target =
      list[Math.max(0, Math.min(list.length - 1, index + (intent === 'down' ? 1 : -1)))];
    if (!target) {
      return;
    }
    const isTab = (element: HTMLElement | null) => element?.getAttribute('role') === 'tab';
    if (isTab(target) && !isTab(active)) {
      // Back up from the content: land on the open tab, not on the last one.
      root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
      return;
    }
    target.focus();
    if (isTab(target) && isTab(active)) {
      target.click();
    }
    return;
  }
  if (!active) {
    list[0]?.focus();
    return;
  }
  if (intent === 'confirm') {
    active.click();
    return;
  }
  const dir = intent === 'right' ? 1 : -1;
  if (active.getAttribute('role') === 'tab') {
    if (dir === 1) {
      root
        .querySelector<HTMLElement>('[role="tabpanel"] :is(input, button):not(:disabled)')
        ?.focus();
    }
    return;
  }
  if (active instanceof HTMLInputElement && active.type === 'range') {
    const spec = {
      min: Number(active.min),
      max: Number(active.max),
      step: Number(active.step),
    };
    setRangeValue(active, stepSlider(Number(active.value), dir, spec));
    return;
  }
  if (active instanceof HTMLInputElement && active.type === 'radio') {
    const group = list.filter(
      (element): element is HTMLInputElement =>
        element instanceof HTMLInputElement &&
        element.type === 'radio' &&
        element.name === active.name,
    );
    const next = group[group.indexOf(active) + dir];
    next?.focus();
    next?.click();
  }
}

export function SettingsPanel() {
  const open = useApp((s) => s.settingsOpen);
  const setOpen = useApp((s) => s.setSettingsOpen);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) {
      return;
    }
    if (open && !element.open) {
      element.showModal();
      element.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
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
      // Keys belong to the dialog: the game's own key handler must not see them.
      onKeyDown={(event) => event.nativeEvent.stopPropagation()}
    >
      {open && <SettingsContent onClose={() => setOpen(false)} dialog={dialog} />}
    </dialog>
  );
}

function SettingsContent({
  onClose,
  dialog,
}: {
  onClose(): void;
  dialog: RefObject<HTMLDialogElement | null>;
}) {
  const [tab, setTab] = useState<SettingsTab>('sound');
  const [reset, setReset] = useState(false);
  const setHintsEnabled = useGuidance((s) => s.setHintsEnabled);
  const update = useSettings((s) => s.update);

  useEffect(() => {
    if (!reset) {
      return;
    }
    const timer = setTimeout(() => setReset(false), 1600);
    return () => clearTimeout(timer);
  }, [reset]);

  useInputCapture(true);
  useNavIntent((intent) => {
    const root = dialog.current;
    if (!root) {
      return false;
    }
    if (intent === 'back') {
      onClose();
    } else if (intent === 'alt') {
      setTab((current) => nextTab(current, 1));
    } else {
      navigate(root, intent);
    }
    return true;
  });

  function onTabKey(event: KeyboardEvent<HTMLElement>) {
    const step = ['ArrowDown', 'ArrowRight'].includes(event.key)
      ? 1
      : ['ArrowUp', 'ArrowLeft'].includes(event.key)
        ? -1
        : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const next = nextTab(tab, step);
    setTab(next);
    requestAnimationFrame(() => document.getElementById(`settings-tab-${next}`)?.focus());
  }

  return (
    <form method="dialog" className={`panel ${styles.sheet}`}>
      <div
        className={styles.rail}
        role="tablist"
        aria-orientation="vertical"
        aria-label={pl.settings.tabList}
        onKeyDown={onTabKey}
      >
        {settingsTabs.map((id) => (
          <button
            key={id}
            id={`settings-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls="settings-tabpanel"
            tabIndex={tab === id ? 0 : -1}
            className={styles.tab}
            onClick={() => setTab(id)}
          >
            <Icon name={TAB_ICON[id]} size={26} />
            <span>{pl.settings.tabs[id]}</span>
          </button>
        ))}
      </div>

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

      <div
        id="settings-tabpanel"
        role="tabpanel"
        aria-labelledby={`settings-tab-${tab}`}
        className={styles.body}
      >
        {tab === 'sound' && <SoundTab />}
        {tab === 'display' && <DisplayTab />}
        {tab === 'access' && <AccessTab />}
        {tab === 'touch' && <TouchTab />}
        {tab === 'controls' && <ControlsTab />}
      </div>

      <footer className={styles.footer}>
        <Button
          variant="ghost"
          onClick={() => {
            update(defaultSettings());
            setHintsEnabled(true);
            setReset(true);
          }}
        >
          {reset ? pl.settings.resetDone : pl.settings.reset}
        </Button>
        <Button type="submit" variant="primary" big back>
          {pl.settings.close}
        </Button>
      </footer>
    </form>
  );
}
