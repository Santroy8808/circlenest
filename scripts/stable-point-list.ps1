param(
  [string]$Filter = "stable/"
)

if (-not (git rev-parse --is-inside-work-tree 2>$null)) {
  Write-Error "Not inside a git repository."
  exit 1
}

git tag --list "$Filter*" --sort=-creatordate
