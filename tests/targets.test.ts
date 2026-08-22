import { describe, expect, it } from 'vitest';

import type { TerminalCommandsSettings } from '../src/settings';
import {
  buildLaunchTargets,
  getLaunchTargetDirectoryLabel,
  getLaunchTargetGroup,
  getLaunchTargetTagLabels,
  getLaunchTargetTerminalLabel,
  getLaunchTargetTerminalNameLabel,
  sortLaunchTargetsByGroup,
  type LaunchTarget
} from '../src/targets';

describe('buildLaunchTargets', () => {
  it('keeps the plain terminal open and propagates each command preference', () => {
    const settings: TerminalCommandsSettings = {
      settingsVersion: 1,
      terminals: [
        {
          id: 'command-prompt',
          name: 'Command Prompt',
          applications: { win: 'cmd.exe' }
        }
      ],
      reuseExistingMacApp: true,
      commands: [
        {
          id: 'open-terminal',
          kind: 'open-terminal',
          name: 'Open in terminal',
          command: '',
          workingDirectory: 'vault',
          keepTerminalOpen: true,
          terminalId: 'command-prompt'
        },
        {
          id: 'open-folder',
          kind: 'shell-command',
          name: 'Open folder',
          command: 'explorer.exe .',
          workingDirectory: 'vault',
          keepTerminalOpen: false,
          terminalId: 'command-prompt'
        }
      ]
    };

    expect(buildLaunchTargets(settings)).toEqual([
      {
        id: 'open-terminal',
        commandName: 'Open in terminal',
        workingDirectory: 'vault',
        keepTerminalOpen: true,
        terminalId: 'command-prompt',
        terminalName: 'Command Prompt'
      },
      {
        id: 'open-open-folder',
        commandName: 'Open folder',
        toolCommand: 'explorer.exe .',
        workingDirectory: 'vault',
        keepTerminalOpen: false,
        terminalId: 'command-prompt',
        terminalName: 'Command Prompt'
      }
    ]);
  });
});

describe('launch target presentation', () => {
  const target = (
    id: string,
    keepTerminalOpen: boolean
  ): LaunchTarget => ({
    id,
    commandName: id,
    toolCommand: id,
    workingDirectory: 'vault',
    keepTerminalOpen,
    terminalId: 'command-prompt',
    terminalName: 'PowerShell'
  });

  it('labels launch targets by terminal behavior', () => {
    expect(getLaunchTargetGroup(target('terminal', true))).toBe('Terminal');
    expect(getLaunchTargetGroup(target('launcher', false))).toBe('Launcher');
  });

  it('provides separate directory and terminal labels', () => {
    const terminalTarget = target('terminal', true);
    const noteTarget: LaunchTarget = {
      ...target('launcher', false),
      workingDirectory: 'current-note'
    };

    expect(getLaunchTargetDirectoryLabel(terminalTarget)).toBe('Vault folder');
    expect(getLaunchTargetTerminalLabel(terminalTarget)).toBe('Keep terminal');
    expect(getLaunchTargetDirectoryLabel(noteTarget)).toBe('Note folder');
    expect(getLaunchTargetTerminalLabel(noteTarget)).toBe('Close terminal');
    expect(getLaunchTargetTerminalNameLabel(terminalTarget)).toBe('PowerShe…');
    expect(getLaunchTargetTagLabels(terminalTarget)).toEqual([
      'PowerShe…',
      'Vault folder',
      'Keep terminal'
    ]);
  });

  it('shows the first terminal when a command has a stale terminal reference', () => {
    const settings: TerminalCommandsSettings = {
      settingsVersion: 3,
      terminals: [
        {
          id: 'fallback-terminal',
          name: 'cmd',
          applications: { win: 'cmd.exe' }
        }
      ],
      reuseExistingMacApp: true,
      commands: [
        {
          id: 'stale-terminal',
          kind: 'shell-command',
          name: 'Stale terminal',
          command: 'echo ready',
          workingDirectory: 'vault',
          keepTerminalOpen: true,
          terminalId: 'removed-terminal'
        }
      ]
    };

    expect(buildLaunchTargets(settings)[0]).toMatchObject({
      terminalId: 'fallback-terminal',
      terminalName: 'cmd'
    });
  });

  it('sorts Terminal targets before Launcher targets while preserving group order', () => {
    const targets = [
      target('launcher-a', false),
      target('terminal-a', true),
      target('launcher-b', false),
      target('terminal-b', true)
    ];

    expect(sortLaunchTargetsByGroup(targets).map(({ id }) => id)).toEqual([
      'terminal-a',
      'terminal-b',
      'launcher-a',
      'launcher-b'
    ]);
  });
});
