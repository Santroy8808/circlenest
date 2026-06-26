import {
  EventInvitationStatus,
  EventModeratorRole,
  EventRsvpStatus,
  EventStatus,
  Prisma,
  UserRole
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { isAdminRole } from "@/lib/platform/roles";
import { sendSmtpMail } from "@/lib/platform/smtp";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import {
  createEventSchema,
  externalEventRsvpSchema,
  eventRsvpSchema,
  inviteEventUserSchema,
  type EventCardView,
  type EventDetailView,
  type EventPersonView
} from "@/modules/events/types";

const MODULE_KEY = "events";
const EVENTS_DB_TIMEOUT_MS = 2500;

function withEventsDbTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out`)), EVENTS_DB_TIMEOUT_MS);
    })
  ]);
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function uniqueEventSlug(title: string) {
  const base = slugify(title) || "event";
  let candidate = base;
  let index = 2;

  while (await prisma.event.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

function profileName(user: { username: string; profile: { displayName: string | null } | null }) {
  return user.profile?.displayName ?? user.username;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function personView(user: {
  id: string;
  username: string;
  profile: { displayName: string | null; avatarUrl: string | null } | null;
}): EventPersonView {
  return {
    id: user.id,
    username: user.username,
    displayName: profileName(user),
    avatarUrl: user.profile?.avatarUrl
  };
}

async function getViewerRole(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  return user?.role ?? UserRole.MEMBER;
}

async function viewerCanCreateEvent(userId: string) {
  const role = await getViewerRole(userId);
  if (isAdminRole(role)) return true;

  const access = await canUserAccessFeature(userId, "events.create");
  return access.allowed;
}

function parseEventDates(startsAtValue: string, endsAtValue?: string | null) {
  const startsAt = new Date(startsAtValue);
  const endsAt = endsAtValue ? new Date(endsAtValue) : null;

  if (Number.isNaN(startsAt.getTime())) {
    return { ok: false as const, error: "Choose a valid start date and time." };
  }

  if (endsAt && Number.isNaN(endsAt.getTime())) {
    return { ok: false as const, error: "Choose a valid end date and time." };
  }

  if (endsAt && endsAt <= startsAt) {
    return { ok: false as const, error: "The event end must be after the start." };
  }

  return { ok: true as const, startsAt, endsAt };
}

function canManageEvent(
  viewerUserId: string,
  viewerRole: UserRole,
  event: { createdByUserId: string | null; moderators: Array<{ userId: string }> }
) {
  return isAdminRole(viewerRole) || event.createdByUserId === viewerUserId || event.moderators.some((item) => item.userId === viewerUserId);
}

function canViewEvent(
  viewerUserId: string,
  viewerRole: UserRole,
  event: {
    createdByUserId: string | null;
    moderators: Array<{ userId: string }>;
    invitations: Array<{ inviteeUserId: string }>;
    rsvps: Array<{ userId: string | null }>;
  }
) {
  return (
    isAdminRole(viewerRole) ||
    event.createdByUserId === viewerUserId ||
    event.moderators.some((item) => item.userId === viewerUserId) ||
    event.invitations.some((item) => item.inviteeUserId === viewerUserId) ||
    event.rsvps.some((item) => item.userId === viewerUserId)
  );
}

type EventCardPayload = Prisma.EventGetPayload<{
  include: {
    moderators: true;
    invitations: true;
    rsvps: true;
    _count: { select: { rsvps: true } };
  };
}>;

function toEventCardView(viewerUserId: string, viewerRole: UserRole, event: EventCardPayload): EventCardView {
  const viewerModerator = event.moderators.find((item) => item.userId === viewerUserId);
  const viewerInvitation = event.invitations.find((item) => item.inviteeUserId === viewerUserId);
  const viewerRsvp = event.rsvps.find((item) => item.userId === viewerUserId);

  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    summary: event.summary,
    locationName: event.locationName,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt?.toISOString(),
    status: event.status,
    viewerModeratorRole: viewerModerator?.role ?? null,
    viewerInvitationStatus: viewerInvitation?.status ?? null,
    viewerRsvpStatus: viewerRsvp?.status ?? null,
    attendeeCount: event._count.rsvps,
    canManage: canManageEvent(viewerUserId, viewerRole, event)
  };
}

async function findUserByIdentifier(identifier: string) {
  const clean = identifier.trim();

  return prisma.user.findFirst({
    where: {
      deactivatedAt: null,
      OR: [
        { email: { equals: clean, mode: "insensitive" } },
        { username: { equals: clean.replace(/^@/, ""), mode: "insensitive" } },
        {
          profile: {
            displayName: {
              contains: clean,
              mode: "insensitive"
            }
          }
        }
      ]
    },
    include: {
      profile: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });
}

async function getEventContext(viewerUserId: string, eventIdOrSlug: string) {
  const [viewerRole, event] = await Promise.all([
    getViewerRole(viewerUserId),
    prisma.event.findFirst({
      where: {
        OR: [{ id: eventIdOrSlug }, { slug: eventIdOrSlug }]
      },
      include: {
        createdBy: {
          include: {
            profile: true
          }
        },
        moderators: {
          include: {
            user: {
              include: {
                profile: true
              }
            }
          }
        },
        invitations: {
          include: {
            invitee: {
              include: {
                profile: true
              }
            }
          }
        },
        rsvps: true,
        _count: {
          select: {
            rsvps: true
          }
        }
      }
    })
  ]);

  if (!event) return null;

  return {
    viewerRole,
    event,
    canView: canViewEvent(viewerUserId, viewerRole, event),
    canManage: canManageEvent(viewerUserId, viewerRole, event)
  };
}

export async function listEvents(viewerUserId: string) {
  const [viewerRole, canCreate] = await Promise.all([getViewerRole(viewerUserId), viewerCanCreateEvent(viewerUserId)]);
  const where =
    isAdminRole(viewerRole)
      ? {}
      : {
          OR: [
            { createdByUserId: viewerUserId },
            { moderators: { some: { userId: viewerUserId } } },
            { invitations: { some: { inviteeUserId: viewerUserId, status: { not: EventInvitationStatus.CANCELED } } } },
            { rsvps: { some: { userId: viewerUserId } } }
          ]
        };

  const events = await withEventsDbTimeout(
    prisma.event.findMany({
      where,
      include: {
        moderators: true,
        invitations: {
          where: {
            inviteeUserId: viewerUserId
          }
        },
        rsvps: {
          where: {
            userId: viewerUserId
          }
        },
        _count: {
          select: {
            rsvps: true
          }
        }
      },
      orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
      take: 60
    }),
    "event list lookup"
  );

  return {
    ok: true as const,
    events: events.map((event) => toEventCardView(viewerUserId, viewerRole, event)),
    viewerCanCreate: canCreate
  };
}

export async function safeListEvents(viewerUserId: string) {
  try {
    return await listEvents(viewerUserId);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list events.", {
      viewerUserId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: true as const, events: [], viewerCanCreate: false };
  }
}

export async function createEvent(viewerUserId: string, input: unknown) {
  const parsed = createEventSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid event." };
  }

  const canCreate = await viewerCanCreateEvent(viewerUserId);

  if (!canCreate) {
    return { ok: false as const, error: "Professional access is required to create events." };
  }

  const parsedDates = parseEventDates(parsed.data.startsAt, parsed.data.endsAt);

  if (!parsedDates.ok) {
    return { ok: false as const, error: parsedDates.error };
  }

  const slug = await uniqueEventSlug(parsed.data.title);
  const event = await prisma.event.create({
    data: {
      slug,
      title: parsed.data.title,
      summary: parsed.data.summary || null,
      description: parsed.data.description || null,
      locationName: parsed.data.locationName || null,
      address: parsed.data.address || null,
      startsAt: parsedDates.startsAt,
      endsAt: parsedDates.endsAt,
      createdByUserId: viewerUserId,
      moderators: {
        create: {
          userId: viewerUserId,
          role: EventModeratorRole.OWNER
        }
      },
      rsvps: {
        create: {
          userId: viewerUserId,
          status: EventRsvpStatus.GOING
        }
      }
    }
  });

  await diagnostics.info(MODULE_KEY, "Event created.", {
    viewerUserId,
    eventId: event.id
  });

  return { ok: true as const, event };
}

export async function getEventDetail(viewerUserId: string, eventIdOrSlug: string) {
  const context = await getEventContext(viewerUserId, eventIdOrSlug);

  if (!context?.canView) {
    return { ok: false as const, error: "Event not found." };
  }

  const card = toEventCardView(viewerUserId, context.viewerRole, {
    ...context.event,
    invitations: context.event.invitations.filter((invitation) => invitation.inviteeUserId === viewerUserId),
    moderators: context.event.moderators,
    rsvps: context.event.rsvps.filter((rsvp) => rsvp.userId === viewerUserId)
  });
  const detail: EventDetailView = {
    ...card,
    description: context.event.description,
    address: context.event.address,
    creator: context.event.createdBy ? personView(context.event.createdBy) : null,
    moderators: context.event.moderators.map((moderator) => ({
      ...personView(moderator.user),
      role: moderator.role
    })),
    invitees: context.event.invitations.slice(0, 30).map((invitation) => ({
      ...personView(invitation.invitee),
      status: invitation.status
    })),
    viewerCanRsvp: context.event.status === EventStatus.PUBLISHED,
    viewerCanInvite: context.canManage && context.event.status === EventStatus.PUBLISHED
  };

  return { ok: true as const, event: detail };
}

export async function safeGetEventDetail(viewerUserId: string, eventIdOrSlug: string) {
  try {
    return await getEventDetail(viewerUserId, eventIdOrSlug);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not load event detail.", {
      viewerUserId,
      eventIdOrSlug,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Could not load event." };
  }
}

export async function inviteUserToEvent(viewerUserId: string, eventIdOrSlug: string, input: unknown) {
  const parsed = inviteEventUserSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid invite." };
  }

  const context = await getEventContext(viewerUserId, eventIdOrSlug);

  if (!context?.canManage || context.event.status !== EventStatus.PUBLISHED) {
    return { ok: false as const, error: "Only event creators and moderators can invite members." };
  }

  const target = await findUserByIdentifier(parsed.data.identifier);

  if (!target) {
    return { ok: false as const, error: "Could not find that member." };
  }

  const invitation = await prisma.eventInvitation.upsert({
    where: {
      eventId_inviteeUserId: {
        eventId: context.event.id,
        inviteeUserId: target.id
      }
    },
    update: {
      status: EventInvitationStatus.PENDING,
      note: parsed.data.note || null,
      invitedByUserId: viewerUserId
    },
    create: {
      eventId: context.event.id,
      inviteeUserId: target.id,
      invitedByUserId: viewerUserId,
      note: parsed.data.note || null
    }
  });

  await diagnostics.info(MODULE_KEY, "Event invitation sent.", {
    viewerUserId,
    eventId: context.event.id,
    inviteeUserId: target.id
  });

  return { ok: true as const, invitation };
}

export async function setEventRsvp(viewerUserId: string, eventIdOrSlug: string, input: unknown) {
  const parsed = eventRsvpSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid RSVP." };
  }

  const context = await getEventContext(viewerUserId, eventIdOrSlug);

  if (!context?.canView || context.event.status !== EventStatus.PUBLISHED) {
    return { ok: false as const, error: "Event not found." };
  }

  const rsvp = await prisma.eventRsvp.upsert({
    where: {
      eventId_userId: {
        eventId: context.event.id,
        userId: viewerUserId
      }
    },
    update: {
      status: parsed.data.status
    },
    create: {
      eventId: context.event.id,
      userId: viewerUserId,
      status: parsed.data.status
    }
  });

  await prisma.eventInvitation.updateMany({
    where: {
      eventId: context.event.id,
      inviteeUserId: viewerUserId
    },
    data: {
      status: parsed.data.status === EventRsvpStatus.DECLINED ? EventInvitationStatus.DECLINED : EventInvitationStatus.ACCEPTED
    }
  });

  await diagnostics.info(MODULE_KEY, "Event RSVP updated.", {
    viewerUserId,
    eventId: context.event.id,
    status: rsvp.status
  });

  return { ok: true as const, rsvp };
}

export async function submitExternalEventRsvp(eventIdOrSlug: string, input: unknown) {
  const parsed = externalEventRsvpSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid RSVP." };
  }

  const event = await prisma.event.findFirst({
    where: {
      OR: [{ id: eventIdOrSlug }, { slug: eventIdOrSlug }],
      status: EventStatus.PUBLISHED
    },
    select: {
      id: true,
      slug: true,
      title: true,
      startsAt: true,
      locationName: true,
      createdByUserId: true
    }
  });

  if (!event) {
    return { ok: false as const, error: "Event not found." };
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const existing = await prisma.eventRsvp.findUnique({
    where: {
      eventId_externalEmail: {
        eventId: event.id,
        externalEmail: normalizedEmail
      }
    },
    select: {
      id: true
    }
  });
  const rsvp = await prisma.eventRsvp.upsert({
    where: {
      eventId_externalEmail: {
        eventId: event.id,
        externalEmail: normalizedEmail
      }
    },
    update: {
      externalName: parsed.data.name,
      status: parsed.data.status
    },
    create: {
      eventId: event.id,
      externalName: parsed.data.name,
      externalEmail: normalizedEmail,
      status: parsed.data.status
    }
  });

  try {
    await sendSmtpMail({
      to: normalizedEmail,
      subject: `Theta-Space RSVP confirmation: ${event.title}`,
      text: [
        `Your RSVP for ${event.title} has been recorded as ${parsed.data.status}.`,
        "",
        `When: ${event.startsAt.toLocaleString()}`,
        event.locationName ? `Where: ${event.locationName}` : "Where: Location TBD"
      ].join("\n"),
      html: `<p>Your RSVP for <strong>${escapeHtml(event.title)}</strong> has been recorded as <strong>${parsed.data.status}</strong>.</p><p><strong>When:</strong> ${event.startsAt.toLocaleString()}</p><p><strong>Where:</strong> ${escapeHtml(event.locationName ?? "Location TBD")}</p>`
    });

    await prisma.eventRsvp.update({
      where: { id: rsvp.id },
      data: { confirmationSentAt: new Date() }
    });
  } catch (error) {
    await diagnostics.warn(MODULE_KEY, "External event RSVP confirmation email failed.", {
      eventId: event.id,
      externalEmail: normalizedEmail,
      error: error instanceof Error ? error.message : "unknown"
    });
  }

  if (event.createdByUserId) {
    await prisma.notification.create({
      data: {
        userId: event.createdByUserId,
        title: `New RSVP for ${event.title}`,
        body: `${parsed.data.name} RSVP'd ${parsed.data.status}.`,
        href: `/events/${event.slug}`
      }
    });
  }

  await diagnostics.info(MODULE_KEY, "External event RSVP recorded.", {
    eventId: event.id,
    externalEmail: normalizedEmail,
    status: rsvp.status
  });

  return { ok: true as const, rsvp, created: !existing };
}

