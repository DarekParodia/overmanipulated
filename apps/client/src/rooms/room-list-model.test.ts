import { describe, expect, it } from 'bun:test';
import type { RoomListResponse, RoomSummary } from '@redakcja/shared';
import {
  activeFilterCount,
  createRoomListPoller,
  isFiltered,
  keepSelection,
  NO_ROOM_FILTERS,
  nextPollDelay,
  ROOM_LIST_MAX_POLL_MS,
  ROOM_LIST_POLL_MS,
  type RoomListFilters,
  RoomListError,
  type RoomListProblem,
  type RoomListState,
  roomAgeMinutes,
  roomListSearch,
} from './room-list-model.ts';

const ROOM: RoomSummary = {
  code: 'KXMP',
  name: '3B piątek',
  hostNickname: 'Ewa',
  levelId: 'l1',
  mode: 'coop',
  difficulty: 'normal',
  players: 2,
  maxPlayers: 4,
  spectators: 0,
  spectatorsAllowed: false,
  inGame: false,
  canJoinAsPlayer: true,
  canSpectate: false,
  createdAt: 1_000_000,
};

describe('roomListSearch', () => {
  it('leaves the defaults out', () => {
    expect(roomListSearch(NO_ROOM_FILTERS)).toBe('');
  });

  it('sends the trimmed search and every narrowing filter', () => {
    const filters: RoomListFilters = {
      q: '  3b ',
      mode: 'versus',
      status: 'open',
      difficulty: 'expert',
    };
    expect(roomListSearch(filters)).toBe('q=3b&mode=versus&status=open&difficulty=expert');
  });

  it('cuts the search at 24 characters and encodes Polish letters', () => {
    expect(roomListSearch({ ...NO_ROOM_FILTERS, q: 'ż'.repeat(30) })).toBe(
      `q=${'%C5%BC'.repeat(24)}`,
    );
  });

  it('counts the filters, not the search', () => {
    expect(activeFilterCount({ ...NO_ROOM_FILTERS, q: 'abc' })).toBe(0);
    expect(activeFilterCount({ ...NO_ROOM_FILTERS, mode: 'coop', difficulty: 'easy' })).toBe(2);
    expect(isFiltered({ ...NO_ROOM_FILTERS, q: ' ' })).toBe(false);
    expect(isFiltered({ ...NO_ROOM_FILTERS, q: 'b' })).toBe(true);
    expect(isFiltered({ ...NO_ROOM_FILTERS, status: 'inGame' })).toBe(true);
  });
});

describe('nextPollDelay', () => {
  it('doubles on 429 up to 60 s', () => {
    expect(nextPollDelay(8000, 'busy')).toBe(16_000);
    expect(nextPollDelay(16_000, 'busy')).toBe(32_000);
    expect(nextPollDelay(32_000, 'busy')).toBe(60_000);
    expect(nextPollDelay(60_000, 'busy')).toBe(60_000);
  });

  it('goes back to 8 s after a success or any other failure', () => {
    expect(nextPollDelay(32_000, null)).toBe(8000);
    expect(nextPollDelay(32_000, 'offline')).toBe(8000);
    expect(nextPollDelay(8000, 'failed')).toBe(8000);
  });
});

describe('roomAgeMinutes and keepSelection', () => {
  it('counts whole minutes and never goes negative', () => {
    expect(roomAgeMinutes(1_000_000, 1_000_000 + 59_999)).toBe(0);
    expect(roomAgeMinutes(1_000_000, 1_000_000 + 5 * 60_000 + 1)).toBe(5);
    expect(roomAgeMinutes(1_000_000, 900_000)).toBe(0);
  });

  it('keeps a selection only while the room is listed', () => {
    expect(keepSelection('KXMP', [ROOM])).toBe('KXMP');
    expect(keepSelection('ABCD', [ROOM])).toBeNull();
    expect(keepSelection(null, [ROOM])).toBeNull();
  });
});

