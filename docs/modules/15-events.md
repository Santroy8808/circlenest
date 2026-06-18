# Events

## Purpose

Support invite-based events with creator and scoped moderator control.

## User-Facing Surfaces

- Events list.
- Event detail.
- Create event wizard.
- Invite/member management.

## Primary Code Areas

- `src/modules/events`
- `src/components/events`
- `src/app/events`

## Data Ownership

- future event, invitation, RSVP, moderator tables.

## Core Workflows

- Create event.
- Invite members.
- Manage scoped moderators.
- Promote through ad system.

## Access Rules

Contributor+ creates events. Invitees and moderators can view. Ads are not embedded inside event listings.

## Integrations

Notifications, ads, production zone, admin, reports.

## Current Design Notes

Events belong under Production Zone for creator tiers and remain invite-based.

## Smoke Checklist

- Free cannot create.
- Event promotion creates normal ad campaign flow only.

