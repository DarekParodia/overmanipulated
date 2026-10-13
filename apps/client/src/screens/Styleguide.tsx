// Living style guide at ?styleguide (S1-17): the cartoon newsroom system on one page — colours
// by meaning, type scale, every button variant, the panel, inputs, icons and stamps — plus the
// minigame bench, to review against agents/design-rules.md on desktop and phone.

import { TECHNIQUES } from '@redakcja/content';
import {
  LEVEL_EVENT_KINDS,
  PING_KINDS,
  ROLES,
  STATION_KINDS,
  type StationKind,
  VERDICTS,
} from '@redakcja/shared';
import { useState } from 'react';
import { cardIcon } from '../encyclopedia/card-icons.ts';
import { EVENT_ICON } from '../events/event-model.ts';
import { emitCue } from '../fx/feedback.ts';
import { PING_ICON } from '../pings/PingPicker.tsx';
import { STATION_ICON } from '../stations/kit.tsx';
import { MinigameBench } from '../stations/minigames/MinigameBench.tsx';
import { StationHelpCard, type StationHelpVariant } from '../stations/StationHelpCard.tsx';
import { type InputDevice, useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { formatNumber, typeset } from '../strings/typography.ts';
import { Button } from '../ui/Button.tsx';
import { Checkbox } from '../ui/Checkbox.tsx';
import { Field } from '../ui/Field.tsx';
import { Icon, type IconName, iconNames } from '../ui/icons/Icon.tsx';
import { RoleIcon } from '../ui/icons/RoleIcon.tsx';
import { Slider } from '../ui/Slider.tsx';
import { STAMP_KINDS, VerdictStamp } from '../ui/VerdictStamp.tsx';
import { GameLogo } from './GameLogo.tsx';
import styles from './Styleguide.module.css';

const meaningSwatches = ['yellow', 'green', 'red', 'orange', 'blue', 'purple'] as const;
const baseSwatches = [
  'sky',
  'sky-deep',
  'surface',
  'surface-soft',
  'surface-sunk',
  'outline',
  'text-soft',
  'text-faint',
];
const playerSwatches = ['player-0', 'player-1', 'player-2', 'player-3'];

type IconItem = {
  key: string;
  label: string;
  icon: IconName;
  role?: (typeof ROLES)[number] | 'none';
};
type IconGroup = { id: keyof typeof pl.styleguide.iconGroups; items: IconItem[] };

const storyTypeNames = Object.keys(pl.vocab.storyTypes) as (keyof typeof pl.vocab.storyTypes)[];

/** Every icon of the set, grouped by what it stands for; the rest lands under "Interfejs". */
function buildIconGroups(): IconGroup[] {
  const groups: IconGroup[] = [
    {
      id: 'storyTypes',
      items: storyTypeNames.map((t) => ({ key: t, label: pl.vocab.storyTypes[t], icon: t })),
    },
    {
      id: 'stations',
      items: STATION_KINDS.map((k) => ({
        key: k,
        label: pl.vocab.stations[k],
        icon: STATION_ICON[k],
      })),
    },
    {
      id: 'verdicts',
      items: VERDICTS.map((v) => ({ key: v, label: pl.vocab.verdicts[v], icon: v })),
    },
    {
      id: 'roles',
      items: [...ROLES, 'none' as const].map((r) => ({
        key: r,
        label: r === 'none' ? pl.lobbyRoles.noRole : pl.vocab.roles[r],
        icon: 'user' as const,
        role: r,
      })),
    },
    {
      id: 'events',
      items: LEVEL_EVENT_KINDS.map((k) => ({
        key: k,
        label: pl.events.banner[k].title,
        icon: EVENT_ICON[k],
      })),
    },
    {
      id: 'pings',
      items: PING_KINDS.map((k) => ({ key: k, label: pl.vocab.pings[k], icon: PING_ICON[k] })),
    },
    {
      id: 'techniques',
      items: TECHNIQUES.map((t) => ({ key: t.id, label: t.name, icon: cardIcon(t) })),
    },
  ];
  const shown = new Set(groups.flatMap((g) => g.items.map((i) => i.icon)));
  groups.push({
    id: 'ui',
    items: iconNames
      .filter((name) => !shown.has(name))
      .map((name) => ({ key: name, label: name, icon: name })),
  });
  return groups;
}

const iconGroups = buildIconGroups();

const typeScale = ['3xl', '2xl', 'xl', 'lg', 'md', 'sm'];

const DEVICES: readonly InputDevice[] = ['keyboard', 'gamepad', 'touch'];
const HELP_VARIANTS: readonly StationHelpVariant[] = ['inPlay', 'full'];

/** Both station help card variants (S7-94) for any station and device. */
function StationHelpSection() {
  const s = pl.styleguide;
  const inputDevice = useApp((state) => state.inputDevice);
  const [kind, setKind] = useState<StationKind>('imageSearch');
  const [device, setDevice] = useState<InputDevice>(inputDevice);
  return (
    <section className={`panel ${styles.section}`} id="station-help">
      <h2>{s.stationHelp}</h2>
      <div className={styles.row}>
        {STATION_KINDS.map((k) => (
          <Button key={k} onClick={() => setKind(k)} aria-pressed={k === kind}>
            {pl.vocab.stations[k]}
          </Button>
        ))}
      </div>
      <div className={styles.row}>
        {DEVICES.map((d) => (
          <Button key={d} onClick={() => setDevice(d)} aria-pressed={d === device}>
            {pl.settings.devices[d]}
          </Button>
        ))}
      </div>
      <div className={styles.helpCards}>
        {HELP_VARIANTS.map((variant) => (
          <div key={variant} className={styles.helpCard} data-testid={`station-help-${variant}`}>
            <h3>{s.stationHelpVariants[variant]}</h3>
            <StationHelpCard kind={kind} device={device} variant={variant} onClose={() => {}} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function Styleguide() {
  const [slamKey, setSlamKey] = useState(0);
  const [checked, setChecked] = useState(true);
  const [volume, setVolume] = useState(0.7);
  const s = pl.styleguide;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <GameLogo small as="div" />
        <div>
          <h1 className={styles.title}>{s.title}</h1>
          <p className={styles.subtitle}>{s.subtitle}</p>
        </div>
      </header>

      <section className={`panel ${styles.section}`}>
        <h2>{s.meaningColours}</h2>
        <div className={styles.swatches}>
          {meaningSwatches.map((name) => (
            <figure key={name} className={styles.swatch}>
              <span className={styles.chip} style={{ background: `var(--${name})` }} />
              <figcaption>
                <strong>{s.meanings[name]}</strong>
                <code>--{name}</code>
              </figcaption>
            </figure>
          ))}
        </div>
        <h3>{s.baseColours}</h3>
        <div className={styles.swatches}>
          {baseSwatches.map((name) => (
            <figure key={name} className={styles.swatch}>
              <span className={styles.chip} style={{ background: `var(--${name})` }} />
              <figcaption>
                <code>--{name}</code>
              </figcaption>
            </figure>
          ))}
        </div>
        <h3>{s.playerColours}</h3>
        <div className={styles.swatches}>
          {playerSwatches.map((name, index) => (
            <figure key={name} className={styles.swatch}>
              <span className={styles.avatar} style={{ background: `var(--${name})` }}>
                {index + 1}
              </span>
              <figcaption>
                <code>--{name}</code>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className={`panel ${styles.section}`}>
        <h2>{s.type}</h2>
        {typeScale.map((size) => (
          <p key={size} className={styles.typeRow}>
            <code>--text-{size}</code>
            <span
              className={styles.display}
              style={{ fontSize: `var(--text-${size})`, lineHeight: 'var(--leading-snug)' }}
            >
              Zażółć gęślą jaźń
            </span>
          </p>
        ))}
        <p>
          {typeset('Nunito, tekst ciągły: cytat "w kontekście" - z sierotkami i datą')} ·{' '}
          <span className="tabular">{formatNumber(12345)}</span>
        </p>
      </section>

      <section className={`panel ${styles.section}`}>
        <h2>{s.buttons}</h2>
        <div className={styles.row}>
          <Button variant="primary" big>
            Do składu!
          </Button>
          <Button variant="primary">Otwórz pokój</Button>
          <Button>Dołącz</Button>
          <Button variant="secondary" disabled>
            Niedostępne
          </Button>
        </div>
        <div className={styles.row}>
          <Button variant="green" icon={<Icon name="publish" />}>
            Publikuj
          </Button>
          <Button variant="orange" icon={<Icon name="publishWithContext" />}>
            Z kontekstem
          </Button>
          <Button variant="red" icon={<Icon name="reject" />}>
            Odrzuć
          </Button>
          <Button icon={<Icon name="settings" label="Ustawienia" />} />
          <Button back icon={<Icon name="leave" />}>
            Wyjdź
          </Button>
          <Button variant="ghost">Pomiń</Button>
        </div>
      </section>

      <div className={styles.split}>
        <section className={`panel ${styles.section}`}>
          <h2>{s.panel}</h2>
          <p>{s.panelText}</p>
          <div className={styles.inset}>
            <code>--surface-soft</code>
          </div>
        </section>

        <section className={`panel ${styles.section}`}>
          <h2>{s.inputs}</h2>
          <Field label="Twój podpis" placeholder="np. Zośka" />
          <Field label="Kod pokoju" large defaultValue="KRWN" />
          <Field label="Z błędem" defaultValue="x" error="Nie ma redakcji z takim kodem." />
          <Checkbox label="Mniej ruchu" checked={checked} onChange={setChecked} />
          <Slider label="Efekty" value={volume} onChange={setVolume} />
        </section>
      </div>

      <section className={`panel ${styles.section}`} id="icons">
        <h2>{s.icons}</h2>
        {iconGroups.map((group) => (
          <div key={group.id} data-testid={`icon-group-${group.id}`}>
            <h3>{s.iconGroups[group.id]}</h3>
            <div className={styles.icons}>
              {group.items.map((item) => (
                <figure key={item.key} className={styles.icon}>
                  {item.role ? (
                    <RoleIcon role={item.role} size={40} />
                  ) : (
                    <Icon name={item.icon} size={40} />
                  )}
                  <figcaption>{item.label}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className={`panel ${styles.section}`} id="stamps">
        <h2>{s.stamps}</h2>
        <p>{s.stampsHint}</p>
        <div className={styles.stamps} key={slamKey}>
          {STAMP_KINDS.map((kind) => (
            <VerdictStamp key={kind} kind={kind} size="lg" slam />
          ))}
        </div>
        <div className={styles.stamps}>
          {STAMP_KINDS.map((kind) => (
            <VerdictStamp key={kind} kind={kind} size="md" />
          ))}
          {STAMP_KINDS.map((kind) => (
            <VerdictStamp key={kind} kind={kind} size="sm" />
          ))}
        </div>
        <div className={styles.row}>
          <Button
            onClick={() => {
              setSlamKey((k) => k + 1);
              emitCue('stamp.applied');
            }}
          >
            {s.stampAgain}
          </Button>
        </div>
      </section>

      <StationHelpSection />

      <section className={`panel ${styles.section}`} id="minigames">
        <h2>{s.minigames}</h2>
        <MinigameBench />
      </section>
    </main>
  );
}
