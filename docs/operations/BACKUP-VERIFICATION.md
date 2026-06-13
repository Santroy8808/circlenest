# Backup Verification

Use this to confirm a backup exists and can be used for rollback.

## Create a stable point

```powershell
npm run stable:create -- -Name <name> -Note "short note" -Push
```

What to confirm:

- The tag is created locally as `stable/<name>`.
- The tag points to the exact commit you want to preserve.
- If `-Push` was used, the tag exists on `origin`.

## List stable points

```powershell
npm run stable:list
```

What to confirm:

- The new tag appears in the list.
- The most recent good tag is still present.

## Confirm the rollback tag resolves

```powershell
git show --no-patch --oneline stable/<name>
```

What to confirm:

- The commit hash matches the intended stable point.
- The message matches the backup note if one was provided.

## Confirm the backup bundle exists

If a backup bundle was created for the release, confirm the file exists in:

```text
C:\Repos\thetansplace\_private\backups\
```

Use PowerShell if you need to check it:

```powershell
Test-Path "C:\Repos\thetansplace\_private\backups\<file>.bundle"
```

## Confirm a restore path exists

Pick the stable tag and verify the rollback command is available:

```powershell
npm run stable:rollback -- -Name <name> -CreateBranch
```

What to confirm:

- A rollback branch can be created from the tag.
- The repo can be checked out at the exact stable commit.

## Safe verification rule

- Use `-CreateBranch` by default.
- Avoid `-HardReset` unless you explicitly intend to discard local changes.
- Do not deploy from a tag until the backup and tag checks are both confirmed.
