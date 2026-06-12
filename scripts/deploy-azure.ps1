# ============================================================================
# Deploy StudAI Prism to Azure App Service (Linux, Node) — single-origin app.
#
# The Express server (server/index.js) serves BOTH the API + socket.io AND the
# built React SPA (dist/), so the whole product runs as ONE Azure Web App.
#
# Prerequisites (one-time, interactive):
#   1. Azure CLI installed  (winget install Microsoft.AzureCLI)
#   2. az login             (opens a browser to authenticate to your account)
#
# Then run:   pwsh ./scripts/deploy-azure.ps1
#
# Re-running is safe — every step is idempotent (create-if-missing) and the
# final step redeploys the latest committed code. Costs ~$13/mo on the B1 tier.
# ============================================================================
param(
  [string]$AppName       = "studai-prism",       # globally unique -> https://<AppName>.azurewebsites.net
  [string]$ResourceGroup = "studai-prism-rg",
  [string]$Plan          = "studai-prism-plan",
  [string]$Location      = "centralindia",
  [string]$Sku           = "B1",                  # B1 supports WebSockets + always-on (needed for phone proctoring)
  [string]$Runtime       = "NODE:20-lts"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

# ── 0. Pre-flight: az present + logged in ───────────────────────────────────
Step "Pre-flight checks"
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
  throw "Azure CLI not found. Install it first:  winget install Microsoft.AzureCLI  (then restart the shell)."
}
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
  throw "Not logged in to Azure. Run 'az login' first, then re-run this script."
}
Write-Host "Subscription: $($account.name) ($($account.id))"

# ── 1. Resource group ───────────────────────────────────────────────────────
Step "Resource group: $ResourceGroup ($Location)"
az group create --name $ResourceGroup --location $Location --output none

# ── 2. App Service plan (Linux) ─────────────────────────────────────────────
Step "App Service plan: $Plan ($Sku, Linux)"
az appservice plan create --name $Plan --resource-group $ResourceGroup `
  --is-linux --sku $Sku --output none

# ── 3. Web App ──────────────────────────────────────────────────────────────
Step "Web App: $AppName ($Runtime)"
$exists = az webapp show --name $AppName --resource-group $ResourceGroup 2>$null
if (-not $exists) {
  az webapp create --name $AppName --resource-group $ResourceGroup `
    --plan $Plan --runtime $Runtime --output none
} else {
  Write-Host "Web App already exists — reusing."
}

$siteUrl = "https://$AppName.azurewebsites.net"

# ── 4. Platform config: WebSockets, startup command, Oryx build, always-on ──
Step "Configuring runtime (WebSockets, startup, build-on-deploy)"
az webapp config set --name $AppName --resource-group $ResourceGroup `
  --web-sockets-enabled true `
  --startup-file "npm start" `
  --always-on true `
  --output none

# ── 5. App settings (env vars) ──────────────────────────────────────────────
# Always-set platform settings, then everything from server/.env (your secrets).
Step "Applying app settings"
$settings = @(
  "SCM_DO_BUILD_DURING_DEPLOYMENT=true",   # let Oryx run npm install + npm run build
  "NODE_ENV=production",
  "PUBLIC_BASE_URL=$siteUrl",              # QR codes / phone-proctor links point here (HTTPS)
  "WEBSITE_NODE_DEFAULT_VERSION=~20"
)

$envFile = Join-Path $repoRoot "server\.env"
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    $t = $line.Trim()
    if ($t -eq "" -or $t.StartsWith("#")) { continue }
    if ($t -notmatch "^[A-Za-z_][A-Za-z0-9_]*=") { continue }
    $key = ($t -split "=", 2)[0].Trim()
    # Don't override the platform-managed settings above.
    if ($key -in @("PORT", "NODE_ENV", "PUBLIC_BASE_URL")) { continue }
    $settings += $t
  }
  Write-Host "Loaded secrets from server/.env"
} else {
  Write-Host "WARNING: server/.env not found — set AZURE_OPENAI_* and JWT_SECRET manually in the portal." -ForegroundColor Yellow
}

az webapp config appsettings set --name $AppName --resource-group $ResourceGroup `
  --settings $settings --output none

# ── 6. Deploy the latest COMMITTED code (clean zip, no node_modules) ────────
# Oryx then runs `npm install` (root postinstall installs server deps) + `npm
# run build` (vite -> dist/) on the server, and `npm start` serves it all.
Step "Packaging committed code (git archive)"
$zip = Join-Path $env:TEMP "prism-deploy.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
git archive --format zip --output $zip HEAD
Write-Host "Created $zip"

Step "Deploying to Azure (Oryx will build — this takes a few minutes)"
az webapp deploy --name $AppName --resource-group $ResourceGroup `
  --src-path $zip --type zip --output none

# ── 7. Done ─────────────────────────────────────────────────────────────────
Step "Deployment complete"
Write-Host "Live URL : $siteUrl" -ForegroundColor Green
Write-Host "Health   : $siteUrl/api/health"
Write-Host "Logs     : az webapp log tail -n $AppName -g $ResourceGroup"
