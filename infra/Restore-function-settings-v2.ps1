<#
.SYNOPSIS
    Restores Function App settings from an Azure Key Vault backup.

.DESCRIPTION
    Reads secrets written by Backup-function-settings.ps1 and restores them
    to the target Function App. For each setting in the backup:

      - If the key already exists in the live app  → OVERWRITE
      - If the key does not exist in the live app  → CREATE
      - If the value is already identical          → SAME (untouched)

    Keys that exist in the live app but are NOT in the selected backup
    are left completely untouched.

    Three special cases are reversed on restore:

      1. Underscore ( _ )
         KV name has a single hyphen - restored via the OriginalKey tag.
         e.g.  AZURE-OPENAI-KEY  →  AZURE_OPENAI_KEY

      2. Dot ( . )
         KV name has -DOT- - restored via the OriginalKey tag.
         e.g.  TEST-DOT-DELETE  →  TEST.DELETE

      3. Empty value
         KV secret holds the sentinel __EMPTY__ - restored as an empty string.
         e.g.  __EMPTY__  →  ""

    A diff is shown before anything is changed, and you must confirm
    before the script touches the Function App.

.PARAMETER FunctionAppName
    Name of the Azure Function App to restore settings into.

.PARAMETER KeyVaultName
    Name of the Key Vault that holds the backup secrets.

.PARAMETER BackupDate
    Optional. The exact backup-date string to restore, e.g.
    "2026-05-31T23:02:08.266". If omitted, the script shows a menu
    of all available backup dates and asks you to pick one.

.EXAMPLE
    # Interactive - pick a backup from the menu
    ./infra/Restore-function-settings-v2.ps1 `
        -FunctionAppName func-srilathaartv2-dev `
        -KeyVaultName    kv-srilathaartv2-dev

.EXAMPLE
    # Non-interactive - pass the backup date directly
    ./infra/Restore-function-settings-v2.ps1 `
        -FunctionAppName func-srilathaartv2-dev `
        -KeyVaultName    kv-srilathaartv2-dev `
        -BackupDate      "2026-05-31T23:02:08.266"

.NOTES
    Requirements:
      - PowerShell 7+
      - Az.Accounts, Az.Resources, Az.KeyVault (4.0+) modules
        (4.0+ is needed for -AsPlainText on Get-AzKeyVaultSecret)
      - The following environment variables must be set before running:
          MY_APPREG_CLIENT_ID
          MY_APPREG_CLIENT_SECRET
          MY_APPREG_TENANT_ID
      - The service principal must have:
          Contributor on the Function App resource group
          Key Vault Secrets User (or higher) on the Key Vault

    Changes from v1:
      - H1: Disabled KV secret versions are now filtered out so stale /
            explicitly-disabled backup versions cannot pollute a restore.
      - H2: Fallback decode comment corrected ('x-' prefix, not "digit prefix").
      - M1: Post-restore read-back verification added (step 13) - catches
            partial ARM writes that return HTTP 200 but miss some keys.
      - M2: [int]::TryParse used instead of [int]$selection - prevents
            OverflowException when user pastes a very large number.
      - L1: Section 2 comment updated to reflect Azure-Connectivity.ps1 usage.
      - L2: BackupDate error message now shows expected format and an example
            from the available dates list.
      - L3: [n/total] progress counter shown while reading KV secret versions.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$FunctionAppName,

    [Parameter(Mandatory = $true)]
    [string]$KeyVaultName,

    [Parameter(Mandatory = $false)]
    [string]$BackupDate,

    [Parameter()]
    [switch] $IgnoreAzAuth
)

$ErrorActionPreference = 'Stop'

# -------------------------------------------------------
# 1. Validate required environment variables up front
# -------------------------------------------------------
foreach ($envVar in @('MY_APPREG_CLIENT_ID', 'MY_APPREG_CLIENT_SECRET', 'MY_APPREG_TENANT_ID')) {
    if ([string]::IsNullOrEmpty((Get-Item "env:$envVar" -ErrorAction SilentlyContinue).Value)) {
        throw "Required environment variable '$envVar' is not set."
    }
}

# -------------------------------------------------------
# 2. Authenticate via Azure-Connectivity.ps1
#    L1: Comment updated - v1 said "Sign in using the service principal"
#    but the code delegates entirely to Azure-Connectivity.ps1.
# -------------------------------------------------------
if($IgnoreAzAuth.present){
    & "$PSScriptRoot\Azure-Connectivity.ps1"
}
$ctx = Get-AzContext

Write-Host "==============================================="
Write-Host "Function App Settings Restore"
Write-Host "==============================================="
Write-Host "Function App : $FunctionAppName"
Write-Host "Key Vault    : $KeyVaultName"
Write-Host "Signed in as : $($ctx.Account.Id) on $($ctx.Subscription.Name)" -ForegroundColor DarkGray
Write-Host ""

# -------------------------------------------------------
# 3. Find the Function App
#    @() forces the result into an array so .Count always works
#    even when only one item is returned
# -------------------------------------------------------
$faResources = @(Get-AzResource `
        -ResourceType "Microsoft.Web/sites" `
        -Name         $FunctionAppName `
        -ErrorAction  SilentlyContinue)

