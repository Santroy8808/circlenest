# Groups

## Purpose

Give members focused community spaces with clear membership and moderation.

## User-Facing Surfaces

- Groups directory.
- Joined/My Groups toggle.
- Create Group wizard.
- Group profile page.

## Primary Code Areas

- `src/modules/groups`
- `src/components/groups`
- `src/app/groups`

## Data Ownership

- future group, group member, join request, group preference tables.

## Core Workflows

- Browse groups as cards.
- Create group through wizard.
- Join/request join.
- Pin/reorder groups.
- Manage members and roles.

## Access Rules

Free group caps, Contributor+ role assignment, admins can always inspect groups.

## Integrations

Group forum, group media/docs, events, notifications, reports.

## Current Design Notes

Group pages must keep platform theme consistent and avoid irrelevant tab bars before a group context exists.

## Smoke Checklist

- Clicking a joined group opens the group profile.
- Create wizard is not open by default.

