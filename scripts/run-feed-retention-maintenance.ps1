param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$AppOrigin = "",
  [string]$LogRoot = "C:\Logs\ThetaSpace",
  [int]$TimeoutSeconds = 900
)

$ErrorActionPreference = "Stop"

function Import-DotEnvFile {
  param([string]$Path)

  if (!(Test-Path -LiteralPath $Path)) {
    return
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (!$line -or $line.StartsWith("#") -or !$line.Contains("=")) {
      return
    }

    $key, $value = $line.Split("=", 2)
    $key = $key.Trim()
    $value = $value.Trim()

    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    if ($key -and !(Test-Path "Env:\$key")) {
      Set-Item -Path "Env:\$key" -Value $value
    }
  }
}

function Write-JobLog {
  param(
    [string]$Path,
    [string]$Message
  )

  Add-Content -LiteralPath $Path -Value "$(Get-Date -Format o) $Message"
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
Import-DotEnvFile -Path (Join-Path $RepoRoot ".env.local")
Import-DotEnvFile -Path (Join-Path $RepoRoot ".env")

$secret = $env:MAINTENANCE_JOB_SECRET
if (!$secret -or $secret.Length -lt 32) {
  throw "MAINTENANCE_JOB_SECRET must be present and at least 32 characters."
}

if (!$AppOrigin) {
  $AppOrigin = $env:APP_ORIGIN
}
if (!$AppOrigin) {
  $AppOrigin = $env:NEXTAUTH_URL
}
if (!$AppOrigin) {
  $AppOrigin = "https://theta-space.net"
}

$endpoint = "$($AppOrigin.TrimEnd('/'))/api/internal/maintenance/feed-retention"
New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null
$logPath = Join-Path $LogRoot "feed-retention-maintenance.log"

Write-JobLog -Path $logPath -Message "Starting stream retention maintenance against $endpoint"

try {
  $response = Invoke-RestMethod `
    -Uri $endpoint `
    -Method Post `
    -Headers @{ Authorization = "Bearer $secret" } `
    -TimeoutSec $TimeoutSeconds

  Write-JobLog -Path $logPath -Message "Completed stream retention maintenance: $($response | ConvertTo-Json -Compress -Depth 8)"
} catch {
  Write-JobLog -Path $logPath -Message "FAILED stream retention maintenance: $($_.Exception.Message)"
  throw
}
