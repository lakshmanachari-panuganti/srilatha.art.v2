<#
.SYNOPSIS
    Load Azure Function App settings into the current PowerShell session.

.DESCRIPTION
    Reads app settings from Azure Function App and sets them as process-scoped
    environment variables. Nothing is written to User or Machine scope.

.NOTES
    Use dot-sourcing to keep values in your current terminal session:
      . ./infra/Load-FunctionAppSettings.ps1 -AppName func-srilathaartv2-dev
#>

[CmdletBinding()]
param(
    [ValidateSet('func-srilathaartv2-dev', 'func-srilathaartv2-prd')]
    [string]$AppName = 'func-srilathaartv2-dev',

    [Switch]$IgnoreAzAuth
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $IgnoreAzAuth) {
    & "$PSScriptRoot\Azure-Connectivity.ps1"
}

$acct = az account show -o json 2>$null | ConvertFrom-Json
if (-not $acct) {
    throw "Not logged in. Run 'az login' first."
}

$rg = az functionapp list --query "[?name=='$AppName'].resourceGroup | [0]" -o tsv
if ([string]::IsNullOrWhiteSpace($rg)) {
    throw "Function app '$AppName' not found in subscription '$($acct.name)'."
}

$settings = az functionapp config appsettings list --name $AppName --resource-group $rg -o json | ConvertFrom-Json

foreach ($s in $settings) {
    [Environment]::SetEnvironmentVariable($s.name, $s.value, 'Process')
}

Write-Host "Loaded $($settings.Count) app settings from $AppName into this session (Process scope only)." -ForegroundColor Green
