Stable Points + Rollback Runbook

Purpose
- Give us safe rollback checkpoints for code and deployment.
- Keep rollback repeatable for Railway + Neon + R2 stack.

What is a stable point
- A stable point is an annotated git tag named `stable/<name>`.
- It references one exact commit that is known good.

Commands
- Create stable point:
  - `npm run stable:create -- -Name <name> -Note "optional note" -Push`
- List stable points:
  - `npm run stable:list`
- Roll back safely to a new branch from stable point:
  - `npm run stable:rollback -- -Name <name> -CreateBranch`
- Roll back and deploy immediately (same commit):
  - `npm run stable:rollback -- -Name <name> -CreateBranch -Deploy`

Important safety notes
- If your working tree is dirty, stable tag points to HEAD commit only, not uncommitted files.
- Prefer `-CreateBranch` rollback path so current work is not lost.
- `-HardReset` is destructive and should be used only when explicitly intended.

Database rollback (Neon)
1. Before schema changes, create a Neon restore point/branch backup.
2. If app rollback requires DB rollback, restore DB to matching stable-point timestamp.
3. Re-apply app deploy from the same stable point.
4. Run smoke tests: login, feed, media upload/view, comments.

Railway rollback flow
1. Use stable point tag to check out rollback branch.
2. Push rollback branch to GitHub.
3. Let Railway auto-redeploy that commit (or run `railway up --service circlenest`).
4. Confirm environment variables still present for production service.

R2 rollback notes
- Media objects are durable; code rollback does not remove objects.
- If a buggy release wrote bad metadata, run targeted metadata repair script (do not mass-delete bucket).

Recommended release checklist
1. Build passes: `npm run build`
2. Create stable point and push tag.
3. Deploy.
4. Run production smoke tests.
5. If failure, rollback from latest stable point branch and redeploy.
