import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { Platform } from 'obsidian';

import { logger } from './logger';

export type LaunchCommand = {
  command: string;
  cwd?: string;
  cleanup?: () => void;
};

export type LaunchOptions = {
  reuseExistingMacApp?: boolean;
};

const sanitizeTerminalApp = (value: string): string => value.trim();

const escapeDoubleQuotes = (value: string): string => value.replace(/"/g, '\\"');

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
  logger.log('Creating temp script', { dir, filePath });
  writeFileSync(filePath, content, { mode: 0o755 });
  const cleanup = () => {
    try {
      rmSync(dir, { recursive: true, force: true });
      logger.log('Cleaned temp script', dir);
    } catch (error) {
      console.warn('[terminal-commands] Failed to remove temp script', error);
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
    const escapedApp = escapeDoubleQuotes(app);
    const escapedPath = escapeDoubleQuotes(vaultPath);
    const command = `open ${openFlag} "${escapedApp}" "${escapedPath}"`;
    logger.log('macOS simple launch', { app, command, vaultPath });
    return { command, cwd: vaultPath };
  }

  const escapedVaultPath = escapeDoubleQuotes(vaultPath);
  const scriptLines = ['#!/bin/bash', `cd "${escapedVaultPath}"`];
  if (toolCommand) {
    scriptLines.push(toolCommand);
  }
  scriptLines.push('exec "$SHELL"');
  const { path, cleanup } = ensureTempScript(scriptLines.join('\n'));
  const command = `open ${openFlag} "${escapeDoubleQuotes(app)}" "${path}"`;
  logger.log('macOS script launch', { app, command, script: path, toolCommand });
  return { command, cwd: vaultPath, cleanup };
};

const buildWindowsLaunch = (
  terminalApp: string,
  vaultPath: string,
  toolCommand?: string
): LaunchCommand | null => {
  const app = sanitizeTerminalApp(terminalApp);
  if (!app) {
    return null;
  }

  const escapedVault = vaultPath.replace(/"/g, '"');
  const cdCommand = `cd /d "${escapedVault}"`;
  const tool = toolCommand ? ` && ${toolCommand}` : '';

  const lowerApp = app.toLowerCase();

  if (lowerApp === 'cmd.exe' || lowerApp === 'cmd') {
    const command = toolCommand
      ? `start "" cmd.exe /K "${cdCommand}${tool}"`
      : `start "" cmd.exe /K "${cdCommand}"`;
    logger.log('Windows launch (cmd.exe)', { command, toolCommand, vaultPath });
    return { command, cwd: vaultPath };
  }

  if (lowerApp === 'powershell' || lowerApp === 'powershell.exe') {
    if (!toolCommand) {
      const command = `start "" powershell -NoExit -Command "Set-Location '${vaultPath.replace(
        /'/g,
        "''"
      )}';"`;
      logger.log('Windows launch (powershell)', { command, toolCommand, vaultPath });
      return { command, cwd: vaultPath };
    }
    const command = `start "" powershell -NoExit -Command "Set-Location '${vaultPath.replace(
      /'/g,
      "''"
    )}'; ${toolCommand}"`;
    logger.log('Windows launch (powershell tool)', { command, toolCommand, vaultPath });
    return { command, cwd: vaultPath };
  }

  if (lowerApp === 'wt.exe' || lowerApp === 'wt') {
    const command = toolCommand
      ? `start "" wt.exe new-tab cmd /K "${cdCommand}${tool}"`
      : `start "" wt.exe new-tab cmd /K "${cdCommand}"`;
    logger.log('Windows launch (wt)', { command, toolCommand, vaultPath });
    return { command, cwd: vaultPath };
  }

  if (!toolCommand) {
    const command = `start "" "${app}"`;
    logger.log('Windows launch (generic simple)', { command, vaultPath });
    return { command, cwd: vaultPath };
  }

  const command = `start "" cmd.exe /K "${cdCommand}${tool}"`;
  logger.log('Windows launch (generic tool fallback)', { command, app, toolCommand, vaultPath });
  return { command, cwd: vaultPath };
};

const buildUnixLaunch = (terminalApp: string, vaultPath: string, toolCommand?: string): LaunchCommand | null => {
  const app = sanitizeTerminalApp(terminalApp);
  if (!app) {
    return null;
  }

  if (!toolCommand) {
    const command = `${app}`;
    logger.log('Unix launch (simple)', { command, vaultPath });
    return { command, cwd: vaultPath };
  }

  const shellCommand = `cd \\\"$PWD\\\"; ${toolCommand}; exec \\\"$SHELL\\\"`;

  if (app.includes('gnome-terminal')) {
    const command = `${app} -- bash -lc "${shellCommand}"`;
    logger.log('Unix launch (gnome-terminal)', { command, toolCommand, vaultPath });
    return { command, cwd: vaultPath };
  }

  if (app.includes('konsole')) {
    const command = `${app} -e bash -lc "${shellCommand}"`;
    logger.log('Unix launch (konsole)', { command, toolCommand, vaultPath });
    return { command, cwd: vaultPath };
  }

  const command = `${app} -e bash -lc "${shellCommand}"`;
  logger.log('Unix launch (generic tool)', { command, toolCommand, vaultPath });
  return { command, cwd: vaultPath };
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
    return buildMacLaunch(terminalApp, vaultPath, toolCommand, options);
  }
  if (Platform.isWin) {
    return buildWindowsLaunch(terminalApp, vaultPath, toolCommand);
  }
  return buildUnixLaunch(terminalApp, vaultPath, toolCommand);
};
