# Launch Checklist

Use this right before and right after a production release.

## Before deploy

- Confirm the dev build passed.
- Confirm the production repo is on the approved commit.
- Confirm the stable point tag exists.
- Confirm the backup bundle exists.
- Confirm the production database schema is in sync.
- Confirm no unapproved local changes are being promoted.

## Railway deploy checks

- Confirm the production service is linked to the production repo `main`.
- Confirm the deploy starts from the approved commit.
- Confirm the build finishes cleanly in Railway.
- Confirm the app returns `200` on the home page and login page.

## Schema checks

- Confirm the Postgres schema matches the app code.
- Confirm Prisma generation succeeded for the Postgres schema.
- Confirm no pending schema drift remains before release.

## Smoke checks

- Login works.
- Signup and invite flow works.
- Feed renders.
- Posts, comments, and replies work.
- Direct messages send.
- Groups, events, Bazaar, jobs, and auditors render.
- Uploads work.
- Admin and moderation gates still behave correctly.
- Tier-gated controls still show locked and enabled states correctly.

## Backup checks

- Confirm the latest stable point tag is present.
- Confirm the latest backup bundle is present.
- Confirm rollback can create a branch from the stable point.

## Log checks

- Check Railway build logs for the release commit.
- Check Railway HTTP logs for 500s on the home page, login, and the main feature pages.
- Check app logs for Prisma or auth errors.

## Rollback path

1. Pick the latest known good stable point.
2. Create a rollback branch from that stable point.
3. Push the rollback branch.
4. Let Railway redeploy it.
5. Re-run the smoke checks.

## After launch

- Record the release commit.
- Record the stable point tag.
- Record the backup bundle path.
- Record any follow-up fixes needed.
