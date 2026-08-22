import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/main.ts',
  output: {
    dir: '.',
    sourcemap: true,
    format: 'cjs',
    exports: 'default'
  },
  external: ['electron', 'obsidian', 'node:child_process', 'node:fs', 'node:os', 'node:path'],
  plugins: [
    typescript({ tsconfig: './tsconfig.json' }),
    nodeResolve({ browser: true }),
    commonjs()
  ]
};