if ($faResources.Count -eq 0) {
    throw "Function App '$FunctionAppName' not found in subscription '$($ctx.Subscription.Name)'."
}

if ($faResources.Count -gt 1) {
    Write-Warning "Multiple Function Apps named '$FunctionAppName' found. Using the first one in resource group '$($faResources[0].ResourceGroupName)'."
}

$faResource = $faResources[0]
$resourceGroupName = $faResource.ResourceGroupName

Write-Host "Resource Group : $resourceGroupName"
Write-Host ""

# -------------------------------------------------------
# 4. Make sure the Key Vault exists
# -------------------------------------------------------
$keyVault = Get-AzKeyVault -VaultName $KeyVaultName -ErrorAction SilentlyContinue
if (-not $keyVault) {
    throw "Key Vault '$KeyVaultName' not found. Make sure Backup-function-settings.ps1 has been run first."
}

# -------------------------------------------------------
# 5. Read all secret versions from the Key Vault
#    H1: Filter out disabled secret versions so stale / corrupted backup
#    versions that were explicitly disabled cannot pollute the restore.
#    L3: [n/total] progress counter shown per secret - a vault with many
#    secrets can take time and was previously completely silent.
# -------------------------------------------------------
Write-Host "Reading backup secrets from Key Vault..." -ForegroundColor DarkGray

$secretNames = @(Get-AzKeyVaultSecret -VaultName $KeyVaultName | Select-Object -ExpandProperty Name)

if ($secretNames.Count -eq 0) {
    throw "No secrets found in Key Vault '$KeyVaultName'. Has Backup-function-settings.ps1 been run against this vault?"
}

$allVersions = [System.Collections.Generic.List[object]]::new()
$secretIdx = 0
foreach ($secretName in $secretNames) {
    $secretIdx++
    Write-Host "  [$secretIdx/$($secretNames.Count)] $secretName" -ForegroundColor DarkGray
    Get-AzKeyVaultSecret -VaultName $KeyVaultName -Name $secretName -IncludeVersions |
        Where-Object { $_.Enabled -ne $false } |
        ForEach-Object { $allVersions.Add($_) }
}

# -------------------------------------------------------
# 6. Build the list of available backup dates from the tags
#    Also collect the Reason tag per date so it can be shown
#    in the menu alongside each timestamp.
# -------------------------------------------------------
$backupDates = @(
    $allVersions |
        Where-Object { $_.Tags -and $_.Tags.ContainsKey("BackupDate") } |
        ForEach-Object { $_.Tags["BackupDate"] } |
        Sort-Object -Unique
)

