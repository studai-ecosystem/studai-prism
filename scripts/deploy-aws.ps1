param(
  [string]$Ref = 'main',
  [string]$Hostname = 'prism-aws.studai.one'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

Push-Location $repoRoot
try {
  gh auth status *> $null
  if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI authentication is required.' }

  gh workflow run deploy-aws.yml --ref $Ref -f "hostname=$Hostname"
  if ($LASTEXITCODE -ne 0) { throw 'Unable to dispatch the AWS deployment workflow.' }

  Write-Host 'AWS deployment dispatched. Track it with:'
  Write-Host '  gh run list --workflow deploy-aws.yml --limit 1'
} finally {
  Pop-Location
}