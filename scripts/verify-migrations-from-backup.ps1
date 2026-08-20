param(
  [Parameter(Mandatory = $true)]
  [string]$CandidateRepoRoot,
  [Parameter(Mandatory = $true)]
  [string]$BackupDirectory,
  [string]$WorkRoot = "S:\Backups\theta-space",
  [string]$PrismaExecutable = "S:\Workspace\circlenest\node_modules\.bin\prisma.cmd",
  [int]$VerificationPort = 55432
)

$ErrorActionPreference = "Stop"

function Resolve-PostgresBin {
  foreach ($root in @("${env:ProgramFiles}\PostgreSQL", "${env:ProgramFiles(x86)}\PostgreSQL")) {
    if (!$root -or !(Test-Path -LiteralPath $root)) {
      continue
    }
    $candidate = Get-ChildItem -LiteralPath $root -Recurse -Filter pg_restore.exe -ErrorAction SilentlyContinue |
      Where-Object {
        $bin = Split-Path -Parent $_.FullName
        (Test-Path -LiteralPath (Join-Path $bin "initdb.exe")) -and
          (Test-Path -LiteralPath (Join-Path $bin "pg_ctl.exe")) -and
          (Test-Path -LiteralPath (Join-Path $bin "psql.exe"))
      } |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($candidate) {
      return Split-Path -Parent $candidate.FullName
    }
  }
  throw "PostgreSQL verification tools were not found."
}

