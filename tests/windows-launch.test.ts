import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildLaunchCommandForPlatform } from '../src/launcher';

// Keep START's parsing, but share the console and wait instead of opening a window.
const runInConsole = (
  terminal: string,
  toolCommand: string,
  cwd = process.cwd()
): string => {
  const launch = buildLaunchCommandForPlatform(
    'windows', terminal, cwd, toolCommand, { keepTerminalOpen: false }
  )!;
  const inConsole = (value: string) => value.replace('start ""', 'start "" /b /wait');
  const result = spawnSync(inConsole(launch.executable), launch.args.map(inConsole), {
    cwd: launch.cwd,
    shell: launch.shell ?? false,
    windowsVerbatimArguments: launch.windowsVerbatimArguments,
    env: {
      ...process.env, ...launch.env,
      TC_REVIEW_LITERAL: 'UNEXPECTED_EXPANSION',
      TC_REVIEW_CHAIN: '%TC_REVIEW_LITERAL%'
    },
    encoding: 'utf8',
    timeout: 15_000
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
};

const directories: string[] = [];

const createWorkingDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "terminal-commands-%TC_REVIEW_LITERAL%-&-!-'-"));
  directories.push(directory);
  writeFileSync(join(directory, 'cwd-marker.txt'), '');
  return directory;
};

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

describe.skipIf(process.platform !== 'win32')('Windows shell execution', () => {
  it('preserves literal percent expressions in PowerShell', () => {
    expect(runInConsole('powershell.exe', "Write-Output '%TC_REVIEW_LITERAL%'"))
      .toBe('%TC_REVIEW_LITERAL%');
  });

  it('preserves quotes and ampersands in PowerShell', () => {
    expect(runInConsole('powershell.exe', 'Write-Output "left & echo right"'))
      .toBe('left & echo right');
  });

  it('preserves quotes and ampersands in cmd', () => {
    expect(runInConsole('cmd.exe', 'echo "left & echo right"'))
      .toBe('"left & echo right"');
  });

  it('preserves cmd caret escaping', () => {
    expect(runInConsole('cmd.exe', 'echo ^& echo extra')).toBe('& echo extra');
  });

  it('expands cmd environment variables only once', () => {
    expect(runInConsole('cmd.exe', 'echo %TC_REVIEW_CHAIN%')).toBe('%TC_REVIEW_LITERAL%');
  });

  it('uses the literal working directory in cmd', () => {
    expect(runInConsole(
      'cmd.exe', 'if exist cwd-marker.txt (echo expected) else (echo wrong)', createWorkingDirectory()
    )).toBe('expected');
  });

  it('uses the literal working directory in PowerShell', () => {
    expect(runInConsole(
      'powershell.exe', "Test-Path -LiteralPath './cwd-marker.txt'", createWorkingDirectory()
    )).toBe('True');
  });
});
