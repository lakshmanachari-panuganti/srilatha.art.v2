<#
Deploy-WhatsAppPlatform.ps1
Purpose: Deploy dedicated WhatsApp Platform infrastructure (Shared)
#>

[CmdletBinding()]
param(
    [switch]$IgnoreAzAuth
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $IgnoreAzAuth) {
    $connScript = Join-Path $PSScriptRoot 'Azure-Connectivity.ps1'
    if (Test-Path $connScript) { & $connScript }
}

# ------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------
$appslug = 'srilathaartwhatsappv2'
$cfg = @{
    ResourceGroup  = "rg-$appslug-shared"
    Location       = "centralindia"
    StorageAccount = "st$($appslug)"
    FunctionApp    = "func-$appslug"
    KeyVault       = "kv-$appslug"
    AppInsights    = "appi-$appslug"
    LogAnalytics   = "log-$appslug"
}

$tableNames = @(
    'whatsappMessages',
    'whatsappTemplates',
    'whatsappContacts',
    'whatsappWebhookLogs'
)

$queueNames = @(
    'whatsapp-outbound',
    'whatsapp-webhooks'
)

$requiredEnvVars = @(
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_APP_SECRET',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_WABA_ID',
    'WHATSAPP_WEBHOOK_VERIFY_TOKEN'
)

function Write-Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Ensure-EnvVar($n) {
    $v = [Environment]::GetEnvironmentVariable($n)
    if ([string]::IsNullOrWhiteSpace($v)) { throw "Missing environment variable: $n" }
    return $v
}

Write-Step "Validate Environment Variables"
$envValues = @{}
foreach ($e in $requiredEnvVars) { $envValues[$e] = Ensure-EnvVar $e }

Write-Step "Validate Tooling"
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw "Azure CLI not found."
}

$ctx = Get-AzContext
if (-not $ctx) { throw "Connect-AzAccount first." }

az account set --subscription $ctx.Subscription.Id --output none

Write-Step "Resource Group"
$rg = Get-AzResourceGroup -Name $cfg.ResourceGroup -ErrorAction SilentlyContinue
if (-not $rg) {
    $rg = New-AzResourceGroup -Name $cfg.ResourceGroup -Location $cfg.Location
}

Write-Step "Storage Account"
$storage = Get-AzStorageAccount -ResourceGroupName $cfg.ResourceGroup -Name $cfg.StorageAccount -ErrorAction SilentlyContinue
if (-not $storage) {
    $storage = New-AzStorageAccount `
        -ResourceGroupName $cfg.ResourceGroup `
        -Name $cfg.StorageAccount `
        -Location $cfg.Location `
        -SkuName Standard_LRS `
        -Kind StorageV2
}

Write-Step "Log Analytics"
$law = Get-AzOperationalInsightsWorkspace -ResourceGroupName $cfg.ResourceGroup -Name $cfg.LogAnalytics -ErrorAction SilentlyContinue
if (-not $law) {
    $law = New-AzOperationalInsightsWorkspace `
        -ResourceGroupName $cfg.ResourceGroup `
        -Name $cfg.LogAnalytics `
        -Location $cfg.Location `
        -Sku PerGB2018 `
        -RetentionInDays 30
}

Write-Step "Application Insights"
$appi = Get-AzApplicationInsights -ResourceGroupName $cfg.ResourceGroup -Name $cfg.AppInsights -ErrorAction SilentlyContinue
if (-not $appi) {
    $appi = New-AzApplicationInsights `
        -ResourceGroupName $cfg.ResourceGroup `
        -Name $cfg.AppInsights `
        -Location $cfg.Location `
        -Kind web `
        -ApplicationType web `
        -WorkspaceResourceId $law.ResourceId
}

Write-Step "Function App"
$faJson = az functionapp show -g $cfg.ResourceGroup -n $cfg.FunctionApp --output json 2>$null
if (-not $faJson) {
    az functionapp create `
        --name $cfg.FunctionApp `
        --resource-group $cfg.ResourceGroup `
        --storage-account $cfg.StorageAccount `
        --consumption-plan-location $cfg.Location `
        --runtime node `
        --runtime-version 22 `
        --functions-version 4 `
        --os-type Linux `
        --app-insights $cfg.AppInsights | Out-Null
}

Write-Step "Key Vault"
$kv = Get-AzKeyVault -ResourceGroupName $cfg.ResourceGroup -VaultName $cfg.KeyVault -ErrorAction SilentlyContinue
if (-not $kv) {
    az keyvault create `
        --name $cfg.KeyVault `
        --resource-group $cfg.ResourceGroup `
        --location $cfg.Location `
        --enable-rbac-authorization true `
        --output none
    $kv = Get-AzKeyVault -ResourceGroupName $cfg.ResourceGroup -VaultName $cfg.KeyVault
}

