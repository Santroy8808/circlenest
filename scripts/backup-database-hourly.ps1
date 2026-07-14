param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$BackupRoot = "C:\Backups",
  [int]$KeepBackups = 24,
  [string]$DatabaseUrl = "",
  [string]$PgDumpPath = ""
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

function Invoke-PgDump {
  param(
    [string]$PgDump,
    [string[]]$Arguments,
    [string]$LogPath
  )

  $output = & $PgDump @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  if ($output) {
    Add-Content -LiteralPath $LogPath -Value $output
  }
  if ($exitCode -ne 0) {
    throw "pg_dump failed with exit code $exitCode. See $LogPath."
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
  $DatabaseUrl
)

$protectedArgs = @(
  "--format=custom",
  "--blobs",
  "--no-owner",
  "--no-privileges",
  "--file=$protectedDumpPath"
)

foreach ($table in $protectedTables) {
  $protectedArgs += "--table=public.`"$table`""
}
$protectedArgs += $DatabaseUrl

Invoke-PgDump -PgDump $pgDump -LogPath $logPath -Arguments $protectedArgs

$manifest = [ordered]@{
  createdAt = (Get-Date -Format o)
  repoRoot = $RepoRoot
  backupDirectory = $backupDir
  fullDump = (Split-Path -Leaf $fullDumpPath)
  protectedRetentionDump = (Split-Path -Leaf $protectedDumpPath)
  protectedTables = $protectedTables
  keepBackups = $KeepBackups
  retentionNote = "Hourly backups; keep only the newest 24 backups by default."
}

$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Add-Content -LiteralPath $logPath -Value "Theta-Space database backup completed $(Get-Date -Format o)"

Remove-OldBackups -Root $backupHome -Keep $KeepBackups
