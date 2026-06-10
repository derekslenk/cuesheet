/**
 * Minimal, surgical type shims so the bun-only supervisor command type-checks
 * under the project's `tsc --noEmit` gate WITHOUT pulling all of bun-types
 * globally (which would clash with the Next.js app's @types/node globals).
 *
 * Only declares the tiny surface the CLI actually uses. The real
 * implementations come from the Bun runtime at compile/run time.
 */

declare module 'bun:sqlite' {
  export interface Statement {
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  }
  export class Database {
    constructor(filename: string, options?: { readonly?: boolean; create?: boolean });
    query(sql: string): Statement;
    run(sql: string, ...params: unknown[]): unknown;
    exec(sql: string): void;
    close(): void;
  }
}

/** `import html from './x.html' with { type: 'text' }` → string (bun inlines it). */
declare module '*.html' {
  const content: string;
  export default content;
}

/** Bun sets `import.meta.main` to true when the file is the entry point. */
interface ImportMeta {
  main: boolean;
}
