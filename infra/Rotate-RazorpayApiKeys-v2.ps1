<#
.SYNOPSIS
    Updates the RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET app settings on
    the matching Function App.

.DESCRIPTION
    Unlike the webhook secret (which we choose ourselves), the Razorpay
    key id + secret are issued by Razorpay and come in matched pairs:
      - test mode  →  rzp_test_xxx + matching secret  (DEV)
      - live mode  →  rzp_live_xxx + matching secret  (PRD)

    Rotating either one alone leaves the other side broken, so this script
    writes BOTH in a single 'az functionapp config appsettings set' call.

    'az functionapp config appsettings set' MERGES with existing settings -
    only RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are touched; all other
    app settings are left exactly as they are.

    Existing Razorpay values are overwritten unconditionally.

.PARAMETER Environment
    Either 'dev' or 'prd'. Picks the correct resource group, Function App
    name, and the expected key prefix (rzp_test_ or rzp_live_).

.PARAMETER KeyId
    The Razorpay Key ID (the 'rzp_test_xxxx' or 'rzp_live_xxxx' string).

.PARAMETER KeySecret
    The Razorpay Key Secret that pairs with the KeyId.

.PARAMETER Force
    Skip the prefix-vs-environment sanity check. Use only when you
    intentionally want to point dev at live keys (or vice versa) for a
    one-off debugging scenario. Without -Force the script refuses to put
    a 'rzp_live_' key on dev or a 'rzp_test_' key on prd.

.EXAMPLE
    # Rotate DEV (test) keys
    ./infra/Rotate-RazorpayApiKeys-v2.ps1 -Environment dev `
        -KeyId 'rzp_test_xxxxxxxxxxxxxx' `
        -KeySecret 'xxxxxxxxxxxxxxxxxxxxxxxx'

.EXAMPLE
    # Rotate PRD (live) keys
    ./infra/Rotate-RazorpayApiKeys-v2.ps1 -Environment prd `
        -KeyId 'rzp_live_aBcDeFgHiJkLmN' `
        -KeySecret 'yyyyyyyyyyyyyyyyyyyyyyyy'

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
      - The KeyId is safe to print to the console (it's the value the browser
        sees when Razorpay Checkout opens). The KeySecret is NEVER printed;
        the script only logs its length after the Function App accepts the write.
      - All Function App operations use az CLI, not Az.Functions PowerShell
        cmdlets. Az.Functions v4.3.2 has a GetRuntimeName.ContainsKey() null-key
        bug that crashes on Linux Consumption Function Apps.

    Changes from v1:
      - Added env var pre-validation (section 1).
      - Replaced ad-hoc subscription-pinning block with Azure-Connectivity.ps1
        for consistent SP authentication (same as all other infra scripts).
      - Backup now calls Backup-function-settings-v2.ps1 with -Reason tag.
      - Removed inline bug-fix annotation comments (code is now canonical).
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('dev', 'prd')]
    [string]$Environment,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$KeyId,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$KeySecret,

    [Parameter(Mandatory = $false)]
    [switch]$Force,

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
        ExpectedPrefix  = 'rzp_test_'
        RazorpayMode    = 'TEST mode'
        KeyVaultName    = "kv-$AppSlug-dev"
    }
    'prd' = @{
        ResourceGroup   = "rg-$AppSlug-prd"
        FunctionAppName = "func-$AppSlug-prd"
        ExpectedPrefix  = 'rzp_live_'
        RazorpayMode    = 'LIVE mode'
        KeyVaultName    = "kv-$AppSlug-prd"
    }
}

$envCfg = $envMap[$Environment]

# ─── 3. Validate inputs ────────────────────────────────────────────────────
$trimmedKeyId = $KeyId.Trim()
$trimmedKeySecret = $KeySecret.Trim()

if ($trimmedKeyId.Length -lt 16) {
    throw "KeyId looks too short ($($trimmedKeyId.Length) chars). Razorpay key ids are usually 20+ characters."
}
if ($trimmedKeySecret.Length -lt 16) {
    throw "KeySecret looks too short ($($trimmedKeySecret.Length) chars). Razorpay key secrets are usually 20+ characters."
}

if (-not $trimmedKeyId.StartsWith($envCfg.ExpectedPrefix)) {
    $msg = "KeyId '$($trimmedKeyId.Substring(0, [Math]::Min(12, $trimmedKeyId.Length)))...' does not start with '$($envCfg.ExpectedPrefix)' - that's the prefix expected for $($envCfg.RazorpayMode) on $Environment."
    if ($Force) {
        Write-Warning "$msg  (-Force was supplied; continuing anyway.)"
    } else {
        throw "$msg`nIf this is intentional (e.g. testing a live key on dev briefly), re-run with -Force."
    }
}

# ─── 4. Authenticate via service principal ────────────────────────────────
if ($IgnoreAzAuth) {
    & "$PSScriptRoot\Azure-Connectivity.ps1"
}
$ctx = Get-AzContext

# ─── 5. PRD gate ───────────────────────────────────────────────────────────
if ($Environment -eq 'prd') {
    Write-Host "`n  ⚠  You are about to rotate LIVE Razorpay keys on PRODUCTION." -ForegroundColor Red
    $prdConfirm = Read-Host "  Type 'yes' to continue"
    if ($prdConfirm -ne 'yes') { Write-Host "Aborted by operator." -ForegroundColor Yellow; exit 0 }
}

# ─── 6. Confirm the target Function App exists ────────────────────────────
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

