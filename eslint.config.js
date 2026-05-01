// ESLint v9+ flat config. See docs/architecture.md for the no-console policy.

import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'smart'],
      'no-console': 'warn',
    },
  },
  {
    files: ['src/lib/logger.js', 'src/index.js'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: ['node_modules/**', 'runs/**'],
  },
];
