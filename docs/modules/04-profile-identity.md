# Profile Identity

## Purpose

Represent the member as a person inside the private network.

## User-Facing Surfaces

- Profile page, avatar/banner, bio, resume links, profile cards, identity settings.

## Primary Code Areas

- `src/modules/profile-identity`
- `src/components/profile`
- `src/app/profile`

## Data Ownership

- `Profile`
- `MediaAsset`

## Core Workflows

- View profile.
- Edit public identity.
- Set avatar/banner from My Pics.
- Display profile cards across the platform.

## Implemented Slice

- Profile schema includes display name, tagline, bio, avatar, banner, location, visibility, and theme metadata.
- Public profile cards render through `ProfileCard`.
- `/profile` redirects signed-in users to their public profile route.
- `/profile/[username]` displays the member profile card or a safe unavailable state.
- `/profile/edit` and `/api/profile` update owner-controlled profile identity.

## Access Rules

Profile editing requires ownership. Public/private field visibility must be explicit.

## Integrations

Auth, My Scientology, gallery, friends, groups, mail, chat, auditors.

## Current Design Notes

Use MySpace-inspired personal expression without sacrificing readability or mobile usability.

## Smoke Checklist

- Avatar/banner update immediately.
- Profile cards render consistently.
