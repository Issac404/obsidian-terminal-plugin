import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';

import { Platform } from 'obsidian';

import { logger } from './logger';

export type LaunchCommand = {
  executable: string;
  args: string[];
  cwd: string;
  shell?: boolean;
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

const quoteWindowsExecutable = (value: string): string =>
  /[\s&(){}^=;!'+,`~]/.test(value) ? quoteCmdPath(value) : value;

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

export const getPlatformSummary = (): string => {
  if (Platform.isDesktopApp) {
    if (Platform.isMacOS) {
      return 'desktop-macos';
    }
    if (Platform.isWin) {
      return 'desktop-windows';
    }
    if (Platform.isLinux) {
      return 'desktop-linux';
    }
    return 'desktop-unknown';
  }
  if (Platform.isMobileApp) {
    if (Platform.isIosApp) {
      return 'mobile-ios';
    }
    if (Platform.isAndroidApp) {
      return 'mobile-android';
    }
    return 'mobile-unknown';
  }
  return 'unknown';
};

const ensureTempScript = (content: string): { path: string; cleanup: () => void } => {
  const dir = mkdtempSync(join(tmpdir(), 'terminal-commands-'));
  const filePath = join(dir, 'launch.command');

  try {
    writeFileSync(filePath, content, { mode: 0o755 });
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }

  logger.log('Created temporary launch script', { dir, filePath });
  const cleanup = (): void => {
    try {
      rmSync(dir, { recursive: true, force: true });
      logger.log('Cleaned temporary launch script', dir);
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
    logger.log('Rejected unsupported Windows terminal executable', { app });
    return null;
  }
  const executable = quoteWindowsExecutable(app);
  const cmdBody = `cd /d ${quoteCmdPath(vaultPath)}${toolCommand ? ` && ${toolCommand}` : ''}`;
  const cmdMode = options?.keepTerminalOpen === false ? '/C' : '/K';

  if (terminalKind === 'cmd') {
    return {
      executable: `start "" ${executable} ${cmdMode} "${cmdBody}"`,
      args: [],
      cwd: vaultPath,
      shell: true
    };
  }

  if (terminalKind === 'powershell' || terminalKind === 'pwsh') {
    const powerShellBody = `Set-Location -LiteralPath ${quotePowerShellPath(vaultPath)}${
      toolCommand ? `; ${toolCommand}` : ''
    }`;
    return {
      executable: `start "" ${executable}${
        options?.keepTerminalOpen === false ? '' : ' -NoExit'
      } -Command "${powerShellBody}"`,
      args: [],
      cwd: vaultPath,
      shell: true
    };
  }

  return null;
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
