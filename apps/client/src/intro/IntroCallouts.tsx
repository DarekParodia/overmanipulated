// The UI-kit callouts beside the intro's in-engine scenes (S7-101). They read the intro's GameView
// (its game store), so the „Następna teczka” card counts down to the folder the local sim will
// spawn, Lupa's sign gets the stamp when the sim applies it and the desk sheet stamps the verdict
// when the sim takes it. They borrow the HUD's folder cards, so they load with the renderer in
// the lazy stage chunk, never with „Jak grać”.
import type { Folder } from '@redakcja/shared';
import { useStore } from 'zustand';
import { Control, Illustration } from '../guidance/ControlsArt.tsx';
import { FolderCard } from '../hud/FolderCard.tsx';
import queueStyles from '../hud/FolderQueue.module.css';
import { GhostCard } from '../hud/FolderQueue.tsx';
import { locationKind, locationLabel, nextFolderState, sortQueue } from '../hud/hud-model.ts';
import type { GameView } from '../net/game-view.ts';
import { STATION_ICON } from '../stations/kit.tsx';
import type { InputDevice } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { VerdictStamp } from '../ui/VerdictStamp.tsx';
import styles from './Intro.module.css';
import type { IntroArt as IntroArtId } from './intro-script.ts';
import { INTRO_PLAYER_ID, INTRO_PROOF_STAMP_ID } from './intro-sim.ts';
import { INTRO_ROSTER } from './intro-view.ts';

/** The UI-kit callout beside an in-engine scene. */
export function Callout({
  art,
  view,
  device,
}: {
  art: IntroArtId;
  view: GameView;
  device: InputDevice;
}) {
  switch (art) {
    case 'nextFolderCard':
      return <QueueCallout view={view} />;
    case 'controlsMove':
      return (
        <div className={styles.callout} data-art={art}>
          <Illustration id="move" device={device} />
          <Control action="interact" device={device} />
        </div>
      );
    case 'controlsWork':
      return (
        <div className={styles.callout} data-art={art}>
          <Illustration id="work" device={device} />
        </div>
      );
    case 'stationSigns':
      return <StationCallout view={view} />;
    case 'deskSheet':
      return <DeskCallout view={view} device={device} />;
    default:
      return null;
  }
}

const nicknameOf = (id: string) => INTRO_ROSTER.find((player) => player.id === id)?.nickname;

/** The HUD's folder cards and the „Następna teczka” ghost card, fed by the local sim. */
function QueueCallout({ view }: { view: GameView }) {
  const folders = useStore(view.store, (s) => s.folders);
  const nextFolder = useStore(view.store, (s) => s.nextFolder);
  const conveyorFull = useStore(view.store, (s) => s.conveyorFull);
  const elapsedMs = useStore(view.store, (s) => s.elapsedMs);
  const next = nextFolderState(nextFolder, conveyorFull, elapsedMs);
  return (
    <div className={`${styles.callout} ${styles.queue}`} data-art="nextFolderCard">
      <ol className={queueStyles.cards}>
        {sortQueue(folders).map((folder) => (
          <FolderCard
            key={folder.id}
            folder={folder}
            elapsedMs={elapsedMs}
            where={locationLabel(folder, nicknameOf)}
            whereKind={locationKind(folder)}
          />
        ))}
        {next.kind !== 'none' && <GhostCard next={next} wide={folders.length === 0} />}
      </ol>
    </div>
  );
}

function photoFolder(folders: readonly Folder[]): Folder | undefined {
  return folders.find(
    (folder) =>
      folder.stamps.includes(INTRO_PROOF_STAMP_ID) ||
      (folder.location.kind === 'carried' && folder.location.playerId === INTRO_PLAYER_ID),
  );
}

/** Lupa's sign; the stamp joins it once the round is solved. */
function StationCallout({ view }: { view: GameView }) {
  const stamped = useStore(
    view.store,
    (s) => photoFolder(s.folders)?.stamps.includes(INTRO_PROOF_STAMP_ID) ?? false,
  );
  return (
    <div className={styles.callout} data-art="stationSigns">
      <span className={styles.sign}>
        <Icon name={STATION_ICON.imageSearch} size={32} />
        {pl.vocab.signs.imageSearch}
      </span>
      {stamped && (
        <span className={styles.proof} data-testid="intro-proof">
          <Icon name="stamp" size={28} />
          {pl.intro.proof}
        </span>
      )}
    </div>
  );
}

/** The desk sheet in two steps: the proof, then the verdict, stamped when the sim takes it. */
function DeskCallout({ view, device }: { view: GameView; device: InputDevice }) {
  const open = useStore(view.store, (s) => s.desks.some((desk) => desk.operatorId !== null));
  const published = useStore(view.store, (s) => s.score > 0);
  return (
    <div
      className={`${styles.callout} ${styles.sheet}`}
      data-art="deskSheet"
      data-step={published ? 'verdict' : open ? 'proof' : 'idle'}
    >
      <span className={`${styles.step} ${open || published ? styles.stepOn : ''}`}>
        <span className={styles.number}>1</span>
        <span className={styles.proof}>
          <Icon name={STATION_ICON.imageSearch} size={24} />
          {pl.intro.proof}
        </span>
      </span>
      <span className={`${styles.step} ${published ? styles.stepOn : ''}`}>
        <span className={styles.number}>2</span>
        {published ? (
          <VerdictStamp kind="publish" size="sm" slam data-testid="intro-verdict" />
        ) : (
          <Illustration id="verdict" device={device} />
        )}
      </span>
    </div>
  );
}
