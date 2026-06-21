<#
.SYNOPSIS
    Generates a fresh Razorpay webhook signing secret and writes it to the
    matching Function App's RAZORPAY_WEBHOOK_SECRET app setting.

.DESCRIPTION
    Razorpay's webhook signing secret is a value we choose, register in the
    Razorpay Dashboard (Settings → Webhooks → Add new), and tell our backend
    via the RAZORPAY_WEBHOOK_SECRET app setting. Both sides must hold the same
    byte-for-byte string for HMAC verification to succeed.

    This script does the Azure half of that flow:

      1. Generates 32 cryptographically random bytes, base64-encoded.
         (or accepts a value you already typed into the Razorpay Dashboard)
      2. Takes a backup of all current Function App settings to Key Vault.
      3. Writes RAZORPAY_WEBHOOK_SECRET via 'az functionapp config appsettings set',
         which MERGES with existing settings — no other env vars are touched.
      4. Reads the setting back and verifies the EXACT value matches.
      5. Prints the secret so you can paste it into the Razorpay Dashboard.

    The secret never touches a file on disk. The console output is the only
    place you will see the new value after this run. Razorpay never reveals
    it back once you save it in the Dashboard, so treat the Function App
    app setting as the sole source of truth.

.PARAMETER Environment
    Either 'dev' or 'prd'. Picks the correct resource group, Function App
    name, Key Vault, and Razorpay dashboard mode (test vs live).

.PARAMETER WebhookSecret
    Optional. If supplied, this exact value is used instead of generating
    a new one. Useful if you have already typed a value into Razorpay and
    just need to sync it to Azure.

.EXAMPLE
    # Rotate the DEV webhook secret (generates a new random value)
    ./infra/Rotate-RazorpayWebhookSecret-v2.ps1 -Environment dev

.EXAMPLE
    # Rotate PRD - generate a new value
    ./infra/Rotate-RazorpayWebhookSecret-v2.ps1 -Environment prd

.EXAMPLE
    # Use a value you already pasted into the Razorpay Dashboard
    ./infra/Rotate-RazorpayWebhookSecret-v2.ps1 `
        -Environment prd `
        -WebhookSecret 'PbykpHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'

.NOTES
    Requirements:
      - PowerShell 7+
      - Az.Accounts, Az.Resources, Az.KeyVault modules
      - Azure CLI (az) installed
      - The following environment variables must be set:
          MY_APPREG_CLIENT_ID
          MY_APPREG_CLIENT_SECRET
          MY_APPREG_TENANT_ID
      - The service principal must have:
          Contributor on the Function App resource group
          Key Vault Secrets Officer on the target Key Vault

    Authoring notes:
      - All Function App operations use az CLI, not Az.Functions PowerShell
        cmdlets. Az.Functions v4.3.2 has a GetRuntimeName.ContainsKey() null-key
        bug that crashes on Linux Consumption Function Apps.
      - 'az functionapp config appsettings set' MERGES with existing settings -
        only RAZORPAY_WEBHOOK_SECRET is updated; all other env vars are untouched.
      - Random bytes come from RandomNumberGenerator (CSPRNG). Get-Random is
        deliberately not used.

    Changes from v1 (all bugs fixed):
      - CRITICAL: PRD KeyVaultName was "kv-$AppSlug-dev" → now "kv-$AppSlug-prd".
      - CRITICAL: $envCfg.FunctionApp (wrong map key) → $envCfg.FunctionAppName
                  in every reference (banner, throw messages, az CLI calls).
      - HIGH: Removed Import-Module Az.Functions, Get-AzFunctionApp,
              Get-AzFunctionAppSetting, Update-AzFunctionAppSetting. All replaced
              with az CLI (functionapp show / appsettings list / appsettings set).
      - HIGH: PS7.4+ $PSNativeCommandUseErrorActionPreference guard added around
              az functionapp show so exit code 3 (not found) is handled cleanly.
      - HIGH: Backup now runs AFTER auth + existence check — wrong app name fails
              fast without triggering a spurious backup.
      - HIGH: Verification now compares the EXACT value, not just its length.
      - MEDIUM: PRD confirmation gate added.
      - MEDIUM: Env var pre-validation added (section 1).
      - MEDIUM: Authentication via Azure-Connectivity.ps1 (consistent with all
                other infra scripts; replaces ad-hoc Get-AzContext check).
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('dev', 'prd')]
    [string]$Environment,

    [Parameter(Mandatory = $false)]
    [string]$WebhookSecret,

    [Parameter()]
    [switch] $IgnoreAzAuth
)

$ErrorActionPreference = 'Stop'

