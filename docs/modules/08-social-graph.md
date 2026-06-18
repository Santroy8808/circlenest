# Social Graph

## Purpose

Model member relationships without confusing friends, contacts, follows, and blocks.

## User-Facing Surfaces

- Friends page.
- Friend cards.
- Requests.
- Suggested people.

## Primary Code Areas

- `src/modules/social-graph`
- `src/components/friends`
- `src/app/friends`

## Data Ownership

- future friend, request, follow, contact, block tables.

## Core Workflows

- Send/accept/deny friend requests.
- Sort friend grid by alphabet, family, interaction, location.
- Maintain contacts separately from friends.
- Block and mute users.

## Access Rules

Users own their relationship tags.

## Integrations

Feed ranking, mail contacts, chat, notifications, profile visibility.

## Current Design Notes

Friends should be visual cards, not administrative request stacks.

## Smoke Checklist

- Friend grid is 4-wide desktop, responsive mobile.
- Contacts do not automatically become friends.

