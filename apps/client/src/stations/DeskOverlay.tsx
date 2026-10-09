// Editorial desk sheet (S2-07): the folder card, then two numbered steps. 1: pick one collected
// stamp as the evidence. 2: press one of three big verdict buttons. After the server's verdict
// the sheet shows the outcome (✓ / ✗, points, what was missed) until dismissed. The managing
// editor also gets the level's one "+20 s" deadline extension here (S4-04 groundwork).
import type { Story, Stamp as StoryStamp } from '@redakcja/content';
import type { Folder, GameEvent, Verdict } from '@redakcja/shared';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { correctionStampId } from '../events/event-model.ts';
import { emitCue } from '../fx/feedback.ts';
import { type NavIntent, useInputCapture, useNavIntent } from '../input/ui-nav.ts';
import { onGameEvent } from '../net/game-events.ts';
import { useGame } from '../net/game-store.ts';
import { sendCommand } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './DeskOverlay.module.css';
import { DEADLINE_EXTENSION_S, mayExtendDeadline } from './deadline-extension.ts';
import { FolderSheet } from './FolderSheet.tsx';
import { OutcomeBanner, ResultMark, STATION_ICON } from './kit.tsx';
import { OverlayFrame } from './OverlayFrame.tsx';
import { type FocusGrid, moveFocus, signed } from './overlay-logic.ts';

export type VerdictResultEvent = Extract<GameEvent, { kind: 'verdictResult' }>;

export type DeskOverlayProps = {
  folder: Folder;
  story: Story | undefined;
  /** A verdict was sent and the result has not arrived yet. */
  pending: boolean;
  /** The server's answer; switches the sheet to the outcome view. */
  result: VerdictResultEvent | null;
  onVerdict(verdict: Verdict, justifyingStampId: string): void;
  onClose(): void;
  onDismissResult(): void;
};

/** Left to right: green publish, orange with context, red reject. */
const VERDICT_ORDER: readonly Verdict[] = ['publish', 'publishWithContext', 'reject'];

const CLOSE = 'close';
const EXTEND = 'extend';
/** How long the "+20 s" button waits for the server before it can be pressed again. */
const EXTEND_RETRY_MS = 2000;
/** Gap kept between a focused stamp and the panel edge or the verdict strip. */
const FOCUS_MARGIN_PX = 12;
const verdictKey = (verdict: Verdict) => `verdict:${verdict}`;

export function DeskOverlay(props: DeskOverlayProps) {
  useInputCapture(true);
  if (props.result) {
    return <ResultView {...props} result={props.result} />;
  }
  // A correction folder (level event) needs no evidence: one big button files the correction.
  return props.folder.tag?.kind === 'correction' ? (
    <CorrectionView {...props} />
  ) : (
    <VerdictView {...props} />
  );
}

/**
 * Desk sheet for a correction folder (S4-09): a published story turned out manipulated, so the
 * only decision is to publish the correction. It goes out as "publish with context" with the
 * story's first justifying stamp (the sim accepts any); no stamp picking.
 */
function CorrectionView({ folder, story, pending, onVerdict, onClose }: DeskOverlayProps) {
  const device = useApp((s) => s.inputDevice);
  const stampId = correctionStampId(story, folder);
  const recover = folder.tag?.kind === 'correction' ? folder.tag.recoverCredibility : 0;
  const canSend = stampId !== null && !pending;
  const send = () => {
    if (stampId !== null && canSend) {
      onVerdict('publishWithContext', stampId);
    }
  };

  useNavIntent((intent: NavIntent) => {
    if (intent === 'back') {
      emitCue('ui.back');
      onClose();
    } else if (intent === 'confirm') {
      send();
    }
  });

  return (
    <OverlayFrame
      title={pl.events.correction.title}
      icon="siren"
      closeLabel={pl.desk.close}
      backKey={pl.station.backKey[device]}
      onClose={onClose}
      testId="desk-overlay"
    >
      <div className={styles.correction} data-testid="desk-correction">
        <div className={styles.correctionFile}>
          {story ? <FolderSheet folder={folder} story={story} /> : <p>{pl.desk.unknownStory}</p>}
        </div>
        <div className={styles.correctionAct}>
          <p className={styles.correctionNote} role="status">
            <Icon name="siren" size={26} className={`${styles.correctionIcon}`} />
            <span>{typeset(pl.events.correction.line)}</span>
          </p>
          {recover > 0 && (
            <p className={styles.correctionGain}>
              {typeset(pl.events.correction.recover(recover))}
            </p>
          )}
          <Button
            variant="green"
            big
            wide
            icon={<Icon name="publishWithContext" size={28} />}
            disabled={!canSend}
            data-focused={device !== 'touch'}
            data-testid="desk-correction-publish"
            onClick={send}
          >
            {pending ? pl.desk.sending : pl.events.correction.button}
          </Button>
        </div>
      </div>
    </OverlayFrame>
  );
}

