// ESLint flat config (PR-2c). Replaces .eslintrc.json with the same rule set —
// next/core-web-vitals + next/typescript + prettier — but `eslint .`
// now covers the WHOLE repo (app/, lib/, components/, scripts/, src/), not just
// the dirs `next lint` defaulted to. The supervisor daemon and CLI live under
// scripts/ and src/, which the review found were never linted.
// eslint-config-next 16 ships native flat configs (FlatCompat can't load them).
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

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
  ...nextCoreWebVitals,
  ...nextTypescript,
  prettier,
  {
    rules: {
      // react-hooks v6 (via eslint-config-next 16) ships these new rules as
      // errors; the flagged patterns predate the upgrade (5x setState-in-effect,
      // 1x immutability) and need real refactors — kept as warnings so the
      // dependency bump stays behavior-neutral.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
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
