import { existsSync } from 'node:fs';
import { delimiter, isAbsolute, join, win32 } from 'node:path';

import { Platform } from 'obsidian';

type DesktopPlatform = 'win' | 'macos' | 'linux';

export type TerminalAppByPlatform = {
  win?: string;
  macos?: string;
  linux?: string;
};

export type TerminalProfile = {
  id: string;
  name: string;
  applications: TerminalAppByPlatform;
};

export type WorkingDirectoryMode = 'vault' | 'current-note';
export type CommandKind = 'open-terminal' | 'shell-command';

export type CommandSettings = {
  id: string;
  kind: CommandKind;
  name: string;
  command: string;
  workingDirectory: WorkingDirectoryMode;
  keepTerminalOpen: boolean;
  terminalId: string;
};

export interface TerminalCommandsSettings {
  settingsVersion: number;
  terminals: TerminalProfile[];
  reuseExistingMacApp: boolean;
  commands: CommandSettings[];
}

export const truncateTerminalName = (value: string): string => {
  const characters = [...value];
  return characters.length > 8
    ? `${characters.slice(0, 8).join('')}…`
    : value;
};

type UnknownRecord = Record<string, unknown>;

const CURRENT_SETTINGS_VERSION = 3;
const INITIAL_TERMINAL_ID = 'terminal-1';
const WINDOWS_POWERSHELL_TERMINAL_ID = 'terminal-powershell';

type DefaultCommandSettings = Omit<CommandSettings, 'terminalId'>;

const DEFAULT_COMMANDS: readonly DefaultCommandSettings[] = [
  {
    id: 'open-terminal',
    kind: 'open-terminal',
    name: 'Open in terminal',
    command: '',
    workingDirectory: 'vault',
    keepTerminalOpen: true
  },
  {
    id: 'claude',
    kind: 'shell-command',
    name: 'Open in Claude Code',
    command: 'claude',
    workingDirectory: 'vault',
    keepTerminalOpen: true
  },
  {
    id: 'codex',
    kind: 'shell-command',
    name: 'Open in Codex cli',
    command: 'codex',
    workingDirectory: 'vault',
    keepTerminalOpen: true
  },
  {
    id: 'antigravity',
    kind: 'shell-command',
    name: 'Open in Antigravity',
    command: 'agy --dangerously-skip-permissions',
    workingDirectory: 'vault',
    keepTerminalOpen: true
  },
  {
    id: 'opencode',
    kind: 'shell-command',
    name: 'Open in OpenCode',
    command: 'opencode',
    workingDirectory: 'vault',
    keepTerminalOpen: true
  },
  {
    id: 'git-pull',
    kind: 'shell-command',
    name: 'Git: pull',
    command: 'git pull',
    workingDirectory: 'vault',
    keepTerminalOpen: true
  },
  {
    id: 'vscode',
    kind: 'shell-command',
    name: 'Open in VS Code',
    command: 'code .',
    workingDirectory: 'vault',
    keepTerminalOpen: false
  }
];

const WINDOWS_DEFAULT_COMMANDS: readonly DefaultCommandSettings[] = [
  {
    id: 'file-explorer',
    kind: 'shell-command',
    name: 'Open in File Explorer',
    command: 'explorer .',
    workingDirectory: 'vault',
    keepTerminalOpen: false
  }
];

export const defaultTerminalName = (): string => {
  if (!Platform.isDesktopApp) {
    return '';
  }
  if (Platform.isMacOS) {
    return 'Terminal';
  }
  if (Platform.isWin) {
    return 'cmd';
  }
  if (Platform.isLinux) {
    return 'x-terminal-emulator';
  }
  return '';
};

