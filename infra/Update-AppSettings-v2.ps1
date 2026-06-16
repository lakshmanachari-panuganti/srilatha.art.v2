<#
.SYNOPSIS
    Updates one or more miscellaneous app settings on the matching Function App.

.DESCRIPTION
    Writes any combination of the following app settings in a single
    'az functionapp config appsettings set' call:

      INVOICE_LOGO_URL
      SMTP_PASS
      WHATSAPP_ACCESS_TOKEN
      WHATSAPP_APP_SECRET
      WHATSAPP_PHONE_NUMBER_ID
      WHATSAPP_WABA_ID
      WHATSAPP_WEBHOOK_VERIFY_TOKEN
      GOOGLE_CLIENT_ID

    All parameters are optional, but at least one must be supplied.

    'az functionapp config appsettings set' MERGES with existing settings -
    only the settings you supply are touched; all others are left exactly
    as they are.

.PARAMETER Environment
    Either 'dev' or 'prd'. Picks the correct resource group, Function App
    name, and Key Vault.

.PARAMETER InvoiceLogoUrl
    Public URL of the logo image embedded in invoice PDFs.

.PARAMETER SmtpPass
    SMTP account password used by the mailer service.

.PARAMETER WhatsAppAccessToken
    WhatsApp Cloud API bearer token (issued by Meta).

.PARAMETER WhatsAppAppSecret
    Meta app secret used to verify webhook payload signatures.

.PARAMETER WhatsAppPhoneNumberId
    WhatsApp Cloud API phone number ID.

.PARAMETER WhatsAppWabaId
    WhatsApp Business Account (WABA) ID.

.PARAMETER WhatsAppWebhookVerifyToken
    Arbitrary token used to verify the WhatsApp webhook subscription handshake.

.PARAMETER GoogleClientId
    Google OAuth Client ID (e.g. '1234567890-abcdefg.apps.googleusercontent.com').
    Read by the backend and surfaced to the frontend via GET /api/config/public,
    so the customer "Continue with Google" button can be enabled at runtime
    without baking the value into the static frontend build.
    Public value (appears in served HTML once the SPA fetches it) - shown
    in the console alongside INVOICE_LOGO_URL.

.EXAMPLE
    # Update only the SMTP password on DEV
    ./infra/Update-AppSettings-v2.ps1 -Environment dev `
        -SmtpPass 'NewP@ssw0rd!'

.EXAMPLE
    # Update only the Google OAuth Client ID on DEV
    ./infra/Update-AppSettings-v2.ps1 -Environment dev `
        -GoogleClientId '1234567890-abcdefg.apps.googleusercontent.com'

.EXAMPLE
    # Update all WhatsApp-related settings on PRD
    ./infra/Update-AppSettings-v2.ps1 -Environment prd `
        -WhatsAppAccessToken  'EAAxxxxxxxx' `
        -WhatsAppAppSecret    'abc123def456' `
        -WhatsAppPhoneNumberId '1234567890' `
        -WhatsAppWabaId        '9876543210' `
        -WhatsAppWebhookVerifyToken 'my-verify-token'

.EXAMPLE
    # Dry-run on PRD - shows what would change without writing.
    ./infra/Update-AppSettings-v2.ps1 -Environment prd `
        -SmtpPass 'NewP@ssw0rd!' -WhatIf

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
      - INVOICE_LOGO_URL is safe to display in the console (it is a public URL).
      - All other settings are treated as secrets and their values are NEVER
        printed; only their lengths are logged after the write succeeds.
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('dev', 'prd')]
    [string]$Environment,

    [Parameter(Mandatory = $false)]
    [string]$InvoiceLogoUrl,

    [Parameter(Mandatory = $false)]
    [string]$SmtpPass,

    [Parameter(Mandatory = $false)]
    [string]$WhatsAppAccessToken,

    [Parameter(Mandatory = $false)]
    [string]$WhatsAppAppSecret,

    [Parameter(Mandatory = $false)]
    [string]$WhatsAppPhoneNumberId,

    [Parameter(Mandatory = $false)]
    [string]$WhatsAppWabaId,

    [Parameter(Mandatory = $false)]
    [string]$WhatsAppWebhookVerifyToken,

    [Parameter(Mandatory = $false)]
    [string]$GoogleClientId,

    [Parameter()]
    [switch] $IgnoreAzAuth
)

