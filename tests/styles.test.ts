import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('command settings layout', () => {
  it('reserves a single row from the drag handle through the delete button', () => {
    expect(styles).toContain(
      '--terminal-commands-columns: 48px minmax(110px, 0.8fr) minmax(190px, 1.4fr) 112px 86px 76px 52px;'
    );
    expect(styles).toContain('grid-template-columns: var(--terminal-commands-columns);');
    expect(styles).toContain('gap: var(--size-2-1);');
    expect(styles).toContain('.terminal-commands-group-description');
    expect(styles).toContain('.terminal-commands-column-headers');
    expect(styles).toContain('.terminal-commands-menu-tags');
    expect(styles).toContain('.terminal-commands-menu-tag');
    expect(styles).toContain('.terminal-commands-menu-tag-terminal-name');
    expect(styles).toContain('.terminal-commands-terminal-controls');
    expect(styles).toContain('.terminal-commands-terminal-column-headers');
    expect(styles).toContain('--terminal-commands-terminal-columns:');
    expect(styles).toContain('.terminal-commands-terminal-file-input');
    expect(styles).toContain('--dropdown-fitted-width: 112px;');
    expect(styles).toContain('min-width: 112px;');
    expect(styles).toContain('max-width: 112px;');
    expect(styles).toContain('field-sizing: fixed;');
    expect(styles).toContain('.terminal-commands-restore-terminals');
  });
});
