<#
.SYNOPSIS
    Seed (insert-or-update) an admin account in the Azure Table Storage
    'admins' table. Safe to re-run.

.DESCRIPTION
    Backend admin auth ([backend/src/functions/adminAuth.ts]) looks up
    admins in the 'admins' table of the env's storage account
    ('st{appslug}{env}'). Entity shape (mirrors
    [backend/scripts/seedAdmin.ts] and
    [backend/src/services/tableStorage.ts]):

        PartitionKey : 'admin'                  (constant)
        RowKey       : <username, lowercased + trimmed>
        email        : <user email>
        name         : <display name>
        role         : 'admin' | 'superadmin'
        passwordHash : <bcrypt hash with embedded salt - 60 chars>
        isActive     : true
        createdAt    : ISO8601 (set on create, preserved on update)
        updatedAt    : ISO8601 (set every time this script writes)

    Behaviour:

      * If no entity exists at (PartitionKey='admin', RowKey=<username>):
        the script inserts a new one with role = -Role (default 'admin').

      * If an entity already exists: the script MERGEs the supplied
        passwordHash + email + isActive=true onto it. It also makes sure
        the role is 'admin' or 'superadmin' - if the existing role is
        anything else it gets bumped to the -Role value; an existing
        'superadmin' is NEVER downgraded to 'admin'. createdAt is
        preserved.

    Idempotency: a second run with the same username is a no-op for
    the username/createdAt fields and a refresh for the password hash.
    Re-running with a fresh hash is the supported way to reset an
    admin's password out-of-band.

.PARAMETER Environment
    'DEV' or 'PRD'. Picks the matching storage account via the same
    $config hashtable used by [infra/Deploy-Infrastructure.ps1] -
    'st{appslug}dev' or 'st{appslug}prd'. DEV is the default; PRD
    seeding requires explicit -Environment PRD.

.PARAMETER Email
    The admin's email address. Stored as the 'email' attribute on the
    entity. Required.

.PARAMETER Username
    The login identifier. Lowercased + trimmed before use; the result
    becomes the RowKey, which is what [backend/src/functions/adminAuth.ts]
    looks up at login. If you want email-based login (the existing
    convention in seedAdmin.ts), pass the same string for -Email and
    -Username.

.PARAMETER BcryptHash
    A pre-generated bcrypt hash including the embedded salt (the
    "$2a$..", "$2b$..", or "$2y$.." 60-char form that bcryptjs.compare
    expects). The script does NOT hash a plaintext password - this is
    deliberate so cleartext never lands on the operator's shell history.

    Generate one out-of-band, e.g. from the backend project root:
        node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 12))" 'YourStrongPassword!'

.PARAMETER Name
    Display name. Defaults to -Username if omitted. Used by the admin
    UI greeting and audit logs.

.PARAMETER Role
    'admin' (default) or 'superadmin'. Only applied on create or when
    the existing role is neither 'admin' nor 'superadmin'. An existing
    'superadmin' is preserved even if you pass -Role admin.

.PARAMETER StorageAccountName
    Optional override. If omitted (the normal case) it's derived from
    -Environment via the shared $config map. Only set this if you're
    seeding into a non-standard account (e.g. a throwaway test rig).

.EXAMPLE
    # Generate a hash, then seed against DEV.
    $hash = node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 12))" 'S0meStr0ng!Pass'
    ./infra/seed-admin.ps1 -Environment DEV -Email 'admin@srilatha.art' -Username 'admin@srilatha.art' -BcryptHash $hash

.EXAMPLE
    ./seed-admin.ps1 -Environment DEV `
    -Email    admin@srilatha.art `
    -Username admin@srilatha.art `
    -Name     Admin -Role superadmin `
    -BcryptHash '$2a$12$9G71nJFIXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'

