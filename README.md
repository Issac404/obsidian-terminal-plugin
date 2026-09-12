# Terminal Commands

Terminal Commands is a desktop-only Obsidian plugin for opening a vault in a terminal and launching configurable shell commands from the command palette or a searchable ribbon menu.

Requires Obsidian 1.13.1 or later.

## Features

- Keep the non-deletable **Open in terminal** action in the same editable command list.
- Open a searchable command menu from the left ribbon, sorted by Terminal and Launcher behavior with a visible group label on every result.
- Manage commands in one compact list with behavior toggles.
- Configure multiple named terminal applications and select one per command.
- Edit each command's palette name, shell command, and working directory.
- Automatically register commands whose name and shell command are not empty.
- Reorder commands by dragging; a highlighted insertion line previews the destination.
- Delete commands through an Obsidian confirmation dialog.
- Start commands at the vault root or the active note's folder.
- Use platform-specific launch behavior on Windows, macOS, and Linux.

## Initial commands

New installations include editable entries for:

- Open in terminal (cannot be deleted)
- Claude Code
- Codex CLI
- Antigravity
- OpenCode
- Git pull
- Visual Studio Code (`code .`, second to last on Windows)
- File Explorer (`explorer .`, last on Windows only)

The shell-command entries can be edited, reordered, or deleted. **Open in terminal** has an editable name, terminal, and working folder, but has no shell command and cannot be deleted.

## Settings

Open **Settings → Community plugins → Terminal Commands**.

The settings page contains:

- **Reuse existing Terminal instance** — macOS-only option controlling `open -a` versus `open -na`.
- **Terminals** — four columns for an editable name, a read-only executable path, a system file-picker button, and delete. A platform-specific description lists the supported terminal types. Windows starts with `cmd` and Windows PowerShell; macOS starts with `Terminal`; Linux starts with `x-terminal-emulator`. Executable paths are scanned when possible, and the Windows picker accepts only supported `.exe` files. Every profile can be deleted, but at least one must remain. **Restore defaults** replaces the list with the platform defaults and reassigns commands from removed profiles to the first default terminal.
- **Commands** — an ordered list containing:

  - Drag handle
  - Command palette name
  - Shell command
  - Terminal profile
  - **Note folder** toggle — on uses the active note's folder; off uses the Vault root
  - **Keep open** toggle — on keeps the terminal open; off closes it when the command finishes
  - Delete button

The **Restore defaults** button beside the Commands add button replaces the entire command list with the current platform's initial commands after confirmation. Custom commands and edits are removed, including changes to names, shell commands, order, working folders, and Keep open preferences. Restored commands use the first current terminal; terminal profiles and other settings are unchanged.

The list includes aligned column headings for all seven controls. Terminal selectors have a fixed width; names longer than eight characters are shortened in the list and remain available as a tooltip. The ribbon command menu shows the selected terminal first, followed by separate **Vault folder** / **Note folder** and **Keep terminal** / **Close terminal** labels, and sorts commands that keep the terminal open before commands that close it.

Existing single-terminal settings are migrated to the first terminal profile. At least one terminal profile is always retained; deleting a profile reassigns its commands to the first remaining terminal.

When **Note folder** is off, the command uses the Vault root. When it is on, it uses the active note's folder and falls back to the Vault root if no note is active.

## Security

Configured commands run in a newly opened terminal with the current user's permissions. Only add commands you understand and trust.

The plugin uses Node.js child processes to open desktop terminal applications. On macOS, command launches also create a short-lived executable script in the operating system's temporary directory; the script is scheduled for deletion after launch. These desktop capabilities are required for the plugin's stated purpose and are not used to access note contents.

Git entries are ordinary shell commands and do not receive a separate repository pre-check.

## Platform behavior

- **macOS** — opens the configured terminal with `open`; command launches use a temporary executable `.command` script.
- **Windows** — supports only `cmd.exe`, Windows PowerShell (`powershell.exe`), and PowerShell 7 (`pwsh.exe`). Other executables are rejected instead of being launched or silently falling back to another terminal.
- **Linux / BSD** — launches the configured terminal directly or uses `bash -lc` when running a command.

## Development

```bash
npm install
npm run check
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
