import { win32 } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  createCommand,
  getCurrentTerminalApp,
  normalizeSettings,
  resolveTerminalProfile,
  restoreDefaultTerminalProfiles,
  setCurrentTerminalApp
} from '../src/settings';
import { Platform } from './obsidian-stub';

beforeEach(() => {
  Object.assign(Platform, {
    isDesktopApp: true,
    isMobileApp: false,
    isMacOS: false,
    isWin: true,
    isLinux: false
  });
});

describe('settings normalization', () => {
  it('repairs malformed command data and duplicate identifiers', () => {
    const settings = normalizeSettings({
      terminalApp: { win: '  wt.exe  ', macos: 42 },
      reuseExistingMacApp: 'yes',
      commands: [
        { id: 'duplicate', name: 'First', command: 'one', workingDirectory: 'current-note' },
        {
          id: 'duplicate',
          name: 2,
          command: 'two',
          workingDirectory: 'invalid',
          keepTerminalOpen: false
        },
        null
      ]
    });

    expect(settings.terminals[0]).toEqual({
      id: 'terminal-1',
      name: 'cmd',
      applications: { win: 'wt.exe' }
    });
    expect(settings.terminals[1]).toMatchObject({
      id: 'terminal-powershell',
      name: 'powershell'
    });
    expect(
      win32.basename(settings.terminals[1]?.applications.win ?? '').toLowerCase()
    ).toBe('powershell.exe');
    expect(settings.settingsVersion).toBe(3);
    expect(settings.reuseExistingMacApp).toBe(true);
    expect(settings.commands).toHaveLength(3);
    expect(settings.commands[0]).toMatchObject({
      id: 'open-terminal',
      kind: 'open-terminal',
      command: '',
      keepTerminalOpen: true,
      terminalId: 'terminal-1'
    });
    expect(settings.commands[1]).toMatchObject({
      id: 'duplicate',
      kind: 'shell-command',
      workingDirectory: 'current-note',
      keepTerminalOpen: true,
      terminalId: 'terminal-1'
    });
    expect(settings.commands[2]?.id).not.toBe('duplicate');
    expect(settings.commands[2]).toMatchObject({
      name: '',
      command: 'two',
      workingDirectory: 'vault',
      keepTerminalOpen: false,
      terminalId: 'terminal-1'
    });
  });

  it('stores terminal applications independently by platform', () => {
    let terminalApps = setCurrentTerminalApp({ macos: 'Terminal' }, '  wt.exe  ');
    expect(terminalApps).toEqual({ macos: 'Terminal', win: 'wt.exe' });
    expect(getCurrentTerminalApp(terminalApps)).toBe('wt.exe');

    Object.assign(Platform, { isWin: false, isMacOS: true });
    terminalApps = setCurrentTerminalApp(terminalApps, ' iTerm ');
    expect(terminalApps).toEqual({ macos: 'iTerm', win: 'wt.exe' });
    expect(getCurrentTerminalApp(terminalApps)).toBe('iTerm');
  });

  it('creates commands with unique valid identifiers', () => {
    const command = createCommand(
      [
        {
          id: 'command-existing',
          kind: 'shell-command',
          name: '',
          command: '',
          workingDirectory: 'vault',
          keepTerminalOpen: true,
          terminalId: 'default-terminal'
        }
      ],
      'powershell'
    );

    expect(command.id).toMatch(/^command-[a-z0-9-]+$/);
    expect(command.id).not.toBe('command-existing');
    expect(command).toMatchObject({
      kind: 'shell-command',
      name: '',
      command: '',
      workingDirectory: 'vault',
      keepTerminalOpen: true,
      terminalId: 'powershell'
    });
  });

  it('normalizes terminal profiles and repairs missing command references', () => {
    const settings = normalizeSettings({
      terminals: [
        {
          id: 'powershell',
          name: 'PowerShell',
          applications: { win: 'powershell.exe' }
        },
        {
          id: 'windows-terminal',
          name: 'Windows Terminal',
          applications: { win: 'wt.exe' }
        }
      ],
      settingsVersion: 1,
      commands: [
        {
          id: 'valid-terminal',
          name: 'Valid',
          command: 'one',
          terminalId: 'powershell'
        },
        {
          id: 'missing-terminal',
          name: 'Missing',
          command: 'two',
          terminalId: 'removed-terminal'
        }
      ]
    });

    expect(settings.commands[0]?.terminalId).toBe('powershell');
    expect(settings.commands[1]?.terminalId).toBe('powershell');
    expect(resolveTerminalProfile(settings, 'powershell')?.name).toBe('PowerShell');
    expect(resolveTerminalProfile(settings, 'removed-terminal')?.name).toBe(
      'PowerShell'
    );
  });

  it('migrates Open in terminal into the command list exactly once', () => {
    const migrated = normalizeSettings({
      commands: [
        {
          id: 'existing',
          name: 'Existing command',
          command: 'echo ready'
        }
      ]
    });
    const normalizedAgain = normalizeSettings(migrated);

    expect(
      migrated.commands.filter(({ kind }) => kind === 'open-terminal')
    ).toHaveLength(1);
    expect(
      normalizedAgain.commands.filter(({ kind }) => kind === 'open-terminal')
    ).toHaveLength(1);
  });

  it('adds the Windows PowerShell default once during the version 2 migration', () => {
    const migrated = normalizeSettings({
      settingsVersion: 1,
      terminals: [
        {
          id: 'terminal-1',
          name: 'cmd',
          applications: { win: 'cmd.exe' }
        }
      ],
      commands: []
    });
    const normalizedAgain = normalizeSettings(migrated);

    expect(migrated.terminals.map(({ name }) => name)).toEqual([
      'cmd',
      'powershell'
    ]);
    expect(
      normalizedAgain.terminals.filter(
        ({ applications }) =>
          win32.basename(applications.win ?? '').toLowerCase() === 'powershell.exe'
      )
    ).toHaveLength(1);
  });

  it('restores platform defaults and remaps commands from custom terminals', () => {
    const settings = normalizeSettings({
      settingsVersion: 2,
      terminals: [
        {
          id: 'terminal-1',
          name: 'Renamed cmd',
          applications: { win: 'cmd.exe' }
        },
        {
          id: 'terminal-powershell',
          name: 'Renamed PowerShell',
          applications: { win: 'powershell.exe' }
        },
        {
          id: 'custom-terminal',
          name: 'Custom',
          applications: { win: 'pwsh.exe' }
        }
      ],
      commands: [
        {
          id: 'keep-powershell',
          name: 'Keep PowerShell',
          command: 'echo one',
          terminalId: 'terminal-powershell'
        },
        {
          id: 'replace-custom',
          name: 'Replace custom',
          command: 'echo two',
          terminalId: 'custom-terminal'
        }
      ]
    });

    restoreDefaultTerminalProfiles(settings);

    expect(settings.terminals.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'terminal-1', name: 'cmd' },
      { id: 'terminal-powershell', name: 'powershell' }
    ]);
    expect(settings.commands[0]?.terminalId).toBe('terminal-powershell');
    expect(settings.commands[1]?.terminalId).toBe('terminal-1');
  });

  it('uses only the platform terminal default outside Windows', () => {
    Object.assign(Platform, { isWin: false, isMacOS: true });

    const settings = normalizeSettings({});

    expect(settings.terminals).toHaveLength(1);
    expect(settings.terminals[0]?.name).toBe('Terminal');
  });

  it('uses consistent System32 casing for Windows default terminal paths', () => {
    const settings = normalizeSettings({});
    const cmdPath = settings.terminals[0]?.applications.win ?? '';
    const powershellPath = settings.terminals[1]?.applications.win ?? '';

    expect(cmdPath).toContain('\\System32\\cmd.exe');
    expect(powershellPath).toContain('\\System32\\WindowsPowerShell\\');

    const windowsRoot = process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows';
    const normalizedStoredPath = normalizeSettings({
      settingsVersion: 3,
      terminals: [
        {
          id: 'terminal-1',
          name: 'cmd',
          applications: {
            win: win32.join(windowsRoot, 'system32', 'cmd.exe')
          }
        }
      ],
      commands: []
    }).terminals[0]?.applications.win;

    expect(normalizedStoredPath).toContain('\\System32\\cmd.exe');
  });

  it('provides VS Code and Windows File Explorer launcher defaults', () => {
    const settings = normalizeSettings({});

    expect(settings.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'open-terminal',
          id: 'open-terminal',
          command: '',
          keepTerminalOpen: true
        }),
        expect.objectContaining({
          id: 'vscode',
          command: 'code .',
          workingDirectory: 'vault',
          keepTerminalOpen: false
        }),
        expect.objectContaining({
          id: 'file-explorer',
          command: 'explorer .',
          workingDirectory: 'vault',
          keepTerminalOpen: false
        })
      ])
    );
    expect(settings.commands.slice(-2).map(({ id }) => id)).toEqual([
      'vscode',
      'file-explorer'
    ]);
  });

  it('does not provide the Windows File Explorer default on macOS', () => {
    Object.assign(Platform, { isWin: false, isMacOS: true });

    const settings = normalizeSettings({});

    expect(settings.commands.some(({ id }) => id === 'vscode')).toBe(true);
    expect(settings.commands.some(({ id }) => id === 'file-explorer')).toBe(false);
  });
});
