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

const decodePowerShellCommand = (command: LaunchCommand): string =>
  Buffer.from(command.env!.TERMINAL_COMMANDS_ARGS!.split('-EncodedCommand ')[1], 'base64')
    .toString('utf16le');

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
      executable: 'cmd.exe',
      args: [
        '/D', '/V:ON', '/S', '/C',
        '"start "" !TERMINAL_COMMANDS_APP! !TERMINAL_COMMANDS_ARGS!"'
      ],
      cwd: 'C:\\Notes & drafts',
      windowsVerbatimArguments: true,
      env: {
        TERMINAL_COMMANDS_APP: '"cmd.exe"',
        TERMINAL_COMMANDS_ARGS: '/S /K "git status"'
      }
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

    expect(command.env?.TERMINAL_COMMANDS_ARGS).toBe('/S /C "explorer.exe ."');
    expect(command.shell).toBeUndefined();
  });

  it('escapes apostrophes in PowerShell paths', () => {
    const command = requireLaunchCommand(
      buildLaunchCommandForPlatform('windows', 'PowerShell', "C:\\Wu's Vault", 'git pull')
    );

    expect(command.env?.TERMINAL_COMMANDS_APP).toBe('"PowerShell"');
    expect(command.env?.TERMINAL_COMMANDS_ARGS).toMatch(/^-NoExit -EncodedCommand [A-Za-z0-9+/=]+$/);
    expect(decodePowerShellCommand(command)).toBe(
      "Set-Location -LiteralPath 'C:\\Wu''s Vault'; git pull"
    );
  });

  it('omits PowerShell -NoExit when the terminal should close', () => {
    const command = requireLaunchCommand(
      buildLaunchCommandForPlatform('windows', 'PowerShell', 'C:\\Vault', 'git pull', {
        keepTerminalOpen: false
      })
    );

    expect(command.env?.TERMINAL_COMMANDS_ARGS).toMatch(/^-EncodedCommand /);
    expect(decodePowerShellCommand(command)).toBe("Set-Location -LiteralPath 'C:\\Vault'; git pull");
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

    expect(command.env?.TERMINAL_COMMANDS_APP).toBe('"C:\\Program Files\\PowerShell\\7\\pwsh.exe"');
    expect(decodePowerShellCommand(command)).toBe("Set-Location -LiteralPath 'C:\\Vault'; git pull");
  });

  it('keeps an empty cmd terminal open without embedding a working-directory command', () => {
    const command = requireLaunchCommand(
      buildLaunchCommandForPlatform('windows', 'cmd.exe', 'C:\\%USERPROFILE% & notes')
    );
    expect(command.env?.TERMINAL_COMMANDS_ARGS).toBe('/S /K');
    expect(command.cwd).toBe('C:\\%USERPROFILE% & notes');
  });

  it('preserves PowerShell syntax and Unicode in the encoded body', () => {
    const command = requireLaunchCommand(buildLaunchCommandForPlatform(
      'windows', 'pwsh.exe', "C:\\笔记 & %USERPROFILE%\\Wu's Vault",
      'Write-Output "中文 & %PATH%"; Write-Output \'$HOME\''
    ));
    expect(decodePowerShellCommand(command)).toBe(
      "Set-Location -LiteralPath 'C:\\笔记 & %USERPROFILE%\\Wu''s Vault'; " +
      'Write-Output "中文 & %PATH%"; Write-Output \'$HOME\''
    );
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