.NOTES
    Requires:
      - PowerShell 7+
      - Az.Accounts module (for the bearer token only - no AzTable / no
        deprecated modules)
      - An active Az session (Connect-AzAccount, or the env-var SP path
        used by the other /infra scripts) whose principal has
        'Storage Table Data Contributor' on the storage account. The
        deployer SP already does (see Phase 3/7 of
        [infra/Deploy-Infrastructure.ps1]).

    Implementation note: we talk to Table Storage over its REST API
    with an AAD bearer token (Get-AzAccessToken -ResourceUrl
    https://storage.azure.com/). The AzTable module is deprecated and
    Az.Storage doesn't expose an AAD-based table data-plane, so REST
    is the cleanest portable option.
#>

[CmdletBinding()]
param(
    [Parameter()]
    [ValidateSet('DEV', 'PRD')]
    [string]$Environment = 'DEV',

    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$Email,

    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$Username,

    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$BcryptHash,

    [Parameter()]
    [string]$Name,

    [Parameter()]
    [ValidateSet('admin', 'superadmin')]
    [string]$Role = 'admin',

    [Parameter()]
    [string]$StorageAccountName,

    [Parameter()]
    [switch] $IgnoreAzAuth
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ─── Per-environment resource names ──────────────────────────────────
# Mirror the $config map in infra/Deploy-Infrastructure.ps1 (PART B.1)
# so this script and the deploy script stay in lockstep - if the
# storage-account naming convention ever changes, both files change
# together and we only need to verify one source of truth.
if (-not $IgnoreAzAuth) {
    & "$PSScriptRoot\Azure-Connectivity.ps1"
}
$AppSlug = 'srilathaartv2'

$config = @{
    DEV = @{
        ResourceGroup  = "rg-$AppSlug-dev"
        StorageAccount = "st$($AppSlug)dev"
    }
    PRD = @{
        ResourceGroup  = "rg-$AppSlug-prd"
        StorageAccount = "st$($AppSlug)prd"
    }
}
$envCfg = $config[$Environment]

# Derive the storage account from -Environment unless the operator
# passed an explicit override.
if ([string]::IsNullOrWhiteSpace($StorageAccountName)) {
    $StorageAccountName = $envCfg.StorageAccount
}

$normalizedUsername = $Username.ToLowerInvariant().Trim()
if ([string]::IsNullOrWhiteSpace($normalizedUsername)) {
    throw "Username is empty after trim."
}

$normalizedEmail = $Email.Trim()
if ($normalizedEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
    throw "Email does not look like an email address: '$Email'."
}

# bcryptjs accepts $2a$, $2b$, or $2y$ prefixes; the encoded form is
# always 60 chars (7-char prefix + 22-char salt + 31-char hash).
if ($BcryptHash -notmatch '^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$') {
    throw @"
BcryptHash does not look like a bcrypt hash with embedded salt.
Expected the 60-char form starting with '`$2a`$', '`$2b`$', or '`$2y`$'.
Generate one with:
    node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 12))" 'YourPassword'
"@
}

if ([string]::IsNullOrWhiteSpace($Name)) {
    $Name = $normalizedUsername
}

Write-Host ''
Write-Host "Target environment : $Environment" -ForegroundColor Cyan
Write-Host "Resource group     : $($envCfg.ResourceGroup)"
Write-Host "Storage account    : $StorageAccountName"
Write-Host "Table              : admins"
Write-Host "Username (RowKey)  : $normalizedUsername"
Write-Host "Email              : $normalizedEmail"
Write-Host "Display name       : $Name"
Write-Host "Requested role     : $Role"
Write-Host ''

# ─── Confirm we have an Az session ───────────────────────────────────
Import-Module Az.Accounts -ErrorAction Stop -WarningAction SilentlyContinue
$ctx = Get-AzContext -ErrorAction SilentlyContinue
if (-not $ctx) {
    throw "No Az session. Run Connect-AzAccount (or the SP env-var pattern in other /infra scripts) first."
}
Write-Host "Az context         : $($ctx.Account.Id) on $($ctx.Subscription.Name)" -ForegroundColor DarkGray
Write-Host ''

# ─── Acquire an AAD bearer token for the Storage data plane ──────────
# Storage Table Data Contributor on the storage account scopes this
# down to data-plane CRUD. See Phase 3/7 of Deploy-Infrastructure.ps1.
$tokenObj = Get-AzAccessToken -ResourceUrl 'https://storage.azure.com/' -ErrorAction Stop
# Az 14+ returns Token as a SecureString. Handle both shapes.
if ($tokenObj.Token -is [System.Security.SecureString]) {
    $bearer = [System.Net.NetworkCredential]::new('', $tokenObj.Token).Password
} else {
    $bearer = [string]$tokenObj.Token
}
if ([string]::IsNullOrWhiteSpace($bearer)) {
    throw "Failed to acquire a Storage data-plane bearer token."
}

