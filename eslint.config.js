// ESLint 10 flat config for the whole monorepo.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default defineConfig([
  globalIgnores([
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/.turbo/**',
    '**/node_modules/**',
    '**/src/generated/**',
    '.mise/**',
  ]),
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: {
          // Root-level scripts/configs, plus every package's own build/test config files
          // (vitest.config.ts, vitest.config.mts, vitest.integration.config.mts,
          // tsup.config.ts, ...) — letting typescript-eslint fall back to its default,
          // tsconfig-less program for these means each package's tsconfig.json doesn't
          // have to `include` them just to keep typed linting from erroring (B-005).
          // `**` is disallowed here (typescript-eslint caps default-project matching to
          // bounded globs to avoid every file in the repo silently falling back to it —
          // https://tseslint.com/allowdefaultproject-glob-too-wide), so this is spelled
          // out one path segment per depth instead of a single recursive pattern.
          // Scoped to the packages whose tsconfig.json no longer `include`s its own
          // config files (B-005) — a file can't appear both here *and* in a tsconfig's
          // `include`, so packages not listed here (apps/tui, packages/proto,
          // packages/media) keep including their config files in tsconfig.json until
          // someone applies the same change there.
          allowDefaultProject: [
            '*.js',
            '*.mjs',
            '*.ts',
            'apps/admin/*.config.{ts,mts,cts}',
            'apps/server/*.config.{ts,mts,cts}',
            'apps/worker/*.config.{ts,mts,cts}',
            'packages/config/*.config.{ts,mts,cts}',
            'packages/database/*.config.{ts,mts,cts}',
            'packages/testkit/*.config.{ts,mts,cts}',
            'packages/terminal-media/*.config.{ts,mts,cts}',
          ],
          // Default cap is 8; the packages above contribute 15 matching config files, all
          // small and cheap to parse standalone (no type info needed) — raising this is the
          // documented escape hatch, not a performance red flag at this file count.
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 20,
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    rules: {
      // Spec §7/§154: no `any`, prefer `unknown` for untrusted data.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description' },
      ],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // NestJS packages rely on decorators + DI; relax a couple of rules that fight the framework.
    files: ['apps/server/**', 'apps/worker/**', 'apps/admin/**', 'packages/database/**'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
  {
    // Ink / React 19 client.
    files: ['apps/tui/**/*.{ts,tsx}', 'packages/terminal-media/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    rules: {
      // The TUI writes to stdout deliberately via Ink; direct console use corrupts the screen.
      'no-console': 'error',
    },
  },
  {
    files: ['**/*.{test,spec}.{ts,tsx}', 'packages/testkit/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node } },
  },
  eslintConfigPrettier,
]);
