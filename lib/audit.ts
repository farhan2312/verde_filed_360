import { prisma } from "./prisma";
import { getActor } from "./scope";

/**
 * Append one row to the audit trail (the Audit Log page + the Overall dashboard read this).
 * Never throws — auditing must not block or fail the write it records.
 *
 * `action` vocabulary: CREATE | UPDATE | DELETE | SEND | IMPORT | CONFIG | EXPORT.
 * `entity` is the area: Visit | Farmer | Campaign | SMS | WhatsApp | Broadcast | Setting | Sale …
 * Pass `actorName` when the caller already knows the real user (saves a lookup); otherwise it is
 * resolved via getActor() (the actual logged-in user, never an impersonated persona).
 */
export async function logAudit(entity: string, action: string, detail: string, actorName?: string): Promise<void> {
  try {
    const actor = actorName ?? (await getActor()).name;
    await prisma.auditLog.create({ data: { actor: actor || null, action, entity, detail: detail.slice(0, 500) } });
  } catch {
    // swallow — the audit trail is best-effort
  }
}