export async function addEventModerator(viewerUserId: string, eventIdOrSlug: string, input: unknown) {
  const parsed = inviteEventUserSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid moderator." };
  }

  const context = await getEventContext(viewerUserId, eventIdOrSlug);

  if (!context?.canManage) {
    return { ok: false as const, error: "Only event creators and moderators can add moderators." };
  }

  const target = await findUserByIdentifier(parsed.data.identifier);

  if (!target) {
    return { ok: false as const, error: "Could not find that member." };
  }

  const moderator = await prisma.eventModerator.upsert({
    where: {
      eventId_userId: {
        eventId: context.event.id,
        userId: target.id
      }
    },
    update: {
      role: EventModeratorRole.MODERATOR
    },
    create: {
      eventId: context.event.id,
      userId: target.id,
      role: EventModeratorRole.MODERATOR
    }
  });

  await prisma.eventInvitation.upsert({
    where: {
      eventId_inviteeUserId: {
        eventId: context.event.id,
        inviteeUserId: target.id
      }
    },
    update: {
      status: EventInvitationStatus.ACCEPTED,
      invitedByUserId: viewerUserId
    },
    create: {
      eventId: context.event.id,
      inviteeUserId: target.id,
      invitedByUserId: viewerUserId,
      status: EventInvitationStatus.ACCEPTED
    }
  });

  await diagnostics.info(MODULE_KEY, "Event moderator added.", {
    viewerUserId,
    eventId: context.event.id,
    moderatorUserId: target.id
  });

  return { ok: true as const, moderator };
}

export async function cancelEvent(viewerUserId: string, eventIdOrSlug: string) {
  const context = await getEventContext(viewerUserId, eventIdOrSlug);

  if (!context?.canManage) {
    return { ok: false as const, error: "Only event creators and moderators can cancel events." };
  }

  const event = await prisma.event.update({
    where: {
      id: context.event.id
    },
    data: {
      status: EventStatus.CANCELED
    }
  });

  await diagnostics.warn(MODULE_KEY, "Event canceled.", {
    viewerUserId,
    eventId: event.id
  });

  return { ok: true as const, event };
}