# Map each date to its Reason (all secrets in one run share the same tag;
# take the first non-empty value found for each date)
$dateReasons = @{}
foreach ($v in $allVersions) {
    if (-not $v.Tags) { continue }
    $d = $v.Tags["BackupDate"]
    if (-not $d) { continue }
    if ($dateReasons.ContainsKey($d)) { continue }   # already captured
    $r = if ($v.Tags.ContainsKey("Reason")) { $v.Tags["Reason"] } else { '' }
    $dateReasons[$d] = $r
}

if ($backupDates.Count -eq 0) {
    throw "No tagged backup versions found. The secrets in '$KeyVaultName' may not have been created by Backup-function-settings.ps1."
}

# -------------------------------------------------------
# 7. Resolve which backup date to restore
#    Either the caller passed -BackupDate, or we show a menu
# -------------------------------------------------------
if ($BackupDate) {

    if ($backupDates -notcontains $BackupDate) {
        # L2: Show the expected format alongside available dates so the
        # caller knows exactly what string to pass next time.
        Write-Host "Available backup dates (format: yyyy-MM-ddTHH:mm:ss.fff):"
        $backupDates | ForEach-Object {
            $r = $dateReasons[$_]
            Write-Host "  $_$(if ($r) { "  ($r)" })"
        }
        Write-Host ""
        throw "BackupDate '$BackupDate' was not found in Key Vault '$KeyVaultName'. Dates must match exactly (e.g. '$($backupDates[-1])')."
    }

    $selectedDate = $BackupDate

} else {

    Write-Host "Available backup versions:"
    Write-Host ""
    for ($i = 0; $i -lt $backupDates.Count; $i++) {
        $d = $backupDates[$i]
        $r = $dateReasons[$d]
        $label = if ($r) { "$d  ($r)" } else { $d }
        Write-Host "  [$($i + 1)]  $label"
    }
    Write-Host ""

    $selection = Read-Host "Enter the number of the backup to restore"

    # M2: [int]::TryParse avoids an OverflowException when the user pastes
    # a very large number - [int]$selection would throw before the range
    # guard is even evaluated under Set-StrictMode.
    $selInt = 0
    if (-not [int]::TryParse($selection, [ref]$selInt) -or $selInt -lt 1 -or $selInt -gt $backupDates.Count) {
        throw "Invalid selection '$selection'. Please enter a number between 1 and $($backupDates.Count)."
    }

    $selectedDate = $backupDates[$selInt - 1]
}

$selectedReason = $dateReasons[$selectedDate]
Write-Host ""
Write-Host "Selected backup : $selectedDate$(if ($selectedReason) { "  ($selectedReason)" })"
Write-Host ""

# -------------------------------------------------------
# 8. Build the settings dictionary from the selected backup
#
#    For each secret in the selected backup we handle three cases:
#
#    CASE 1 - Empty value (sentinel)
#      If the KV secret value is __EMPTY__, the original setting
#      was empty. We convert it back to an empty string for restore.
#
#    CASE 2 - Dot ( . ) in the name
#      The OriginalKey tag holds TEST.DELETE exactly.
#      We read the tag - no decoding needed.
#
#    CASE 3 - Underscore ( _ ) in the name
#      The OriginalKey tag holds AZURE_OPENAI_KEY exactly.
#      We read the tag - no decoding needed.
#
#    The OriginalKey tag is always the source of truth for the name.
#    The fallback (if tag is missing) reverses the encoding manually.
# -------------------------------------------------------
$backupSettings = @{}

$selectedVersions = $allVersions | Where-Object {
    $_.Tags -and
    $_.Tags.ContainsKey("BackupDate") -and
    $_.Tags["BackupDate"] -eq $selectedDate
}

