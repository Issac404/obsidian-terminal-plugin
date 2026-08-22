import { webUtils } from 'electron';
import {
  App,
  ButtonComponent,
  Modal,
  Notice,
  Platform,
  Plugin,
  PluginSettingTab,
  Setting,
  type SettingDefinitionItem,
  type SettingDefinitionList
} from 'obsidian';

import { isSupportedWindowsTerminalApp } from './launcher';
import {
  createCommand,
  createTerminalProfile,
  getCurrentTerminalApp,
  restoreDefaultTerminalProfiles,
  setCurrentTerminalApp,
  truncateTerminalName,
  type CommandSettings,
  type TerminalCommandsSettings,
  type TerminalProfile
} from './settings';

type SettingsHost = Plugin & {
  settings: TerminalCommandsSettings;
  saveSettings: () => Promise<void>;
};

const SAVE_DELAY_MS = 250;
const TERMINAL_DROPDOWN_WIDTH = '112px';

type ConfirmModalOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
};

type ColumnHeader = readonly [label: string, centered: boolean];

const TERMINAL_COLUMN_HEADERS: readonly ColumnHeader[] = [
  ['Name', false],
  ['Path', false],
  ['Browse', true],
  ['Delete', true]
];

const COMMAND_COLUMN_HEADERS: readonly ColumnHeader[] = [
  ['Sort', true],
  ['Name', false],
  ['Command', false],
  ['Terminal', false],
  ['Note folder', true],
  ['Keep open', true],
  ['Delete', true]
];