# ─── 7. Pre-rotation backup ──────────────────────────────────────────────
# Runs AFTER validation + existence check so a wrong environment or a typo
# in FunctionAppName fails fast without triggering a spurious backup.
try {
    & "$PSScriptRoot\Backup-function-settings-v2.ps1" -IgnoreAzAuth `
        -FunctionAppName $envCfg.FunctionAppName `
        -KeyVaultName    $envCfg.KeyVaultName `
        -Reason          "pre-rotation: Razorpay API keys ($Environment)"
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
Write-Host "Expected key prefix: $($envCfg.ExpectedPrefix)"
Write-Host "Signed in as       : $($ctx.Account.Id) on $($ctx.Subscription.Name)" -ForegroundColor DarkGray
Write-Host ''

# ─── 8. Inspect current state ─────────────────────────────────────────────
$settingsJson = az functionapp config appsettings list `
    --resource-group $envCfg.ResourceGroup `
    --name           $envCfg.FunctionAppName `
    --output         json 2>$null

$current = if ($settingsJson) {
    ($settingsJson | ConvertFrom-Json) |
        Where-Object { $_.name -in @('RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET') }
} else {
    @()
}

if ($current) {
    Write-Host 'Existing Razorpay settings on this Function App:' -ForegroundColor Yellow
    foreach ($s in $current | Sort-Object name) {
        if ($s.name -eq 'RAZORPAY_KEY_ID') {
            # Key ID is safe to show - it is visible to browsers via Checkout.
            Write-Host ("  {0} = {1}  (will overwrite)" -f $s.name, $s.value)
        } else {
            # Never print the secret; log only its length.
            Write-Host ("  {0} = ******** ({1} chars, will overwrite)" -f $s.name, $s.value.Length)
        }
    }
} else {
    Write-Host 'No existing Razorpay key settings found - adding new.' -ForegroundColor Yellow
}
Write-Host ''

# ─── 9. Apply ─────────────────────────────────────────────────────────────
# 'az functionapp config appsettings set' MERGES with existing settings -
# only the two keys listed in --settings are updated; everything else is
# left exactly as it was.
Write-Host "Updating RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET on $($envCfg.FunctionAppName)..." -ForegroundColor Yellow

az functionapp config appsettings set `
    --resource-group $envCfg.ResourceGroup `
    --name           $envCfg.FunctionAppName `
    --settings       "RAZORPAY_KEY_ID=$trimmedKeyId" "RAZORPAY_KEY_SECRET=$trimmedKeySecret" `
    --output         none

if ($LASTEXITCODE -ne 0) {
    throw "az functionapp config appsettings set failed with exit code $LASTEXITCODE."
}

# ─── 10. Verify ────────────────────────────────────────────────────────────
$appliedJson = az functionapp config appsettings list `
    --resource-group $envCfg.ResourceGroup `
    --name           $envCfg.FunctionAppName `
    --output         json 2>$null

if (-not $appliedJson) {
    throw "Verification failed - could not retrieve settings from '$($envCfg.FunctionAppName)' after update."
}

$applied = ($appliedJson | ConvertFrom-Json) |
    Where-Object { $_.name -in @('RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET') } |
    Sort-Object name

$appliedKeyId = ($applied | Where-Object { $_.name -eq 'RAZORPAY_KEY_ID' }).value
$appliedKeySecret = ($applied | Where-Object { $_.name -eq 'RAZORPAY_KEY_SECRET' }).value

if ($appliedKeyId -ne $trimmedKeyId) {
    throw "Verification failed - RAZORPAY_KEY_ID on the Function App does not match what we sent."
}
if ($appliedKeySecret -ne $trimmedKeySecret) {
    throw "Verification failed - RAZORPAY_KEY_SECRET on the Function App does not match what we sent."
}

# ─── 11. Post-rotation backup ────────────────────────────────────────────
# Captures the new live state so the restore menu shows exactly what key was
# applied and when - useful if you need to roll back to this exact state.
try {
    & "$PSScriptRoot\Backup-function-settings-v2.ps1" -IgnoreAzAuth`
    -FunctionAppName $envCfg.FunctionAppName `
        -KeyVaultName    $envCfg.KeyVaultName `
        -Reason          "post-rotation: Razorpay API keys ($Environment) | KeyId=$appliedKeyId"
    Write-Host "Post-rotation backup complete." -ForegroundColor DarkGray
} catch {
    Write-Warning "Post-rotation backup failed (the rotation itself succeeded): $($_.Exception.Message)"
}

# ─── 12. Done ──────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '──────────────────────────────────────────────────────────────────────' -ForegroundColor Magenta
Write-Host "OK. $($envCfg.FunctionAppName) is now using:" -ForegroundColor Green
Write-Host ''
Write-Host "  RAZORPAY_KEY_ID     = $appliedKeyId" -ForegroundColor White
Write-Host ("  RAZORPAY_KEY_SECRET = ******** ({0} chars)" -f $appliedKeySecret.Length) -ForegroundColor White
Write-Host '──────────────────────────────────────────────────────────────────────' -ForegroundColor Magenta
Write-Host ''
Write-Host 'NEXT' -ForegroundColor Cyan
Write-Host '  - Restart is not required: Function App settings hot-reload on next invocation.'
Write-Host '  - Sanity check: open any page that triggers a Razorpay order create flow and confirm'
Write-Host "    the Checkout iframe opens with key '$appliedKeyId'."
Write-Host '  - If you also rotated the webhook secret, run Rotate-RazorpayWebhookSecret-v2.ps1 next.'
Write-Host ''
