import { spawn } from 'node:child_process';
import { join } from 'node:path';

import { FileSystemAdapter, Notice, Plugin } from 'obsidian';

import { TerminalCommandMenu } from './command-menu';
import { resolveCommandManager } from './command-manager';
import { buildLaunchCommand, getPlatformSummary, type LaunchCommand } from './launcher';
import { logger } from './logger';
import {
  DEFAULT_SETTINGS,
  getCurrentTerminalApp,
  normalizeSettings,
  resolveTerminalProfile,
  type TerminalCommandsSettings,
  type WorkingDirectoryMode
} from './settings';
import { TerminalCommandsSettingTab } from './settings-tab';
import { buildLaunchTargets } from './targets';

const TEMP_SCRIPT_CLEANUP_DELAY_MS = 30_000;

export default class TerminalCommandsPlugin extends Plugin {
  private registeredCommandIds = new Set<string>();
  settings: TerminalCommandsSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    await this.loadSettings();
    const settingTab = new TerminalCommandsSettingTab(this.app, this);
    this.addSettingTab(settingTab);
    this.register(() => settingTab.dispose());
    this.addRibbonIcon('terminal', 'Terminal commands', () => {
      this.openCommandMenu();
    });
    this.refreshCommands();
  }

  private openCommandMenu(): void {
    const menu = new TerminalCommandMenu(this.app, buildLaunchTargets(this.settings), (target) => {
      this.runLaunchCommand(
        () =>
          this.composeLaunchCommand(
            target.toolCommand,
            target.workingDirectory,
            target.keepTerminalOpen,
            target.terminalId
          ),
        target.commandName
      );
    });
    menu.open();
  }

  refreshCommands() {
    const commandManager = resolveCommandManager(this.app);

    if (commandManager) {
      for (const fullId of this.registeredCommandIds) {
        if (commandManager.findCommand(fullId)) {
          commandManager.removeCommand(fullId);
        }
      }
    }
    this.registeredCommandIds.clear();

    for (const target of buildLaunchTargets(this.settings)) {
      this.addCommand({
        id: target.id,
        name: target.commandName,
        callback: () => {
          this.runLaunchCommand(
            () =>
              this.composeLaunchCommand(
                target.toolCommand,
                target.workingDirectory,
                target.keepTerminalOpen,
                target.terminalId
              ),
            target.commandName
          );
        }
      });
      this.registeredCommandIds.add(`${this.manifest.id}:${target.id}`);
    }
  }

  private composeLaunchCommand(
    toolCommand?: string,
    workingDirectory: WorkingDirectoryMode = 'vault',
    keepTerminalOpen = true,
    terminalId = this.settings.terminals[0]?.id ?? ''
  ): LaunchCommand | null {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      return null;
    }
    const vaultPath = adapter.getBasePath();
    const launchPath = this.getLaunchPath(vaultPath, workingDirectory);
    const terminal = resolveTerminalProfile(this.settings, terminalId);
    const terminalApp = terminal
      ? getCurrentTerminalApp(terminal.applications)
      : '';
    const launchCommand = buildLaunchCommand(terminalApp, launchPath, toolCommand, {
      reuseExistingMacApp: this.settings.reuseExistingMacApp,
      keepTerminalOpen
    });
    logger.log('Compose launch command', {
      platform: getPlatformSummary(),
      terminalApp,
      terminalId: terminal?.id,
      toolCommand,
      keepTerminalOpen,
      vaultPath,
      launchPath,
      launchCommand
    });
    return launchCommand ? { ...launchCommand, cwd: launchPath } : null;
  }

  private getLaunchPath(vaultPath: string, workingDirectory: WorkingDirectoryMode): string {
    if (workingDirectory === 'vault') {
      return vaultPath;
    }

    const activeFile = this.app.workspace.getActiveFile();
    const folderPath = activeFile?.parent?.path;
    return folderPath ? join(vaultPath, folderPath) : vaultPath;
  }

  private runLaunchCommand(buildCommand: () => LaunchCommand | null, label: string) {
    const launchCommand = buildCommand();
    if (!launchCommand) {
      new Notice(
        `Unable to run ${label}. Check the Terminal Commands settings for the terminal application name.`
      );
      return;
    }
    this.executeShellCommand(launchCommand, label);
  }

  private executeShellCommand(launchCommand: LaunchCommand, label: string) {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      new Notice('File system adapter not available. This plugin works only on desktop.');
      return;
    }

    const vaultPath = adapter.getBasePath();
    const workingDirectory = launchCommand.cwd ?? vaultPath;

    try {
      logger.log('Spawning command', {
        label,
        executable: launchCommand.executable,
        args: launchCommand.args,
        vaultPath,
        workingDirectory
      });
      const child = spawn(launchCommand.executable, launchCommand.args, {
        cwd: workingDirectory,
        shell: launchCommand.shell ?? false,
        detached: true,
        stdio: 'ignore'
      });
      child.on('error', (error) => {
        console.error(`[terminal-commands] Failed to run '${launchCommand.executable}':`, error);
        new Notice(`Failed to run ${label}. Check the developer console for details.`);
      });
      child.unref();
      logger.log('Spawned command successfully', { label });
    } catch (error) {
      console.error(`[terminal-commands] Unexpected error for '${launchCommand.executable}':`, error);
      new Notice(`Failed to run ${label}. Check the developer console for details.`);
    } finally {
      if (launchCommand.cleanup) {
        const cleanup = launchCommand.cleanup;
        window.setTimeout(() => {
          try {
            cleanup();
          } catch (error) {
            console.warn('[terminal-commands] Cleanup after command failed', error);
          }
        }, TEMP_SCRIPT_CLEANUP_DELAY_MS);
      }
    }
  }

  async loadSettings() {
    this.settings = normalizeSettings(await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.refreshCommands();
  }
}
