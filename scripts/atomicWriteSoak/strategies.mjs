// ESM mirror of strategies.ts for execution on hosts without tsx
// (the Phase 2.2 F1 Windows soak). Keep behavior identical to the .ts
// version; if the algorithm changes here, update strategies.ts too.
import fs from 'fs';
import path from 'path';

export const writeStrategy = ({ targetPath, payload }) => {
  fs.writeFileSync(targetPath, payload);
};

export const renameStrategy = ({ targetPath, payload }) => {
  const tmp = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, payload);
  fs.renameSync(tmp, targetPath);
};

export function pickStrategy(name) {
  switch (name) {
    case 'write':
      return writeStrategy;
    case 'rename':
      return renameStrategy;
    default:
      throw new Error(`pickStrategy: unknown strategy "${name}"`);
  }
}

export function isValidStrategy(name) {
  return name === 'write' || name === 'rename';
}

export function strategyOutputBase(strategy, dir) {
  return path.join(dir, `soak-${strategy}.txt`);
}