/** A poller on a fake clock and timer; each request waits until the test answers it. */
function harness() {
  let time = 0;
  let visible = true;
  let timers: { at: number; run: () => void; id: number }[] = [];
  let nextId = 1;
  const requests: {
    filters: RoomListFilters;
    signal: AbortSignal;
    resolve(response: RoomListResponse): void;
    reject(error: unknown): void;
    at: number;
  }[] = [];
  const states: RoomListState[] = [];
  const poller = createRoomListPoller({
    load: (filters, signal) =>
      new Promise((resolve, reject) => {
        requests.push({ filters, signal, resolve, reject, at: time });
      }),
    now: () => time,
    setTimer: (run, ms) => {
      const id = nextId++;
      timers.push({ at: time + ms, run, id });
      return id;
    },
    clearTimer: (handle) => {
      timers = timers.filter((timer) => timer.id !== handle);
    },
    isVisible: () => visible,
    onChange: (state) => states.push(state),
  });
  const flush = () => new Promise((done) => setTimeout(done, 0));
  return {
    poller,
    requests,
    states,
    /** Moves the clock, running each due timer in order. */
    advance(ms: number) {
      const end = time + ms;
      for (;;) {
        const due = timers.filter((timer) => timer.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) {
          break;
        }
        timers = timers.filter((timer) => timer !== due);
        time = due.at;
        due.run();
      }
      time = end;
    },
    async answer(response: RoomListResponse = { rooms: [ROOM], total: 1 }) {
      requests.at(-1)?.resolve(response);
      await flush();
    },
    async fail(problem: RoomListProblem) {
      requests.at(-1)?.reject(new RoomListError(problem));
      await flush();
    },
    setVisible(next: boolean) {
      visible = next;
      poller.visibilityChanged();
    },
    pendingTimers: () => timers.length,
  };
}

