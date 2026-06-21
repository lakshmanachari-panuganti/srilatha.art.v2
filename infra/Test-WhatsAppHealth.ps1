#Requires -Version 7.0

<#
.SYNOPSIS
    WhatsApp Platform Health Validation

.DESCRIPTION
    Validates:

      ✓ Required local environment variables
      ✓ Function App exists
      ✓ Functions deployed
      ✓ Health endpoint reachable
      ✓ Webhook endpoint reachable
      ✓ Meta verification endpoint
      ✓ Azure resources existence

.EXAMPLE
    .\Test-WhatsAppHealth.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# ============================================================================
# Configuration
# ============================================================================

$ResourceGroup = "rg-srilathaartwhatsappv2-shared"
$FunctionApp = "func-srilathaartwhatsappv2"

$FunctionBaseUrl = "https://$FunctionApp.azurewebsites.net"

$HealthUrl = "$FunctionBaseUrl/api/health"
$WebhookUrl = "$FunctionBaseUrl/api/webhooks/whatsapp"

# ============================================================================
# Helper Functions
# ============================================================================

function Write-Step {
    param([string]$Message)

    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host $Message -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)

    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-ErrorLine {
    param([string]$Message)

    Write-Host "✗ $Message" -ForegroundColor Red
}

function Write-WarnLine {
    param([string]$Message)

    Write-Host "! $Message" -ForegroundColor Yellow
}

# ============================================================================
# STEP 1
# ============================================================================

Write-Step "STEP 1 - Validate Environment Variables"

$requiredVars = @(
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_APP_SECRET',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_WABA_ID',
    'WHATSAPP_WEBHOOK_VERIFY_TOKEN'
)

$missing = @()

foreach ($var in $requiredVars) {

    $value = [Environment]::GetEnvironmentVariable($var)

    if ([string]::IsNullOrWhiteSpace($value)) {
        Write-ErrorLine "$var missing"
        $missing += $var
    } else {
        Write-Success "$var present"
    }
}

if ($missing.Count -gt 0) {

    Write-Host ""
    Write-ErrorLine "Missing required variables."

    exit 1
}

$verifyToken = $env:WHATSAPP_WEBHOOK_VERIFY_TOKEN

# ============================================================================
# STEP 2
# ============================================================================

Write-Step "STEP 2 - Validate Azure Login"

try {

    $account = az account show --output json | ConvertFrom-Json

    Write-Success "Logged into Azure"
    Write-Host "Subscription : $($account.name)"

} catch {

    Write-ErrorLine "Azure CLI not logged in"

    exit 1
}

# ============================================================================
# STEP 3
# ============================================================================

Write-Step "STEP 3 - Validate Function App"

try {

    $app = az functionapp show `
        --name $FunctionApp `
        --resource-group $ResourceGroup `
        --output json | ConvertFrom-Json

    Write-Success "Function App found"

} catch {

    Write-ErrorLine "Function App not found"

    exit 1
}

# ============================================================================
# STEP 4
# ============================================================================

Write-Step "STEP 4 - Validate Functions"

try {

    $functions = az functionapp function list `
        --name $FunctionApp `
        --resource-group $ResourceGroup `
        --output json | ConvertFrom-Json

    if (-not $functions) {

        Write-ErrorLine "No functions deployed"

        exit 1
    }

    Write-Success "$($functions.Count) functions deployed"

    foreach ($f in $functions) {

        Write-Host "  • $($f.name)"
    }
} catch {

    Write-ErrorLine "Unable to list functions"

    exit 1
}

# ============================================================================
# STEP 5
# ============================================================================

Write-Step "STEP 5 - Health Endpoint"

try {

    $response = Invoke-RestMethod `
        -Method Get `
        -Uri $HealthUrl `
        -TimeoutSec 30

    Write-Success "Health endpoint reachable"

    Write-Host ""
    Write-Host "Response:"
    $response | ConvertTo-Json -Depth 20

} catch {

    Write-ErrorLine "Health endpoint failed"

    Write-Host $_.Exception.Message
}

# ============================================================================
# STEP 6
# ============================================================================

Write-Step "STEP 6 - Webhook Endpoint Reachability"

try {

    Invoke-WebRequest `
        -Uri $WebhookUrl `
        -Method Get `
        -ErrorAction Stop | Out-Null

    Write-Success "Webhook endpoint reachable"

} catch {

    if ($_.Exception.Response) {

        $status = $_.Exception.Response.StatusCode.value__

        Write-WarnLine "Webhook returned HTTP $status"

    } else {

        Write-ErrorLine $_.Exception.Message
    }
}

# ============================================================================
# STEP 7
# ============================================================================

Write-Step "STEP 7 - Meta Verification"

$challenge = "123456"

$url = "$($WebhookUrl)?hub.mode=subscribe&hub.verify_token=$($verifyToken)&hub.challenge=$challenge"

try {

    $result = Invoke-WebRequest `
        -Uri $url `
        -Method Get `
        -TimeoutSec 30

    if ($result.Content -eq $challenge) {

        Write-Success "Meta verification endpoint PASSED"

    } else {

        Write-ErrorLine "Unexpected challenge response"

        Write-Host "Expected: $challenge"
        Write-Host "Actual  : $($result.Content)"
    }

} catch {

    Write-ErrorLine "Meta verification failed"

    Write-Host $_.Exception.Message
}

# ============================================================================
# STEP 8
# ============================================================================

Write-Step "STEP 8 - Invalid Token Test"

$badUrl = "$($WebhookUrl)?hub.mode=subscribe&hub.verify_token=invalid-token&hub.challenge=123"

try {

    Invoke-WebRequest `
        -Uri $badUrl `
        -Method Get `
        -ErrorAction Stop | Out-Null

    Write-WarnLine "Invalid token accepted"

} catch {

    if ($_.Exception.Response.StatusCode.value__ -eq 403) {

        Write-Success "Invalid token correctly rejected"

    } else {

        Write-WarnLine $_.Exception.Message
    }
}

# ============================================================================
# STEP 9
# ============================================================================

Write-Step "SUMMARY"

Write-Success "Function App URL"
Write-Host "  $FunctionBaseUrl"

Write-Success "Health URL"
Write-Host "  $HealthUrl"

Write-Success "Webhook URL"
Write-Host "  $WebhookUrl"

Write-Host ""
Write-Host "If all checks passed, configure Meta with:"
Write-Host ""
Write-Host "Callback URL:"
Write-Host "  $WebhookUrl"
Write-Host ""
Write-Host "Verify Token:"
Write-Host "  $verifyToken"
Write-Host ""

Write-Success "Health validation completed"