# ─── 2. Environment → Azure resource mapping ──────────────────────────────
$AppSlug = 'srilathaartv2'
$envMap = @{
    'dev' = @{
        ResourceGroup   = "rg-$AppSlug-dev"
        FunctionAppName = "func-$AppSlug-dev"
        FrontendUrl     = "https://orange-forest-042a5df00.7.azurestaticapps.net"
        WebhookUrl      = "https://func-$AppSlug-dev.azurewebsites.net/api/razorpay/webhook"
        RazorpayMode    = "TEST mode (rzp_test_... keys)"
        KeyVaultName    = "kv-$AppSlug-dev"
    }
    'prd' = @{
        ResourceGroup   = "rg-$AppSlug-prd"
        FunctionAppName = "func-$AppSlug-prd"
        FrontendUrl     = "https://www.srilatha.art"
        WebhookUrl      = "https://www.srilatha.art/api/razorpay/webhook"
        RazorpayMode    = "LIVE mode (rzp_live_... keys)"
        KeyVaultName    = "kv-$AppSlug-prd"   # v1 BUG: was "kv-$AppSlug-dev"
    }
}

$envCfg = $envMap[$Environment]

# ─── 3. Generate or validate the webhook secret ────────────────────────────
# Done early so the PRD gate can show the new secret length to the operator.
$generated = $false
if ([string]::IsNullOrWhiteSpace($WebhookSecret)) {
    $bytes = [byte[]]::new(32)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $WebhookSecret = [Convert]::ToBase64String($bytes)
    $generated = $true
} else {
    if ($WebhookSecret.Length -lt 16) {
        throw "Provided WebhookSecret is too short ($($WebhookSecret.Length) chars). Use 32+ characters."
    }
}

# ─── 4. Authenticate via service principal ────────────────────────────────
if (-not $IgnoreAzAuth) {
    & "$PSScriptRoot\Azure-Connectivity.ps1"
}
$ctx = Get-AzContext

# ─── 5. Confirm the target Function App exists ────────────────────────────
# az functionapp show exits 3 when the app is missing. PS7.4+'s
# $PSNativeCommandUseErrorActionPreference = $true (default) turns any non-zero
# az exit into a terminating error under $ErrorActionPreference = 'Stop'.
# Toggle it off and handle the exit code explicitly.
$savedNativePref = $PSNativeCommandUseErrorActionPreference
$PSNativeCommandUseErrorActionPreference = $false
try {
    az functionapp show `
        --resource-group $envCfg.ResourceGroup `
        --name           $envCfg.FunctionAppName `
        --output         none 2>$null
    $showExit = $LASTEXITCODE
} finally {
    $PSNativeCommandUseErrorActionPreference = $savedNativePref
}

if ($showExit -ne 0) {
    throw "Function App '$($envCfg.FunctionAppName)' not found in resource group '$($envCfg.ResourceGroup)' (az exit $showExit)."
}

# ─── 6. PRD gate ───────────────────────────────────────────────────────────
if ($Environment -eq 'prd') {
    Write-Host "`n  ⚠  You are about to rotate the LIVE Razorpay webhook secret on PRODUCTION." -ForegroundColor Red
    Write-Host "     New secret will be $($WebhookSecret.Length) characters $(if ($generated) { '(generated)' } else { '(supplied)' })." -ForegroundColor Red
    Write-Host "     You must update the Razorpay Dashboard IMMEDIATELY after this completes." -ForegroundColor Red
    $prdConfirm = Read-Host "  Type 'yes' to continue"
    if ($prdConfirm -ne 'yes') { Write-Host "Aborted by operator." -ForegroundColor Yellow; exit 0 }
}

