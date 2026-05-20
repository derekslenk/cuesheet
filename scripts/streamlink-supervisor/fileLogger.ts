import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'fs';
import { join } from 'path';

export interface FileLoggerOptions {
  dir: string;
  name: string;
  maxBytes: number;
  retain: number;
}

export class FileLogger {
  private readonly dir: string;
  private readonly name: string;
  private readonly maxBytes: number;
  private readonly retain: number;
  private fd: number | null = null;
  private bytesWritten = 0;

  constructor(opts: FileLoggerOptions) {
    this.dir = opts.dir;
    this.name = opts.name;
    this.maxBytes = opts.maxBytes;
    this.retain = opts.retain;
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    this.openActive();
  }

  write(chunk: string | Buffer): void {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    if (this.bytesWritten + buf.length > this.maxBytes) {
      this.rotate();
    }
    if (this.fd === null) this.openActive();
    writeSync(this.fd!, buf);
    this.bytesWritten += buf.length;
  }

  close(): void {
    if (this.fd !== null) {
      closeSync(this.fd);
      this.fd = null;
    }
  }

  diskBytes(): number {
    let total = 0;
    for (let i = 0; i <= this.retain; i++) {
      const f = this.fileAt(i);
      if (existsSync(f)) total += statSync(f).size;
    }
    return total;
  }

  private openActive(): void {
    const active = this.fileAt(0);
    this.fd = openSync(active, 'a');
    this.bytesWritten = existsSync(active) ? statSync(active).size : 0;
  }

  private rotate(): void {
    this.close();

    // Cascade .N → .(N+1), discard anything past `retain`.
    for (let i = this.retain; i >= 1; i--) {
      const src = this.fileAt(i);
      const dst = this.fileAt(i + 1);
      if (!existsSync(src)) continue;
      if (i === this.retain) {
        // Pushing past the retain budget — drop the oldest rather than create .(retain+1).
        unlinkSync(src);
      } else {
        renameSync(src, dst);
      }
    }

    const active = this.fileAt(0);
    if (existsSync(active)) renameSync(active, this.fileAt(1));

    this.openActive();
  }

  private fileAt(index: number): string {
    return index === 0
      ? join(this.dir, `${this.name}.log`)
      : join(this.dir, `${this.name}.${index}.log`);
  }
}
