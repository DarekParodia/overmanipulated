// Live CSS media query match, for layouts that change structure (not just style) on phones.
import { useSyncExternalStore } from 'react';

/** Same breakpoint as the results panel's phone styles (ResultsPlate.module.css). */
export const PHONE_QUERY = '(max-height: 500px), (max-width: 760px)';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = globalThis.matchMedia?.(query);
      list?.addEventListener('change', onChange);
      return () => list?.removeEventListener('change', onChange);
    },
    () => globalThis.matchMedia?.(query).matches ?? false,
    () => false,
  );
}
