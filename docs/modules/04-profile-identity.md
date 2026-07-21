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
- Set avatar/banner from an owned, ready My Pics asset and confirm the exact requested target was applied.
- Display profile cards across the platform.

## Implemented Slice

- Profile schema includes display name, tagline, bio, avatar, banner, location, visibility, and theme metadata.
- Public profile cards render through `ProfileCard`.
- `/profile` redirects signed-in users to their public profile route.
- `/profile/[username]` displays the member profile card or a safe unavailable state.
- `/profile/edit` and `/api/profile` update owner-controlled profile identity.
- `/api/profile/media` accepts a bounded typed request, resolves only the member's exact owned My Pics asset, serializes against deletion/visibility changes, and returns the applied avatar or banner URL.
- Gallery avatar/banner controls validate the response asset, URL, and target field before reporting success. HTML proxy failures, malformed JSON, network errors, and mismatched responses become stable user-facing errors rather than client crashes.

## Access Rules

Profile editing requires ownership. Public/private field visibility must be explicit.

## Integrations

Auth, My Scientology, gallery, friends, groups, mail, chat, auditors.

## Current Design Notes

Use MySpace-inspired personal expression without sacrificing readability or mobile usability.

## Smoke Checklist

- Avatar and banner each update from the exact selected owned My Pics asset.
- Selecting a protected, missing, foreign, or deleting asset fails without changing the profile.
- A malformed, mismatched, HTML, or network response displays a stable error and does not crash the page.
- Successful avatar/banner updates refresh the profile and gallery state cleanly.
- Profile cards render consistently.