describe('createRoomListPoller', () => {
  it('asks at once, then every 8 s', async () => {
    const h = harness();
    h.poller.start(NO_ROOM_FILTERS);
    expect(h.requests).toHaveLength(1);
    await h.answer();
    expect(h.poller.state()).toMatchObject({ status: 'ready', total: 1, problem: null });
    h.advance(7999);
    expect(h.requests).toHaveLength(1);
    h.advance(1);
    expect(h.requests).toHaveLength(2);
    expect(h.requests[1]?.at).toBe(8000);
  });

  it('backs off on 429: 16 s, 32 s, 60 s, 60 s, then 8 s again after a success', async () => {
    const h = harness();
    h.poller.start(NO_ROOM_FILTERS);
    await h.answer();
    const gaps: number[] = [];
    for (let i = 0; i < 4; i++) {
      h.advance(h.poller.state().delayMs);
      const [before, last] = [h.requests.at(-2), h.requests.at(-1)];
      gaps.push((last?.at ?? 0) - (before?.at ?? 0));
      await h.fail('busy');
    }
    // The first gap is the base interval (after the success), each 429 doubles the next one.
    expect(gaps).toEqual([8000, 16_000, 32_000, 60_000]);
    expect(h.poller.state().delayMs).toBe(ROOM_LIST_MAX_POLL_MS);
    expect(h.poller.state()).toMatchObject({ status: 'ready', problem: 'busy', delayMs: 60_000 });
    // The last list stays on screen while the server asks us to slow down.
    expect(h.poller.state().rooms).toEqual([ROOM]);
    h.advance(60_000);
    await h.answer();
    expect(h.poller.state()).toMatchObject({ problem: null, delayMs: ROOM_LIST_POLL_MS });
    const count = h.requests.length;
    h.advance(8000);
    expect(h.requests).toHaveLength(count + 1);
  });

  it('a filter change during a backoff waits for the interval, otherwise asks at once', async () => {
    const h = harness();
    h.poller.start(NO_ROOM_FILTERS);
    await h.fail('busy');
    expect(h.poller.state()).toMatchObject({ status: 'error', problem: 'busy', delayMs: 16_000 });
    h.advance(1000);
    h.poller.setFilters({ ...NO_ROOM_FILTERS, q: '3b' });
    h.advance(14_999);
    expect(h.requests).toHaveLength(1);
    h.advance(1);
    expect(h.requests).toHaveLength(2);
    expect(h.requests[1]?.filters.q).toBe('3b');
    await h.answer();
    h.advance(1000);
    h.poller.setFilters({ ...NO_ROOM_FILTERS, q: '3b p' });
    h.advance(0);
    expect(h.requests).toHaveLength(3);
    expect(h.requests[2]?.filters.q).toBe('3b p');
  });

  it('the same filters again ask nothing (the dialog re-renders)', async () => {
    const h = harness();
    h.poller.start(NO_ROOM_FILTERS);
    h.poller.setFilters({ ...NO_ROOM_FILTERS });
    expect(h.requests[0]?.signal.aborted).toBe(false);
    await h.answer();
    h.advance(0);
    expect(h.requests).toHaveLength(1);
  });

  it('a newer query aborts the older request and its late answer is ignored', async () => {
    const h = harness();
    h.poller.start(NO_ROOM_FILTERS);
    const first = h.requests[0];
    h.poller.setFilters({ ...NO_ROOM_FILTERS, mode: 'versus' });
    expect(first?.signal.aborted).toBe(true);
    h.advance(0);
    first?.resolve({ rooms: [ROOM], total: 1 });
    await h.answer({ rooms: [], total: 0 });
    expect(h.poller.state()).toMatchObject({ status: 'ready', rooms: [], total: 0 });
  });

  it('pauses while the tab is hidden and resumes when the interval has passed', async () => {
    const h = harness();
    h.poller.start(NO_ROOM_FILTERS);
    await h.answer();
    h.advance(3000);
    h.setVisible(false);
    expect(h.pendingTimers()).toBe(0);
    h.advance(120_000);
    expect(h.requests).toHaveLength(1);
    // Back after more than one interval: asks at once.
    h.setVisible(true);
    h.advance(0);
    expect(h.requests).toHaveLength(2);
    await h.answer();
    // Hidden and back within the interval: waits for the rest of it.
    h.advance(2000);
    h.setVisible(false);
    h.setVisible(true);
    h.advance(5999);
    expect(h.requests).toHaveLength(2);
    h.advance(1);
    expect(h.requests).toHaveLength(3);
  });

  it('an answer that arrives while hidden schedules nothing', async () => {
    const h = harness();
    h.poller.start(NO_ROOM_FILTERS);
    h.setVisible(false);
    await h.answer();
    expect(h.poller.state().status).toBe('ready');
    expect(h.pendingTimers()).toBe(0);
    h.advance(60_000);
    expect(h.requests).toHaveLength(1);
  });

  it('stops on close: aborts the request and asks nothing more', async () => {
    const h = harness();
    h.poller.start(NO_ROOM_FILTERS);
    h.poller.stop();
    expect(h.requests[0]?.signal.aborted).toBe(true);
    await h.answer();
    expect(h.poller.state().status).toBe('loading');
    h.advance(60_000);
    h.setVisible(true);
    h.poller.setFilters({ ...NO_ROOM_FILTERS, q: 'x' });
    h.advance(60_000);
    expect(h.requests).toHaveLength(1);
  });

  it('shows an error without a list, keeps polling and retries at once on demand', async () => {
    const h = harness();
    h.poller.start(NO_ROOM_FILTERS);
    await h.fail('offline');
    expect(h.poller.state()).toMatchObject({ status: 'error', problem: 'offline', delayMs: 8000 });
    h.advance(8000);
    expect(h.requests).toHaveLength(2);
    await h.fail('busy');
    h.poller.retry();
    expect(h.requests).toHaveLength(3);
    expect(h.poller.state().delayMs).toBe(ROOM_LIST_POLL_MS);
    await h.answer({ rooms: [], total: 0 });
    expect(h.poller.state()).toMatchObject({ status: 'ready', problem: null, rooms: [] });
    expect(h.states.map((state) => state.status)).toEqual(['error', 'error', 'error', 'ready']);
  });
});
