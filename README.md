# Terminal Commands

Terminal Commands is a desktop-only Obsidian plugin for opening a vault in a terminal and launching configurable shell commands from the command palette or a searchable ribbon menu.

## Features

- Open the current vault in a configured terminal application.
- Open a searchable command menu from the left ribbon, with each command's working directory and shell command shown beneath its name.
- Manage commands in one compact five-column table.
- Edit each command's palette name, shell command, and working directory.
- Automatically register commands whose name and shell command are not empty.
- Reorder commands by dragging; a highlighted insertion line previews the destination.
- Delete commands through an Obsidian confirmation dialog.
- Start commands at the vault root or the active note's folder.
- Use platform-specific launch behavior on Windows, macOS, and Linux.

## Initial commands

New installations include editable entries for:

- Claude Code
- Codex CLI
- Antigravity
- OpenCode
- Git pull
- Git commit and push

These are ordinary commands. They can be edited, reordered, or deleted like commands added later.

## Settings

Open **Settings → Community plugins → Terminal Commands**.

The settings page contains:

- **Terminal application name** — terminal executable or application used for launches.
- **Reuse existing Terminal instance** — macOS-only option controlling `open -a` versus `open -na`.
- **Commands** — an ordered table containing:
  - Drag handle
  - Command palette name
  - Shell command
  - Working directory: `Current note folder` or `Vault root`
  - Delete button

`Current note folder` falls back to the vault root when no note is active. The always-available `Open in terminal` command opens the vault root.

## Security

Configured commands run through the system shell with the current user's permissions. Only add commands you understand and trust.

Git entries are ordinary shell commands and do not receive a separate repository pre-check.

## Platform behavior

- **macOS** — opens the configured terminal with `open`; command launches use a temporary executable `.command` script.
- **Windows** — supports `cmd.exe`, PowerShell, Windows Terminal, and custom terminal executables.
- **Linux / BSD** — launches the configured terminal directly or uses `bash -lc` when running a command.

## Development

```bash
npm install
npm run lint
npm run build
```

For local installation, copy these files into `.obsidian/plugins/terminal-commands/`:

- `manifest.json`
- `main.js`
- `styles.css`

Then reload Obsidian and enable **Terminal Commands** under Community plugins.

## Author

[Issac404](https://github.com/Issac404)

## Repository

[Issac404/obsidian-terminal-plugin](https://github.com/Issac404/obsidian-terminal-plugin)

## License

[MIT](LICENSE)
