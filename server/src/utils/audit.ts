import { prisma } from '../config/prisma.js';

export const writeAudit = async (params: {
  actorId?: string;
  action: string;
  targetEntity: string;
  targetId?: string;
  outcome: string;
  metadata?: Record<string, unknown>;
}): Promise<void> => {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      targetEntity: params.targetEntity,
      targetId: params.targetId,
      outcome: params.outcome,
      metadata: params.metadata ? JSON.stringify(params.metadata) : undefined
    }
  });
};