const resolveExecutableFromPath = (value: string): string => {
  const executable = value.trim().replace(/^"(.*)"$/, '$1');
  if (!executable) {
    return '';
  }

  const isExecutableAbsolute = Platform.isWin
    ? win32.isAbsolute(executable)
    : isAbsolute(executable);
  if (isExecutableAbsolute) {
    return executable;
  }

  const extensions = Platform.isWin && !win32.extname(executable)
    ? ['', '.exe']
    : [''];
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (!directory) {
      continue;
    }
    for (const extension of extensions) {
      const candidate = join(directory, `${executable}${extension}`);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return executable;
};

const defaultWindowsCmdApp = (): string => {
  const windowsRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (windowsRoot) {
    const systemCmd = win32.join(windowsRoot, 'System32', 'cmd.exe');
    if (existsSync(systemCmd)) {
      return systemCmd;
    }
  }
  return resolveExecutableFromPath(process.env.ComSpec ?? 'cmd.exe');
};

const normalizeExecutablePath = (value: string): string => {
  const resolved = resolveExecutableFromPath(value);
  if (!Platform.isWin || win32.basename(resolved).toLowerCase() !== 'cmd.exe') {
    return resolved;
  }

  const defaultCmd = defaultWindowsCmdApp();
  return win32.normalize(resolved).toLowerCase() ===
    win32.normalize(defaultCmd).toLowerCase()
    ? defaultCmd
    : resolved;
};

export const defaultTerminalApp = (): string => {
  if (!Platform.isDesktopApp) {
    return '';
  }
  if (Platform.isWin) {
    return defaultWindowsCmdApp();
  }
  if (Platform.isMacOS) {
    const terminalApp = '/System/Applications/Utilities/Terminal.app';
    return existsSync(terminalApp) ? terminalApp : 'Terminal';
  }
  if (Platform.isLinux) {
    return resolveExecutableFromPath('x-terminal-emulator');
  }
  return '';
};

const getCurrentDesktopPlatform = (): DesktopPlatform | null => {
  if (!Platform.isDesktopApp) {
    return null;
  }
  if (Platform.isMacOS) {
    return 'macos';
  }
  if (Platform.isWin) {
    return 'win';
  }
  if (Platform.isLinux) {
    return 'linux';
  }
  return null;
};

const buildDefaultTerminalAppSetting = (): TerminalAppByPlatform => {
  const platform = getCurrentDesktopPlatform();
  const app = defaultTerminalApp();
  if (!platform) {
    return {};
  }
  return { [platform]: app };
};

const buildDefaultTerminalProfile = (
  applications = buildDefaultTerminalAppSetting()
): TerminalProfile => ({
  id: INITIAL_TERMINAL_ID,
  name: defaultTerminalName(),
  applications
});

const defaultWindowsPowerShellApp = (): string => {
  const windowsRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (windowsRoot) {
    const systemPowerShell = win32.join(
      windowsRoot,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    );
    if (existsSync(systemPowerShell)) {
      return systemPowerShell;
    }
  }
  return resolveExecutableFromPath('powershell.exe');
};

const buildDefaultWindowsPowerShellProfile = (): TerminalProfile => ({
  id: WINDOWS_POWERSHELL_TERMINAL_ID,
  name: 'powershell',
  applications: { win: defaultWindowsPowerShellApp() }
});

export const createDefaultTerminalProfiles = (): TerminalProfile[] =>
  Platform.isWin
    ? [buildDefaultTerminalProfile(), buildDefaultWindowsPowerShellProfile()]
    : [buildDefaultTerminalProfile()];

const cloneDefaultCommands = (): CommandSettings[] => {
  const commands = Platform.isWin
    ? [...DEFAULT_COMMANDS, ...WINDOWS_DEFAULT_COMMANDS]
    : DEFAULT_COMMANDS;
  return commands.map((command) => ({
    ...command,
    terminalId: INITIAL_TERMINAL_ID
  }));
};

export const DEFAULT_SETTINGS: TerminalCommandsSettings = {
  settingsVersion: CURRENT_SETTINGS_VERSION,
  terminals: createDefaultTerminalProfiles(),
  reuseExistingMacApp: true,
  commands: cloneDefaultCommands()
};

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null;

const normalizeTerminalAppSetting = (
  value: unknown,
  fallback: TerminalAppByPlatform
): TerminalAppByPlatform => {
  const platform = getCurrentDesktopPlatform();
  if (isRecord(value)) {
    const next: TerminalAppByPlatform = {};
    if (typeof value.win === 'string') {
      next.win = value.win.trim();
    }
    if (typeof value.macos === 'string') {
      next.macos = value.macos.trim();
    }
    if (typeof value.linux === 'string') {
      next.linux = value.linux.trim();
    }
    if (platform && next[platform]) {
      next[platform] = normalizeExecutablePath(next[platform]);
    }
    return next;
  }
  if (!platform) {
    return { ...fallback };
  }
  return {
    [platform]: normalizeExecutablePath(fallback[platform] ?? '')
  };
};

const readBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const normalizeWorkingDirectory = (value: unknown): WorkingDirectoryMode =>
  value === 'current-note' ? 'current-note' : 'vault';

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]*$/.test(normalized) ? normalized : null;
};