$ErrorActionPreference = 'Stop'

if ($IgnoreAzAuth) {
    & "$PSScriptRoot\Azure-Connectivity.ps1"
}

# Disable the PS7.4+ default of throwing on native-command non-zero exits, so
# our explicit `if ($LASTEXITCODE -ne 0)` checks always run and produce the
# tailored error messages below. Without this, az failures would throw a
# generic NativeCommandExitException before our handlers ever see them.
$PSNativeCommandUseErrorActionPreference = $false

# ─── 2. Environment → Azure resource mapping ──────────────────────────────
$AppSlug = 'srilathaartv2'
$envMap = @{
    'dev' = @{
        ResourceGroup   = "rg-$AppSlug-dev"
        FunctionAppName = "func-$AppSlug-dev"
        KeyVaultName    = "kv-$AppSlug-dev"
    }
    'prd' = @{
        ResourceGroup   = "rg-$AppSlug-prd"
        FunctionAppName = "func-$AppSlug-prd"
        KeyVaultName    = "kv-$AppSlug-prd"
    }
}

$envCfg = $envMap[$Environment]

# ─── 3. Build the map of settings to apply ────────────────────────────────
# Only include parameters that were actually supplied by the caller.
#
# Trim() is applied to URLs and IDs (where copy-paste whitespace is a bug)
# but NEVER to secrets - a real token can legitimately contain leading or
# trailing whitespace, and silently stripping it would corrupt the value.
$settingsToApply = [ordered]@{}

if ($PSBoundParameters.ContainsKey('InvoiceLogoUrl')) { $settingsToApply['INVOICE_LOGO_URL'] = $InvoiceLogoUrl.Trim() }
if ($PSBoundParameters.ContainsKey('SmtpPass')) { $settingsToApply['SMTP_PASS'] = $SmtpPass }
if ($PSBoundParameters.ContainsKey('WhatsAppAccessToken')) { $settingsToApply['WHATSAPP_ACCESS_TOKEN'] = $WhatsAppAccessToken }
if ($PSBoundParameters.ContainsKey('WhatsAppAppSecret')) { $settingsToApply['WHATSAPP_APP_SECRET'] = $WhatsAppAppSecret }
if ($PSBoundParameters.ContainsKey('WhatsAppPhoneNumberId')) { $settingsToApply['WHATSAPP_PHONE_NUMBER_ID'] = $WhatsAppPhoneNumberId.Trim() }
if ($PSBoundParameters.ContainsKey('WhatsAppWabaId')) { $settingsToApply['WHATSAPP_WABA_ID'] = $WhatsAppWabaId.Trim() }
if ($PSBoundParameters.ContainsKey('WhatsAppWebhookVerifyToken')) { $settingsToApply['WHATSAPP_WEBHOOK_VERIFY_TOKEN'] = $WhatsAppWebhookVerifyToken }
if ($PSBoundParameters.ContainsKey('GoogleClientId')) { $settingsToApply['GOOGLE_CLIENT_ID'] = $GoogleClientId.Trim() }

if ($settingsToApply.Count -eq 0) {
    throw "No settings provided. Supply at least one parameter to update."
}

# A newline embedded in a value would break the KEY=VALUE argument passed to
# az CLI and could silently corrupt another setting's key name. Reject up front.
foreach ($entry in $settingsToApply.GetEnumerator()) {
    if ($entry.Value -match "[\r\n]") {
        throw "Setting '$($entry.Key)' contains an embedded newline, which cannot be passed safely via the file-based settings argument. Strip the newline and retry."
    }
}

# Settings whose values are safe to display in console output.
# INVOICE_LOGO_URL is a public URL embedded in invoice PDFs.
# GOOGLE_CLIENT_ID is a public OAuth client identifier (visible in served HTML).
# All other settings are treated as secrets and masked.
$safeToDisplay = @('INVOICE_LOGO_URL', 'GOOGLE_CLIENT_ID')

