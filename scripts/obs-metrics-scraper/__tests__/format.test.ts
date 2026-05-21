import fs from 'fs';
import path from 'path';

interface SampleProcess {
  present: boolean;
  processId: number | null;
  workingSetBytes: number | null;
  privateMemoryBytes: number | null;
  virtualMemoryBytes: number | null;
  handleCount: number | null;
  threadCount: number | null;
  pageFaults: number | null;
  cpuTotalSeconds: number | null;
}

interface SampleSystem {
  freePhysicalMemoryBytes: number | null;
  totalVisibleMemoryBytes: number | null;
  freePhysicalPercent: number | null;
}

interface SampleRecord {
  ts: string;
  process: SampleProcess;
  system: SampleSystem;
}

const FIXTURE = path.join(__dirname, 'sample-output.fixture.jsonl');

function loadRecords(): SampleRecord[] {
  const raw = fs.readFileSync(FIXTURE, 'utf8');
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line) as SampleRecord);
}

describe('obs-metrics-scraper JSONL fixture', () => {
  it('parses every line as JSON', () => {
    const records = loadRecords();
    expect(records.length).toBeGreaterThanOrEqual(2);
  });

  it('every record carries ts, process, system top-level keys', () => {
    const records = loadRecords();
    for (const r of records) {
      expect(typeof r.ts).toBe('string');
      expect(r.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(r.process).toBeDefined();
      expect(r.system).toBeDefined();
    }
  });

  it('process.present=true rows have numeric process fields', () => {
    const records = loadRecords();
    const present = records.filter(r => r.process.present);
    expect(present.length).toBeGreaterThan(0);
    for (const r of present) {
      expect(typeof r.process.processId).toBe('number');
      expect(typeof r.process.workingSetBytes).toBe('number');
      expect(typeof r.process.privateMemoryBytes).toBe('number');
      expect(typeof r.process.handleCount).toBe('number');
      expect(typeof r.process.threadCount).toBe('number');
      expect(typeof r.process.cpuTotalSeconds).toBe('number');
    }
  });

  it('process.present=false rows have null process fields (stable shape)', () => {
    const records = loadRecords();
    const absent = records.filter(r => !r.process.present);
    expect(absent.length).toBeGreaterThan(0);
    for (const r of absent) {
      expect(r.process.processId).toBeNull();
      expect(r.process.workingSetBytes).toBeNull();
      expect(r.process.privateMemoryBytes).toBeNull();
      expect(r.process.handleCount).toBeNull();
      expect(r.process.threadCount).toBeNull();
      expect(r.process.cpuTotalSeconds).toBeNull();
    }
  });

  it('system.freePhysicalPercent is in 0..100 when reported', () => {
    const records = loadRecords();
    for (const r of records) {
      const pct = r.system.freePhysicalPercent;
      if (pct === null) continue;
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });
});
