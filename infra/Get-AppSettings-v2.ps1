<#
.SYNOPSIS
    Retrieves app settings from an Azure Function App.

.DESCRIPTION
    Fetches one or more app settings from the target Function App.

    By default, secret values are masked in console output.

    Use -ShowSecrets to display actual values.

.PARAMETER Environment
    Either 'dev' or 'prd'.

.PARAMETER SettingName
    One or more app setting names to retrieve.

    If omitted, all settings are returned.

.PARAMETER ShowSecrets
    Displays actual values for secret settings.

.PARAMETER IgnoreAzAuth
    Skips Azure-Connectivity.ps1.

.EXAMPLE
    ./infra/Get-AppSettings-v2.ps1 `
        -Environment dev `
        -SettingName SMTP_PASS

.EXAMPLE
    ./infra/Get-AppSettings-v2.ps1 `
        -Environment prd `
        -SettingName GOOGLE_CLIENT_ID,INVOICE_LOGO_URL

.EXAMPLE
    ./infra/Get-AppSettings-v2.ps1 `
        -Environment dev

.EXAMPLE
    ./infra/Get-AppSettings-v2.ps1 `
        -Environment dev `
        -ShowSecrets
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('dev', 'prd')]
    [string]$Environment,

    [Parameter()]
    [string[]]$SettingName,

    [Parameter()]
    [switch]$ShowSecrets,

    [Parameter()]
    [switch]$IgnoreAzAuth
)

$ErrorActionPreference = 'Stop'

if (-not $IgnoreAzAuth) {
    & "$PSScriptRoot\Azure-Connectivity.ps1"
}

# Match behavior of the update script
$PSNativeCommandUseErrorActionPreference = $false

# ─── Environment → Azure resource mapping ────────────────────────────────
$AppSlug = 'srilathaartv2'

$envMap = @{
    dev = @{
        ResourceGroup   = "rg-$AppSlug-dev"
        FunctionAppName = "func-$AppSlug-dev"
    }
    prd = @{
        ResourceGroup   = "rg-$AppSlug-prd"
        FunctionAppName = "func-$AppSlug-prd"
    }
}

$envCfg = $envMap[$Environment]

# ─── Azure context ───────────────────────────────────────────────────────
$ctx = Get-AzContext

if (-not $ctx) {
    throw "No Azure context available. Run Azure-Connectivity.ps1 or login before executing this script."
}

# ─── Confirm Function App exists ─────────────────────────────────────────
$showOutput = az functionapp show `
    --resource-group $envCfg.ResourceGroup `
    --name $envCfg.FunctionAppName `
    --output none 2>&1

if ($LASTEXITCODE -ne 0) {
    throw "Function App '$($envCfg.FunctionAppName)' is not reachable in resource group '$($envCfg.ResourceGroup)': $showOutput"
}

# ─── Banner ──────────────────────────────────────────────────────────────
Write-Host ''
Write-Host "Target environment : $Environment" -ForegroundColor Cyan
Write-Host "Resource group     : $($envCfg.ResourceGroup)"
Write-Host "Function App       : $($envCfg.FunctionAppName)"
Write-Host "Signed in as       : $($ctx.Account.Id) on $($ctx.Subscription.Name)" -ForegroundColor DarkGray
Write-Host ''

# ─── PRD gate ────────────────────────────────────────────────────────────
if ($Environment -eq 'prd') {

    Write-Host "⚠ You are reading settings from PRODUCTION." -ForegroundColor Yellow

    if ($ShowSecrets) {
        Write-Host "⚠ Secret values will be displayed." -ForegroundColor Red
    }

    $confirm = Read-Host "Type 'yes' to continue"

    if ($confirm -ne 'yes') {
        Write-Host "Aborted by operator." -ForegroundColor Yellow
        exit 0
    }
}

# ─── Retrieve settings ───────────────────────────────────────────────────
$json = az functionapp config appsettings list `
    --resource-group $envCfg.ResourceGroup `
    --name $envCfg.FunctionAppName `
    --output json

if ($LASTEXITCODE -ne 0) {
    throw "Unable to retrieve app settings from '$($envCfg.FunctionAppName)'."
}

$settings = $json | ConvertFrom-Json

# Filter if specific settings requested
if ($SettingName) {

    $requested = $SettingName | ForEach-Object { $_.Trim() }

    $settings = $settings | Where-Object {
        $_.name -in $requested
    }

    if (-not $settings) {
        Write-Warning "None of the requested settings were found."
        exit 0
    }
}

# Safe-to-display values
$safeToDisplay = @(
    'INVOICE_LOGO_URL',
    'GOOGLE_CLIENT_ID'
)

# ─── Output ──────────────────────────────────────────────────────────────
Write-Host ''
Write-Host 'App Settings' -ForegroundColor Green
Write-Host '────────────────────────────────────────────────────────────'
Write-Host ''

foreach ($setting in ($settings | Sort-Object name)) {

    $value = if ($null -eq $setting.value) { '' } else { [string]$setting.value }

    if ($ShowSecrets -or $safeToDisplay -contains $setting.name) {

        Write-Host ("{0} = {1}" -f $setting.name, $value)

    } else {

        Write-Host ("{0} = ******** ({1} chars)" -f $setting.name, $value.Length)

    }
}

Write-Host ''
Write-Host ("Returned {0} setting(s)." -f @($settings).Count)
Write-Host ''
