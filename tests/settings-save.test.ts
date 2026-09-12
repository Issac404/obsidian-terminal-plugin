import type { App } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ webUtils: {} }));
vi.mock('obsidian', async (importOriginal) => ({
  ...await importOriginal<typeof import('./obsidian-stub')>(),
  Modal: class {},
  PluginSettingTab: class {}
}));

import { TerminalCommandsSettingTab } from '../src/settings-tab';

const createTab = () => {
  const saveSettings = vi.fn(() => Promise.resolve());
  const tab = new TerminalCommandsSettingTab(
    {} as App,
    { saveSettings } as unknown as ConstructorParameters<typeof TerminalCommandsSettingTab>[1]
  );
  // Exercise the scheduler directly; rendering is outside these timer/lifecycle tests.
  const scheduler = tab as unknown as {
    scheduleSave: () => void;
    saveImmediately: () => Promise<void>;
  };
  return { tab, scheduler, saveSettings };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout, clearTimeout });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('settings save scheduling', () => {
  it('coalesces consecutive edits with a 250ms debounce', () => {
    const { scheduler, saveSettings } = createTab();
    scheduler.scheduleSave();
    vi.advanceTimersByTime(200);
    scheduler.scheduleSave();
    vi.advanceTimersByTime(249);
    expect(saveSettings).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it('flushes pending edits on hide without a duplicate timer write', () => {
    const { tab, scheduler, saveSettings } = createTab();
    scheduler.scheduleSave();
    tab.hide();
    expect(saveSettings).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    tab.dispose();
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it('flushes pending edits once on disposal', () => {
    const { tab, scheduler, saveSettings } = createTab();
    scheduler.scheduleSave();
    tab.dispose();
    tab.dispose();
    vi.runAllTimers();
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it('an immediate save cancels a scheduled write', async () => {
    const { scheduler, saveSettings } = createTab();
    scheduler.scheduleSave();
    await scheduler.saveImmediately();
    vi.runAllTimers();
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });
});