# ─── Tiny REST wrapper for the Table service ─────────────────────────
# RowKey for an email-shaped username contains '@', and OData entity-
# reference values must escape any embedded single quote by doubling
# it. Apply both before stitching the URL together.
$odataEscapedKey = $normalizedUsername -replace "'", "''"
$urlEncodedKey = [System.Uri]::EscapeDataString($odataEscapedKey)

$tableEndpoint = "https://$StorageAccountName.table.core.windows.net"
$entityPath = "/admins(PartitionKey='admin',RowKey='$urlEncodedKey')"
$entityUri = "$tableEndpoint$entityPath"
$insertUri = "$tableEndpoint/admins"

function Invoke-TableRest {
    param(
        [Parameter(Mandatory)] [string]$Method,
        [Parameter(Mandatory)] [string]$Uri,
        [Parameter()]          $Body,
        [Parameter()]          [string]$IfMatch
    )
    $headers = @{
        'Authorization'         = "Bearer $bearer"
        'x-ms-version'          = '2020-12-06'
        'x-ms-date'             = [DateTime]::UtcNow.ToString('R')
        'Accept'                = 'application/json;odata=nometadata'
        'DataServiceVersion'    = '3.0;NetFx'
        'MaxDataServiceVersion' = '3.0;NetFx'
    }
    if ($IfMatch) { $headers['If-Match'] = $IfMatch }

    # Named $restArgs (not $args - that's an automatic variable inside
    # functions and would shadow ours).
    $restArgs = @{
        Method             = $Method
        Uri                = $Uri
        Headers            = $headers
        ContentType        = 'application/json'
        # Inspect 4xx (notably 404) without a thrown terminating error.
        SkipHttpErrorCheck = $true
        StatusCodeVariable = 'statusCode'
    }
    if ($null -ne $Body) {
        $restArgs['Body'] = ($Body | ConvertTo-Json -Depth 8 -Compress)
    }

    $response = Invoke-RestMethod @restArgs
    return @{ StatusCode = $statusCode; Body = $response }
}

# ─── Read current state ──────────────────────────────────────────────
Write-Host "Checking for existing admin at RowKey='$normalizedUsername' ..." -ForegroundColor Yellow
$existing = Invoke-TableRest -Method 'GET' -Uri $entityUri

if ($existing.StatusCode -eq 404) {
    # Could be entity-missing (good - INSERT path) or table-missing.
    # Table-missing surfaces as 404 with code='TableNotFound' in the body.
    $detail = if ($null -ne $existing.Body) { ($existing.Body | ConvertTo-Json -Depth 6 -Compress) } else { '' }
    if ($detail -match 'TableNotFound') {
        throw "'admins' table does not exist on storage account '$StorageAccountName'. Run infra/Deploy-Infrastructure.ps1 to provision tables first."
    }
    Write-Host "  -> not found; will INSERT." -ForegroundColor DarkGray
    $action = 'insert'
} elseif ($existing.StatusCode -ge 200 -and $existing.StatusCode -lt 300) {
    Write-Host "  -> found; will MERGE (passwordHash + isActive + email)." -ForegroundColor DarkGray
    $action = 'merge'
} else {
    $detail = if ($null -ne $existing.Body) { ($existing.Body | ConvertTo-Json -Depth 6 -Compress) } else { '' }
    if ($existing.StatusCode -eq 403) {
        throw "Table GET returned 403 Forbidden. The current principal lacks 'Storage Table Data Contributor' on '$StorageAccountName'. Detail: $detail"
    }
    throw "Table GET on $entityUri returned HTTP $($existing.StatusCode). Detail: $detail"
}

# ─── Build the write payload ─────────────────────────────────────────
$nowIso = [DateTime]::UtcNow.ToString('o')

