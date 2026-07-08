// Flat ESLint config (ESLint 9 + typescript-eslint 8).
// Replaces the deprecated TSLint setup.
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'out/**', 'node_modules/**', '.vscode-test/**', '**/*.js'],
  },
  {
    files: ['src/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    rules: {
      // TypeScript already reports undefined identifiers and unused-vars via tsc.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { args: 'none', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // This codebase is intentionally loose about `any`; keep it non-blocking.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-namespace': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'no-case-declarations': 'off',
      'prefer-const': 'warn',
      // Legacy patterns in remote-client adapters (callback forwarding, monkey
      // patching): worth surfacing but not worth blocking the build over.
      'prefer-rest-params': 'warn',
      'no-async-promise-executor': 'warn',
    },
  },
  {
    // Monkey-patches the `ftp` package internals; keep it byte-for-byte close
    // to the upstream source, so relax the rules that style would trip.
    files: ['src/core/remote-client/ftpClient.ts'],
    rules: {
      'no-var': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  }
);
