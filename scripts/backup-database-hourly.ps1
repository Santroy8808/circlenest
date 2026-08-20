param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$BackupRoot = "C:\Backups",
  [int]$KeepBackups = 24,
  [string]$DatabaseUrl = "",
  [string]$PgDumpPath = "",
  [string]$PsqlPath = ""
)

$ErrorActionPreference = "Stop"

$protectedTables = @(
  "AuditLog",
  "AdminAction",
  "PublicAnnouncement",
  "AdCreditLedgerEntry",
  "AdDeliveryLog",
  "AdCampaign",
  "AdDisplayScheduleRun",
  "AdDisplayScheduleSlot",
  "BillingCheckoutIntent",
  "StripeCheckoutFulfillment",
  "StripeWebhookEvent",
  "StripeIntegrationConfig",
  "StripeCreditPackage",
  "PlatformCostRule",
  "SubscriptionPlanRule",
  "FundraiserCampaign",
  "FundLedgerEntry",
  "FundContributionIntent",
  "MailThread",
  "MailMessage",
  "MailRecipient",
  "MailAttachment",
  "MailContact",
  "MailPreference",
  "MailPolicyConfig",
  "MailSenderOptOut",
  "BusinessInquiry",
  "ChatThread",
  "ChatMessage",
  "ChatParticipant",
  "ChatAttachment",
  "EncryptedChatThread",
  "EncryptedChatMessage",
  "EncryptedChatParticipant",
  "EncryptedChatEnvelope"
)

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

function Resolve-PgDump {
  param([string]$ExplicitPath)

  if ($ExplicitPath -and (Test-Path -LiteralPath $ExplicitPath)) {
    return (Resolve-Path -LiteralPath $ExplicitPath).Path
  }

  if ($env:PG_DUMP_PATH -and (Test-Path -LiteralPath $env:PG_DUMP_PATH)) {
    return (Resolve-Path -LiteralPath $env:PG_DUMP_PATH).Path
  }

  $command = Get-Command pg_dump -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidateRoots = @(
    "${env:ProgramFiles}\PostgreSQL",
    "${env:ProgramFiles(x86)}\PostgreSQL"
  )

  foreach ($root in $candidateRoots) {
    if (!$root -or !(Test-Path -LiteralPath $root)) {
      continue
    }

    $candidate = Get-ChildItem -LiteralPath $root -Recurse -Filter pg_dump.exe -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending |
      Select-Object -First 1

    if ($candidate) {
      return $candidate.FullName
    }
  }

  throw "pg_dump.exe was not found. Install PostgreSQL client tools or set PG_DUMP_PATH."
}

function ConvertTo-NativePostgresUrl {
  param([string]$ConnectionString)

  $parts = $ConnectionString.Split("?", 2)
  if ($parts.Count -eq 1) {
    return $ConnectionString
  }

  $prismaOnlyParameters = @("schema", "connection_limit", "pool_timeout", "pgbouncer")
  $nativeParameters = @($parts[1].Split("&") | Where-Object {
    $key = ([uri]::UnescapeDataString(($_.Split("=", 2)[0]))).ToLowerInvariant()
    $prismaOnlyParameters -notcontains $key
  })

  if (!$nativeParameters.Count) {
    return $parts[0]
  }

  return "$($parts[0])?$($nativeParameters -join '&')"
}

function Resolve-Psql {
  param(
    [string]$ExplicitPath,
    [string]$PgDump
  )

  if ($ExplicitPath -and (Test-Path -LiteralPath $ExplicitPath)) {
    return (Resolve-Path -LiteralPath $ExplicitPath).Path
  }

  if ($env:PSQL_PATH -and (Test-Path -LiteralPath $env:PSQL_PATH)) {
    return (Resolve-Path -LiteralPath $env:PSQL_PATH).Path
  }

  $nextToPgDump = Join-Path (Split-Path -Parent $PgDump) "psql.exe"
  if (Test-Path -LiteralPath $nextToPgDump) {
    return (Resolve-Path -LiteralPath $nextToPgDump).Path
  }

  $command = Get-Command psql -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  throw "psql.exe was not found. Install PostgreSQL client tools or set PSQL_PATH."
}

function Invoke-CapturedNativeProcess {
  param(
    [string]$Executable,
    [string[]]$Arguments
  )

  $quotedArguments = @($Arguments | ForEach-Object {
    '"' + $_.Replace('"', '\"') + '"'
  }) -join " "
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $Executable
  $startInfo.Arguments = $quotedArguments
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  if (!$process.Start()) {
    throw "Could not start $Executable."
  }
  $standardOutput = $process.StandardOutput.ReadToEnd()
  $standardError = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  return [pscustomobject]@{
    ExitCode = $process.ExitCode
    StandardOutput = $standardOutput
    StandardError = $standardError
  }
}

