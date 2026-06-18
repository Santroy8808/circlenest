# Production Zone

## Purpose

Organize creator, professional, auditor, and business workflows without cluttering the social control panel.

## User-Facing Surfaces

- Production Zone hub at `/production-zone`.
- Browse section.
- Create section.
- Business Center section.
- Future Production Tools section.

## Primary Code Areas

- `src/modules/production-zone`
- `src/components/production-zone`
- `src/app/production-zone`

## Data Ownership

- Policy-owned view model and module links.
- No primary business data is owned by this module.

## Core Workflows

- Show browse tools for all members.
- Show creator tools by tier.
- Show Business Center for Professional.
- Show locked/blueprint future tools without pretending they are finished.
- Keep forms out of the hub; cards navigate to dedicated pages.

## Access Rules

Driven by membership policy and account capabilities.

## Integrations

Events, Market, Jobs, Auditors, Writers, Fundraisers, Business.

## Current Design Notes

Avoid duplicate "Production Zone" link under the Production Zone heading.

## Smoke Checklist

- Free sees browse tools.
- Contributor sees Contributor creator tools.
- Professional sees Business Center.
- Auditor sees auditor profile tooling.
- Hub remains card/action-first with no raw forms.
