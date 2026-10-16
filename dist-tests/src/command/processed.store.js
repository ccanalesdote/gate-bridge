import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
export class ProcessedStore {
    file;
    max;
    ids = new Set();
    records = [];
    constructor(file, max) {
        this.file = file;
        this.max = max;
        this.load();
    }
    load() {
        if (!existsSync(this.file))
            return;
        const content = readFileSync(this.file, 'utf8');
        const seen = new Set();
        for (const line of content.split('\n')) {
            if (!line.trim())
                continue;
            try {
                const record = JSON.parse(line);
                if (typeof record.id !== 'string' || seen.has(record.id))
                    continue;
                seen.add(record.id);
                this.ids.add(record.id);
                this.records.push({ id: record.id, at: record.at ?? '', result: record.result ?? '' });
            }
            catch {
                // línea corrupta: se ignora
            }
        }
        this.prune();
    }
    has(id) {
        return this.ids.has(id);
    }
    add(id, result) {
        if (this.ids.has(id))
            return;
        this.ids.add(id);
        const record = { id, at: new Date().toISOString(), result };
        this.records.push(record);
        mkdirSync(dirname(this.file), { recursive: true });
        appendFileSync(this.file, `${JSON.stringify(record)}\n`);
        this.prune();
    }
    prune() {
        if (this.records.length <= this.max)
            return;
        this.records = this.records.slice(this.records.length - this.max);
        this.ids.clear();
        for (const record of this.records)
            this.ids.add(record.id);
        const body = this.records.map((record) => JSON.stringify(record)).join('\n');
        writeFileSync(this.file, body ? `${body}\n` : '');
    }
}
