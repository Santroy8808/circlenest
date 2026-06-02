Repo Architecture

Goal
- Keep day-to-day development separate from the production deploy source.
- Make promotion to production deliberate.
- Keep a rollback snapshot every time we cut over production.

Local repo layout
- `C:\Repos\thetansplace\circlenest-dev`
  - Working repo for feature work, fixes, smoke tests, and staging-style iteration.
  - Safe place to branch, experiment, and prepare changes before promotion.
- `C:\Repos\thetansplace\circlenest`
  - Production repo source that Railway watches and deploys from.
  - Only approved/promoted work should land here.

Promotion flow
1. Build and test changes in `circlenest-dev`.
2. Create or update a stable point before promotion.
3. Merge or cherry-pick the approved commit into `circlenest`.
4. Push `main` from the production repo.
5. Let Railway auto-deploy, then smoke test production.

Operating rule
- Edit in Dev: all feature work, fixes, and experiments happen in `circlenest-dev`.
- Backup Prod: before promotion, create a stable point and keep the production bundle backup current.
- Push Dev to Prod: only approved changes move from `circlenest-dev` into `circlenest`.

Rollback and backup flow
- Before risky production changes, create a stable point tag:
  - `npm run stable:create -- -Name <name> -Note "reason" -Push`
- Keep a Git bundle backup in `_private/backups/` for local recovery.
- If rollback is needed, use the stable point tag and the existing rollback script.

Notes
- The Android app repo remains separate from the web repo.
- Web production changes should continue to be committed in the production repo only after approval.
