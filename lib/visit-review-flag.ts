import { prisma } from "@/lib/prisma";

/**
 * Keeps a visit's "Needs follow-up" flag in step with the Action it created. Called from the Action
 * Registry when that action is signed off (→ flag resolved) or re-opened (→ flag raised again). Each
 * transition writes an immutable VisitReviewRevision. Plain module (not "use server") so these are not
 * exposed as client-callable actions.
 */
type Actor = { name: string | null; code: string | null };

export async function resolveReviewFlagsForAction(actionId: number, actor: Actor, role: string): Promise<void> {
  const visits = await prisma.visit.findMany({
    where: { reviewFlagActionId: actionId, reviewFlagged: true },
    select: { id: true, reviewNote: true, reviewRating: true },
  });
  for (const v of visits) {
    await prisma.$transaction([
      prisma.visit.update({ where: { id: v.id }, data: { reviewFlagged: false, reviewFlagResolvedAt: new Date() } }),
      prisma.visitReviewRevision.create({
        data: {
          visitId: v.id, action: "FLAG_RESOLVED", note: v.reviewNote, rating: v.reviewRating, flagged: false,
          flagActionId: actionId, actorName: actor.name, actorCode: actor.code, actorRole: role,
        },
      }),
    ]);
  }
}

export async function reopenReviewFlagsForAction(actionId: number, actor: Actor, role: string): Promise<void> {
  const visits = await prisma.visit.findMany({
    where: { reviewFlagActionId: actionId, reviewFlagged: false },
    select: { id: true, reviewNote: true, reviewRating: true },
  });
  for (const v of visits) {
    await prisma.$transaction([
      prisma.visit.update({ where: { id: v.id }, data: { reviewFlagged: true, reviewFlagResolvedAt: null } }),
      prisma.visitReviewRevision.create({
        data: {
          visitId: v.id, action: "FLAG_REOPENED", note: v.reviewNote, rating: v.reviewRating, flagged: true,
          flagActionId: actionId, actorName: actor.name, actorCode: actor.code, actorRole: role,
        },
      }),
    ]);
  }
}
