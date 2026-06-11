// ESLint flat config (PR-2c). Replaces .eslintrc.json with the same rule set —
// next/core-web-vitals + next/typescript + prettier via FlatCompat — but `eslint .`
// now covers the WHOLE repo (app/, lib/, components/, scripts/, src/), not just
// the dirs `next lint` defaulted to. The supervisor daemon and CLI live under
// scripts/ and src/, which the review found were never linted.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const eslintConfig = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'dist/**',
      'coverage/**',
      'out/**',
      '.omc/**',
      '.full-review/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript', 'prettier'),
  {
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      // Underscore prefix marks intentionally unused (CLI command signatures
      // take (_argv, _ctx) even when a command needs neither).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // Tests stub node:http req/res and runtime seams through `as any` on
    // purpose; full structural types there add noise, not safety.
    files: ['**/__tests__/**', '**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];

export default eslintConfig;
