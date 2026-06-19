# Events

## Purpose

Support invite-based events with creator and scoped moderator control.

## User-Facing Surfaces

- Events list at `/events`.
- Event detail at `/events/[eventId]`.
- Create event wizard at `/events/create`.
- Invite, RSVP, moderator, and cancel controls on event detail.

## Primary Code Areas

- `src/modules/events`
- `src/components/events`
- `src/app/events`

## Data Ownership

- `Event` owns the event shell.
- `EventModerator` owns scoped event moderation.
- `EventInvitation` owns invite-based access.
- `EventRsvp` owns RSVP state.

## Core Workflows

- Create event with title, time, location, and notes.
- Event creator starts as owner/moderator and RSVP `GOING`.
- Invite members by username, email, or display name.
- Add scoped event moderators.
- RSVP `GOING`, `MAYBE`, or `DECLINED`.
- Cancel events without deleting records.
- Promote through ad system later; ads are not embedded in event listings.

## Access Rules

- Professional or Admin can create events.
- Creators and scoped moderators can invite members and manage the event.
- Invitees, RSVP users, creators, moderators, and Admin can view.
- Ads are not embedded inside event listings.

## Integrations

- Membership policy.
- Notifications later.
- Ads handoff later.
- Production Zone later.
- Admin/moderation later.

## Current Design Notes

Events belong under Production Zone for creator tiers and remain invite-based. This phase builds the event foundation before the final Production Zone hub module.

## Smoke Checklist

- Free cannot create.
- Contributor and Auditor cannot create.
- Professional can create.
- Event creator can invite members.
- Event creator can add scoped moderators.
- Invitee can RSVP.
- Event promotion links to ad handoff notes only; no embedded ads appear inside event details.
