param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$BackupRoot = "C:\Backups",
  [string]$Label = "predeploy",
  [string]$DatabaseUrl = "",
  [int]$MinimumPublicTables = 1
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

function Resolve-PostgresBin {
  function Test-PostgresBin([string]$Path) {
    if (!$Path) {
      return $false
    }
    return @("pg_dump.exe", "pg_restore.exe", "psql.exe", "createdb.exe", "dropdb.exe").Where({
      !(Test-Path -LiteralPath (Join-Path $Path $_))
    }).Count -eq 0
  }

  $pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
  if ($pgDump -and (Test-PostgresBin (Split-Path -Parent $pgDump.Source))) {
    return (Split-Path -Parent $pgDump.Source)
  }

  foreach ($root in @("${env:ProgramFiles}\PostgreSQL", "${env:ProgramFiles(x86)}\PostgreSQL")) {
    if (!$root -or !(Test-Path -LiteralPath $root)) {
      continue
    }
    $candidate = Get-ChildItem -LiteralPath $root -Recurse -Filter pg_dump.exe -ErrorAction SilentlyContinue |
      Where-Object { Test-PostgresBin (Split-Path -Parent $_.FullName) } |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($candidate) {
      return Split-Path -Parent $candidate.FullName
    }
  }

  throw "PostgreSQL client tools were not found."
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

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
if ($Label -notmatch '^[a-zA-Z0-9-]+$') {
  throw "Label may contain only letters, numbers, and hyphens."
}
if ($MinimumPublicTables -lt 1) {
  throw "MinimumPublicTables must be at least 1."
}

Import-DotEnvFile -Path (Join-Path $RepoRoot ".env.local")
Import-DotEnvFile -Path (Join-Path $RepoRoot ".env")
if (!$DatabaseUrl) {
  $DatabaseUrl = $env:DATABASE_URL
}
if (!$DatabaseUrl) {
  throw "DATABASE_URL was not provided and was not found in environment files."
}

$nativeDatabaseUrl = ConvertTo-NativePostgresUrl -ConnectionString $DatabaseUrl
$databaseUri = [uri]$nativeDatabaseUrl
$maintenanceBuilder = [System.UriBuilder]::new($databaseUri)
$maintenanceBuilder.Path = "/postgres"
$maintenanceUrl = $maintenanceBuilder.Uri.AbsoluteUri

$pgBin = Resolve-PostgresBin
$pgDump = Join-Path $pgBin "pg_dump.exe"
$pgRestore = Join-Path $pgBin "pg_restore.exe"
$psql = Join-Path $pgBin "psql.exe"
$createDb = Join-Path $pgBin "createdb.exe"
$dropDb = Join-Path $pgBin "dropdb.exe"
foreach ($tool in @($pgDump, $pgRestore, $psql, $createDb, $dropDb)) {
  if (!(Test-Path -LiteralPath $tool)) {
    throw "Required PostgreSQL tool was not found: $tool"
  }
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDirectory = Join-Path (Join-Path $BackupRoot "theta-space") "$Label-$timestamp"
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
$failureLog = Join-Path $backupDirectory "FAILED.txt"

try {
  Set-Location $RepoRoot
  $head = (Invoke-Checked -Executable "git" -Arguments @("rev-parse", "HEAD") -Operation "Read Git HEAD").Trim()
  $branch = (Invoke-Checked -Executable "git" -Arguments @("branch", "--show-current") -Operation "Read Git branch").Trim()

  $sourceArchive = Join-Path $backupDirectory "theta-space-source.zip"
  $repositoryBundle = Join-Path $backupDirectory "theta-space-repository.bundle"
  $databaseDump = Join-Path $backupDirectory "theta-space.full.dump"

  Invoke-Checked -Executable "git" -Arguments @("archive", "--format=zip", "--output=$sourceArchive", "HEAD") -Operation "Git source archive" | Out-Null
  Invoke-Checked -Executable "git" -Arguments @("bundle", "create", $repositoryBundle, "--all") -Operation "Git repository bundle" | Out-Null
  Invoke-Checked -Executable $pgDump -Arguments @("--format=custom", "--blobs", "--no-owner", "--no-privileges", "--file=$databaseDump", $nativeDatabaseUrl) -Operation "PostgreSQL full dump" | Out-Null
  Invoke-Checked -Executable $pgRestore -Arguments @("--list", $databaseDump) -Operation "PostgreSQL dump catalog validation" | Out-Null

  $restoreDatabase = "theta_space_restore_$($timestamp -replace '-', '_')"
  if ($restoreDatabase -notmatch '^theta_space_restore_[0-9_]+$') {
    throw "Unsafe restore database name."
  }
  $restoreBuilder = [System.UriBuilder]::new($databaseUri)
  $restoreBuilder.Path = "/$restoreDatabase"
  $restoreUrl = $restoreBuilder.Uri.AbsoluteUri
  $restoreCreated = $false

  try {
    Invoke-Checked -Executable $createDb -Arguments @("--maintenance-db=$maintenanceUrl", "--template=template0", $restoreDatabase) -Operation "Create isolated restore database" | Out-Null
    $restoreCreated = $true
    Invoke-Checked -Executable $pgRestore -Arguments @("--no-owner", "--no-privileges", "--dbname=$restoreUrl", $databaseDump) -Operation "Restore database backup" | Out-Null
    $tableOutput = Invoke-Checked -Executable $psql -Arguments @("--tuples-only", "--no-align", "--quiet", "--set=ON_ERROR_STOP=1", "--command=SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';", $restoreUrl) -Operation "Count restored tables"
    $restoredTableCount = [int]($tableOutput | Select-Object -Last 1).Trim()
    if ($restoredTableCount -lt $MinimumPublicTables) {
      throw "Restore verification found only $restoredTableCount public tables; expected at least $MinimumPublicTables."
    }
  } finally {
    if ($restoreCreated) {
      Invoke-Checked -Executable $dropDb -Arguments @("--maintenance-db=$maintenanceUrl", "--if-exists", "--force", $restoreDatabase) -Operation "Remove isolated restore database" | Out-Null
    }
  }

  $artifacts = @($sourceArchive, $repositoryBundle, $databaseDump)
  $checksums = @($artifacts | ForEach-Object {
    $item = Get-Item -LiteralPath $_
    $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $_
    [ordered]@{ file = $item.Name; sha256 = $hash.Hash; bytes = $item.Length }
  })
  $manifest = [ordered]@{
    createdAt = (Get-Date -Format o)
    purpose = $Label
    repository = $RepoRoot
    branch = $branch
    head = $head
    restoreVerified = $true
    restoredPublicTableCount = $restoredTableCount
    files = $checksums
  }
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $backupDirectory "manifest.json") -Encoding UTF8
  $checksums | ForEach-Object { "$($_.sha256)  $($_.file)" } | Set-Content -LiteralPath (Join-Path $backupDirectory "SHA256SUMS.txt") -Encoding ASCII

  [pscustomobject]@{
    BackupDirectory = $backupDirectory
    Head = $head
    RestoreVerified = $true
    RestoredPublicTables = $restoredTableCount
  }
} catch {
  $_ | Out-String | Set-Content -LiteralPath $failureLog -Encoding UTF8
  throw
}
