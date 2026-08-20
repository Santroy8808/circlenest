param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-f]{40}$')]
  [string]$ExpectedCommit,
  [string]$RepoRoot = "S:\Workspace\circlenest",
  [string]$LogRoot = "S:\Admin\ThetaSpace\logs",
  [string]$BackupScriptDestination = "S:\Admin\ThetaSpace\backup-database-hourly.ps1"
)

$ErrorActionPreference = "Stop"
$applicationServices = @("ThetaSpaceWeb", "ThetaSpaceWorker")
$requiredServices = @("postgresql-x64-18", "ThetaSpaceCaddy") + $applicationServices
$servicesStopped = $false

New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null
$logPath = Join-Path $LogRoot ("release-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))

function Invoke-ReleaseStep {
  param(
    [string]$Name,
    [string]$Executable,
    [string[]]$Arguments
  )

  Write-Output "BEGIN:$Name"
  "[$(Get-Date -Format o)] BEGIN $Name" | Add-Content -LiteralPath $logPath
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & $Executable @Arguments *>> $logPath
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousPreference
  if ($exitCode -ne 0) {
    $tail = (Get-Content -LiteralPath $logPath -Tail 60) -join "`n"
    throw "$Name failed with exit code $exitCode.`n$tail"
  }
  "[$(Get-Date -Format o)] OK $Name" | Add-Content -LiteralPath $logPath
  Write-Output "OK:$Name"
}

function Wait-ServiceState {
  param(
    [string]$Name,
    [System.ServiceProcess.ServiceControllerStatus]$Status
  )

  (Get-Service -Name $Name).WaitForStatus($Status, [TimeSpan]::FromSeconds(45))
}

try {
  Set-Location (Resolve-Path -LiteralPath $RepoRoot).Path
  $workingTree = @(& git status --porcelain)
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect the production checkout."
  }
  if ($workingTree.Count -gt 0) {
    throw "Production checkout is not clean: $($workingTree -join '; ')"
  }

  Invoke-ReleaseStep -Name "fetch-release" -Executable "git.exe" -Arguments @("fetch", "origin", "--prune")
  $targetCommit = (& git rev-parse origin/main).Trim()
  if ($targetCommit -ne $ExpectedCommit) {
    throw "origin/main is $targetCommit; expected $ExpectedCommit."
  }

  foreach ($serviceName in $applicationServices) {
    Stop-Service -Name $serviceName -Force
    Wait-ServiceState -Name $serviceName -Status Stopped
  }
  $servicesStopped = $true
  Write-Output "OK:stop-application-services"

  Invoke-ReleaseStep -Name "fast-forward-release" -Executable "git.exe" -Arguments @("merge", "--ff-only", "origin/main")
  $deployedCommit = (& git rev-parse HEAD).Trim()
  if ($deployedCommit -ne $ExpectedCommit) {
    throw "Deployed HEAD is $deployedCommit; expected $ExpectedCommit."
  }

  Invoke-ReleaseStep -Name "install-dependencies" -Executable "npm.cmd" -Arguments @("ci")
  Invoke-ReleaseStep -Name "validate-environment" -Executable "npm.cmd" -Arguments @("run", "env:check")
  Invoke-ReleaseStep -Name "production-build" -Executable "npm.cmd" -Arguments @("run", "build")
  Invoke-ReleaseStep -Name "deploy-database-migrations" -Executable "npx.cmd" -Arguments @("prisma", "migrate", "deploy")
  Invoke-ReleaseStep -Name "verify-database-migrations" -Executable "npx.cmd" -Arguments @("prisma", "migrate", "status")

  Copy-Item -LiteralPath (Join-Path $RepoRoot "scripts\backup-database-hourly.ps1") -Destination $BackupScriptDestination -Force

  foreach ($serviceName in $applicationServices) {
    Start-Service -Name $serviceName
    Wait-ServiceState -Name $serviceName -Status Running
  }
  Start-Sleep -Seconds 5
  $servicesStopped = $false

  $serviceStatus = @(Get-Service -Name $requiredServices | ForEach-Object {
    [pscustomobject]@{ name = $_.Name; status = $_.Status.ToString() }
  })
  if (@($serviceStatus | Where-Object { $_.status -ne "Running" }).Count -gt 0) {
    throw "One or more required production services are not running."
  }

  [pscustomobject]@{
    success = $true
    deployedCommit = $deployedCommit
    logPath = $logPath
    services = $serviceStatus
  } | ConvertTo-Json -Depth 4 -Compress
} catch {
  $_ | Out-String | Add-Content -LiteralPath $logPath
  if ($servicesStopped) {
    foreach ($serviceName in $applicationServices) {
      try {
        if ((Get-Service -Name $serviceName).Status -ne "Running") {
          Start-Service -Name $serviceName
        }
      } catch {
        $_ | Out-String | Add-Content -LiteralPath $logPath
      }
    }
  }
  Write-Output "DEPLOY_FAILED:$($_.Exception.Message)"
  Write-Output "LOG:$logPath"
  exit 1
}
