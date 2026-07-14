param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$TaskName = "Theta-Space Stream Retention Maintenance",
  [int]$IntervalMinutes = 60,
  [int]$StartDelayMinutes = 10,
  [string]$AppOrigin = "",
  [string]$LogRoot = "S:\Logs\ThetaSpace",
  [string]$RunAsUser = "",
  [switch]$RunNow
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$maintenanceScript = Join-Path $RepoRoot "scripts\run-feed-retention-maintenance.ps1"

if (!(Test-Path -LiteralPath $maintenanceScript)) {
  throw "Maintenance script was not found: $maintenanceScript"
}

if ($IntervalMinutes -lt 15) {
  throw "IntervalMinutes must be at least 15."
}

New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null

$argumentParts = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$maintenanceScript`"",
  "-RepoRoot", "`"$RepoRoot`"",
  "-LogRoot", "`"$LogRoot`""
)

if ($AppOrigin) {
  $argumentParts += @("-AppOrigin", "`"$AppOrigin`"")
}

$argument = $argumentParts -join " "
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argument
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes($StartDelayMinutes) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable

$description = "Runs Theta-Space public stream retention: image compression, archive, deletion, and admin-hold exclusion."

if ($RunAsUser) {
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -User $RunAsUser `
    -Description $description `
    -Force | Out-Null
} else {
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description $description `
    -Force | Out-Null
}

if ($RunNow) {
  Start-ScheduledTask -TaskName $TaskName
}

Write-Host "Installed scheduled task: $TaskName"
Write-Host "Maintenance script: $maintenanceScript"
Write-Host "Interval minutes: $IntervalMinutes"
Write-Host "Log root: $LogRoot"
