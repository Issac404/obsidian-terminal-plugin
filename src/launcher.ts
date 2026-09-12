import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';

import { Platform } from 'obsidian';

export type LaunchCommand = {
  executable: string;
  args: string[];
  cwd: string;
  shell?: boolean;
  env?: NodeJS.ProcessEnv;
  windowsVerbatimArguments?: boolean;
  cleanup?: () => void;
};

export type LaunchOptions = {
  reuseExistingMacApp?: boolean;
  keepTerminalOpen?: boolean;
};

export type DesktopLaunchPlatform = 'macos' | 'windows' | 'unix';

const sanitizeTerminalApp = (value: string): string => value.trim();

const quotePosix = (value: string): string => `'${value.replace(/'/g, `'"'"'`)}'`;

const quoteCmdPath = (value: string): string => `"${value.replace(/"/g, '""')}"`;

const quotePowerShellPath = (value: string): string => `'${value.replace(/'/g, "''")}'`;

type WindowsTerminalKind = 'cmd' | 'powershell' | 'pwsh';

const getWindowsTerminalKind = (value: string): WindowsTerminalKind | null => {
  const executableName = win32.basename(sanitizeTerminalApp(value)).toLowerCase();
  if (executableName === 'cmd' || executableName === 'cmd.exe') {
    return 'cmd';
  }
  if (executableName === 'powershell' || executableName === 'powershell.exe') {
    return 'powershell';
  }
  if (executableName === 'pwsh' || executableName === 'pwsh.exe') {
    return 'pwsh';
  }
  return null;
};

export const isSupportedWindowsTerminalApp = (value: string): boolean =>
  getWindowsTerminalKind(value) !== null;

const ensureTempScript = (content: string): { path: string; cleanup: () => void } => {
  const dir = mkdtempSync(join(tmpdir(), 'terminal-commands-'));
  const filePath = join(dir, 'launch.command');

  try {
    writeFileSync(filePath, content, { mode: 0o755 });
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }

  const cleanup = (): void => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      console.warn('[terminal-commands] Failed to remove temporary launch script', error);
    }
  };
  return { path: filePath, cleanup };
};

const buildMacLaunch = (
  terminalApp: string,
  vaultPath: string,
  toolCommand?: string,
  options?: LaunchOptions
): LaunchCommand | null => {
  const app = sanitizeTerminalApp(terminalApp);
  if (!app) {
    return null;
  }

  const openFlag = options?.reuseExistingMacApp === false ? '-na' : '-a';
  if (!toolCommand) {
    return {
      executable: 'open',
      args: [openFlag, app, vaultPath],
      cwd: vaultPath
    };
  }

  const scriptLines = ['#!/bin/bash', `cd -- ${quotePosix(vaultPath)}`, toolCommand];
  if (options?.keepTerminalOpen !== false) {
    scriptLines.push('exec "$SHELL"');
  }
  const { path, cleanup } = ensureTempScript(scriptLines.join('\n'));
  return {
    executable: 'open',
    args: [openFlag, app, path],
    cwd: vaultPath,
    cleanup
  };
};

const buildWindowsLaunch = (
  terminalApp: string,
  vaultPath: string,
  toolCommand?: string,
  options?: LaunchOptions
): LaunchCommand | null => {
  const app = sanitizeTerminalApp(terminalApp);
  if (!app) {
    return null;
  }

  const terminalKind = getWindowsTerminalKind(app);
  if (!terminalKind) {
    return null;
  }
  let terminalArguments: string;
  if (terminalKind === 'cmd') {
    const cmdMode = options?.keepTerminalOpen === false ? '/C' : '/K';
    // The new terminal inherits cwd; embedding a cd command would expand % in paths.
    terminalArguments = `/S ${cmdMode}${toolCommand ? ` "${toolCommand}"` : ''}`;
  } else {
    const powerShellBody = `Set-Location -LiteralPath ${quotePowerShellPath(vaultPath)}${
      toolCommand ? `; ${toolCommand}` : ''
    }`;
    const encodedCommand = Buffer.from(powerShellBody, 'utf16le').toString('base64');
    terminalArguments = `${options?.keepTerminalOpen === false ? '' : '-NoExit '}-EncodedCommand ${encodedCommand}`;
  }

  // Late expansion carries paths, quotes and metacharacters past the outer CMD parser.
  // Verbatim arguments keep Node from adding C-runtime escaping to this CMD command line.
  return {
    executable: 'cmd.exe',
    args: [
      '/D', '/V:ON', '/S', '/C',
      '"start "" !TERMINAL_COMMANDS_APP! !TERMINAL_COMMANDS_ARGS!"'
    ],
    cwd: vaultPath,
    windowsVerbatimArguments: true,
    env: {
      TERMINAL_COMMANDS_APP: quoteCmdPath(app),
      TERMINAL_COMMANDS_ARGS: terminalArguments
    }
  };
};

const buildUnixLaunch = (
  terminalApp: string,
  vaultPath: string,
  toolCommand?: string,
  options?: LaunchOptions
): LaunchCommand | null => {
  const app = sanitizeTerminalApp(terminalApp);
  if (!app) {
    return null;
  }

  if (!toolCommand) {
    return {
      executable: app,
      args: [],
      cwd: vaultPath
    };
  }

  const shellCommand =
    options?.keepTerminalOpen === false ? toolCommand : `${toolCommand}; exec "$SHELL"`;
  return {
    executable: app,
    args: app.includes('gnome-terminal')
      ? ['--', 'bash', '-lc', shellCommand]
      : ['-e', 'bash', '-lc', shellCommand],
    cwd: vaultPath
  };
};

export const buildLaunchCommandForPlatform = (
  platform: DesktopLaunchPlatform,
  terminalApp: string,
  vaultPath: string,
  toolCommand?: string,
  options?: LaunchOptions
): LaunchCommand | null => {
  if (platform === 'macos') {
    return buildMacLaunch(terminalApp, vaultPath, toolCommand, options);
  }
  if (platform === 'windows') {
    return buildWindowsLaunch(terminalApp, vaultPath, toolCommand, options);
  }
  return buildUnixLaunch(terminalApp, vaultPath, toolCommand, options);
};

export const buildLaunchCommand = (
  terminalApp: string,
  vaultPath: string,
  toolCommand?: string,
  options?: LaunchOptions
): LaunchCommand | null => {
  if (!Platform.isDesktopApp) {
    return null;
  }
  if (Platform.isMacOS) {
    return buildLaunchCommandForPlatform('macos', terminalApp, vaultPath, toolCommand, options);
  }
  if (Platform.isWin) {
    return buildLaunchCommandForPlatform('windows', terminalApp, vaultPath, toolCommand, options);
  }
  return buildLaunchCommandForPlatform('unix', terminalApp, vaultPath, toolCommand, options);
};