foreach ($version in $selectedVersions) {

    # Read the plaintext value for this exact secret version
    $value = Get-AzKeyVaultSecret `
        -VaultName  $KeyVaultName `
        -Name       $version.Name `
        -Version    $version.Version `
        -AsPlainText

    # Resolve the original setting name from the OriginalKey tag
    if ($version.Tags -and $version.Tags.ContainsKey("OriginalKey")) {

        # Primary path - always reliable
        $originalKey = $version.Tags["OriginalKey"]

    } else {

        # Fallback path - reverse the encoding manually
        # Order matters: decode -DOT- first, then single hyphens
        # CASE 2 : -DOT-  →  .
        # CASE 3 : -      →  _
        # H2: Comment corrected from v1 ("strip digit prefix" was wrong).
        $originalKey = $version.Name
        $originalKey = $originalKey -replace '-DOT-', '.'   # CASE 2
        $originalKey = $originalKey -replace '^x-', ''      # strip 'x-' prefix added when original name started with a digit (KV names cannot begin with a digit)
        $originalKey = $originalKey -replace '-', '_'        # CASE 3
        Write-Warning "Secret '$($version.Name)' has no OriginalKey tag - decoded fallback: '$originalKey'. Verify after restore."
    }

    # CASE 1 - sentinel means the original value was empty
    if ($value -eq '__EMPTY__') {
        Write-Host "  Note: '$originalKey' was empty in the backup - will restore as empty." -ForegroundColor DarkGray
        $value = ''
    }

    $backupSettings[$originalKey] = $value
}

if ($backupSettings.Count -eq 0) {
    throw "No settings found for backup date '$selectedDate'. The backup may be empty or corrupted."
}

Write-Host "Settings in this backup : $($backupSettings.Count)"
Write-Host ""

# -------------------------------------------------------
# 9. Read the current live Function App settings
# -------------------------------------------------------
$subId = $ctx.Subscription.Id
$getPath = "/subscriptions/$subId/resourceGroups/$resourceGroupName" +
    "/providers/Microsoft.Web/sites/$FunctionAppName" +
    "/config/appsettings/list?api-version=2022-03-01"

$getResponse = Invoke-AzRestMethod -Method POST -Path $getPath -Payload '{}'

if ($getResponse.StatusCode -ne 200) {
    throw "Could not read current Function App settings (HTTP $($getResponse.StatusCode)): $($getResponse.Content)"
}

$currentSettings = ($getResponse.Content | ConvertFrom-Json).properties

# -------------------------------------------------------
# 10. Check each key and print its status live
#     [CREATE]           - does not exist in the live app
#     [OVERWRITE]        - exists but value is different
#     [SAME]             - exists and value is already correct
#     [NOT IN BACKUP]    - exists in live app but not in backup
# -------------------------------------------------------
$toCreate    = [System.Collections.Generic.List[string]]::new()
$toOverwrite = [System.Collections.Generic.List[string]]::new()
$same        = [System.Collections.Generic.List[string]]::new()

Write-Host "Checking each setting against the live app:"
Write-Host ""

foreach ($key in ($backupSettings.Keys | Sort-Object)) {
    $liveEntry = $currentSettings.PSObject.Properties[$key]

    if ($null -eq $liveEntry) {
        Write-Host "  [CREATE]     $key" -ForegroundColor Green
        $toCreate.Add($key)
    } elseif ($liveEntry.Value -ne $backupSettings[$key]) {
        Write-Host "  [OVERWRITE]  $key" -ForegroundColor Yellow
        $toOverwrite.Add($key)
    } else {
        Write-Host "  [SAME]       $key" -ForegroundColor DarkGray
        $same.Add($key)
    }
}

# Keys in the live app that are not in the backup - never touched
$untouched = @(
    $currentSettings.PSObject.Properties.Name |
        Where-Object { -not $backupSettings.ContainsKey($_) } |
        Sort-Object
)

if ($untouched.Count -gt 0) {
    Write-Host ""
    foreach ($k in $untouched) {
        Write-Host "  [NOT IN BACKUP]  $k" -ForegroundColor Cyan
    }
}

Write-Host ""

