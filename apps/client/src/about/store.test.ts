import { beforeEach, describe, expect, it } from 'bun:test';
import { ABOUT_TABS, nextAboutTab, useAbout } from './store.ts';

describe('about tabs', () => {
  it('has the three tabs in order', () => {
    expect(ABOUT_TABS).toEqual(['game', 'credits', 'libraries']);
  });

  it('steps forward and back, wrapping around', () => {
    expect(nextAboutTab('game')).toBe('credits');
    expect(nextAboutTab('credits', 1)).toBe('libraries');
    expect(nextAboutTab('libraries', 1)).toBe('game');
    expect(nextAboutTab('game', -1)).toBe('libraries');
  });
});

describe('about store', () => {
  beforeEach(() => {
    useAbout.getState().hide();
    useAbout.getState().setTab('game');
  });

  it('opens on „Gra” by default, or on the tab asked for', () => {
    useAbout.getState().show();
    expect(useAbout.getState()).toMatchObject({ open: true, tab: 'game' });
    useAbout.getState().hide();
    expect(useAbout.getState().open).toBe(false);
    useAbout.getState().show('credits');
    expect(useAbout.getState()).toMatchObject({ open: true, tab: 'credits' });
    useAbout.getState().setTab('libraries');
    expect(useAbout.getState().tab).toBe('libraries');
  });
});
