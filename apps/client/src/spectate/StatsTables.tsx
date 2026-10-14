// Per-player stats tables (S7-91), one per newsroom: the stats sheet shows the live counters
// (`matchStats`), the spectator results the final ones (`levelEnd.stats`). Columns: the player,
// verdicts given (with the ones the versus embargo still masks), accuracy over the revealed ones,
// stamps, failed tasks and abilities used.
import { pl } from '../strings/pl.ts';
import { Icon, type IconName } from '../ui/icons/Icon.tsx';
import { PlayerMark } from '../ui/PlayerMark.tsx';
import { TeamBadge, teamName } from '../ui/TeamBadge.tsx';
import styles from './SpectatePanels.module.css';
import type { StatsRow, StatsTeam } from './stats-model.ts';

type Column = {
  id: 'verdicts' | 'accuracy' | 'stamps' | 'fails' | 'abilities';
  icon: IconName;
  label: string;
};

const COLUMNS: readonly Column[] = [
  { id: 'verdicts', icon: 'desk', label: pl.spectate.stats.verdicts },
  { id: 'accuracy', icon: 'check', label: pl.spectate.stats.accuracy },
  { id: 'stamps', icon: 'stamp', label: pl.spectate.stats.stamps },
  { id: 'fails', icon: 'cross', label: pl.spectate.stats.fails },
  { id: 'abilities', icon: 'bolt', label: pl.spectate.stats.abilities },
];

function Cell({ row, column }: { row: StatsRow; column: Column['id'] }) {
  const t = pl.spectate.stats;
  switch (column) {
    case 'verdicts':
      return (
        <>
          {row.verdicts}
          {row.pending > 0 && (
            <span
              className={styles.pending}
              role="img"
              aria-label={t.pendingLabel(row.pending)}
              data-testid="stats-pending"
            >
              {t.pending(row.pending)}
            </span>
          )}
        </>
      );
    case 'accuracy':
      return row.accuracy === null ? (
        <>
          <span aria-hidden="true">{t.noAccuracy}</span>
          <span className="visually-hidden">{t.noAccuracyLabel}</span>
        </>
      ) : (
        t.percent(row.accuracy)
      );
    case 'stamps':
      return row.stamps;
    case 'fails':
      return row.minigameFails;
    case 'abilities':
      return row.abilities;
  }
}

export function StatsTables({ groups, versus }: { groups: readonly StatsTeam[]; versus: boolean }) {
  return (
    <div className={styles.statsTables}>
      {groups.map((group) => {
        const name = versus ? teamName(group.team) : pl.spectate.coopTeam;
        return (
          <table
            key={group.team}
            className={styles.statsTable}
            aria-label={pl.spectate.stats.tableLabel(name)}
            data-testid={`stats-team-${group.team}`}
          >
            {versus && (
              <caption className={styles.statsCaption}>
                <TeamBadge team={group.team} size={24} />
                {name}
              </caption>
            )}
            <thead>
              <tr>
                <th scope="col" className={styles.statsPlayerHead}>
                  {pl.spectate.stats.player}
                </th>
                {COLUMNS.map((column) => (
                  <th key={column.id} scope="col" title={column.label}>
                    <Icon name={column.icon} size={18} label={column.label} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => (
                <tr
                  key={row.playerId}
                  className={row.connected ? '' : styles.away}
                  data-testid={`stats-row-${row.playerId}`}
                  data-verdicts={row.verdicts}
                  data-accuracy={row.accuracy ?? undefined}
                >
                  <th scope="row" className={styles.statsPlayer}>
                    <span className={styles.statsPlayerCell}>
                      <PlayerMark colorIndex={row.colorIndex} size={16} />
                      <span className={styles.statsNick}>{row.nickname}</span>
                    </span>
                  </th>
                  {COLUMNS.map((column) => (
                    <td key={column.id}>
                      <Cell row={row} column={column.id} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}
