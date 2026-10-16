import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

type ProcessedRecord = { id: string; at: string; result: string };

export class ProcessedStore {
  private readonly ids = new Set<string>();
  private records: ProcessedRecord[] = [];

  constructor(
    private readonly file: string,
    private readonly max: number,
  ) {
    this.load();
  }

  private load(): void {
    if (!existsSync(this.file)) return;
    const content = readFileSync(this.file, 'utf8');
    const seen = new Set<string>();
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as ProcessedRecord;
        if (typeof record.id !== 'string' || seen.has(record.id)) continue;
        seen.add(record.id);
        this.ids.add(record.id);
        this.records.push({ id: record.id, at: record.at ?? '', result: record.result ?? '' });
      } catch {
        // línea corrupta: se ignora
      }
    }
    this.prune();
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  add(id: string, result: string): void {
    if (this.ids.has(id)) return;
    this.ids.add(id);
    const record: ProcessedRecord = { id, at: new Date().toISOString(), result };
    this.records.push(record);
    mkdirSync(dirname(this.file), { recursive: true });
    appendFileSync(this.file, `${JSON.stringify(record)}\n`);
    this.prune();
  }

  private prune(): void {
    if (this.records.length <= this.max) return;
    this.records = this.records.slice(this.records.length - this.max);
    this.ids.clear();
    for (const record of this.records) this.ids.add(record.id);
    const body = this.records.map((record) => JSON.stringify(record)).join('\n');
    writeFileSync(this.file, body ? `${body}\n` : '');
  }
}
