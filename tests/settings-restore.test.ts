import type { App } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Only the DOM/Obsidian operations used by heading buttons and confirmation dialogs.
const ui = vi.hoisted(() => {
  class Element {
    classes = new Set<string>();
    text = '';
    tooltip = '';
    destructive = false;
    focus = vi.fn();
    click: () => void = vi.fn();
    ownerDocument = { defaultView: null };

    constructor(className = '', public children: Element[] = []) {
      if (className) this.classes.add(className);
    }

    addClass(className: string): void { this.classes.add(className); }
    prepend(element: Element): void {
      this.children = this.children.filter((child) => child !== element);
      this.children.unshift(element);
    }
    querySelector(selector: string): Element | null {
      for (const child of this.children) {
        if (child.classes.has(selector.slice(1))) return child;
        const nested = child.querySelector(selector);
        if (nested) return nested;
      }
      return null;
    }
    createEl(_tag: string, options: { text: string }): Element {
      const element = new Element();
      element.text = options.text;
      this.children.push(element);
      return element;
    }
    empty(): void { this.children = []; }
  }

  class Button {
    buttonEl = new Element();
    constructor(parent: Element) { parent.children.push(this.buttonEl); }
    setButtonText(text: string): this { this.buttonEl.text = text; return this; }
    setTooltip(tooltip: string): this { this.buttonEl.tooltip = tooltip; return this; }
    setClass(className: string): this { this.buttonEl.addClass(className); return this; }
    setDestructive(): this { this.buttonEl.destructive = true; return this; }
    onClick(callback: () => void): this { this.buttonEl.click = callback; return this; }
  }

  const modals: Modal[] = [];
  class Modal {
    title = '';
    contentEl = new Element();
    constructor() { modals.push(this); }
    setTitle(title: string): void { this.title = title; }
    open(): void { this.onOpen(); }
    close(): void { this.onClose(); }
    onOpen(): void {}
    onClose(): void {}
  }

  class Setting {
    settingEl = new Element();
    constructor(parent: Element) { parent.children.push(this.settingEl); }
    addButton(render: (button: Button) => void): this {
      render(new Button(this.settingEl));
      return this;
    }
  }

  return { Element, Button, Modal, Setting, modals };
});

vi.mock('electron', () => ({ webUtils: {} }));
vi.mock('obsidian', async (importOriginal) => ({
  ...await importOriginal<typeof import('./obsidian-stub')>(),
  ButtonComponent: ui.Button,
  Modal: ui.Modal,
  Setting: ui.Setting,
  PluginSettingTab: class {
    constructor(public app: App) {}
  }
}));

import { normalizeSettings } from '../src/settings';
import { TerminalCommandsSettingTab } from '../src/settings-tab';

const createHeading = (groupClass: string, headersClass: string) => {
  const add = new ui.Element();
  const controls = new ui.Element('setting-item-control', [add]);
  const group = new ui.Element(groupClass, [
    new ui.Element('setting-item-heading', [controls]),
    new ui.Element('terminal-commands-group-description'),
    new ui.Element('setting-items', [new ui.Element(headersClass)])
  ]);
  return { add, controls, group };
};

const createTab = () => {
  const settings = normalizeSettings({
    settingsVersion: 3,
    terminals: [{ id: 'custom-terminal', name: 'My terminal', applications: { win: 'cmd.exe' } }],
    commands: [{ id: 'custom-command', name: 'Custom command', command: 'echo custom' }]
  });
  const saveSettings = vi.fn(() => Promise.resolve());
  const tab = new TerminalCommandsSettingTab({} as App, {
    settings, saveSettings
  } as unknown as ConstructorParameters<typeof TerminalCommandsSettingTab>[1]);
  const terminals = createHeading('terminal-commands-terminals-list', 'terminal-commands-terminal-column-headers');
  const commands = createHeading('terminal-commands-list', 'terminal-commands-column-headers');
  tab.containerEl = new ui.Element('', [terminals.group, commands.group]) as unknown as HTMLElement;
  const update = vi.fn();
  tab.update = update;
  tab.getSettingDefinitions();
  return { tab, settings, saveSettings, update, terminals, commands };
};

beforeEach(() => { ui.modals.length = 0; });

describe('restore commands settings control', () => {
  it('places identically styled restore buttons before each add button without duplicates', () => {
    const { tab, terminals, commands } = createTab();
    tab.getSettingDefinitions();
    expect(terminals.controls.children).toHaveLength(2);
    expect(commands.controls.children).toHaveLength(2);
    expect(terminals.controls.children[1]).toBe(terminals.add);
    expect(commands.controls.children[1]).toBe(commands.add);
    const terminalButton = terminals.controls.children[0];
    const commandButton = commands.controls.children[0];
    expect(terminalButton.text).toBe('Restore defaults');
    expect(commandButton.text).toBe(terminalButton.text);
    expect(terminalButton.classes.has('terminal-commands-restore-defaults')).toBe(true);
    expect(commandButton.classes.has('terminal-commands-restore-defaults')).toBe(true);
    expect(commandButton.classes.has('terminal-commands-restore-commands')).toBe(true);
    expect(terminalButton.classes.has('terminal-commands-restore-terminals')).toBe(true);
    expect(commandButton.tooltip).toBe('Restore the platform default command list');
  });

  it('leaves commands untouched when the user cancels the confirmation', () => {
    const { settings, saveSettings, update, commands } = createTab();
    const original = structuredClone(settings);
    commands.controls.children[0].click();
    const modal = ui.modals[0];
    expect(modal.title).toBe('Restore default commands');
    expect(modal.contentEl.children[0].text).toContain('Custom commands and edits will be removed');
    expect(settings).toEqual(original);
    expect(saveSettings).not.toHaveBeenCalled();
    const cancel = modal.contentEl.children[1].children[0];
    expect(cancel.text).toBe('Cancel');
    expect(cancel.focus).toHaveBeenCalledOnce();
    cancel.click();
    expect(settings).toEqual(original);
    expect(saveSettings).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('restores commands only after confirmation, saves, then refreshes the tab', async () => {
    const { settings, saveSettings, update, commands } = createTab();
    const terminals = settings.terminals;
    let finishSave!: () => void;
    saveSettings.mockImplementationOnce(() => new Promise<void>((resolve) => { finishSave = resolve; }));
    commands.controls.children[0].click();
    const confirm = ui.modals[0].contentEl.children[1].children[1];
    expect(confirm.text).toBe('Restore');
    expect(confirm.destructive).toBe(true);
    confirm.click();
    expect(settings.commands.some(({ id }) => id === 'custom-command')).toBe(false);
    expect(settings.commands[0].id).toBe('open-terminal');
    expect(settings.commands.every(({ terminalId }) => terminalId === 'custom-terminal')).toBe(true);
    expect(settings.terminals).toBe(terminals);
    expect(saveSettings).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    finishSave();
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
  });

  it('keeps the terminal restore button wired to the terminal confirmation', () => {
    const { terminals } = createTab();
    terminals.controls.children[0].click();
    expect(ui.modals[0].title).toBe('Restore default terminals');
  });
});
