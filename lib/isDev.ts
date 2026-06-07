/**
 * Single source of truth for the development-mode check.
 *
 * Reading `process.env.NODE_ENV` directly works in real builds (the bundler
 * inlines it), but `next/jest`'s SWC transform also inlines it to `"test"`,
 * which makes the dev/prod branches impossible to exercise from a test that
 * mutates `process.env` at runtime. Funnelling the check through this function
 * lets tests `jest.mock('@/lib/isDev')` and control the branch deterministically
 * without depending on env-inlining behaviour.
 */
export function isDev(): boolean {
  return process.env.NODE_ENV === 'development';
}
