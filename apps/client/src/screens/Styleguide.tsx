// Living style guide at ?styleguide (S1-17): the cartoon newsroom system on one page — colours
// by meaning, type scale, every button variant, the panel, inputs, icons and stamps — plus the
// minigame bench, to review against agents/design-rules.md on desktop and phone.
import { useState } from 'react';
import { emitCue } from '../fx/feedback.ts';
import { MinigameBench } from '../stations/minigames/MinigameBench.tsx';
import { pl } from '../strings/pl.ts';
import { formatNumber, typeset } from '../strings/typography.ts';
import { Button } from '../ui/Button.tsx';
import { Checkbox } from '../ui/Checkbox.tsx';
import { Field } from '../ui/Field.tsx';
import { Icon, iconNames } from '../ui/icons/Icon.tsx';
import { Slider } from '../ui/Slider.tsx';
import { Stamp } from '../ui/Stamp.tsx';
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

const typeScale = ['3xl', '2xl', 'xl', 'lg', 'md', 'sm'];

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

      <section className={`panel ${styles.section}`}>
        <h2>{s.icons}</h2>
        <div className={styles.icons}>
          {iconNames.map((name) => (
            <figure key={name} className={styles.icon}>
              <Icon name={name} size={40} />
              <figcaption>
                <code>{name}</code>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className={`panel ${styles.section}`}>
        <h2>{s.stamps}</h2>
        <div className={styles.stamps} key={slamKey}>
          <Stamp text="Fałsz" subtext="Kartoteka źródeł" tone="red" seed={11} slam />
          <Stamp
            text="Potwierdzone"
            subtext="6.10.2026"
            tone="blue"
            shape="double"
            seed={23}
            slam
          />
          <Stamp text="Kontekst" tone="ochre" shape="circle" seed={37} slam size={130} />
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

      <section className={`panel ${styles.section}`} id="minigames">
        <h2>{s.minigames}</h2>
        <MinigameBench />
      </section>
    </main>
  );
}
