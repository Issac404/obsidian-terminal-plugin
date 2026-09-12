import type { App, Command, PluginManifest, PluginSettingTab } from 'obsidian';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { LaunchCommand } from '../src/launcher';

const mocks = vi.hoisted(() => ({
  commandManager: {
    findCommand: vi.fn(() => true),
    removeCommand: vi.fn()
  },
  buildLaunchCommand: vi.fn<() => LaunchCommand | null>(() => null),
  spawn: vi.fn(() => ({ on: vi.fn(), unref: vi.fn() }))
}));

vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));

vi.mock('obsidian', async (importOriginal) => ({
  ...await importOriginal<typeof import('./obsidian-stub')>(),
  Plugin: class {
    constructor(public app: App, public manifest: PluginManifest) {}
    loadData = vi.fn(async () => null);
    saveData = vi.fn(async (_data: unknown) => {});
    addCommand = vi.fn((command: Command) => command);
    addSettingTab = vi.fn();
    addRibbonIcon = vi.fn();
    register = vi.fn();
    onunload(): void {}
  },
  FileSystemAdapter: class {
    getBasePath(): string { return 'C:\\Vault'; }
  },
  Notice: class {}
}));
vi.mock('../src/command-manager', () => ({
  resolveCommandManager: () => mocks.commandManager
}));
vi.mock('../src/command-menu', () => ({ TerminalCommandMenu: class {} }));
vi.mock('../src/settings-tab', () => ({
  TerminalCommandsSettingTab: class { dispose = vi.fn(); }
}));
vi.mock('../src/launcher', () => ({ buildLaunchCommand: mocks.buildLaunchCommand }));

import { FileSystemAdapter } from 'obsidian';

import TerminalCommandsPlugin from '../src/main';
import { normalizeSettings, restoreDefaultCommands, type TerminalCommandsSettings } from '../src/settings';

type TestPlugin = Omit<TerminalCommandsPlugin, 'saveData' | 'addCommand' | 'addSettingTab' | 'register'> & {
  saveData: Mock<(settings: TerminalCommandsSettings) => Promise<void>>;
  addCommand: Mock<(command: Command) => Command>;
  addSettingTab: Mock<(tab: PluginSettingTab) => void>;
  register: Mock<(dispose: () => void) => void>;
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const createPlugin = () => {
  const plugin = new TerminalCommandsPlugin({
    vault: { adapter: new FileSystemAdapter() },
    workspace: { getActiveFile: () => ({ parent: { path: 'notes' } }) }
  } as unknown as App, { id: 'terminal-commands' } as PluginManifest);
  plugin.settings = normalizeSettings({
    settingsVersion: 3,
    terminals: [{ id: 'cmd', name: 'cmd', applications: { win: 'cmd.exe' } }],
    commands: [{ id: 'test', name: 'Test command', command: 'echo first', terminalId: 'cmd' }]
  });
  return plugin as unknown as TestPlugin;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.buildLaunchCommand.mockReturnValue(null);
});

