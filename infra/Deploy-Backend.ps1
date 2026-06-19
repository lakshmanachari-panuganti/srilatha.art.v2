<#
.SYNOPSIS
    Deploys the Azure Functions TypeScript backend to Azure.

.DESCRIPTION
    Builds and deploys the backend Azure Function App for either DEV or PRD
    environment. Supports deployment via Azure Functions Core Tools (func CLI)
    when available, or falls back to zip-deploy via the Azure CLI.

.PARAMETER Environment
    Target environment. Must be 'DEV' or 'PRD'. Defaults to 'DEV'.

.EXAMPLE
    .\Deploy-Backend.ps1
    .\Deploy-Backend.ps1 -Environment PRD
#>

param(
    [ValidateSet('DEV', 'PRD')]
    [string]$Environment = 'DEV'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Config ─────────────────────────────────────────────────────────────────────
$config = @{
    DEV = @{ FunctionApp = 'func-srilathaartv2-dev'; ResourceGroup = 'rg-srilathaartv2-dev' }
    PRD = @{ FunctionApp = 'func-srilathaartv2-prd'; ResourceGroup = 'rg-srilathaartv2-prd' }
}

$cfg           = $config[$Environment]
$functionApp   = $cfg.FunctionApp
$resourceGroup = $cfg.ResourceGroup

# ── Banner ─────────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '════════════════════════════════════════════════════════════' -ForegroundColor Cyan
Write-Host "  🚀  Srilatha Art v2 — Backend Deploy  [$Environment]" -ForegroundColor Cyan
Write-Host "  Function App  : $functionApp" -ForegroundColor Cyan
Write-Host "  Resource Group: $resourceGroup" -ForegroundColor Cyan
Write-Host '════════════════════════════════════════════════════════════' -ForegroundColor Cyan
Write-Host ''

# ── Resolve backend directory ──────────────────────────────────────────────────
$backendDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\backend'))

if (-not (Test-Path $backendDir -PathType Container)) {
    throw "Backend directory not found: '$backendDir'. Ensure you are running this script from the infra/ folder."
}

Push-Location $backendDir
Write-Host "📁  Working directory: $backendDir" -ForegroundColor Gray

try {

    # ── Step 0 — Azure authentication ─────────────────────────────────────────
    Write-Host ''
    Write-Host '▶  Step 0 — Connecting to Azure…' -ForegroundColor Yellow

    $connectivityScript = Join-Path $PSScriptRoot 'Azure-Connectivity.ps1'
    if (-not (Test-Path $connectivityScript)) {
        throw "Azure-Connectivity.ps1 not found at: $connectivityScript"
    }
    . $connectivityScript

    # Set subscription
    $subscriptionId = '88355f02-7508-401e-a6c0-24993fad9e77'
    az account set --subscription $subscriptionId --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw "Failed to set subscription: $subscriptionId" }
    Set-AzContext -SubscriptionId $subscriptionId | Out-Null
    Write-Host "   ✔  Subscription set: $subscriptionId" -ForegroundColor Green

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

    # ── Step B — TypeScript build ──────────────────────────────────────────────
    Write-Host ''
    Write-Host '▶  Step B — Compiling TypeScript…' -ForegroundColor Yellow

    npx tsc --noEmit false 2>&1 | Write-Host
    if ($LASTEXITCODE -ne 0) {
        throw "TypeScript compilation failed with exit code $LASTEXITCODE."
    }

    Write-Host '   ✔  TypeScript compiled successfully.' -ForegroundColor Green

    # ── Step C — Check for Azure Functions Core Tools ─────────────────────────
    Write-Host ''
    Write-Host '▶  Step C — Checking for Azure Functions Core Tools (func)…' -ForegroundColor Yellow

    $funcAvailable = $null -ne (Get-Command func -ErrorAction SilentlyContinue)

    if ($funcAvailable) {
        Write-Host '   ✔  func CLI found.' -ForegroundColor Green
    }
    else {
        Write-Host '   ⚠  func CLI not found — will use az zip-deploy fallback.' -ForegroundColor DarkYellow
    }

    # ── Step D — Deploy ────────────────────────────────────────────────────────
    Write-Host ''
    Write-Host '▶  Step D — Deploying to Azure…' -ForegroundColor Yellow

    if ($funcAvailable) {
        # ── D1: Deploy via func CLI ────────────────────────────────────────────
        Write-Host "   Using: func azure functionapp publish $functionApp --node" -ForegroundColor Gray

        func azure functionapp publish $functionApp --node 2>&1 | Write-Host
        if ($LASTEXITCODE -ne 0) {
            throw "func azure functionapp publish failed with exit code $LASTEXITCODE."
        }

        Write-Host '   ✔  Deployed via func CLI.' -ForegroundColor Green

    }
    else {
        # ── D2: Zip-deploy fallback via az CLI ────────────────────────────────
        Write-Host '   Falling back to zip-deploy via az CLI.' -ForegroundColor DarkYellow

        # Verify az CLI is available
        if ($null -eq (Get-Command az -ErrorAction SilentlyContinue)) {
            throw "Neither 'func' nor 'az' CLI is installed. Please install Azure Functions Core Tools or the Azure CLI and re-run."
        }

        # Prepare clean staging directory with only production artefacts
        $timestamp  = Get-Date -Format 'yyyyMMddHHmmss'
        $stagingDir = Join-Path $env:TEMP "func-deploy-staging-$timestamp"
        Write-Host "   Creating staging directory: $stagingDir" -ForegroundColor Gray
        New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null

        # Verify compiled output exists
        $distDir = Join-Path $backendDir 'dist'
        if (-not (Test-Path $distDir)) {
            throw "Compiled output 'dist/' not found in '$backendDir'. TypeScript build may have failed."
        }

        # Copy artefacts into staging
        Write-Host '   Copying dist/ …' -ForegroundColor Gray
        Copy-Item -Path $distDir -Destination (Join-Path $stagingDir 'dist') -Recurse -Force

        Write-Host '   Copying host.json …' -ForegroundColor Gray
        Copy-Item -Path (Join-Path $backendDir 'host.json')    -Destination $stagingDir -Force

        Write-Host '   Copying package.json …' -ForegroundColor Gray
        Copy-Item -Path (Join-Path $backendDir 'package.json') -Destination $stagingDir -Force

        $lockFile = Join-Path $backendDir 'package-lock.json'
        if (Test-Path $lockFile) {
            Copy-Item -Path $lockFile -Destination $stagingDir -Force
        }

        # Install production-only dependencies inside the staging directory
        Write-Host '   Installing production dependencies in staging (--omit=dev)…' -ForegroundColor Gray
        Push-Location $stagingDir
        try {
            npm install --omit=dev 2>&1 | Write-Host
            if ($LASTEXITCODE -ne 0) {
                throw "npm install --omit=dev (staging) failed with exit code $LASTEXITCODE."
            }
        }
        finally {
            Pop-Location
        }

        # Compress staging directory to zip
        $zipPath = Join-Path $env:TEMP "func-deploy-$timestamp.zip"
        Write-Host "   Compressing staging → $zipPath" -ForegroundColor Gray
        Compress-Archive -Path (Join-Path $stagingDir '*') -DestinationPath $zipPath -Force

        $zipSizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
        Write-Host "   Zip size: ${zipSizeMb} MB" -ForegroundColor Gray

        # Upload via az CLI
        Write-Host '   Running: az functionapp deployment source config-zip …' -ForegroundColor Gray
        az functionapp deployment source config-zip `
            --name           $functionApp   `
            --resource-group $resourceGroup `
            --src            $zipPath       `
            --output         none           `
            2>&1 | Write-Host

        if ($LASTEXITCODE -ne 0) {
            throw "az functionapp deployment source config-zip failed with exit code $LASTEXITCODE."
        }

        Write-Host '   ✔  Deployed via zip-deploy.' -ForegroundColor Green

        # Cleanup temporary files
        Write-Host '   Cleaning up temporary files…' -ForegroundColor Gray
        Remove-Item -Path $zipPath    -Force           -ErrorAction SilentlyContinue
        Remove-Item -Path $stagingDir -Recurse -Force  -ErrorAction SilentlyContinue
    }

    # ── Step E — Success ───────────────────────────────────────────────────────
    Write-Host ''
    Write-Host '════════════════════════════════════════════════════════════' -ForegroundColor Green
    Write-Host "  ✅  Backend deployed successfully! [$Environment]" -ForegroundColor Green
    Write-Host '  🌐  API base URL:' -ForegroundColor Green
    Write-Host "      https://$functionApp.azurewebsites.net/api" -ForegroundColor Cyan
    Write-Host '════════════════════════════════════════════════════════════' -ForegroundColor Green
    Write-Host ''

}
catch {
    Write-Host ''
    Write-Host "  ✗  Deployment failed: $_" -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location
}
