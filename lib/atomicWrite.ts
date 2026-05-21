import fs from 'fs';

let counter = 0;

/**
 * Atomically replace `targetPath` with `payload` by writing to a sibling
 * temp file and renaming over the destination. On POSIX (APFS/ext4) and
 * Windows NTFS `MoveFileEx(MOVEFILE_REPLACE_EXISTING)`, the rename is a
 * single atomic step — a concurrent reader sees either the old content
 * or the new content, never a partial state.
 *
 * Used by `setActive` for the switcher `${screen}.txt` files. The plugin
 * polls these at 1000 ms intervals (G2), so any tearing window — even a
 * few microseconds — is observable. See `docs/plugin-contract.md`
 * "Phase 2.2 — Atomic-Write Decision" for the soak evidence.
 */
export function atomicWriteFileSync(targetPath: string, payload: string | Buffer): void {
  const tmpPath = `${targetPath}.tmp-${process.pid}-${Date.now()}-${counter++}`;
  fs.writeFileSync(tmpPath, payload);
  try {
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // tmp may already be gone; the rename error is the important one
    }
    throw err;
  }
}
