<#
.SYNOPSIS
    Deploys the Next.js frontend to Azure Static Web Apps.

.DESCRIPTION
    Builds and deploys the frontend for either DEV or PRD environment.
    Sets the correct API URL for the build, retrieves the SWA deployment
    token from Azure, and deploys via the SWA CLI (installing it if needed).

.PARAMETER Environment
    Target environment. Must be 'DEV' or 'PRD'. Defaults to 'DEV'.

.EXAMPLE
    .\Deploy-Frontend.ps1
    .\Deploy-Frontend.ps1 -Environment PRD
#>

param(
    [ValidateSet('DEV', 'PRD')]
    [string]$Environment = 'DEV'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Config ─────────────────────────────────────────────────────────────────────
$config = @{
    DEV = @{
        SwaName       = 'swa-srilathaartv2-dev'
        ResourceGroup = 'rg-srilathaartv2-dev'
        ApiUrl        = 'https://func-srilathaartv2-dev.azurewebsites.net/api'
    }
    PRD = @{
        SwaName       = 'swa-srilathaartv2-prd'
        ResourceGroup = 'rg-srilathaartv2-prd'
        ApiUrl        = 'https://func-srilathaartv2-prd.azurewebsites.net/api'
    }
}

$cfg           = $config[$Environment]
$swaName       = $cfg.SwaName
$resourceGroup = $cfg.ResourceGroup
$apiUrl        = $cfg.ApiUrl

# ── Banner ─────────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '════════════════════════════════════════════════════════════' -ForegroundColor Cyan
Write-Host "  🚀  Srilatha Art v2 — Frontend Deploy  [$Environment]" -ForegroundColor Cyan
Write-Host "  SWA Name      : $swaName" -ForegroundColor Cyan
Write-Host "  Resource Group: $resourceGroup" -ForegroundColor Cyan
Write-Host "  API URL       : $apiUrl" -ForegroundColor Cyan
Write-Host '════════════════════════════════════════════════════════════' -ForegroundColor Cyan
Write-Host ''

# ── Resolve frontend directory ─────────────────────────────────────────────────
$frontendDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\frontend'))

if (-not (Test-Path $frontendDir -PathType Container)) {
    throw "Frontend directory not found: '$frontendDir'. Ensure you are running this script from the infra/ folder."
}

Push-Location $frontendDir
Write-Host "📁  Working directory: $frontendDir" -ForegroundColor Gray

try {

    # ── Step A — npm install ───────────────────────────────────────────────────
    Write-Host ''
    Write-Host '▶  Step A — Installing npm dependencies (npm ci)…' -ForegroundColor Yellow

    npm ci 2>&1 | Write-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Host '   npm ci failed — retrying with npm install…' -ForegroundColor DarkYellow
        npm install 2>&1 | Write-Host
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed with exit code $LASTEXITCODE."
        }
    }

    Write-Host '   ✔  Dependencies installed.' -ForegroundColor Green

    # ── Step B — Set NEXT_PUBLIC_API_URL and build ────────────────────────────
    Write-Host ''
    Write-Host '▶  Step B — Building Next.js app…' -ForegroundColor Yellow
    Write-Host "   NEXT_PUBLIC_API_URL = $apiUrl" -ForegroundColor Gray

    $env:NEXT_PUBLIC_API_URL = $apiUrl

    npm run build 2>&1 | Write-Host
    if ($LASTEXITCODE -ne 0) {
        throw "npm run build failed with exit code $LASTEXITCODE."
    }

    Write-Host '   ✔  Next.js build completed.' -ForegroundColor Green

    # ── Step C — Retrieve SWA deployment token ────────────────────────────────
    Write-Host ''
    Write-Host '▶  Step C — Retrieving SWA deployment token from Azure…' -ForegroundColor Yellow

    # Verify az CLI is available
    if ($null -eq (Get-Command az -ErrorAction SilentlyContinue)) {
        throw "'az' CLI is not installed. Please install the Azure CLI: https://docs.microsoft.com/cli/azure/install-azure-cli"
    }

    $deploymentToken = az staticwebapp secrets list `
        --name           $swaName       `
        --resource-group $resourceGroup `
        --query          'properties.apiKey' `
        --output         tsv            `
        2>&1

    if ($LASTEXITCODE -ne 0) {
        throw "Failed to retrieve SWA deployment token. Ensure you are logged in (az login) and have access to '$swaName'."
    }

    $deploymentToken = $deploymentToken.Trim()
    if ([string]::IsNullOrWhiteSpace($deploymentToken)) {
        throw "SWA deployment token is empty. Verify that '$swaName' exists in '$resourceGroup'."
    }

    Write-Host '   ✔  Deployment token retrieved.' -ForegroundColor Green

    # ── Step D — Deploy via SWA CLI ───────────────────────────────────────────
    Write-Host ''
    Write-Host '▶  Step D — Deploying to Azure Static Web Apps…' -ForegroundColor Yellow

    $swaAvailable = $null -ne (Get-Command swa -ErrorAction SilentlyContinue)

    if (-not $swaAvailable) {
        Write-Host '   swa CLI not found — installing @azure/static-web-apps-cli globally…' -ForegroundColor DarkYellow
        npm install -g @azure/static-web-apps-cli 2>&1 | Write-Host
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to install @azure/static-web-apps-cli with exit code $LASTEXITCODE."
        }
        Write-Host '   ✔  swa CLI installed.' -ForegroundColor Green
    }
    else {
        Write-Host '   ✔  swa CLI found.' -ForegroundColor Green
    }

    Write-Host '   Running: swa deploy ./.next --deployment-token *** --env production' -ForegroundColor Gray

    swa deploy ./.next `
        --deployment-token $deploymentToken `
        --env              production        `
        2>&1 | Write-Host

    if ($LASTEXITCODE -ne 0) {
        throw "swa deploy failed with exit code $LASTEXITCODE."
    }

    Write-Host '   ✔  Deployed to Azure Static Web Apps.' -ForegroundColor Green

    # ── Step E — Print SWA URL ────────────────────────────────────────────────
    Write-Host ''
    Write-Host '▶  Step E — Fetching SWA public URL…' -ForegroundColor Yellow

    $swaHostname = az staticwebapp show `
        --name           $swaName       `
        --resource-group $resourceGroup `
        --query          'defaultHostname' `
        --output         tsv            `
        2>&1

    $swaHostname = $swaHostname.Trim()

    Write-Host ''
    Write-Host '════════════════════════════════════════════════════════════' -ForegroundColor Green
    Write-Host "  ✅  Frontend deployed successfully! [$Environment]" -ForegroundColor Green
    if (-not [string]::IsNullOrWhiteSpace($swaHostname)) {
        Write-Host '  🌐  Live URL:' -ForegroundColor Green
        Write-Host "      https://$swaHostname" -ForegroundColor Cyan
    }
    Write-Host '════════════════════════════════════════════════════════════' -ForegroundColor Green
    Write-Host ''

}
catch {
    Write-Host ''
    Write-Host "  ✗  Deployment failed: $_" -ForegroundColor Red
    exit 1
}
finally {
    # Restore env var so it does not leak into the calling shell session
    Remove-Item Env:\NEXT_PUBLIC_API_URL -ErrorAction SilentlyContinue
    Pop-Location
}
