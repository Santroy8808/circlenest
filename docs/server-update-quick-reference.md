# Server Update Quick Reference

## Standing push rule

When the user explicitly says `push`, do both steps:

1. Push the current local repo changes to GitHub `main`.
2. Immediately initiate an interactive SSH session to the production Windows server and pull/restart from there.

Do not stop after the GitHub push unless the user explicitly says GitHub-only.

## Production server

- Host: `207.188.9.139`
- SSH user: `codexadmin`
- App location: `S:\Workspace\circlenest`
- Public site: `https://theta-space.net`
- App port behind Caddy: `3000`

## SSH tool

Use Windows OpenSSH from this laptop with the dedicated Theta-Space server key:

```powershell
ssh -i $env:USERPROFILE\.ssh\id_rsa_theta_space_server codexadmin@207.188.9.139
```

Verified tool path:

```text
C:\WINDOWS\System32\OpenSSH\ssh.exe
```

Bootstrap/helper tool used for password-based setup when key auth is broken: Python `paramiko`.

Do not use `plink` unless the user specifically asks for it. Do not store the server password in this file.

## Server-side update checklist

After SSH login:

```powershell
Set-Location S:\Workspace\circlenest
git pull origin main
npm install
npm run build
```

Then restart the production app service/process used on the server and verify:

```powershell
curl.exe http://localhost:3000/health/live
curl.exe http://localhost/health/live
```

If `npm` is not recognized, fix the server PATH for Node.js before rebuilding.
