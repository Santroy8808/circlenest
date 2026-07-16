import { ConductLocationType, GroupMemberRole, UserRole } from "@prisma/client";
import { prisma } from "@/lib/platform/db";

export function isPlatformModeratorRole(role: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.GOD;
}

export async function canModerateConductLocation(userId: string, locationType: ConductLocationType, groupId?: string | null) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, deactivatedAt: true } });
  if (!user || user.deactivatedAt) return false;
  if (isPlatformModeratorRole(user.role)) return true;
  if (!groupId || !locationType.startsWith("GROUP_")) return false;
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { role: true }
  });
  return membership?.role === GroupMemberRole.OWNER || membership?.role === GroupMemberRole.MODERATOR;
}

export async function canViewConductIncident(userId: string, incidentId: string) {
  const incident = await prisma.conductIncident.findUnique({
    where: { id: incidentId },
    select: {
      subjectAuthorUserId: true,
      groupId: true,
      locationType: true,
      reports: { select: { reporterUserId: true } },
      disputes: { select: { participants: { select: { userId: true } } } }
    }
  });
  if (!incident) return false;
  if (incident.subjectAuthorUserId === userId) return true;
  if (incident.reports.some((report) => report.reporterUserId === userId)) return true;
  if (incident.disputes.some((dispute) => dispute.participants.some((participant) => participant.userId === userId))) return true;
  return canModerateConductLocation(userId, incident.locationType, incident.groupId);
}
