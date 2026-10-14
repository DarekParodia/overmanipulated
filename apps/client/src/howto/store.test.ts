import { beforeEach, describe, expect, it } from 'bun:test';
import { HOW_TO_TABS, nextHowToTab, useHowTo } from './store.ts';

describe('how-to tabs', () => {
  it('has the three tabs in order', () => {
    expect(HOW_TO_TABS).toEqual(['intro', 'stations', 'controls']);
  });

  it('steps forward and back, wrapping around', () => {
    expect(nextHowToTab('intro')).toBe('stations');
    expect(nextHowToTab('stations', 1)).toBe('controls');
    expect(nextHowToTab('controls', 1)).toBe('intro');
    expect(nextHowToTab('intro', -1)).toBe('controls');
    expect(nextHowToTab('stations', -1)).toBe('intro');
  });
});

describe('how-to store', () => {
  beforeEach(() => {
    useHowTo.getState().hide();
  });

  it('opens on the intro by default, practice allowed', () => {
    useHowTo.getState().show();
    expect(useHowTo.getState()).toMatchObject({
      open: true,
      tab: 'intro',
      station: null,
      practiceAllowed: true,
      autoplay: false,
    });
  });

  it('opens on a station with practice off (in a match)', () => {
    useHowTo.getState().show('stations', { station: 'archive', practiceAllowed: false });
    expect(useHowTo.getState()).toMatchObject({
      open: true,
      tab: 'stations',
      station: 'archive',
      practiceAllowed: false,
    });
  });

  it('a new show resets what the previous one asked for', () => {
    useHowTo.getState().show('stations', { station: 'phone', practiceAllowed: false });
    useHowTo.getState().hide();
    useHowTo.getState().show('controls');
    expect(useHowTo.getState()).toMatchObject({
      tab: 'controls',
      station: null,
      practiceAllowed: true,
    });
  });

  it('switching tabs leaves the station card and the autoplay', () => {
    useHowTo.getState().show('intro', { autoplay: true });
    useHowTo.getState().setStation('metadata');
    useHowTo.getState().setTab('stations');
    expect(useHowTo.getState()).toMatchObject({ tab: 'stations', station: null, autoplay: false });
  });

  it('hides', () => {
    useHowTo.getState().show('controls');
    useHowTo.getState().hide();
    expect(useHowTo.getState().open).toBe(false);
  });
});