const createUniqueId = (usedIds: Set<string>, prefix: string): string => {
  let id: string;
  do {
    id = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  } while (usedIds.has(id));
  return id;
};

const normalizeTerminalProfiles = (
  value: unknown,
  legacyTerminalApp: unknown
): TerminalProfile[] => {
  if (!Array.isArray(value)) {
    return [
      buildDefaultTerminalProfile(
        normalizeTerminalAppSetting(
          legacyTerminalApp,
          buildDefaultTerminalAppSetting()
        )
      )
    ];
  }

  const usedIds = new Set<string>();
  const terminals: TerminalProfile[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    let id = normalizeId(item.id);
    if (!id || usedIds.has(id)) {
      id = createUniqueId(usedIds, 'terminal');
    }
    usedIds.add(id);
    terminals.push({
      id,
      name: typeof item.name === 'string' ? item.name : '',
      applications: normalizeTerminalAppSetting(
        item.applications,
        buildDefaultTerminalAppSetting()
      )
    });
  }

  return terminals.length > 0 ? terminals : createDefaultTerminalProfiles();
};

const normalizeCommands = (
  value: unknown,
  terminalIds: ReadonlySet<string>,
  fallbackTerminalId: string
): CommandSettings[] => {
  if (!Array.isArray(value)) {
    return cloneDefaultCommands().map((command) => ({
      ...command,
      terminalId: fallbackTerminalId
    }));
  }

  const usedIds = new Set<string>();
  const commands: CommandSettings[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    let id = normalizeId(item.id);
    if (!id || usedIds.has(id)) {
      id = createUniqueId(usedIds, 'command');
    }
    usedIds.add(id);

    const terminalId = normalizeId(item.terminalId);

    const kind: CommandKind =
      item.kind === 'open-terminal' ? 'open-terminal' : 'shell-command';
    commands.push({
      id,
      kind,
      name: typeof item.name === 'string' ? item.name : '',
      command:
        kind === 'open-terminal'
          ? ''
          : typeof item.command === 'string'
            ? item.command
            : '',
      workingDirectory: normalizeWorkingDirectory(item.workingDirectory),
      keepTerminalOpen:
        kind === 'open-terminal'
          ? true
          : readBoolean(item.keepTerminalOpen, true),
      terminalId:
        terminalId && terminalIds.has(terminalId)
          ? terminalId
          : fallbackTerminalId
    });
  }
  return commands;
};

export const createCommand = (
  existing: readonly CommandSettings[],
  terminalId: string
): CommandSettings => {
  const usedIds = new Set(existing.map((command) => command.id));
  return {
    id: createUniqueId(usedIds, 'command'),
    kind: 'shell-command',
    name: '',
    command: '',
    workingDirectory: 'vault',
    keepTerminalOpen: true,
    terminalId
  };
};