class ConfirmModal extends Modal {
  constructor(
    app: App,
    private readonly options: ConfirmModalOptions
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle(this.options.title);
    this.contentEl.createEl('p', {
      text: this.options.message
    });

    const actions = new Setting(this.contentEl);
    actions.settingEl.addClass('terminal-commands-confirm-actions');
    actions.addButton((button) => {
      button.setButtonText('Cancel').onClick(() => this.close());
      button.buttonEl.focus();
    });
    actions.addButton((button) =>
      button
        .setButtonText(this.options.confirmLabel)
        .setDestructive()
        .onClick(() => {
          this.close();
          this.options.onConfirm();
        })
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class TerminalCommandsSettingTab extends PluginSettingTab {
  plugin: SettingsHost;
  private commandListObserver: MutationObserver | null = null;
  private saveTimer: number | null = null;

  constructor(app: App, plugin: SettingsHost) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const definitions: SettingDefinitionItem[] = [];
    if (Platform.isMacOS) {
      definitions.push({
        type: 'group',
        heading: 'Terminal integration',
        items: [
          {
            name: 'Reuse existing terminal instance',
            desc: 'Reuse the configured macOS terminal app instead of launching a new instance.',
            visible: Platform.isMacOS,
            control: {
              type: 'toggle',
              key: 'reuseExistingMacApp'
            }
          }
        ]
      });
    }
    definitions.push(
      this.getTerminalDefinitions(),
      this.getCommandDefinitions()
    );
    this.observeCommandList();
    return definitions;
  }

  hide(): void {
    this.flushScheduledSave();
  }

  dispose(): void {
    this.commandListObserver?.disconnect();
    this.commandListObserver = null;
    this.flushScheduledSave();
  }

  private getTerminalDefinitions(): SettingDefinitionList {
    return {
      type: 'list',
      heading: 'Terminals',
      cls: 'terminal-commands-terminals-list',
      emptyState: 'At least one terminal is required.',
      addItem: {
        name: 'Add terminal',
        action: () => {
          void this.addTerminal();
        }
      },
      onDelete: (index) => {
        const terminal = this.plugin.settings.terminals[index];
        if (terminal) {
          this.confirmTerminalDelete(terminal, index);
        }
      },
      items: this.plugin.settings.terminals.map((terminal, index) => ({
        name: terminal.id,
        searchable: false,
        render: (setting) => {
          this.renderTerminalControls(setting, terminal, index);
        }
      }))
    };
  }

  private getCommandDefinitions(): SettingDefinitionList {
    return {
      type: 'list',
      heading: 'Commands',
      cls: 'terminal-commands-list',
      emptyState: 'No commands. Add one to create a command palette entry.',
      addItem: {
        name: 'Add command',
        action: () => {
          void this.addCommand();
        }
      },
      onReorder: (oldIndex, newIndex) => {
        const commands = this.plugin.settings.commands;
        const [movedCommand] = commands.splice(oldIndex, 1);
        if (!movedCommand) {
          return;
        }
        commands.splice(newIndex, 0, movedCommand);
        void this.saveImmediately();
      },
      onDelete: (index) => {
        const command = this.plugin.settings.commands[index];
        if (command) {
          this.confirmCommandDelete(command, index);
        }
      },
      items: this.plugin.settings.commands.map((command, index) => ({
        name: command.id,
        searchable: false,
        render: (setting) => {
          this.renderCommandControls(setting, command, index);
        }
      }))
    };
  }

  private renderCommandControls(
    setting: Setting,
    command: CommandSettings,
    index: number
  ): void {
    setting.settingEl.addClass('terminal-commands-command-setting');
    setting.settingEl.toggleClass(
      'is-open-terminal',
      command.kind === 'open-terminal'
    );
    setting.settingEl.setAttribute(
      'aria-label',
      command.name.trim() || `Command ${index + 1}`
    );
    setting.infoEl.remove();
    setting.controlEl.addClass('terminal-commands-command-controls');

    setting.addText((text) => {
      text.setPlaceholder('Name').setValue(command.name).onChange((value) => {
        command.name = value;
        this.scheduleSave();
      });
      text.inputEl.setAttribute('aria-label', 'Command palette name');
    });

    setting.addText((text) => {
      if (command.kind === 'open-terminal') {
        text.setValue('').setDisabled(true);
      } else {
        text.setPlaceholder('Command').setValue(command.command).onChange((value) => {
          command.command = value;
          this.scheduleSave();
        });
      }
      text.inputEl.setAttribute('aria-label', 'Shell command');
    });

    setting.addDropdown((dropdown) => {
      this.plugin.settings.terminals.forEach((terminal, terminalIndex) => {
        dropdown.addOption(
          terminal.id,
          this.getTerminalDropdownLabel(terminal, terminalIndex)
        );
      });
      dropdown.setValue(command.terminalId).onChange((value) => {
        command.terminalId = value;
        this.setTerminalDropdownTitle(dropdown.selectEl, value);
        void this.saveImmediately();
      });
      dropdown.selectEl.setAttribute('aria-label', 'Terminal');
      dropdown.selectEl.addClass('terminal-commands-terminal-dropdown');
      dropdown.selectEl.setCssProps({
        '--dropdown-fitted-width': TERMINAL_DROPDOWN_WIDTH
      });
      this.setTerminalDropdownTitle(dropdown.selectEl, command.terminalId);
    });

    setting.addToggle((toggle) => {
      toggle
        .setValue(command.workingDirectory === 'current-note')
        .setTooltip('Use current note folder')
        .onChange((value) => {
          command.workingDirectory = value ? 'current-note' : 'vault';
          void this.saveImmediately();
        });
      toggle.toggleEl.setAttribute('aria-label', 'Use current note folder');
    });

    setting.addToggle((toggle) => {
      toggle
        .setValue(
          command.kind === 'open-terminal' ? true : command.keepTerminalOpen
        )
        .setDisabled(command.kind === 'open-terminal')
        .setTooltip('Keep terminal open')
        .onChange((value) => {
          if (command.kind === 'open-terminal') {
            return;
          }
          command.keepTerminalOpen = value;
          void this.saveImmediately();
        });
      toggle.toggleEl.setAttribute('aria-label', 'Keep terminal open');
    });

    setting.controlEl.ownerDocument.defaultView?.queueMicrotask(() => {
      const dragHandle = setting.controlEl.querySelector<HTMLElement>('.mod-drag-handle');
      if (dragHandle) {
        setting.controlEl.prepend(dragHandle);
      }
      if (command.kind === 'open-terminal') {
        setting.controlEl
          .querySelector<HTMLElement>('.mod-delete')
          ?.remove();
      }
    });
  }

  private renderTerminalControls(
    setting: Setting,
    terminal: TerminalProfile,
    index: number
  ): void {
    setting.settingEl.addClass('terminal-commands-terminal-setting');
    setting.settingEl.setAttribute('aria-label', this.getTerminalLabel(terminal, index));
    setting.infoEl.remove();
    setting.controlEl.addClass('terminal-commands-terminal-controls');

    setting.addText((text) => {
      text.setPlaceholder('Name').setValue(terminal.name).onChange((value) => {
        terminal.name = value;
        this.scheduleSave();
      });
      text.inputEl.setAttribute('aria-label', 'Terminal name');
      text.inputEl.addEventListener('blur', () => this.update());
    });

    let pathInput: HTMLInputElement | null = null;
    setting.addText((text) => {
      text.setPlaceholder('Select an executable').setValue(
        getCurrentTerminalApp(terminal.applications)
      );
      text.inputEl.readOnly = true;
      pathInput = text.inputEl;
      text.inputEl.setAttribute('aria-label', 'Terminal application');
    });

    const fileInput = setting.controlEl.createEl('input', {
      cls: 'terminal-commands-terminal-file-input',
      attr: { type: 'file', 'aria-hidden': 'true', tabIndex: '-1' }
    });
    if (Platform.isWin) {
      fileInput.accept = '.exe';
    }
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) {
        return;
      }

      const executablePath = webUtils.getPathForFile(file);
      if (!executablePath) {
        new Notice('Unable to read the selected executable path.');
        return;
      }
      if (Platform.isWin && !executablePath.toLowerCase().endsWith('.exe')) {
        new Notice('Select a Windows .exe file.');
        return;
      }
      if (Platform.isWin && !isSupportedWindowsTerminalApp(executablePath)) {
        new Notice(
          'Supported Windows terminals are cmd.exe, powershell.exe, and pwsh.exe.'
        );
        return;
      }

      terminal.applications = setCurrentTerminalApp(
        terminal.applications,
        executablePath
      );
      if (pathInput) {
        pathInput.value = executablePath;
      }
      fileInput.value = '';
      void this.saveImmediately();
    });

