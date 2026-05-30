param(
  [Parameter(Mandatory=$true)][string]$Name,
  [string]$Note = "",
  [switch]$Push
)

$tag = "stable/$Name"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"

if (-not (git rev-parse --is-inside-work-tree 2>$null)) {
  Write-Error "Not inside a git repository."
  exit 1
}

$head = (git rev-parse --short HEAD).Trim()
$status = git status --porcelain
if ($status) {
  Write-Warning "Working tree is dirty. Tag will point to current HEAD commit only (uncommitted changes are not included)."
}

$message = "Stable point: $Name`nCreated: $timestamp`nCommit: $head"
if ($Note.Trim()) {
  $message += "`nNote: $Note"
}

git tag -a $tag -m $message
if ($LASTEXITCODE -ne 0) {
  Write-Error "Failed to create tag $tag"
  exit 1
}

Write-Host "Created tag $tag at commit $head"
if ($Push) {
  git push origin $tag
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to push tag $tag"
    exit 1
  }
  Write-Host "Pushed tag $tag to origin"
}
