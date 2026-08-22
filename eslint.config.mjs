import obsidianmd from 'eslint-plugin-obsidianmd';

const tsFiles = ['src/**/*.ts', 'tests/**/*.ts'];

export default [
  {
    ignores: ['node_modules/**', '.obsidian/**', 'main.js', 'main.js.map']
  },
  ...obsidianmd.configs.recommended,
  {
    files: ['eslint.config.mjs'],
    rules: {
      'obsidianmd/hardcoded-config-path': 'off'
    }
  },
  {
    files: tsFiles,
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      'obsidianmd/ui/sentence-case': [
        'error',
        {
          brands: [
            'Terminal.app',
            'iTerm',
            'cmd.exe',
            'gnome-terminal',
            'Claude Code',
            'Codex cli',
            'Cursor cli',
            'Gemini cli',
            'Git',
            'Windows'
          ]
        }
      ]
    }
  }
];
