import { App, FuzzySuggestModal, type FuzzyMatch } from 'obsidian';

import {
  getLaunchTargetDirectoryLabel,
  getLaunchTargetTagLabels,
  getLaunchTargetTerminalLabel,
  sortLaunchTargetsByGroup,
  type LaunchTarget
} from './targets';

const getCommandDetails = (target: LaunchTarget): string =>
  target.toolCommand ?? 'Open terminal';

export class TerminalCommandMenu extends FuzzySuggestModal<LaunchTarget> {
  constructor(
    app: App,
    private readonly targets: readonly LaunchTarget[],
    private readonly onChoose: (target: LaunchTarget) => void
  ) {
    super(app);
    this.setPlaceholder('Search commands…');
    this.setInstructions([
      { command: '↑↓', purpose: 'to navigate' },
      { command: '↵', purpose: 'to run' },
      { command: 'esc', purpose: 'to dismiss' }
    ]);
  }

  getItems(): LaunchTarget[] {
    return sortLaunchTargetsByGroup(this.targets);
  }

  getItemText(target: LaunchTarget): string {
    return `${target.terminalName} ${getLaunchTargetDirectoryLabel(target)} ${getLaunchTargetTerminalLabel(target)} ${target.commandName} ${getCommandDetails(target)}`;
  }

  renderSuggestion(match: FuzzyMatch<LaunchTarget>, el: HTMLElement): void {
    const target = match.item;
    const details = getCommandDetails(target);

    el.addClass('terminal-commands-menu-item');
    const headingEl = el.createDiv({ cls: 'terminal-commands-menu-heading' });
    headingEl.createDiv({ cls: 'terminal-commands-menu-name', text: target.commandName });
    const tagsEl = headingEl.createDiv({ cls: 'terminal-commands-menu-tags' });
    const [terminalNameLabel, directoryLabel, terminalBehaviorLabel] =
      getLaunchTargetTagLabels(target);
    const terminalNameTagEl = tagsEl.createSpan({
      cls: 'terminal-commands-menu-tag terminal-commands-menu-tag-terminal-name',
      text: terminalNameLabel
    });
    terminalNameTagEl.setAttr('title', target.terminalName);
    tagsEl.createSpan({
      cls: 'terminal-commands-menu-tag terminal-commands-menu-tag-directory',
      text: directoryLabel
    });
    tagsEl.createSpan({
      cls: 'terminal-commands-menu-tag terminal-commands-menu-tag-terminal-behavior',
      text: terminalBehaviorLabel
    });
    const detailsEl = el.createDiv({ cls: 'terminal-commands-menu-details', text: details });
    detailsEl.setAttr('title', details);
  }

  onChooseItem(target: LaunchTarget): void {
    this.onChoose(target);
  }
}