# ─── 4. Authenticate via service principal ────────────────────────────────
& "$PSScriptRoot\Azure-Connectivity.ps1"
$ctx = Get-AzContext

# ─── 5. Confirm the target Function App exists ────────────────────────────
$showOutput = az functionapp show `
    --resource-group $envCfg.ResourceGroup `
    --name           $envCfg.FunctionAppName `
    --output         none 2>&1
$showExit = $LASTEXITCODE

if ($showExit -ne 0) {
    throw "Function App '$($envCfg.FunctionAppName)' is not reachable in resource group '$($envCfg.ResourceGroup)' (az exit $showExit): $showOutput"
}

# ─── 6. Banner ────────────────────────────────────────────────────────────
# Printed before the PRD gate so the operator confirms with full context
# (which subscription, which Function App, which keys) visible.
Write-Host ''
Write-Host "Target environment : $Environment" -ForegroundColor Cyan
Write-Host "Resource group     : $($envCfg.ResourceGroup)"
Write-Host "Function App       : $($envCfg.FunctionAppName)"
Write-Host "Settings to update : $($settingsToApply.Count) ($($settingsToApply.Keys -join ', '))"
Write-Host "Signed in as       : $($ctx.Account.Id) on $($ctx.Subscription.Name)" -ForegroundColor DarkGray
Write-Host ''

# ─── 7. PRD gate ───────────────────────────────────────────────────────────
if ($Environment -eq 'prd') {
    Write-Host "  ⚠  You are about to update app settings on PRODUCTION." -ForegroundColor Red
    $prompt = "  Type 'yes' to update '$($envCfg.FunctionAppName)' in subscription '$($ctx.Subscription.Name)'"
    $prdConfirm = Read-Host $prompt
    if ($prdConfirm -ne 'yes') {
        Write-Host "Aborted by operator." -ForegroundColor Yellow
        exit 0
    }
}

# ─── 8. Pre-update backup ────────────────────────────────────────────────
if ($PSCmdlet.ShouldProcess($envCfg.FunctionAppName, 'pre-update Key Vault backup')) {
    try {
        & "$PSScriptRoot\Backup-function-settings-v2.ps1" -IgnoreAzAuth `
            -FunctionAppName $envCfg.FunctionAppName `
            -KeyVaultName    $envCfg.KeyVaultName `
            -Reason          "pre-update: misc app settings ($Environment) | keys=$($settingsToApply.Keys -join ',')"
        Write-Host "Pre-update backup complete." -ForegroundColor DarkGray
    } catch {
        throw "Unable to take pre-update backup for '$($envCfg.FunctionAppName)'. Error: $($_.Exception.Message)"
    }
}