    setting.addExtraButton((button) => {
      button
        .setIcon('folder-open')
        .setTooltip('Select terminal executable')
        .onClick(() => fileInput.click());
    });
  }

  private async addCommand(): Promise<void> {
    const command = createCommand(
      this.plugin.settings.commands,
      this.plugin.settings.terminals[0]?.id ?? ''
    );
    this.plugin.settings.commands.push(command);
    await this.saveImmediately();
    this.update();
  }

  private async addTerminal(): Promise<void> {
    this.plugin.settings.terminals.push(
      createTerminalProfile(this.plugin.settings.terminals)
    );
    await this.saveImmediately();
    this.update();
  }

  private confirmCommandDelete(command: CommandSettings, index: number): void {
    if (command.kind === 'open-terminal') {
      new Notice('Open in terminal cannot be deleted.');
      return;
    }

    const displayName = command.name.trim() || `Command ${index + 1}`;
    new ConfirmModal(this.app, {
      title: 'Delete command',
      message: `Delete "${displayName}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        const currentIndex = this.plugin.settings.commands.findIndex(
          (candidate) => candidate.id === command.id
        );
        if (currentIndex < 0) {
          return;
        }
        this.plugin.settings.commands.splice(currentIndex, 1);
        void this.saveImmediately().then(() => this.update());
      }
    }).open();
  }

  private confirmTerminalDelete(terminal: TerminalProfile, index: number): void {
    if (this.plugin.settings.terminals.length <= 1) {
      new Notice('At least one terminal is required.');
      return;
    }

    const displayName = this.getTerminalLabel(terminal, index);
    new ConfirmModal(this.app, {
      title: 'Delete terminal',
      message: `Delete "${displayName}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        const terminalIndex = this.plugin.settings.terminals.findIndex(
          (candidate) => candidate.id === terminal.id
        );
        if (terminalIndex < 0) {
          return;
        }

        this.plugin.settings.terminals.splice(terminalIndex, 1);
        const fallbackTerminalId = this.plugin.settings.terminals[0]?.id ?? '';
        for (const command of this.plugin.settings.commands) {
          if (command.terminalId === terminal.id) {
            command.terminalId = fallbackTerminalId;
          }
        }
        void this.saveImmediately().then(() => this.update());
      }
    }).open();
  }

  private confirmRestoreTerminals(): void {
    new ConfirmModal(this.app, {
      title: 'Restore default terminals',
      message: 'Replace the terminal list with the platform defaults? Custom terminals will be removed, and their commands will use the first default terminal.',
      confirmLabel: 'Restore',
      onConfirm: () => {
        restoreDefaultTerminalProfiles(this.plugin.settings);
        void this.saveImmediately().then(() => this.update());
      }
    }).open();
  }

  private getTerminalLabel(terminal: TerminalProfile, index: number): string {
    return terminal.name.trim() || `Terminal ${index + 1}`;
  }

  private getTerminalDropdownLabel(
    terminal: TerminalProfile,
    index: number
  ): string {
    return truncateTerminalName(this.getTerminalLabel(terminal, index));
  }

  private setTerminalDropdownTitle(selectEl: HTMLSelectElement, terminalId: string): void {
    const terminalIndex = this.plugin.settings.terminals.findIndex(
      (terminal) => terminal.id === terminalId
    );
    const terminal = this.plugin.settings.terminals[terminalIndex];
    if (terminal) {
      selectEl.setAttribute('title', this.getTerminalLabel(terminal, terminalIndex));
    } else {
      selectEl.removeAttribute('title');
    }
  }

  private observeCommandList(): void {
    if (!this.commandListObserver) {
      const ViewMutationObserver =
        this.containerEl.ownerDocument.defaultView?.MutationObserver;
      if (ViewMutationObserver) {
        this.commandListObserver = new ViewMutationObserver(() => {
          this.addCommandListChrome();
        });
        this.commandListObserver.observe(this.containerEl, {
          childList: true,
          subtree: true
        });
      }
    }
    this.addCommandListChrome();
  }

  private addCommandListChrome(): void {
    const terminalGroupEl = this.containerEl.querySelector<HTMLElement>(
      '.terminal-commands-terminals-list'
    );
    const terminalHeadingEl = terminalGroupEl?.querySelector<HTMLElement>(
      '.setting-item-heading'
    );
    const terminalHeadingControlsEl = terminalHeadingEl?.querySelector<HTMLElement>(
      '.setting-item-control'
    );
    if (
      terminalHeadingControlsEl &&
      !terminalHeadingControlsEl.querySelector('.terminal-commands-restore-terminals')
    ) {
      const restoreButton = new ButtonComponent(terminalHeadingControlsEl)
        .setButtonText('Restore defaults')
        .setTooltip('Restore the platform default terminal list')
        .setClass('terminal-commands-restore-terminals')
        .onClick(() => this.confirmRestoreTerminals());
      terminalHeadingControlsEl.prepend(restoreButton.buttonEl);
    }
    if (
      terminalGroupEl &&
      terminalHeadingEl &&
      !terminalGroupEl.querySelector('.terminal-commands-group-description')
    ) {
      const terminalDescriptionEl = terminalGroupEl.createDiv({
        cls: 'terminal-commands-group-description',
        text: this.getTerminalGroupDescription()
      });
      terminalHeadingEl.after(terminalDescriptionEl);
    }
    this.renderColumnHeaders(
      terminalGroupEl?.querySelector<HTMLElement>('.setting-items'),
      'terminal-commands-terminal-column-headers',
      TERMINAL_COLUMN_HEADERS
    );

    const groupEl = this.containerEl.querySelector<HTMLElement>('.terminal-commands-list');
    if (!groupEl) {
      return;
    }

    const headingEl = groupEl.querySelector<HTMLElement>('.setting-item-heading');
    if (headingEl && !groupEl.querySelector('.terminal-commands-group-description')) {
      const descriptionEl = groupEl.createDiv({
        cls: 'terminal-commands-group-description'
      });
      descriptionEl.createDiv({
        text: 'Note folder: on uses the note folder; off uses the Vault folder.'
      });
      descriptionEl.createDiv({
        text: 'Keep open: on keeps the terminal open after the command finishes; off closes it.'
      });
      headingEl.after(descriptionEl);
    }

    this.renderColumnHeaders(
      groupEl.querySelector<HTMLElement>('.setting-items'),
      'terminal-commands-column-headers',
      COMMAND_COLUMN_HEADERS
    );
  }

  private renderColumnHeaders(
    listEl: HTMLElement | null | undefined,
    className: string,
    columns: readonly ColumnHeader[]
  ): void {
    if (!listEl || listEl.querySelector(`.${className}`)) {
      return;
    }

    const headersEl = listEl.createDiv({
      cls: className,
      attr: { role: 'row' }
    });
    for (const [label, centered] of columns) {
      headersEl.createDiv({
        cls: `terminal-commands-column-header${centered ? ' is-centered' : ''}`,
        text: label,
        attr: { role: 'columnheader' }
      });
    }
    listEl.prepend(headersEl);
  }

  private getTerminalGroupDescription(): string {
    if (Platform.isWin) {
      return 'Supported terminals: Command Prompt (cmd), Windows PowerShell, and PowerShell 7 (pwsh). Other .exe files are rejected.';
    }
    if (Platform.isMacOS) {
      return 'Supported terminals: Terminal and terminal apps that can open .command scripts.';
    }
    if (Platform.isLinux) {
      return 'Supported terminals: GNOME Terminal and terminals compatible with -e bash -lc.';
    }
    return 'Terminal launching is available in the Obsidian desktop app.';
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
    }
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.plugin.saveSettings();
    }, SAVE_DELAY_MS);
  }

  private flushScheduledSave(): void {
    if (this.saveTimer === null) {
      return;
    }
    window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
    void this.plugin.saveSettings();
  }

  private async saveImmediately(): Promise<void> {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.plugin.saveSettings();
  }
}
