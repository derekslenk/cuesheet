const nextJest = require('next/jest');

/** @type {import('jest').Config} */
const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
});

// Add any custom config to be passed to Jest
const config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  
  // Setup files to run before each test
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.(ts|tsx|js)',
    '**/*.(test|spec).(ts|tsx|js)'
  ],
  
  // Module name mapping for absolute imports (correct property name)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // Strip ESM `.js` specifiers so ts-jest resolves the `.ts` source. The CLI
    // uses NodeNext-style `.js` import specifiers (required for bun --compile),
    // which jest's resolver would otherwise fail to find.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  
  // Coverage settings
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    'scripts/**/*.ts',
    'src/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**',
    // Bun-only entry points: import bun:sqlite and `with { type: 'text' }`
    // attributes that jest cannot load. Gated by supervisor:smoke + the
    // tsconfig.bun.json type-check instead.
    '!**/*.bun.ts',
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
    // Supervisor daemon gets its own ratchet (measured ~88% on 2026-06-10;
    // floor set below that so it gates regressions without flaking). Per jest
    // semantics this path group is excluded from the `global` bucket.
    'scripts/streamlink-supervisor/': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(config);