# ─── 9. Inspect current state ─────────────────────────────────────────────
$existingJson = az functionapp config appsettings list `
    --resource-group $envCfg.ResourceGroup `
    --name           $envCfg.FunctionAppName `
    --output         json 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "Could not list existing app settings for '$($envCfg.FunctionAppName)' (az exit $LASTEXITCODE)."
}

$existing = if ($existingJson) {
    ($existingJson | ConvertFrom-Json) |
        Where-Object { $_.name -in $settingsToApply.Keys }
} else {
    @()
}

if ($existing) {
    Write-Host 'Existing values for the settings being updated:' -ForegroundColor Yellow
    foreach ($s in $existing | Sort-Object name) {
        # `value` can be $null for unresolved Key Vault references - guard with ??.
        $len = ($s.value ?? '').Length
        if ($safeToDisplay -contains $s.name) {
            Write-Host ("  {0} = {1}  (will overwrite)" -f $s.name, $s.value)
        } else {
            Write-Host ("  {0} = ******** ({1} chars, will overwrite)" -f $s.name, $len)
        }
    }
} else {
    Write-Host 'No existing values found for the supplied settings - adding new.' -ForegroundColor Yellow
}
Write-Host ''

# ─── 10. Apply ─────────────────────────────────────────────────────────────
# `az functionapp config appsettings set --settings` accepts space-separated
# KEY=VALUE pairs. PowerShell array splatting (@settingArgs) expands each
# element as a separate argument, which is the correct multi-value form for
# this az command. 'az functionapp config appsettings set' MERGES with existing
# settings - only the keys listed here are touched.
if ($PSCmdlet.ShouldProcess($envCfg.FunctionAppName, "update $($settingsToApply.Count) app setting(s)")) {
    Write-Host "Updating $($settingsToApply.Count) setting(s) on $($envCfg.FunctionAppName)..." -ForegroundColor Yellow

    $settingArgs = @($settingsToApply.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" })

    az functionapp config appsettings set `
        --resource-group $envCfg.ResourceGroup `
        --name           $envCfg.FunctionAppName `
        --settings       @settingArgs `
        --output         none

    if ($LASTEXITCODE -ne 0) {
        throw "az functionapp config appsettings set failed with exit code $LASTEXITCODE."
    }

    # ─── 11. Verify ────────────────────────────────────────────────────────
    $appliedJson = az functionapp config appsettings list `
        --resource-group $envCfg.ResourceGroup `
        --name           $envCfg.FunctionAppName `
        --output         json 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Verification failed - could not list settings on '$($envCfg.FunctionAppName)' (az exit $LASTEXITCODE). The write itself may have succeeded; restore from the pre-update backup in Key Vault '$($envCfg.KeyVaultName)' (reason starts with 'pre-update: misc app settings') if needed."
    }

    $appliedAll = $appliedJson | ConvertFrom-Json

    foreach ($entry in $settingsToApply.GetEnumerator()) {
        $appliedEntry = $appliedAll | Where-Object { $_.name -eq $entry.Key }
        if (-not $appliedEntry) {
            throw "Verification failed - '$($entry.Key)' was not found on '$($envCfg.FunctionAppName)' after update. Restore from the pre-update backup in Key Vault '$($envCfg.KeyVaultName)' (reason starts with 'pre-update: misc app settings')."
        }
        if ($appliedEntry.value -ne $entry.Value) {
            throw "Verification failed - '$($entry.Key)' on '$($envCfg.FunctionAppName)' does not match what we sent. Restore from the pre-update backup in Key Vault '$($envCfg.KeyVaultName)' (reason starts with 'pre-update: misc app settings')."
        }
    }
} else {
    Write-Host "Skipped apply (-WhatIf)." -ForegroundColor DarkGray
    Write-Host ''
    exit 0
}

# ─── 12. Post-update backup ──────────────────────────────────────────────
if ($PSCmdlet.ShouldProcess($envCfg.FunctionAppName, 'post-update Key Vault backup')) {
    try {
        & "$PSScriptRoot\Backup-function-settings-v2.ps1" -IgnoreAzAuth `
            -FunctionAppName $envCfg.FunctionAppName `
            -KeyVaultName    $envCfg.KeyVaultName `
            -Reason          "post-update: misc app settings ($Environment) | keys=$($settingsToApply.Keys -join ',')"
        Write-Host "Post-update backup complete." -ForegroundColor DarkGray
    } catch {
        Write-Warning "Post-update backup failed (the update itself succeeded): $($_.Exception.Message)"
    }
}

# ─── 13. Done ──────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '──────────────────────────────────────────────────────────────────────' -ForegroundColor Magenta
Write-Host "OK. $($envCfg.FunctionAppName) now has the following updated settings:" -ForegroundColor Green
Write-Host ''

foreach ($entry in $settingsToApply.GetEnumerator() | Sort-Object Key) {
    if ($safeToDisplay -contains $entry.Key) {
        Write-Host ("  {0} = {1}" -f $entry.Key, $entry.Value) -ForegroundColor White
    } else {
        Write-Host ("  {0} = ******** ({1} chars)" -f $entry.Key, $entry.Value.Length) -ForegroundColor White
    }
}

Write-Host '──────────────────────────────────────────────────────────────────────' -ForegroundColor Magenta
Write-Host ''
Write-Host 'NEXT' -ForegroundColor Cyan
Write-Host '  - Restart is not required: Function App settings hot-reload on next invocation.'
Write-Host '  - Sanity check: trigger a flow that exercises the updated setting(s) and confirm'
Write-Host '    expected behaviour.'
Write-Host ''

exit 0
