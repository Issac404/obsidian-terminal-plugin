import { spawn } from 'node:child_process';
import { join } from 'node:path';

import { FileSystemAdapter, Notice, Plugin } from 'obsidian';

import { TerminalCommandMenu } from './command-menu';
import { resolveCommandManager } from './command-manager';
import { buildLaunchCommand, type LaunchCommand } from './launcher';
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
  private registeredCommandNames = new Map<string, string>();
  private saveQueue: Promise<void> = Promise.resolve();
  private isUnloading = false;
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
      this.launchTarget(target.id);
    });
    menu.open();
  }

  onunload(): void {
    this.isUnloading = true;
  }

  refreshCommands(): void {
    if (this.isUnloading) {
      return;
    }
    const targets = buildLaunchTargets(this.settings);
    const nextNames = new Map(targets.map((target) => [target.id, target.commandName]));
    const commandManager = resolveCommandManager(this.app);

    for (const [id, name] of this.registeredCommandNames) {
      if (nextNames.get(id) === name) {
        continue;
      }
      const fullId = `${this.manifest.id}:${id}`;
      if (commandManager?.findCommand(fullId)) {
        commandManager.removeCommand(fullId);
      }
      this.registeredCommandNames.delete(id);
    }

    for (const target of targets) {
      const id = target.id;
      if (this.registeredCommandNames.has(id)) {
        continue;
      }
      this.addCommand({
        id,
        name: target.commandName,
        callback: () => this.launchTarget(id)
      });
      this.registeredCommandNames.set(id, target.commandName);
    }
  }

  private launchTarget(id: string): void {
    // Settings can change while a menu entry or a debounced save is pending.
    const target = buildLaunchTargets(this.settings).find((item) => item.id === id);
    if (!target) {
      return;
    }
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
    try {
      const child = spawn(launchCommand.executable, launchCommand.args, {
        cwd: launchCommand.cwd,
        shell: launchCommand.shell ?? false,
        env: { ...process.env, ...launchCommand.env },
        windowsVerbatimArguments: launchCommand.windowsVerbatimArguments,
        detached: true,
        stdio: 'ignore'
      });
      child.on('error', (error) => {
        this.reportLaunchError(launchCommand.executable, label, error);
      });
      child.unref();
    } catch (error) {
      this.reportLaunchError(launchCommand.executable, label, error);
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

  private reportLaunchError(executable: string, label: string, error: unknown): void {
    console.error(`[terminal-commands] Failed to run '${executable}':`, error);
    new Notice(`Failed to run ${label}. Check the developer console for details.`);
  }

  async loadSettings() {
    this.settings = normalizeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    this.refreshCommands();
    const snapshot = structuredClone(this.settings);
    const write = () => this.saveData(snapshot);
    // Each caller receives its write failure; later saves may still proceed.
    this.saveQueue = this.saveQueue.then(write, write);
    return this.saveQueue;
  }
}