function VerdictView({ folder, story, pending, onVerdict, onClose }: DeskOverlayProps) {
  const device = useApp((s) => s.inputDevice);
  const collected = collectedStamps(folder, story);
  const [chosen, setChosen] = useState<string | null>(null);
  const extension = useDeadlineExtension(folder.id);
  const grid: FocusGrid = [
    extension.state === 'available' ? [EXTEND] : [],
    ...collected.map((stamp) => [stamp.id]),
    collected.length > 0 ? VERDICT_ORDER.map(verdictKey) : [],
    [CLOSE],
  ];
  const [focus, setFocus] = useState<string | null>(() => collected[0]?.id ?? CLOSE);
  const canVerdict = chosen !== null && !pending;
  const choose = (stampId: string) => {
    setChosen(stampId);
    emitCue('desk.justify');
  };
  const decide = (verdict: Verdict) => {
    if (chosen === null || pending) {
      return;
    }
    onVerdict(verdict, chosen);
  };

  useNavIntent((intent: NavIntent) => {
    if (intent === 'back') {
      emitCue('ui.back');
      onClose();
      return;
    }
    if (intent !== 'confirm') {
      setFocus((current) => moveFocus(grid, current, intent));
      return;
    }
    if (focus === CLOSE) {
      emitCue('ui.back');
      onClose();
    } else if (focus === EXTEND) {
      if (extension.state === 'available') {
        emitCue('ui.click');
        extension.extend();
      } else {
        emitCue('ui.hover');
      }
    } else if (focus?.startsWith('verdict:')) {
      const verdict = focus.slice('verdict:'.length) as Verdict;
      if (canVerdict) {
        emitCue('ui.click');
        decide(verdict);
      } else {
        emitCue('ui.hover');
      }
    } else if (focus !== null) {
      choose(focus);
      setFocus(verdictKey('publish'));
    }
  });

  const showFocus = device !== 'touch';
  const focused = (key: string) => (showFocus && focus === key ? styles.focused : '');
  // Keep the keyboard/gamepad focus in view above the sticky verdict strip. Not on open (the
  // story must stay readable); moving back to the first stamp scrolls up to the story again.
  const layoutRef = useRef<HTMLDivElement>(null);
  const decideRef = useRef<HTMLDivElement>(null);
  const stampRefs = useRef(new Map<string, HTMLButtonElement>());
  const firstStamp = collected[0]?.id;
  const lastFocus = useRef(focus);
  useEffect(() => {
    if (focus === lastFocus.current) {
      return;
    }
    lastFocus.current = focus;
    if (!showFocus || focus === null) {
      return;
    }
    const body = layoutRef.current?.parentElement;
    if (!body) {
      return;
    }
    if (focus === firstStamp) {
      body.scrollTop = 0;
      return;
    }
    const target = stampRefs.current.get(focus);
    if (!target) {
      return;
    }
    // Scroll only the panel body (never the panel itself), keeping the item above the strip.
    const view = body.getBoundingClientRect();
    const item = target.getBoundingClientRect();
    const bottom = view.bottom - (decideRef.current?.offsetHeight ?? 0) - FOCUS_MARGIN_PX;
    if (item.bottom > bottom) {
      body.scrollTop += item.bottom - bottom;
    } else if (item.top < view.top + FOCUS_MARGIN_PX) {
      body.scrollTop -= view.top + FOCUS_MARGIN_PX - item.top;
    }
  }, [focus, showFocus, firstStamp]);
  const empty = collected.length === 0;
  const hint = empty
    ? pl.desk.noStamps
    : chosen === null
      ? pl.desk.pickStamp
      : pending
        ? pl.desk.sending
        : pl.desk.pickVerdict;

  return (
    <OverlayFrame
      title={pl.desk.title}
      icon="article"
      closeLabel={pl.desk.close}
      backKey={pl.station.backKey[device]}
      onClose={onClose}
      closeFocused={showFocus && focus === CLOSE && collected.length > 0}
      testId="desk-overlay"
    >
      <div className={`${styles.layout} ${empty ? styles.layoutEmpty : ''}`} ref={layoutRef}>
        <div className={styles.file}>
          {story ? <FolderSheet folder={folder} story={story} /> : <p>{pl.desk.unknownStory}</p>}
        </div>

        <div className={styles.evidence}>
          <p className="visually-hidden" role="status" data-testid="desk-hint">
            {typeset(hint)}
          </p>
          <ExtendDeadline
            state={extension.state}
            focused={showFocus && focus === EXTEND}
            onExtend={() => {
              setFocus(EXTEND);
              extension.extend();
            }}
          />
          {empty ? (
            <div className={styles.emptyBox}>
              <OutcomeBanner success={false} title={typeset(pl.desk.noStamps)} />
              <Button
                variant="primary"
                big
                back
                onClick={onClose}
                data-focused={showFocus && focus === CLOSE}
              >
                {pl.desk.close}
              </Button>
            </div>
          ) : (
            <>
              <Step n={1} state={chosen === null ? 'active' : 'done'}>
                {pl.desk.stepEvidence}
              </Step>
              <ul className={styles.stamps}>
                {collected.map((stamp) => (
                  <li key={stamp.id}>
                    <button
                      type="button"
                      className={`${styles.stamp} ${chosen === stamp.id ? styles.chosen : ''} ${focused(stamp.id)}`}
                      aria-pressed={chosen === stamp.id}
                      data-testid={`desk-stamp-${stamp.id}`}
                      ref={(element) => {
                        if (element) {
                          stampRefs.current.set(stamp.id, element);
                        } else {
                          stampRefs.current.delete(stamp.id);
                        }
                      }}
                      onClick={() => {
                        choose(stamp.id);
                        setFocus(stamp.id);
                      }}
                    >
                      <span className={styles.stampIcon}>
                        <Icon name={STATION_ICON[stamp.station]} size={26} />
                      </span>
                      <span className={styles.stampText}>
                        <span className={styles.stampStation}>
                          {pl.vocab.stations[stamp.station]}
                        </span>
                        <span>{typeset(stamp.text)}</span>
                      </span>
                      {chosen === stamp.id && (
                        <span className={styles.tick} aria-hidden="true">
                          <Icon name="publish" size={20} className={`${styles.tickIcon}`} />
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {!empty && (
          <div className={styles.decide} ref={decideRef}>
            <Step n={2} state={chosen === null ? 'waiting' : 'active'}>
              {pending ? pl.desk.sending : pl.desk.stepVerdict}
            </Step>
            <fieldset className={styles.verdicts} disabled={!canVerdict}>
              <legend className="visually-hidden">{pl.desk.verdictsLabel}</legend>
              {VERDICT_ORDER.map((verdict) => (
                <button
                  key={verdict}
                  type="button"
                  className={`${styles.verdict} ${styles[verdict]} ${focused(verdictKey(verdict))}`}
                  aria-label={pl.vocab.verdicts[verdict]}
                  data-testid={`desk-verdict-${verdict}`}
                  onClick={() => {
                    emitCue('ui.click');
                    setFocus(verdictKey(verdict));
                    decide(verdict);
                  }}
                >
                  <span className={styles.verdictIcon}>
                    <Icon name={verdict} size={26} className={`${styles.verdictGlyph}`} />
                  </span>
                  <span>{pl.desk.verdictShort[verdict]}</span>
                </button>
              ))}
            </fieldset>
          </div>
        )}
      </div>
    </OverlayFrame>
  );
}

type ExtensionState = 'hidden' | 'available' | 'sending' | 'done';

/**
 * The local player's view of the level's one deadline extension for this folder: offered only
 * to whoever may use it (see `mayExtendDeadline`) while it is unused, then "done" once the
 * server confirms it for this folder.
 */
function useDeadlineExtension(folderId: string): { state: ExtensionState; extend(): void } {
  const playerId = useApp((s) => s.playerId);
  const players = useApp((s) => s.room?.players);
  const used = useGame((s) => s.deadlineExtensionUsed);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  useEffect(
    () =>
      onGameEvent((event) => {
        if (event.kind === 'deadlineExtended' && event.folderId === folderId) {
          setDone(true);
          setSentAt(null);
        }
      }),
    [folderId],
  );
  // The server ignores a refused command; let the player try again after a moment.
  useEffect(() => {
    if (sentAt === null) {
      return;
    }
    const timer = setTimeout(() => setSentAt(null), EXTEND_RETRY_MS);
    return () => clearTimeout(timer);
  }, [sentAt]);
  const allowed = mayExtendDeadline(players ?? [], playerId, used);
  const state: ExtensionState = done
    ? 'done'
    : !allowed
      ? 'hidden'
      : sentAt !== null
        ? 'sending'
        : 'available';
  return {
    state,
    extend() {
      if (state !== 'available') {
        return;
      }
      setSentAt(Date.now());
      sendCommand({ kind: 'extendDeadline', folderId });
    },
  };
}

/** Secondary "+20 s" button; after the server's confirmation a green "+20 s!" badge. */
function ExtendDeadline({
  state,
  focused,
  onExtend,
}: {
  state: ExtensionState;
  focused: boolean;
  onExtend(): void;
}) {
  if (state === 'hidden') {
    return null;
  }
  if (state === 'done') {
    return (
      <p className={styles.extended} role="status" data-testid="desk-extended">
        <Icon name="clock" size={22} />
        {pl.desk.extended(DEADLINE_EXTENSION_S)}
      </p>
    );
  }
  return (
    <div className={styles.extend}>
      <Button
        variant="secondary"
        icon={<Icon name="clock" size={22} />}
        disabled={state === 'sending'}
        aria-label={pl.desk.extendLabel(DEADLINE_EXTENSION_S)}
        data-focused={focused}
        data-testid="desk-extend"
        onClick={onExtend}
      >
        <span className={styles.extendAmount}>{pl.desk.extendAmount(DEADLINE_EXTENSION_S)}</span>{' '}
        {pl.desk.extend}
      </Button>
    </div>
  );
}

/** Numbered step heading: yellow number when it is the thing to do, green ✓ once done. */
function Step({
  n,
  state,
  children,
}: {
  n: number;
  state: 'active' | 'done' | 'waiting';
  children: ReactNode;
}) {
  return (
    <h3 className={`${styles.step} ${styles[state] ?? ''}`}>
      <span className={styles.stepNo} aria-hidden="true">
        {state === 'done' ? <Icon name="publish" size={20} /> : n}
      </span>
      {children}
    </h3>
  );
}

function ResultView({
  story,
  result,
  onDismissResult,
}: DeskOverlayProps & { result: VerdictResultEvent }) {
  const device = useApp((s) => s.inputDevice);
  useNavIntent((intent) => {
    if (intent === 'confirm' || intent === 'back') {
      emitCue('ui.click');
      onDismissResult();
    }
  });
  const missed = result.missedStampIds
    .map((id) => story?.stamps.find((stamp) => stamp.id === id))
    .filter((stamp): stamp is StoryStamp => stamp !== undefined);
  const good = result.outcome === 'correct';

  return (
    <OverlayFrame
      title={pl.desk.title}
      icon="article"
      closeLabel={pl.desk.next}
      backKey={pl.station.backKey[device]}
      onClose={onDismissResult}
      testId="desk-result"
    >
      <div className={styles.result}>
        <div className={styles.outcome} role="status" data-testid="desk-outcome">
          <ResultMark success={good} size="lg" />
          <div className={styles.outcomeText}>
            <p className={`${styles.outcomeTitle} ${good ? styles.good : styles.bad}`}>
              {typeset(pl.desk.outcomes[result.outcome])}
            </p>
            {story && <p className={styles.outcomeStory}>{typeset(story.headline)}</p>}
          </div>
          <span className={`${styles.verdictChip} ${styles[result.verdict]}`}>
            <Icon name={result.verdict} size={22} />
            {pl.desk.verdictShort[result.verdict]}
          </span>
        </div>

        <p className={styles.deltas}>
          <span className={`${styles.delta} ${styles.points}`}>
            {pl.desk.points(signed(result.scoreDelta))}
          </span>
          <span className={styles.delta}>
            {pl.desk.credibility(signed(result.credibilityDelta))}
          </span>
          {result.speedBonus && (
            <span className={styles.delta}>
              <Icon name="clock" size={20} />
              {pl.desk.speedBonus}
            </span>
          )}
        </p>

        {missed.length > 0 && (
          <div className={styles.missed}>
            <h3 className={styles.missedTitle}>{pl.desk.missed}</h3>
            <ul>
              {missed.map((m) => (
                <li key={m.id}>
                  <span className={styles.stampIcon}>
                    <Icon name={STATION_ICON[m.station]} size={22} />
                  </span>
                  <span>{typeset(m.text)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.next}>
          <Button variant="primary" big onClick={onDismissResult}>
            {pl.desk.next}
          </Button>
        </div>
      </div>
    </OverlayFrame>
  );
}

/** The folder's stamps, resolved against the story, in the order they were applied. */
function collectedStamps(folder: Folder, story: Story | undefined): StoryStamp[] {
  if (!story) {
    return [];
  }
  return folder.stamps
    .map((id) => story.stamps.find((stamp) => stamp.id === id))
    .filter((stamp): stamp is StoryStamp => stamp !== undefined);
}
