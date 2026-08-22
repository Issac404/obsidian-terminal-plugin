import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../src/settings-tab.ts', import.meta.url), 'utf8');

describe('command list chrome', () => {
  it('keeps declarative rendering lifecycle and required command controls', () => {
    expect(source).toContain('new ViewMutationObserver');
    expect(source).toContain('childList: true');
    expect(source).toContain('subtree: true');
    expect(source).toContain('dispose(): void');
    expect(source).toContain('this.commandListObserver?.disconnect()');
    expect(source).not.toContain(
      'hide(): void {\n    this.commandListObserver?.disconnect()'
    );
    expect(source).toContain("['Terminal', false]");
    expect(source).toContain("['Note folder', true]");
    expect(source).toContain("['Keep open', true]");
    expect(source).toContain("['Path', false]");
    expect(source).toContain("['Browse', true]");
    expect(source).toContain("command.kind === 'open-terminal'");
    expect(source).toContain('Open in terminal cannot be deleted.');
    expect(source).toContain("if (this.plugin.settings.terminals.length <= 1)");
    expect(source).toContain(".setButtonText('Restore defaults')");
    expect(source).toContain('class ConfirmModal extends Modal');
    expect(source.match(/new ConfirmModal/g)).toHaveLength(3);
    expect(source).not.toContain('class DeleteItemModal');
    expect(source).not.toContain('class RestoreTerminalsModal');
    expect(source).toContain('restoreDefaultTerminalProfiles(this.plugin.settings)');
    expect(source).toContain("'--dropdown-fitted-width': TERMINAL_DROPDOWN_WIDTH");
    expect(source).toContain("text.setValue('').setDisabled(true)");
    expect(source).toContain('private getTerminalGroupDescription(): string');
    expect(source).toContain('Supported terminals: Command Prompt (cmd)');
    expect(source).toContain('isSupportedWindowsTerminalApp(executablePath)');
    expect(source).toContain(
      'Supported Windows terminals are cmd.exe, powershell.exe, and pwsh.exe.'
    );
    expect(source).not.toContain('Windows Terminal (wt)');
    expect(source).toContain('Supported terminals: Terminal and terminal apps');
    expect(source).toContain('Supported terminals: GNOME Terminal');
    expect(source).toContain(
      "text: 'Note folder: on uses the note folder; off uses the Vault folder.'"
    );
    expect(source).toContain("text: 'Keep open: on keeps the terminal open");
    expect(source).toContain('private renderColumnHeaders(');
    expect(source).toContain('private setTerminalDropdownTitle(');
  });
});
