// Lint configuration.
//
// The rule this exists for is `react-hooks/rules-of-hooks`. A hook called
// conditionally is invisible in review, compiles, and then desynchronises state
// at runtime in a way that reads as a data bug rather than as a hooks bug. It
// cost us a debugging session once already; it is a compile error here.
//
// Deliberately narrow otherwise. A style ruleset imposed on a codebase this far
// along produces hundreds of findings that nobody reads, and the signal from the
// two rules that matter is lost in it.

import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Not the react plugin's recommended set — only the one rule that teaches
      // core ESLint to see a component used in JSX. Without it every imported
      // component is reported as unused, which is 30 false positives and no
      // true ones.
      'react/jsx-uses-vars': 'error',

      // Unused *arguments* are frequently deliberate — an event handler that
      // ignores its event, a catch that ignores its error. Unused variables are
      // not, and are usually the residue of a half-finished edit.
      'no-unused-vars': ['error', {
        args: 'none',
        caughtErrors: 'none',
        varsIgnorePattern: '^_',
      }],
    },
  },
];