export const createTerminalProfile = (
  existing: readonly TerminalProfile[]
): TerminalProfile => {
  const usedIds = new Set(existing.map((terminal) => terminal.id));
  return {
    id: createUniqueId(usedIds, 'terminal'),
    name: '',
    applications: {}
  };
};

const addMigratedOpenTerminalCommand = (
  commands: CommandSettings[],
  terminalId: string
): void => {
  if (commands.some((command) => command.kind === 'open-terminal')) {
    return;
  }

  const usedIds = new Set(commands.map((command) => command.id));
  const id = usedIds.has('open-terminal')
    ? createUniqueId(usedIds, 'open-terminal')
    : 'open-terminal';
  commands.unshift({
    id,
    kind: 'open-terminal',
    name: 'Open in terminal',
    command: '',
    workingDirectory: 'vault',
    keepTerminalOpen: true,
    terminalId
  });
};

const addMigratedWindowsPowerShellTerminal = (
  terminals: TerminalProfile[]
): void => {
  if (!Platform.isWin) {
    return;
  }
  const hasWindowsPowerShell = terminals.some((terminal) => {
    const executableName = win32.basename(terminal.applications.win ?? '').toLowerCase();
    return executableName === 'powershell' || executableName === 'powershell.exe';
  });
  if (hasWindowsPowerShell) {
    return;
  }

  const profile = buildDefaultWindowsPowerShellProfile();
  const usedIds = new Set(terminals.map((terminal) => terminal.id));
  if (usedIds.has(profile.id)) {
    profile.id = createUniqueId(usedIds, 'terminal-powershell');
  }
  terminals.push(profile);
};

export const normalizeSettings = (stored: unknown): TerminalCommandsSettings => {
  const source = isRecord(stored) ? stored : {};
  const terminals = normalizeTerminalProfiles(source.terminals, source.terminalApp);
  const fallbackTerminalId = terminals[0]?.id ?? INITIAL_TERMINAL_ID;
  const commands = normalizeCommands(
    source.commands,
    new Set(terminals.map((terminal) => terminal.id)),
    fallbackTerminalId
  );
  const storedVersion =
    typeof source.settingsVersion === 'number' ? source.settingsVersion : 0;
  if (storedVersion < 1) {
    addMigratedOpenTerminalCommand(commands, fallbackTerminalId);
  }
  if (storedVersion < 2) {
    addMigratedWindowsPowerShellTerminal(terminals);
  }
  return {
    settingsVersion: CURRENT_SETTINGS_VERSION,
    terminals,
    reuseExistingMacApp: readBoolean(
      source.reuseExistingMacApp,
      DEFAULT_SETTINGS.reuseExistingMacApp
    ),
    commands
  };
};

export const restoreDefaultTerminalProfiles = (
  settings: TerminalCommandsSettings
): void => {
  const defaultTerminals = createDefaultTerminalProfiles();
  const defaultTerminalIds = new Set(
    defaultTerminals.map((terminal) => terminal.id)
  );
  const fallbackTerminalId = defaultTerminals[0]?.id ?? '';

  settings.terminals = defaultTerminals;
  for (const command of settings.commands) {
    if (!defaultTerminalIds.has(command.terminalId)) {
      command.terminalId = fallbackTerminalId;
    }
  }
};

export const resolveTerminalProfile = (
  settings: TerminalCommandsSettings,
  terminalId: string
): TerminalProfile | undefined =>
  settings.terminals.find((terminal) => terminal.id === terminalId) ??
  settings.terminals[0];

export const getCurrentTerminalApp = (terminalApp: TerminalAppByPlatform): string => {
  const platform = getCurrentDesktopPlatform();
  if (!platform) {
    return '';
  }
  return terminalApp[platform] ?? '';
};

export const setCurrentTerminalApp = (
  terminalApp: TerminalAppByPlatform,
  value: string
): TerminalAppByPlatform => {
  const platform = getCurrentDesktopPlatform();
  if (!platform) {
    return { ...terminalApp };
  }
  return {
    ...terminalApp,
    [platform]: value.trim()
  };
};