describe('command registration', () => {
  it('replaces custom palette registrations with the restored defaults on save', async () => {
    const plugin = createPlugin();
    plugin.refreshCommands();
    plugin.addCommand.mockClear();
    restoreDefaultCommands(plugin.settings);
    await plugin.saveSettings();

    expect(mocks.commandManager.removeCommand).toHaveBeenCalledExactlyOnceWith('terminal-commands:open-test');
    expect(plugin.addCommand.mock.calls.map(([command]) => command.id)).toEqual([
      'open-terminal', 'open-claude', 'open-codex', 'open-antigravity', 'open-opencode',
      'open-git-pull', 'open-vscode', 'open-file-explorer'
    ]);
    expect(plugin.saveData).toHaveBeenCalledExactlyOnceWith(plugin.settings);
  });

  it('does not re-register unchanged commands when saving settings', async () => {
    const plugin = createPlugin();
    plugin.refreshCommands();
    vi.mocked(plugin.addCommand).mockClear();

    plugin.settings.terminals[0].name = 'Renamed terminal';
    await plugin.saveSettings();

    expect(plugin.addCommand).not.toHaveBeenCalled();
    expect(mocks.commandManager.removeCommand).not.toHaveBeenCalled();
  });

  it('only updates changed command registrations', async () => {
    const plugin = createPlugin();
    plugin.settings.commands.push({ ...plugin.settings.commands[0], id: 'unchanged' });
    plugin.refreshCommands();
    vi.mocked(plugin.addCommand).mockClear();
    plugin.settings.commands[0].name = 'Renamed command';

    await plugin.saveSettings();

    expect(mocks.commandManager.removeCommand).toHaveBeenCalledExactlyOnceWith('terminal-commands:open-test');
    expect(plugin.addCommand).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      id: 'open-test', name: 'Renamed command'
    }));
  });

  it('registers additions and removes deleted or incomplete commands', async () => {
    const plugin = createPlugin();
    plugin.refreshCommands();
    vi.mocked(plugin.addCommand).mockClear();
    const original = plugin.settings.commands[0];
    plugin.settings.commands.push({ ...original, id: 'new' });
    original.command = '';
    await plugin.saveSettings();

    expect(mocks.commandManager.removeCommand).toHaveBeenCalledExactlyOnceWith('terminal-commands:open-test');
    expect(plugin.addCommand).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'open-new' }));

    plugin.settings.commands.pop();
    await plugin.saveSettings();
    expect(mocks.commandManager.removeCommand).toHaveBeenLastCalledWith('terminal-commands:open-new');
  });

  it('existing callbacks read current launch settings before a pending save completes', async () => {
    const plugin = createPlugin();
    plugin.refreshCommands();
    const callback = vi.mocked(plugin.addCommand).mock.calls[0][0].callback!;
    const write = deferred();
    vi.mocked(plugin.saveData).mockReturnValue(write.promise);
    Object.assign(plugin.settings.commands[0], {
      command: 'echo updated', workingDirectory: 'current-note', keepTerminalOpen: false,
      terminalId: 'powershell'
    });
    plugin.settings.terminals.push({
      id: 'powershell', name: 'PowerShell', applications: { win: 'powershell.exe' }
    });
    const saving = plugin.saveSettings();
    callback();

    expect(mocks.buildLaunchCommand).toHaveBeenCalledWith(
      'powershell.exe', expect.stringMatching(/Vault[\\/]notes$/), 'echo updated',
      { reuseExistingMacApp: true, keepTerminalOpen: false }
    );
    write.resolve();
    await saving;
  });

  it('does not re-register commands when their order changes', async () => {
    const plugin = createPlugin();
    plugin.settings.commands.push({ ...plugin.settings.commands[0], id: 'second' });
    plugin.refreshCommands();
    plugin.addCommand.mockClear();
    plugin.settings.commands.reverse();
    await plugin.saveSettings();
    expect(plugin.addCommand).not.toHaveBeenCalled();
    expect(mocks.commandManager.removeCommand).not.toHaveBeenCalled();
  });

  it('forwards Windows transport options to spawn while retaining the inherited environment', () => {
    const plugin = createPlugin();
    plugin.refreshCommands();
    const launch: LaunchCommand = {
      executable: 'cmd.exe', args: ['/D', '/V:ON', '/S', '/C', 'start command'],
      cwd: 'C:\\Vault', windowsVerbatimArguments: true,
      env: { TERMINAL_COMMANDS_ARGS: '/S /C "echo ready"' }
    };
    mocks.buildLaunchCommand.mockReturnValue(launch);
    plugin.addCommand.mock.calls[0][0].callback!();
    expect(mocks.spawn).toHaveBeenCalledExactlyOnceWith(launch.executable, launch.args, {
      cwd: launch.cwd, shell: false, detached: true, stdio: 'ignore',
      windowsVerbatimArguments: true, env: { ...process.env, ...launch.env }
    });
  });

  it('does not execute a stale callback after its command is removed', () => {
    const plugin = createPlugin();
    plugin.refreshCommands();
    const callback = vi.mocked(plugin.addCommand).mock.calls[0][0].callback!;
    plugin.settings.commands = [];
    callback();
    expect(mocks.buildLaunchCommand).not.toHaveBeenCalled();
  });
});

describe('settings persistence', () => {
  it('serializes writes and captures a separate snapshot for each save', async () => {
    const plugin = createPlugin();
    const firstWrite = deferred();
    vi.mocked(plugin.saveData).mockReturnValueOnce(firstWrite.promise);
    const firstSave = plugin.saveSettings();
    await Promise.resolve();
    plugin.settings.commands[0].command = 'echo second';
    const secondSave = plugin.saveSettings();
    await Promise.resolve();

    expect(plugin.saveData).toHaveBeenCalledTimes(1);
    expect(vi.mocked(plugin.saveData).mock.calls[0][0].commands[0].command).toBe('echo first');
    firstWrite.resolve();
    await Promise.all([firstSave, secondSave]);
    expect(plugin.saveData).toHaveBeenCalledTimes(2);
    expect(vi.mocked(plugin.saveData).mock.calls[1][0].commands[0].command).toBe('echo second');
  });

  it('reports a failed save without blocking subsequent saves', async () => {
    const plugin = createPlugin();
    const error = new Error('Write failed');
    vi.mocked(plugin.saveData).mockRejectedValueOnce(error);
    const firstSave = plugin.saveSettings();
    const failure = expect(firstSave).rejects.toBe(error);
    const secondSave = plugin.saveSettings();
    await failure;
    await secondSave;
    expect(plugin.saveData).toHaveBeenCalledTimes(2);
  });

  it('does not register commands when an in-flight save finishes after unload', async () => {
    const plugin = createPlugin();
    const write = deferred();
    vi.mocked(plugin.saveData).mockReturnValueOnce(write.promise);
    const saving = plugin.saveSettings();
    await Promise.resolve();
    plugin.onunload();
    vi.mocked(plugin.addCommand).mockClear();
    write.resolve();
    await saving;
    expect(plugin.addCommand).not.toHaveBeenCalled();
  });

  it('flushes pending settings on disposal without registering commands', async () => {
    const plugin = createPlugin();
    await plugin.onload();
    const tab = vi.mocked(plugin.addSettingTab).mock.calls[0][0] as unknown as { dispose: () => void };
    let saving: Promise<void>;
    vi.mocked(tab.dispose).mockImplementation(() => { saving = plugin.saveSettings(); });
    plugin.onunload();
    vi.mocked(plugin.addCommand).mockClear();
    for (const [dispose] of vi.mocked(plugin.register).mock.calls) dispose();
    await saving!;

    expect(plugin.saveData).toHaveBeenCalledTimes(1);
    expect(plugin.addCommand).not.toHaveBeenCalled();
  });
});
