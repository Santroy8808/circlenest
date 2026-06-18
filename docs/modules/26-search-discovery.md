# Search Discovery

## Purpose

Provide unified, privacy-aware search across the private platform.

## User-Facing Surfaces

- Search page at `/search`.
- Inline search boxes for people, groups, market, jobs, auditors.

## Primary Code Areas

- `src/modules/search-discovery`
- `src/components/search`
- `src/app/search`

## Data Ownership

- Query-time discovery service for the rebuild foundation.
- Future search index/materialized views if query volume or relevance tuning requires it.

## Core Workflows

- Search people by allowed profile data.
- Search groups, The Market, jobs, auditors, Writers Corner, and visible feed posts.
- Respect blocks and privacy settings.
- Group results into recognizable buckets instead of one noisy global list.

## Access Rules

Search results only reveal records the viewer may access.

- Private profiles are hidden from non-admin search.
- Blocked users are excluded in either direction.
- Private groups are shown only to members or admins.
- Feed posts are shown only when member-visible, friend-visible to a friend/family relation, authored by the viewer, or admin-visible.
- Active Market listings, active jobs, active auditor profiles, and member-visible manuscripts are searchable.

## Integrations

Profile, social graph, groups, jobs, market, auditors, admin.

## Current Design Notes

Search should support private community discovery, not public web indexing.

The first implementation uses direct PostgreSQL queries and clear service boundaries. A search index can be added later without changing the page contract.

## Smoke Checklist

- Blocked/private users do not leak.
- Results are grouped by type.
- `/search` requires login.
- `/search?q=<term>` renders card groups without changing module pages.
- The dev update page marks Phase 26 ready and leaves production cutover as the next milestone.