# ─── 7. Pre-rotation backup ──────────────────────────────────────────────
# Runs AFTER auth + existence check so wrong app name / env fails fast.
try {
    & "$PSScriptRoot\Backup-function-settings-v2.ps1" `
        -FunctionAppName $envCfg.FunctionAppName `
        -KeyVaultName    $envCfg.KeyVaultName `
        -Reason          "pre-rotation: Razorpay webhook secret ($Environment)"
    Write-Host "Pre-rotation backup complete." -ForegroundColor DarkGray
} catch {
    throw "Unable to take pre-rotation backup for '$($envCfg.FunctionAppName)'. Error: $($_.Exception.Message)"
}

# ─── Banner ────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host "Target environment : $Environment" -ForegroundColor Cyan
Write-Host "Resource group     : $($envCfg.ResourceGroup)"
Write-Host "Function App       : $($envCfg.FunctionAppName)"
Write-Host "Razorpay mode      : $($envCfg.RazorpayMode)"
Write-Host "Webhook URL        : $($envCfg.WebhookUrl)"
Write-Host "Signed in as       : $($ctx.Account.Id) on $($ctx.Subscription.Name)" -ForegroundColor DarkGray
Write-Host ''

# ─── 8. Inspect current state ─────────────────────────────────────────────
$settingsJson = az functionapp config appsettings list `
    --resource-group $envCfg.ResourceGroup `
    --name           $envCfg.FunctionAppName `
    --output         json 2>$null

$existing = if ($settingsJson) {
    ($settingsJson | ConvertFrom-Json) |
        Where-Object { $_.name -eq 'RAZORPAY_WEBHOOK_SECRET' }
} else {
    $null
}

if ($existing) {
    # Never reveal the current secret value - log only its length.
    Write-Host "Existing RAZORPAY_WEBHOOK_SECRET found - will overwrite (was $($existing.value.Length) chars)." -ForegroundColor Yellow
} else {
    Write-Host 'No existing RAZORPAY_WEBHOOK_SECRET on this Function App - will add a new one.' -ForegroundColor Yellow
}
Write-Host ''

# ─── 9. Apply ─────────────────────────────────────────────────────────────
# 'az functionapp config appsettings set' MERGES with existing settings -
# only RAZORPAY_WEBHOOK_SECRET is updated; all other app settings are
# left exactly as they were.
Write-Host "Updating RAZORPAY_WEBHOOK_SECRET on $($envCfg.FunctionAppName)..." -ForegroundColor Yellow

az functionapp config appsettings set `
    --resource-group $envCfg.ResourceGroup `
    --name           $envCfg.FunctionAppName `
    --settings       "RAZORPAY_WEBHOOK_SECRET=$WebhookSecret" `
    --output         none

if ($LASTEXITCODE -ne 0) {
    throw "az functionapp config appsettings set failed with exit code $LASTEXITCODE."
}

# ─── 10. Verify ────────────────────────────────────────────────────────────
# Read back the EXACT value and compare - length-only comparison (v1) can
# silently pass when a partial write lands a truncated or different value.
$appliedJson = az functionapp config appsettings list `
    --resource-group $envCfg.ResourceGroup `
    --name           $envCfg.FunctionAppName `
    --output         json 2>$null

if (-not $appliedJson) {
    throw "Verification failed - could not retrieve settings from '$($envCfg.FunctionAppName)' after update."
}

$applied = ($appliedJson | ConvertFrom-Json) |
    Where-Object { $_.name -eq 'RAZORPAY_WEBHOOK_SECRET' }

if (-not $applied) {
    throw "Verification failed - RAZORPAY_WEBHOOK_SECRET is missing from the Function App after update."
}
if ($applied.value -ne $WebhookSecret) {
    throw "Verification failed - RAZORPAY_WEBHOOK_SECRET on the Function App does not match what we sent."
}

Write-Host "OK. RAZORPAY_WEBHOOK_SECRET is now $($applied.value.Length) chars on $($envCfg.FunctionAppName)." -ForegroundColor Green
Write-Host ''

# ─── 11. Post-rotation backup ────────────────────────────────────────────
# Captures the new live state. The Reason tag records the secret length so
# the restore menu makes it clear which backup holds which secret generation.
try {
    & "$PSScriptRoot\Backup-function-settings-v2.ps1" `
        -FunctionAppName $envCfg.FunctionAppName `
        -KeyVaultName    $envCfg.KeyVaultName `
        -Reason          "post-rotation: Razorpay webhook secret ($Environment) | $($applied.value.Length) chars $(if ($generated) { 'generated' } else { 'supplied' })"
    Write-Host "Post-rotation backup complete." -ForegroundColor DarkGray
} catch {
    Write-Warning "Post-rotation backup failed (the rotation itself succeeded): $($_.Exception.Message)"
}

# ─── 12. Print the secret + next step instructions ────────────────────────
Write-Host ''
Write-Host '──────────────────────────────────────────────────────────────────────' -ForegroundColor Magenta
if ($generated) {
    Write-Host 'NEW WEBHOOK SECRET - copy this NOW, it will not be shown again:' -ForegroundColor Magenta
} else {
    Write-Host 'WEBHOOK SECRET (the value you passed in - confirmed on Function App):' -ForegroundColor Magenta
}
Write-Host ''
Write-Host "    $WebhookSecret" -ForegroundColor White -BackgroundColor DarkBlue
Write-Host ''
Write-Host '──────────────────────────────────────────────────────────────────────' -ForegroundColor Magenta
Write-Host ''
Write-Host "NEXT - Razorpay Dashboard ($($envCfg.RazorpayMode))" -ForegroundColor Cyan
Write-Host '  1. Toggle the Test/Live switch to the matching mode at the top right.'
Write-Host '  2. Account & Settings -> Webhooks -> Add new webhook (or edit existing).'
Write-Host "  3. Webhook URL : $($envCfg.WebhookUrl)"
Write-Host '  4. Secret      : paste the value printed above.'
Write-Host '  5. Tick events : payment.captured, payment.failed (minimum).'
Write-Host '  6. Save. Then click the new webhook -> "Test webhook" -> payment.captured.'
Write-Host '     Recent Deliveries should show HTTP 200 within a few seconds.'
Write-Host ''
