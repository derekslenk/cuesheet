import fs from 'fs';
import path from 'path';

export type StrategyName = 'write' | 'rename';

export interface WriteContext {
  targetPath: string;
  payload: string;
}

export type WriteStrategy = (ctx: WriteContext) => void;

export const writeStrategy: WriteStrategy = ({ targetPath, payload }) => {
  fs.writeFileSync(targetPath, payload);
};

export const renameStrategy: WriteStrategy = ({ targetPath, payload }) => {
  const tmp = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, payload);
  fs.renameSync(tmp, targetPath);
};

export function pickStrategy(name: StrategyName): WriteStrategy {
  switch (name) {
    case 'write':
      return writeStrategy;
    case 'rename':
      return renameStrategy;
  }
}

export function isValidStrategy(name: string): name is StrategyName {
  return name === 'write' || name === 'rename';
}

export function strategyOutputBase(strategy: StrategyName, dir: string): string {
  return path.join(dir, `soak-${strategy}.txt`);
}