Write-Step "Managed Identity"
$identity = az functionapp identity assign -g $cfg.ResourceGroup -n $cfg.FunctionApp --output json | ConvertFrom-Json
$principalId = $identity.principalId

Write-Step "Storage Tables and Queues"
$storageCtx = New-AzStorageContext -StorageAccountName $cfg.StorageAccount -UseConnectedAccount

foreach ($t in $tableNames) {
    if (-not (Get-AzStorageTable -Name $t -Context $storageCtx -ErrorAction SilentlyContinue)) {
        New-AzStorageTable -Name $t -Context $storageCtx | Out-Null
    }
}

foreach ($q in $queueNames) {
    if (-not (Get-AzStorageQueue -Name $q -Context $storageCtx -ErrorAction SilentlyContinue)) {
        New-AzStorageQueue -Name $q -Context $storageCtx | Out-Null
    }
}

Write-Step "Key Vault Backup Secrets"
$secretMap = @{
    WhatsAppAccessToken        = $envValues['WHATSAPP_ACCESS_TOKEN']
    WhatsAppAppSecret          = $envValues['WHATSAPP_APP_SECRET']
    WhatsAppPhoneNumberId      = $envValues['WHATSAPP_PHONE_NUMBER_ID']
    WhatsAppWabaId             = $envValues['WHATSAPP_WABA_ID']
    WhatsAppWebhookVerifyToken = $envValues['WHATSAPP_WEBHOOK_VERIFY_TOKEN']
}

foreach ($s in $secretMap.GetEnumerator()) {
    $existing = Get-AzKeyVaultSecret -VaultName $cfg.KeyVault -Name $s.Key -ErrorAction SilentlyContinue
    if (-not $existing) {
        Set-AzKeyVaultSecret `
            -VaultName $cfg.KeyVault `
            -Name $s.Key `
            -SecretValue (ConvertTo-SecureString $s.Value -AsPlainText -Force) | Out-Null
    }
}

Write-Step "Function App Settings"

$settings = @{
    WHATSAPP_ACCESS_TOKEN                 = $envValues['WHATSAPP_ACCESS_TOKEN']
    WHATSAPP_APP_SECRET                   = $envValues['WHATSAPP_APP_SECRET']
    WHATSAPP_PHONE_NUMBER_ID              = $envValues['WHATSAPP_PHONE_NUMBER_ID']
    WHATSAPP_WABA_ID                      = $envValues['WHATSAPP_WABA_ID']
    WHATSAPP_WEBHOOK_VERIFY_TOKEN         = $envValues['WHATSAPP_WEBHOOK_VERIFY_TOKEN']
    WHATSAPP_API_VERSION                  = 'v23.0'
    FUNCTIONS_WORKER_RUNTIME              = 'node'
    ENVIRONMENT                           = 'Shared'
    APPLICATIONINSIGHTS_CONNECTION_STRING = $appi.ConnectionString
    AzureWebJobsStorage__accountName      = $cfg.StorageAccount
    AzureWebJobsStorage__blobServiceUri   = "https://$($cfg.StorageAccount).blob.core.windows.net"
    AzureWebJobsStorage__queueServiceUri  = "https://$($cfg.StorageAccount).queue.core.windows.net"
    AzureWebJobsStorage__tableServiceUri  = "https://$($cfg.StorageAccount).table.core.windows.net"
}

$settingArgs = @()
foreach ($k in $settings.Keys) {
    $settingArgs += "$k=$($settings[$k])"
}

az functionapp config appsettings set `
    --name $cfg.FunctionApp `
    --resource-group $cfg.ResourceGroup `
    --settings $settingArgs | Out-Null

Write-Host ""
Write-Host "Deployment Complete" -ForegroundColor Green
Write-Host "Resource Group : $($cfg.ResourceGroup)"
Write-Host "Storage        : $($cfg.StorageAccount)"
Write-Host "Function App   : $($cfg.FunctionApp)"
Write-Host "Key Vault      : $($cfg.KeyVault)"
Write-Host "App Insights   : $($cfg.AppInsights)"
Write-Host "Log Analytics  : $($cfg.LogAnalytics)"
