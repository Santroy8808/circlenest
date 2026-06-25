import { EventInvitationStatus, EventModeratorRole, EventRsvpStatus, EventStatus } from "@prisma/client";
import { z } from "zod";

export const createEventSchema = z.object({
  title: z.string().min(2, "Name the event.").max(120),
  summary: z.string().max(180).optional().or(z.literal("")),
  description: z.string().max(3000).optional().or(z.literal("")),
  locationName: z.string().max(180).optional().or(z.literal("")),
  address: z.string().max(280).optional().or(z.literal("")),
  startsAt: z.string().min(1, "Choose a start date and time."),
  endsAt: z.string().optional().or(z.literal(""))
});

export const inviteEventUserSchema = z.object({
  identifier: z.string().min(2, "Search by username, email, or display name.").max(180),
  note: z.string().max(500).optional().or(z.literal(""))
});

export const eventRsvpSchema = z.object({
  status: z.nativeEnum(EventRsvpStatus)
});

export const externalEventRsvpSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(120),
  email: z.string().trim().email("Enter a real email address.").max(180),
  status: z.nativeEnum(EventRsvpStatus).default(EventRsvpStatus.GOING)
});

export type EventPersonView = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
};

export type EventCardView = {
  id: string;
  slug: string;
  title: string;
  summary?: string | null;
  locationName?: string | null;
  startsAt: string;
  endsAt?: string | null;
  status: EventStatus;
  viewerModeratorRole?: EventModeratorRole | null;
  viewerInvitationStatus?: EventInvitationStatus | null;
  viewerRsvpStatus?: EventRsvpStatus | null;
  attendeeCount: number;
  canManage: boolean;
};

export type EventDetailView = EventCardView & {
  description?: string | null;
  address?: string | null;
  creator?: EventPersonView | null;
  moderators: Array<EventPersonView & { role: EventModeratorRole }>;
  invitees: Array<EventPersonView & { status: EventInvitationStatus }>;
  viewerCanRsvp: boolean;
  viewerCanInvite: boolean;
};
