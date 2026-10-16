import { z } from 'zod';
export const commandSchema = z.strictObject({
    id: z.string().uuid(),
    command: z.literal('open'),
    issued_at: z.string(),
    expires_at: z.string(),
});
function parseInstant(value) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
}
export function validateCommand(raw, ctx) {
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success) {
        return { ok: false, reason: `payload inválido: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ') || 'schema'}` };
    }
    const command = parsed.data;
    const issuedAt = parseInstant(command.issued_at);
    const expiresAt = parseInstant(command.expires_at);
    if (issuedAt === null)
        return { ok: false, reason: 'issued_at inválido' };
    if (expiresAt === null)
        return { ok: false, reason: 'expires_at inválido' };
    if (expiresAt <= issuedAt)
        return { ok: false, reason: 'expires_at no es posterior a issued_at' };
    if (ctx.now >= expiresAt)
        return { ok: false, reason: 'comando vencido' };
    if (issuedAt - ctx.now > ctx.maxSkewMs)
        return { ok: false, reason: 'issued_at en el futuro fuera de tolerancia' };
    if (expiresAt - ctx.now < ctx.minTtlMs)
        return { ok: false, reason: 'comando sin vigencia suficiente' };
    return { ok: true, command };
}
