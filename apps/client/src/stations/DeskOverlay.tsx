// Editorial desk sheet (S2-07): the open folder on the desk blotter. The player points at one
// collected stamp as the justification, then presses one of three verdict stamps. After the
// server's verdict the sheet shows the outcome (with what was missed) for a moment.
import type { Story, Stamp as StoryStamp } from '@redakcja/content';
import {
  type Folder,
  type GameEvent,
  type StationKind,
  VERDICTS,
  type Verdict,
} from '@redakcja/shared';
import { useEffect, useState } from 'react';
import { emitCue } from '../fx/feedback.ts';
import { type NavIntent, useInputCapture, useNavIntent } from '../input/ui-nav.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { Stamp, type StampShape, type StampTone } from '../ui/Stamp.tsx';
import styles from './DeskOverlay.module.css';
import { FolderSheet } from './FolderSheet.tsx';
import { OverlayFrame } from './OverlayFrame.tsx';
import { type FocusGrid, moveFocus, seedFromId, signed } from './overlay-logic.ts';

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

/** Each station's stamp has its own border, so stamps differ by shape, not only by label. */
const STATION_STAMP_SHAPE: Record<StationKind, StampShape> = {
  imageSearch: 'circle',
  archive: 'rect',
  sourceRegistry: 'double',
  phone: 'circle',
  aiScanner: 'double',
  dataLibrary: 'rect',
};

const VERDICT_STAMP: Record<Verdict, { tone: StampTone; shape: StampShape }> = {
  publish: { tone: 'blue', shape: 'rect' },
  reject: { tone: 'red', shape: 'double' },
  publishWithContext: { tone: 'ochre', shape: 'rect' },
};

const CLOSE = 'close';
const verdictKey = (verdict: Verdict) => `verdict:${verdict}`;

export function DeskOverlay(props: DeskOverlayProps) {
  useInputCapture(true);
  return props.result ? (
    <ResultView {...props} result={props.result} />
  ) : (
    <VerdictView {...props} />
  );
}

function VerdictView({ folder, story, pending, onVerdict, onClose }: DeskOverlayProps) {
  const device = useApp((s) => s.inputDevice);
  const collected = collectedStamps(folder, story);
  const [chosen, setChosen] = useState<string | null>(null);
  const grid: FocusGrid = [
    ...collected.map((stamp) => [stamp.id]),
    collected.length > 0 ? VERDICTS.map(verdictKey) : [],
    [CLOSE],
  ];
  const [focus, setFocus] = useState<string | null>(() => grid[0]?.[0] ?? CLOSE);
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
  const hint =
    collected.length === 0
      ? pl.desk.noStamps
      : chosen === null
        ? pl.desk.pickStamp
        : pending
          ? pl.desk.sending
          : pl.desk.pickVerdict;

  return (
    <OverlayFrame
      kicker={pl.desk.kicker}
      formNo={pl.desk.caseNo(folder.id)}
      closeLabel={pl.desk.close}
      closeHint={pl.station.leaveHint[device]}
      onClose={onClose}
      tone="manila"
      testId="desk-overlay"
    >
      <div className={styles.layout}>
        <div className={styles.file}>
          {story ? (
            <FolderSheet folder={folder} story={story} />
          ) : (
            <p className="typed">{pl.desk.unknownStory}</p>
          )}
        </div>

        <div className={styles.evidence}>
          <h3 className={`label ${styles.heading}`}>{pl.desk.evidence}</h3>
          <p
            className={`${styles.hint} ${collected.length === 0 ? styles.empty : ''}`}
            role="status"
            data-testid="desk-hint"
          >
            {typeset(hint)}
          </p>
          <ul className={styles.stamps}>
            {collected.map((stamp) => (
              <li key={stamp.id}>
                <button
                  type="button"
                  className={`${styles.stampSlip} ${chosen === stamp.id ? styles.chosen : ''} ${focused(stamp.id)}`}
                  aria-pressed={chosen === stamp.id}
                  data-testid={`desk-stamp-${stamp.id}`}
                  onClick={() => {
                    choose(stamp.id);
                    setFocus(stamp.id);
                  }}
                >
                  {chosen === stamp.id && (
                    <span className={styles.justifyTab}>{pl.desk.justification}</span>
                  )}
                  <Stamp
                    text={pl.vocab.stations[stamp.station]}
                    shape={STATION_STAMP_SHAPE[stamp.station]}
                    tone="ink"
                    seed={seedFromId(stamp.id)}
                    size={STATION_STAMP_SHAPE[stamp.station] === 'circle' ? 76 : 124}
                  />
                  <span className={styles.stampText}>{typeset(stamp.text)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <fieldset className={styles.verdicts} disabled={!canVerdict}>
          <legend className="visually-hidden">{pl.desk.verdictsLabel}</legend>
          {VERDICTS.map((verdict) => (
            <button
              key={verdict}
              type="button"
              className={`${styles.verdict} ${styles[verdict]} ${focused(verdictKey(verdict))}`}
              data-testid={`desk-verdict-${verdict}`}
              onClick={() => {
                emitCue('ui.click');
                setFocus(verdictKey(verdict));
                decide(verdict);
              }}
            >
              <Icon name={verdict} size={22} />
              <span>{pl.vocab.verdicts[verdict]}</span>
            </button>
          ))}
        </fieldset>
      </div>
    </OverlayFrame>
  );
}

function ResultView({
  folder,
  story,
  result,
  onDismissResult,
}: DeskOverlayProps & { result: VerdictResultEvent }) {
  useNavIntent((intent) => {
    if (intent === 'confirm' || intent === 'back') {
      emitCue('ui.click');
      onDismissResult();
    }
  });
  const missed = result.missedStampIds
    .map((id) => story?.stamps.find((stamp) => stamp.id === id))
    .filter((stamp): stamp is StoryStamp => stamp !== undefined);
  const stamp = VERDICT_STAMP[result.verdict];
  const good = result.outcome === 'correct';

  return (
    <OverlayFrame
      kicker={pl.desk.kicker}
      formNo={pl.desk.caseNo(folder.id)}
      closeLabel={pl.desk.next}
      onClose={onDismissResult}
      tone="manila"
      testId="desk-result"
    >
      <div className={styles.layout}>
        <div className={styles.file}>
          {story && (
            <FolderSheet folder={folder} story={story} hideDeadline>
              <span className={styles.verdictStamp}>
                <Stamp
                  text={pl.vocab.verdicts[result.verdict]}
                  tone={stamp.tone}
                  shape={stamp.shape}
                  seed={seedFromId(result.folderId)}
                  size={220}
                  slam
                />
              </span>
            </FolderSheet>
          )}
        </div>
        <div className={styles.evidence}>
          <p
            className={`${styles.outcome} ${good ? styles.good : styles.bad}`}
            role="status"
            data-testid="desk-outcome"
          >
            <Icon name={good ? 'publish' : 'reject'} size={22} />
            {pl.desk.outcomes[result.outcome]}
          </p>
          <p className={styles.deltas}>
            <span className={styles.points}>{pl.desk.points(signed(result.scoreDelta))}</span>
            <span>{pl.desk.credibility(signed(result.credibilityDelta))}</span>
            {result.speedBonus && <span>{pl.desk.speedBonus}</span>}
          </p>
          {missed.length > 0 && (
            <>
              <h3 className={`label ${styles.heading}`}>{pl.desk.missed}</h3>
              <ul className={styles.missed}>
                {missed.map((m) => (
                  <li key={m.id}>
                    <span className="label">{pl.vocab.stations[m.station]}</span> {typeset(m.text)}
                  </li>
                ))}
              </ul>
            </>
          )}
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
