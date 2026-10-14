// The room browser's list (S7-88): one poller while the dialog is open (`createRoomListPoller`),
// paused while the tab is hidden, stopped and aborted when the dialog closes.
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchRooms } from '../net/api.ts';
import {
  createRoomListPoller,
  INITIAL_ROOM_LIST,
  type RoomListFilters,
  type RoomListPoller,
  type RoomListState,
} from './room-list-model.ts';

export function useRoomList(
  filters: RoomListFilters,
  active: boolean,
): RoomListState & { retry(): void } {
  const [state, setState] = useState<RoomListState>(INITIAL_ROOM_LIST);
  const poller = useRef<RoomListPoller | null>(null);
  const latest = useRef(filters);
  latest.current = filters;

  useEffect(() => {
    if (!active) {
      return;
    }
    const instance = createRoomListPoller({
      load: fetchRooms,
      now: () => performance.now(),
      setTimer: (run, ms) => window.setTimeout(run, ms),
      clearTimer: (handle) => window.clearTimeout(handle),
      isVisible: () => document.visibilityState === 'visible',
      onChange: setState,
    });
    poller.current = instance;
    setState(INITIAL_ROOM_LIST);
    instance.start(latest.current);
    const onVisibility = () => instance.visibilityChanged();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      instance.stop();
      poller.current = null;
    };
  }, [active]);

  const { q, mode, status, difficulty } = filters;
  useEffect(() => {
    poller.current?.setFilters({ q, mode, status, difficulty });
  }, [q, mode, status, difficulty]);

  const retry = useCallback(() => poller.current?.retry(), []);
  return { ...state, retry };
}
