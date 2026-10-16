import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProcessedStore } from '../src/command/processed.store.js';
test('sobrevive reinicios: un id procesado sigue marcado', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-store-'));
    try {
        const file = join(dir, 'processed.jsonl');
        const first = new ProcessedStore(file, 100);
        assert.equal(first.has('a'), false);
        first.add('a', 'simulated');
        assert.equal(first.has('a'), true);
        const second = new ProcessedStore(file, 100);
        assert.equal(second.has('a'), true);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test('no duplica ids repetidos', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-store-'));
    try {
        const file = join(dir, 'processed.jsonl');
        const store = new ProcessedStore(file, 100);
        store.add('a', 'simulated');
        store.add('a', 'sent_to_local_broker');
        const reloaded = new ProcessedStore(file, 100);
        assert.equal(reloaded.has('a'), true);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test('poda ids antiguos', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-store-'));
    try {
        const file = join(dir, 'processed.jsonl');
        const store = new ProcessedStore(file, 2);
        store.add('a', 'x');
        store.add('b', 'x');
        store.add('c', 'x');
        const reloaded = new ProcessedStore(file, 2);
        assert.equal(reloaded.has('a'), false);
        assert.equal(reloaded.has('b'), true);
        assert.equal(reloaded.has('c'), true);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
