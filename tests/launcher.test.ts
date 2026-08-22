import { existsSync, readFileSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildLaunchCommandForPlatform,
  type LaunchCommand
} from '../src/launcher';

const cleanups: Array<() => void> = [];

const requireLaunchCommand = (command: LaunchCommand | null): LaunchCommand => {
  expect(command).not.toBeNull();
  if (!command) {
    throw new Error('Expected a launch command');
  }
  if (command.cleanup) {
    cleanups.push(command.cleanup);
  }
  return command;
};

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

describe('buildLaunchCommandForPlatform', () => {
  it('rejects an empty terminal application', () => {
    expect(buildLaunchCommandForPlatform('windows', '  ', 'C:\\Vault')).toBeNull();
  });

  it('uses start to create a visible external cmd.exe window', () => {
    const command = requireLaunchCommand(
      buildLaunchCommandForPlatform(
        'windows',
        'cmd.exe',
        'C:\\Notes & drafts',
        'git status'
      )
    );

    expect(command).toEqual({
      executable:
        'start "" cmd.exe /K "cd /d "C:\\Notes & drafts" && git status"',
      args: [],
      cwd: 'C:\\Notes & drafts',
      shell: true
    });
  });

  it('uses cmd.exe /C when the terminal should close after the command', () => {
    const command = requireLaunchCommand(
      buildLaunchCommandForPlatform(
        'windows',
        'cmd.exe',
        'C:\\Notes',
        'explorer.exe .',
        { keepTerminalOpen: false }
      )
    );

    expect(command.executable).toBe(
      'start "" cmd.exe /C "cd /d "C:\\Notes" && explorer.exe ."'
    );
    expect(command.shell).toBe(true);
  });

  it('escapes apostrophes in PowerShell paths', () => {
    const command = requireLaunchCommand(
      buildLaunchCommandForPlatform('windows', 'PowerShell', "C:\\Wu's Vault", 'git pull')
    );

    expect(command.executable).toBe(
      'start "" PowerShell -NoExit -Command "Set-Location -LiteralPath \'C:\\Wu\'\'s Vault\'; git pull"'
    );
    expect(command.args).toEqual([]);
    expect(command.shell).toBe(true);
  });

  it('omits PowerShell -NoExit when the terminal should close', () => {
    const command = requireLaunchCommand(
      buildLaunchCommandForPlatform('windows', 'PowerShell', 'C:\\Vault', 'git pull', {
        keepTerminalOpen: false
      })
    );

    expect(command.executable).toBe(
      'start "" PowerShell -Command "Set-Location -LiteralPath \'C:\\Vault\'; git pull"'
    );
  });

  it('uses the configured PowerShell 7 executable instead of falling back to cmd', () => {
    const command = requireLaunchCommand(
      buildLaunchCommandForPlatform(
        'windows',
        'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
        'C:\\Vault',
        'git pull'
      )
    );

    expect(command.executable).toBe(
      'start "" "C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoExit -Command "Set-Location -LiteralPath \'C:\\Vault\'; git pull"'
    );
    expect(command.executable).not.toContain('cmd.exe');
  });

  it('rejects Windows Terminal instead of falling back to cmd.exe', () => {
    expect(
      buildLaunchCommandForPlatform('windows', 'wt.exe', 'C:\\Vault', 'git pull')
    ).toBeNull();
  });

  it('rejects arbitrary Windows executables for Open in terminal', () => {
    expect(
      buildLaunchCommandForPlatform(
        'windows',
        'C:\\Program Files\\MATLAB\\R2026a\\bin\\matlab.exe',
        'C:\\Vault'
      )
    ).toBeNull();
  });

  it('passes Linux commands as arguments without nested quote escaping', () => {
    const command = requireLaunchCommand(
      buildLaunchCommandForPlatform('unix', 'gnome-terminal', '/home/wu/My Vault', 'git status')
    );

    expect(command).toEqual({
      executable: 'gnome-terminal',
      args: ['--', 'bash', '-lc', 'git status; exec "$SHELL"'],
      cwd: '/home/wu/My Vault'
    });
  });

  it('lets a Linux terminal exit after a non-interactive command', () => {
    const command = requireLaunchCommand(
      buildLaunchCommandForPlatform('unix', 'gnome-terminal', '/home/wu/Vault', 'git pull', {
        keepTerminalOpen: false
      })
    );

    expect(command.args).toEqual(['--', 'bash', '-lc', 'git pull']);
  });

  it('uses open arguments for a simple macOS launch', () => {
    const command = requireLaunchCommand(
      buildLaunchCommandForPlatform('macos', 'Terminal', '/Users/wu/Vault', undefined, {
        reuseExistingMacApp: false
      })
    );

    expect(command).toEqual({
      executable: 'open',
      args: ['-na', 'Terminal', '/Users/wu/Vault'],
      cwd: '/Users/wu/Vault'
    });
  });

  it('creates and cleans a quoted macOS launch script', () => {
    const command = requireLaunchCommand(
      buildLaunchCommandForPlatform(
        'macos',
        'Terminal',
        "/Users/o'connor/Vault",
        'git status'
      )
    );
    const scriptPath = command.args[2];

    expect(scriptPath).toBeDefined();
    expect(readFileSync(scriptPath, 'utf8')).toBe(
      "#!/bin/bash\ncd -- '/Users/o'\"'\"'connor/Vault'\ngit status\nexec \"$SHELL\""
    );

    command.cleanup?.();
    cleanups.splice(0);
    expect(existsSync(scriptPath)).toBe(false);
  });

  it('omits the interactive shell when a macOS terminal should close', () => {
    const command = requireLaunchCommand(
      buildLaunchCommandForPlatform('macos', 'Terminal', '/Users/wu/Vault', 'git pull', {
        keepTerminalOpen: false
      })
    );
    const scriptPath = command.args[2];

    expect(readFileSync(scriptPath, 'utf8')).toBe(
      "#!/bin/bash\ncd -- '/Users/wu/Vault'\ngit pull"
    );
  });
});
