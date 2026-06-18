# Groups

## Purpose

Give members focused community spaces with clear membership and moderation.

## User-Facing Surfaces

- `/groups` directory with Joined, My Groups, and Discover modes.
- Live search that expands to discoverable groups.
- `/groups/create` focused Create Group wizard.
- `/groups/[groupId]` group profile page.

## Primary Code Areas

- `src/modules/groups`
- `src/components/groups`
- `src/app/groups`

## Data Ownership

- `Group`
- `GroupMember`
- `GroupJoinRequest`
- `GroupUserPin`

## Core Workflows

- Browse groups as cards.
- Create group through wizard.
- Join/request join.
- Pin/reorder groups.
- Manage members and roles.
- Click a group card to open its profile.
- Keep forum/media/docs out of the directory until inside a group context.

## Access Rules

Free group caps, Contributor+ role assignment, admins can always inspect groups. Group creation uses the central `groups.create` policy. Public groups can be discovered; private groups are visible to members and admins.

## Integrations

Group forum, group media/docs, events, notifications, reports.

## Current Design Notes

Group pages must keep platform theme consistent and avoid irrelevant tab bars before a group context exists.

Phase 12 intentionally stops at the group shell/profile. Group forum, media, docs, provider uploads, storage caps, and moderator workflows are later modules.

## Smoke Checklist

- Clicking a joined group opens the group profile.
- Create wizard is not open by default.
- Directory cards are whole-card links.
- `/groups/create` is a dedicated wizard page.
- Private groups are not discoverable to non-members, but admins can inspect them.
- Group profile shows overview, moderators, and members without a fake tab bar.
