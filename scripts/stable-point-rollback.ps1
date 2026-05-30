param(
  [Parameter(Mandatory=$true)][string]$Name,
  [switch]$CreateBranch,
  [switch]$HardReset,
  [switch]$Deploy
)

$tag = if ($Name.StartsWith("stable/")) { $Name } else { "stable/$Name" }

if (-not (git rev-parse --is-inside-work-tree 2>$null)) {
  Write-Error "Not inside a git repository."
  exit 1
}

$exists = git tag --list $tag
if (-not $exists) {
  Write-Error "Tag not found: $tag"
  exit 1
}

if ($HardReset) {
  Write-Warning "Hard reset will discard uncommitted local changes."
  git reset --hard $tag
} elseif ($CreateBranch) {
  $branch = "rollback/$($tag.Replace('/','-'))"
  git checkout -b $branch $tag
  Write-Host "Created and switched to $branch at $tag"
} else {
  git checkout $tag
  Write-Host "Checked out detached HEAD at $tag"
}

if ($Deploy) {
  railway up --service circlenest
}
