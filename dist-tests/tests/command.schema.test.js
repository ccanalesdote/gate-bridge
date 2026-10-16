import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCommand } from '../src/command/command.schema.js';
const now = Date.parse('2026-10-15T12:00:00-04:00');
const ctx = { now, maxSkewMs: 5000, minTtlMs: 0 };
function cmd(overrides = {}) {
    return {
        id: '11111111-1111-4111-8111-111111111111',
        command: 'open',
        issued_at: '2026-10-15T12:00:00-04:00',
        expires_at: '2026-10-15T12:00:10-04:00',
        ...overrides,
    };
}
test('acepta un comando válido', () => {
    const result = validateCommand(cmd(), ctx);
    assert.equal(result.ok, true);
});
test('rechaza comando distinto de open', () => {
    assert.equal(validateCommand(cmd({ command: 'close' }), ctx).ok, false);
});
test('rechaza id no UUID', () => {
    assert.equal(validateCommand(cmd({ id: 'abc' }), ctx).ok, false);
});
test('rechaza vencido', () => {
    const result = validateCommand(cmd(), { ...ctx, now: Date.parse('2026-10-15T12:00:20-04:00') });
    assert.equal(result.ok, false);
});
test('rechaza issued_at futuro fuera de tolerancia', () => {
    const result = validateCommand(cmd(), { ...ctx, now: now - 60_000 });
    assert.equal(result.ok, false);
});
test('rechaza expires_at no posterior a issued_at', () => {
    const result = validateCommand(cmd({ expires_at: '2026-10-15T11:59:59-04:00' }), ctx);
    assert.equal(result.ok, false);
});
test('rechaza campos extra', () => {
    assert.equal(validateCommand(cmd({ extra: 1 }), ctx).ok, false);
});