function Invoke-Checked {
  param(
    [string]$Executable,
    [string[]]$Arguments,
    [string]$Operation
  )

  $output = & $Executable @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "$Operation failed with exit code $LASTEXITCODE.`n$($output -join "`n")"
  }
  return $output
}

function Invoke-CheckedProcess {
  param(
    [string]$Executable,
    [string[]]$Arguments,
    [string]$Operation
  )

  $quotedArguments = @($Arguments | ForEach-Object {
    '"' + $_.Replace('"', '\"') + '"'
  }) -join " "
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $Executable
  $startInfo.Arguments = $quotedArguments
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  if (!$process.Start()) {
    throw "$Operation could not be started."
  }
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "$Operation failed with exit code $($process.ExitCode)."
  }
}

$CandidateRepoRoot = (Resolve-Path -LiteralPath $CandidateRepoRoot).Path
$BackupDirectory = (Resolve-Path -LiteralPath $BackupDirectory).Path
$WorkRoot = (Resolve-Path -LiteralPath $WorkRoot).Path
$databaseDump = Join-Path $BackupDirectory "theta-space.full.dump"
if (!(Test-Path -LiteralPath $databaseDump)) {
  throw "Database dump was not found: $databaseDump"
}
if (!(Test-Path -LiteralPath $PrismaExecutable)) {
  throw "Prisma executable was not found: $PrismaExecutable"
}
if ($VerificationPort -lt 1024 -or $VerificationPort -gt 65535) {
  throw "VerificationPort must be between 1024 and 65535."
}
if (Get-NetTCPConnection -LocalPort $VerificationPort -State Listen -ErrorAction SilentlyContinue) {
  throw "Verification port $VerificationPort is already in use."
}

$pgBin = Resolve-PostgresBin
$initDb = Join-Path $pgBin "initdb.exe"
$pgCtl = Join-Path $pgBin "pg_ctl.exe"
$pgRestore = Join-Path $pgBin "pg_restore.exe"
$psql = Join-Path $pgBin "psql.exe"
$verificationRoot = Join-Path $WorkRoot ("migration-verification-{0}" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
$clusterData = Join-Path $verificationRoot "data"
$clusterLog = Join-Path $verificationRoot "postgres.log"
$databaseUrl = "postgresql://postgres@127.0.0.1:$VerificationPort/postgres?schema=public"
$nativeDatabaseUrl = $databaseUrl.Split("?", 2)[0]
$clusterStarted = $false
$verificationPassed = $false
$previousDatabaseUrl = $env:DATABASE_URL

New-Item -ItemType Directory -Path $verificationRoot -Force | Out-Null
try {
  Invoke-Checked -Executable $initDb -Arguments @("--pgdata=$clusterData", "--username=postgres", "--auth=trust", "--encoding=UTF8", "--no-locale") -Operation "Initialize migration verification cluster" | Out-Null
  Invoke-CheckedProcess -Executable $pgCtl -Arguments @("--pgdata=$clusterData", "--log=$clusterLog", "--options=-p $VerificationPort -h 127.0.0.1", "--wait", "start") -Operation "Start migration verification cluster"
  $clusterStarted = $true
  Invoke-Checked -Executable $pgRestore -Arguments @("--no-owner", "--no-privileges", "--dbname=$nativeDatabaseUrl", $databaseDump) -Operation "Restore production database backup" | Out-Null

  Set-Location $CandidateRepoRoot
  $env:DATABASE_URL = $databaseUrl
  Invoke-Checked -Executable $PrismaExecutable -Arguments @("migrate", "deploy", "--schema=prisma\schema.prisma") -Operation "Deploy candidate migrations" | Out-Null
  Invoke-Checked -Executable $PrismaExecutable -Arguments @("migrate", "status", "--schema=prisma\schema.prisma") -Operation "Verify candidate migration status" | Out-Null

  $verificationSql = @'
SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';
SELECT count(*) FROM "PlatformCostRule" WHERE "key" LIKE 'marketplace.%';
SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'PlatformCostSubject' AND e.enumlabel LIKE 'MARKETPLACE_%';
SELECT count(*) FROM "FeatureFlag" WHERE "key" = 'marketplace.focused_rollout';
SELECT count(*) FROM "_prisma_migrations" WHERE migration_name IN ('20260820120000_marketplace_first', '20260820143000_marketplace_auditor_directory_bridge', '20260820150000_marketplace_cost_rules', '20260820160000_retire_directory_bridge_listings') AND finished_at IS NOT NULL AND rolled_back_at IS NULL;
SELECT count(*) FROM "MarketplaceListing" WHERE "status" = 'ACTIVE' AND "attributes" ->> 'sourceProfileSync' = 'true';
SELECT count(*) FROM "AuditorProfile" WHERE "active" = true AND "isOfficial" = true;
'@
  $verificationSqlPath = Join-Path $verificationRoot "verify.sql"
  $verificationSql | Set-Content -LiteralPath $verificationSqlPath -Encoding ASCII
  $verificationOutput = @(Invoke-Checked -Executable $psql -Arguments @("--tuples-only", "--no-align", "--quiet", "--set=ON_ERROR_STOP=1", "--file=$verificationSqlPath", $nativeDatabaseUrl) -Operation "Inspect migrated production copy")
  $values = @($verificationOutput | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ })
  if ($values.Count -ne 7) {
    throw "Migration verification returned an unexpected result set."
  }

  $publicTables = [int]$values[0]
  $costRules = [int]$values[1]
  $costSubjects = [int]$values[2]
  $rolloutFlag = [int]$values[3]
  $completedMigrations = [int]$values[4]
  $activeDirectoryBridgeListings = [int]$values[5]
  $activeOfficialDirectoryProfiles = [int]$values[6]
  if ($publicTables -lt 160 -or $costRules -ne 4 -or $costSubjects -ne 4 -or $rolloutFlag -ne 1 -or $completedMigrations -ne 4 -or $activeDirectoryBridgeListings -ne 0 -or $activeOfficialDirectoryProfiles -lt 1) {
    throw "Migration assertions failed: tables=$publicTables costRules=$costRules costSubjects=$costSubjects rolloutFlag=$rolloutFlag completedMigrations=$completedMigrations activeDirectoryBridgeListings=$activeDirectoryBridgeListings activeOfficialDirectoryProfiles=$activeOfficialDirectoryProfiles."
  }
  $verificationPassed = $true

  [pscustomobject]@{
    verified = $true
    sourceBackup = $BackupDirectory
    publicTables = $publicTables
    marketplaceCostRules = $costRules
    marketplaceCostSubjects = $costSubjects
    rolloutFlagPresent = ($rolloutFlag -eq 1)
    completedMarketplaceMigrations = $completedMigrations
    activeDirectoryBridgeListings = $activeDirectoryBridgeListings
    activeOfficialDirectoryProfiles = $activeOfficialDirectoryProfiles
  } | ConvertTo-Json -Compress
} finally {
  if ($clusterStarted) {
    Invoke-Checked -Executable $pgCtl -Arguments @("--pgdata=$clusterData", "--mode=fast", "--wait", "stop") -Operation "Stop migration verification cluster" | Out-Null
  }
  $env:DATABASE_URL = $previousDatabaseUrl
  if ($verificationPassed) {
    $resolvedWorkRoot = [IO.Path]::GetFullPath($WorkRoot).TrimEnd("\") + "\"
    $resolvedVerificationRoot = [IO.Path]::GetFullPath($verificationRoot)
    if (!$resolvedVerificationRoot.StartsWith($resolvedWorkRoot, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Migration verification directory escaped the work root."
    }
    Remove-Item -LiteralPath $resolvedVerificationRoot -Recurse -Force
  }
}
