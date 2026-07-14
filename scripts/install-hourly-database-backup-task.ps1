param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$BackupRoot = "C:\Backups",
  [int]$KeepBackups = 24,
  [string]$TaskName = "Theta-Space Hourly Database Backup",
  [string]$RunAsUser = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$backupScript = Join-Path $RepoRoot "scripts\backup-database-hourly.ps1"

if (!(Test-Path -LiteralPath $backupScript)) {
  throw "Backup script was not found: $backupScript"
}

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

$argument = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$backupScript`"",
  "-RepoRoot", "`"$RepoRoot`"",
  "-BackupRoot", "`"$BackupRoot`"",
  "-KeepBackups", $KeepBackups
) -join " "

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argument
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(5) `
  -RepetitionInterval (New-TimeSpan -Hours 1) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable

if ($RunAsUser) {
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -User $RunAsUser `
    -Description "Backs up Theta-Space PostgreSQL database and protected ledgers/audit logs hourly to $BackupRoot. Keeps newest $KeepBackups backups." `
    -Force | Out-Null
} else {
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Backs up Theta-Space PostgreSQL database and protected ledgers/audit logs hourly to $BackupRoot. Keeps newest $KeepBackups backups." `
    -Force | Out-Null
}

Write-Host "Installed scheduled task: $TaskName"
Write-Host "Backup script: $backupScript"
Write-Host "Backup root: $BackupRoot"
