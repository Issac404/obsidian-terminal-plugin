import {
  truncateTerminalName,
  type TerminalCommandsSettings,
  type WorkingDirectoryMode
} from './settings';

export type LaunchTarget = {
  id: string;
  commandName: string;
  toolCommand?: string;
  workingDirectory: WorkingDirectoryMode;
  keepTerminalOpen: boolean;
  terminalId: string;
  terminalName: string;
};

export type LaunchTargetGroup = 'Terminal' | 'Launcher';
export type LaunchTargetDirectoryLabel = 'Note folder' | 'Vault folder';
export type LaunchTargetTerminalLabel = 'Keep terminal' | 'Close terminal';

export const getLaunchTargetGroup = (target: LaunchTarget): LaunchTargetGroup =>
  target.keepTerminalOpen ? 'Terminal' : 'Launcher';

export const getLaunchTargetDirectoryLabel = (
  target: LaunchTarget
): LaunchTargetDirectoryLabel =>
  target.workingDirectory === 'current-note' ? 'Note folder' : 'Vault folder';

export const getLaunchTargetTerminalLabel = (
  target: LaunchTarget
): LaunchTargetTerminalLabel =>
  target.keepTerminalOpen ? 'Keep terminal' : 'Close terminal';

export const getLaunchTargetTerminalNameLabel = (target: LaunchTarget): string => {
  return truncateTerminalName(target.terminalName);
};

export const getLaunchTargetTagLabels = (
  target: LaunchTarget
): readonly [string, LaunchTargetDirectoryLabel, LaunchTargetTerminalLabel] => [
  getLaunchTargetTerminalNameLabel(target),
  getLaunchTargetDirectoryLabel(target),
  getLaunchTargetTerminalLabel(target)
];

export const sortLaunchTargetsByGroup = (
  targets: readonly LaunchTarget[]
): LaunchTarget[] =>
  [...targets].sort(
    (left, right) =>
      Number(right.keepTerminalOpen) - Number(left.keepTerminalOpen)
  );

export const buildLaunchTargets = (
  settings: TerminalCommandsSettings
): readonly LaunchTarget[] => {
  const targets: LaunchTarget[] = [];

  for (const configuredCommand of settings.commands) {
    const name = configuredCommand.name.trim();
    const command = configuredCommand.command.trim();
    if (
      !name ||
      (configuredCommand.kind === 'shell-command' && !command)
    ) {
      continue;
    }
    const configuredTerminalIndex = settings.terminals.findIndex(
      (terminal) => terminal.id === configuredCommand.terminalId
    );
    const terminalIndex = configuredTerminalIndex >= 0 ? configuredTerminalIndex : 0;
    const terminal = settings.terminals[terminalIndex];
    const terminalName = terminal?.name.trim() || `Terminal ${terminalIndex + 1}`;
    targets.push({
      id:
        configuredCommand.kind === 'open-terminal'
          ? 'open-terminal'
          : `open-${configuredCommand.id}`,
      commandName: name,
      toolCommand:
        configuredCommand.kind === 'open-terminal' ? undefined : command,
      workingDirectory: configuredCommand.workingDirectory,
      keepTerminalOpen:
        configuredCommand.kind === 'open-terminal'
          ? true
          : configuredCommand.keepTerminalOpen,
      terminalId: terminal?.id ?? configuredCommand.terminalId,
      terminalName
    });
  }

  return targets;
};