function Get-PublicTableNames {
  param(
    [string]$Psql,
    [string]$ConnectionString,
    [string]$LogPath
  )

  $query = "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
  $result = Invoke-CapturedNativeProcess -Executable $Psql -Arguments @("--tuples-only", "--no-align", "--quiet", "--command=$query", $ConnectionString)
  if ($result.ExitCode -ne 0) {
    Add-Content -LiteralPath $LogPath -Value $result.StandardError
    throw "psql failed while reading the current table list with exit code $($result.ExitCode). See $LogPath."
  }

  return @($result.StandardOutput -split "\r?\n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Invoke-PgDump {
  param(
    [string]$PgDump,
    [string[]]$Arguments,
    [string]$LogPath
  )

  $result = Invoke-CapturedNativeProcess -Executable $PgDump -Arguments $Arguments
  if ($result.StandardOutput) {
    Add-Content -LiteralPath $LogPath -Value $result.StandardOutput
  }
  if ($result.StandardError) {
    Add-Content -LiteralPath $LogPath -Value $result.StandardError
  }
  if ($result.ExitCode -ne 0) {
    throw "pg_dump failed with exit code $($result.ExitCode). See $LogPath."
  }
}

function Remove-OldBackups {
  param(
    [string]$Root,
    [int]$Keep
  )

  if ($Keep -lt 1) {
    throw "KeepBackups must be at least 1."
  }

  Get-ChildItem -LiteralPath $Root -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^[0-9]{8}-[0-9]{6}$' } |
    Sort-Object Name -Descending |
    Select-Object -Skip $Keep |
    ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
Import-DotEnvFile -Path (Join-Path $RepoRoot ".env.local")
Import-DotEnvFile -Path (Join-Path $RepoRoot ".env")

if (!$DatabaseUrl) {
  $DatabaseUrl = $env:DATABASE_URL
}

if (!$DatabaseUrl) {
  throw "DATABASE_URL was not provided and was not found in environment files."
}

$pgDump = Resolve-PgDump -ExplicitPath $PgDumpPath
$psql = Resolve-Psql -ExplicitPath $PsqlPath -PgDump $pgDump
$nativeDatabaseUrl = ConvertTo-NativePostgresUrl -ConnectionString $DatabaseUrl
$backupHome = Join-Path $BackupRoot "theta-space"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $backupHome $timestamp
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

$logPath = Join-Path $backupDir "backup.log"
$fullDumpPath = Join-Path $backupDir "theta-space.full.dump"
$protectedDumpPath = Join-Path $backupDir "theta-space.protected-retention.dump"
$manifestPath = Join-Path $backupDir "manifest.json"

Add-Content -LiteralPath $logPath -Value "Theta-Space database backup started $(Get-Date -Format o)"
Add-Content -LiteralPath $logPath -Value "RepoRoot: $RepoRoot"
Add-Content -LiteralPath $logPath -Value "BackupDir: $backupDir"

Invoke-PgDump -PgDump $pgDump -LogPath $logPath -Arguments @(
  "--format=custom",
  "--blobs",
  "--no-owner",
  "--no-privileges",
  "--file=$fullDumpPath",
  $nativeDatabaseUrl
)

$availableTables = Get-PublicTableNames -Psql $psql -ConnectionString $nativeDatabaseUrl -LogPath $logPath
$includedProtectedTables = @($protectedTables | Where-Object { $availableTables -contains $_ })
$skippedProtectedTables = @($protectedTables | Where-Object { $availableTables -notcontains $_ })

if (!$includedProtectedTables.Count) {
  throw "None of the protected-retention tables exist in the current public schema."
}

if ($skippedProtectedTables.Count) {
  Add-Content -LiteralPath $logPath -Value "Skipped protected tables not present in this schema: $($skippedProtectedTables -join ', ')"
}

$protectedArgs = @(
  "--format=custom",
  "--blobs",
  "--no-owner",
  "--no-privileges",
  "--file=$protectedDumpPath"
)

foreach ($table in $includedProtectedTables) {
  $protectedArgs += ('--table=public."{0}"' -f $table)
}
$protectedArgs += $nativeDatabaseUrl

Invoke-PgDump -PgDump $pgDump -LogPath $logPath -Arguments $protectedArgs

$manifest = [ordered]@{
  createdAt = (Get-Date -Format o)
  repoRoot = $RepoRoot
  backupDirectory = $backupDir
  fullDump = (Split-Path -Leaf $fullDumpPath)
  protectedRetentionDump = (Split-Path -Leaf $protectedDumpPath)
  protectedTables = $includedProtectedTables
  skippedProtectedTables = $skippedProtectedTables
  keepBackups = $KeepBackups
  retentionNote = "Hourly backups; keep only the newest $KeepBackups timestamped backups."
}

$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Add-Content -LiteralPath $logPath -Value "Theta-Space database backup completed $(Get-Date -Format o)"

Remove-OldBackups -Root $backupHome -Keep $KeepBackups