# -------------------------------------------------------
# 11. If nothing needs to change, exit early
# -------------------------------------------------------
if ($toCreate.Count -eq 0 -and $toOverwrite.Count -eq 0) {
    Write-Host "Nothing to do - the live app already matches this backup." -ForegroundColor Green
    exit 0
}

Write-Host "Summary : $($toCreate.Count) to CREATE, $($toOverwrite.Count) to OVERWRITE, $($same.Count) already correct, $($untouched.Count) not in backup." -ForegroundColor Yellow
Write-Host "Note    : This will restart the Function App." -ForegroundColor Yellow
Write-Host ""

$confirm = Read-Host "Apply changes? [y/N]"
if ($confirm -notmatch '^[Yy]$') {
    Write-Host "Aborted. No changes were made." -ForegroundColor Yellow
    exit 0
}

# -------------------------------------------------------
# 12. Apply all changes in one ARM REST API call
#     PUT replaces the full settings block, so we merge
#     the backup on top of the current settings - that way
#     keys not in the backup are preserved.
# -------------------------------------------------------
Write-Host ""
Write-Host "Applying changes to Function App..."

$mergedSettings = @{}
$currentSettings.PSObject.Properties | ForEach-Object {
    $mergedSettings[$_.Name] = $_.Value
}
foreach ($key in $backupSettings.Keys) {
    $mergedSettings[$key] = $backupSettings[$key]
}

$putBody = @{ properties = $mergedSettings } | ConvertTo-Json -Depth 10 -Compress

$putPath = "/subscriptions/$subId/resourceGroups/$resourceGroupName" +
    "/providers/Microsoft.Web/sites/$FunctionAppName" +
    "/config/appsettings?api-version=2022-03-01"

$putResponse = Invoke-AzRestMethod -Method PUT -Path $putPath -Payload $putBody

if ($putResponse.StatusCode -notin @(200, 201)) {
    throw "Failed to apply settings (HTTP $($putResponse.StatusCode)): $($putResponse.Content)"
}

# -------------------------------------------------------
# 13. Verify - read back and diff to catch partial ARM writes
#     M1: A timeout/retry during the PUT can produce HTTP 200 but still
#     leave some keys unwritten. HTTP status alone is not sufficient.
# -------------------------------------------------------
Write-Host ""
Write-Host "Verifying restore..." -ForegroundColor DarkGray

$verifyResponse = Invoke-AzRestMethod -Method POST -Path $getPath -Payload '{}'
if ($verifyResponse.StatusCode -ne 200) {
    Write-Warning "Could not read back settings for verification (HTTP $($verifyResponse.StatusCode)). The PUT succeeded but post-restore check was skipped."
} else {
    $verifiedSettings = ($verifyResponse.Content | ConvertFrom-Json).properties
    $verifyFailed = @()
    foreach ($key in $backupSettings.Keys) {
        $liveVal = $verifiedSettings.PSObject.Properties[$key]
        if ($null -eq $liveVal -or $liveVal.Value -ne $backupSettings[$key]) {
            $verifyFailed += $key
        }
    }
    if ($verifyFailed.Count -gt 0) {
        Write-Host "  WARNING: $($verifyFailed.Count) key(s) did not match after restore - re-run may be needed:" -ForegroundColor Red
        $verifyFailed | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
    } else {
        Write-Host "  All $($backupSettings.Count) restored settings verified OK." -ForegroundColor Green
    }
}

# -------------------------------------------------------
# 14. Done
# -------------------------------------------------------
Write-Host ""
Write-Host "==============================================="
Write-Host "Restore complete!" -ForegroundColor Green
Write-Host "  Created       : $($toCreate.Count)"
Write-Host "  Overwritten   : $($toOverwrite.Count)"
Write-Host "  Same          : $($same.Count)  (untouched)"
Write-Host "  Not in backup : $($untouched.Count)  (untouched)"
Write-Host "  Backup        : $selectedDate"
if ($selectedReason) { Write-Host "  Reason        : $selectedReason" -ForegroundColor Cyan }
Write-Host "==============================================="