if ($action -eq 'insert') {
    $payload = [ordered]@{
        PartitionKey = 'admin'
        RowKey       = $normalizedUsername
        email        = $normalizedEmail
        name         = $Name
        role         = $Role
        passwordHash = $BcryptHash
        isActive     = $true
        createdAt    = $nowIso
        updatedAt    = $nowIso
    }

    $write = Invoke-TableRest -Method 'POST' -Uri $insertUri -Body $payload
    if ($write.StatusCode -lt 200 -or $write.StatusCode -ge 300) {
        $detail = ($write.Body | ConvertTo-Json -Depth 6 -Compress)
        throw "Insert failed with HTTP $($write.StatusCode). Detail: $detail"
    }
    Write-Host ''
    Write-Host "OK. Created admin '$normalizedUsername' (role=$Role) on '$StorageAccountName'." -ForegroundColor Green
} else {
    # MERGE preserves fields we aren't touching (createdAt, lastLogin,
    # any name the operator may have customised after seeding).
    $existingBody = $existing.Body
    $existingRole = if ($existingBody.PSObject.Properties.Name -contains 'role') { [string]$existingBody.role } else { '' }

    # Never downgrade a superadmin; promote anything non-admin/superadmin
    # to the requested -Role (default 'admin').
    $resolvedRole =
    if ($existingRole -eq 'superadmin') { 'superadmin' }
    elseif ($existingRole -eq 'admin' -and $Role -eq 'admin') { 'admin' }
    elseif ($Role -eq 'superadmin') { 'superadmin' }
    else { 'admin' }

    if ($resolvedRole -ne $existingRole) {
        Write-Host "  -> role: '$existingRole' -> '$resolvedRole'" -ForegroundColor Yellow
    } else {
        Write-Host "  -> role unchanged ('$existingRole')" -ForegroundColor DarkGray
    }

    $payload = [ordered]@{
        PartitionKey = 'admin'
        RowKey       = $normalizedUsername
        email        = $normalizedEmail
        role         = $resolvedRole
        passwordHash = $BcryptHash
        isActive     = $true
        updatedAt    = $nowIso
    }

    # If-Match: * means "merge regardless of ETag" - fine for this
    # one-operator-at-a-time admin-bootstrap path.
    $write = Invoke-TableRest -Method 'MERGE' -Uri $entityUri -Body $payload -IfMatch '*'
    if ($write.StatusCode -lt 200 -or $write.StatusCode -ge 300) {
        $detail = ($write.Body | ConvertTo-Json -Depth 6 -Compress)
        throw "Merge failed with HTTP $($write.StatusCode). Detail: $detail"
    }
    Write-Host ''
    Write-Host "OK. Updated admin '$normalizedUsername' (role=$resolvedRole, isActive=true, passwordHash refreshed) on '$StorageAccountName'." -ForegroundColor Green
}

# ─── Read-back verification ──────────────────────────────────────────
$verify = Invoke-TableRest -Method 'GET' -Uri $entityUri
if ($verify.StatusCode -lt 200 -or $verify.StatusCode -ge 300) {
    throw "Post-write verification GET returned HTTP $($verify.StatusCode)."
}
$v = $verify.Body
$verifiedHashOk = ($v.PSObject.Properties.Name -contains 'passwordHash') -and ($v.passwordHash -eq $BcryptHash)
$verifiedActive = ($v.PSObject.Properties.Name -contains 'isActive') -and ($v.isActive -eq $true)
$verifiedRoleOk = ($v.PSObject.Properties.Name -contains 'role') -and ($v.role -in @('admin', 'superadmin'))

if (-not ($verifiedHashOk -and $verifiedActive -and $verifiedRoleOk)) {
    throw "Verification failed. hashMatches=$verifiedHashOk isActive=$verifiedActive roleValid=$verifiedRoleOk"
}

Write-Host ''
Write-Host 'Verification:' -ForegroundColor Cyan
Write-Host "  RowKey       : $($v.RowKey)"
Write-Host "  email        : $($v.email)"
Write-Host "  role         : $($v.role)"
Write-Host "  isActive     : $($v.isActive)"
Write-Host "  passwordHash : <$($v.passwordHash.Length) chars, matches input>"
if ($v.PSObject.Properties.Name -contains 'createdAt') {
    Write-Host "  createdAt    : $($v.createdAt)"
}
Write-Host "  updatedAt    : $($v.updatedAt)"
Write-Host ''
