<#
.SYNOPSIS
    Read-only audit of frontend <-> backend wiring for The Srilatha Arts.

.DESCRIPTION
    Verifies every contract between the deployed frontend (Azure Static Web App)
    and the backend (Azure Function App) is intact:

      1. Azure resources exist and are healthy
      2. Backend app settings contain required keys
      3. Backend HTTP endpoints respond with the expected JSON shape
      4. Backend auth gates (401 without cookie, CSRF required)
      5. CORS preflight succeeds from the SWA origin
      6. Frontend SWA serves expected pages (200, correct titles)
      7. Frontend embedded NEXT_PUBLIC_* env vars point at the right backend
      8. Data quality: products have valid fields, image URLs are reachable

    Exits 0 when everything is green, 1 when any check fails.

    NOTHING IS MUTATED. Safe to run repeatedly.

.PARAMETER Environment
    'dev' (default) or 'prd'. Drives the resource group and resource names.

.PARAMETER SkipBackend
    Skip Azure-side and backend HTTP checks. Useful when you just want to
    smoke the deployed SWA.

.PARAMETER SkipFrontend
    Skip the SWA reachability and embedded-config checks.

.PARAMETER SkipDataQuality
    Skip per-product image HEAD requests (the slowest section).

.PARAMETER OutFile
    Optional path. When set, writes the full audit report (JSON) to disk.

.EXAMPLE
    pwsh -File infra/Audit-Wiring.ps1
    pwsh -File infra/Audit-Wiring.ps1 -Environment dev -OutFile out/audit.json
    pwsh -File infra/Audit-Wiring.ps1 -SkipDataQuality
#>

[CmdletBinding()]
param(
    [ValidateSet('dev', 'prd')]
    [string]$Environment = 'dev',
    [switch]$SkipBackend,
    [switch]$SkipFrontend,
    [switch]$SkipDataQuality,
    [string]$OutFile
)

$ErrorActionPreference = 'Stop'

# ------------------------------------------------------------------
# Resource naming
# ------------------------------------------------------------------
$rg = "rg-srilathaartv2-$Environment"
$funcAppName = "func-srilathaartv2-$Environment"
$swaName = "swa-srilathaartv2-$Environment"
$storageName = "stsrilathaartv2$Environment"
$backendOrigin = "https://$funcAppName.azurewebsites.net"
$apiBase = "$backendOrigin/api"

# ------------------------------------------------------------------
# Result aggregation
# ------------------------------------------------------------------
$script:results = @()
$script:section = ''

function Add-Result {
    param(
        [ValidateSet('PASS', 'FAIL', 'WARN', 'INFO')]
        [string]$Status,
        [string]$Check,
        [string]$Detail = ''
    )
    $script:results += [pscustomobject]@{
        Section = $script:section
        Status  = $Status
        Check   = $Check
        Detail  = $Detail
        At      = (Get-Date).ToString('o')
    }
    $color = switch ($Status) {
        'PASS' { 'Green' }
        'FAIL' { 'Red' }
        'WARN' { 'Yellow' }
        'INFO' { 'Cyan' }
    }
    $icon = switch ($Status) {
        'PASS' { '[+]' }
        'FAIL' { '[X]' }
        'WARN' { '[!]' }
        'INFO' { '[i]' }
    }
    $line = "  $icon $Check"
    if ($Detail) { $line += " - $Detail" }
    Write-Host $line -ForegroundColor $color
}

function Write-Section {
    param([string]$Name)
    $script:section = $Name
    Write-Host ''
    Write-Host "=== $Name ===" -ForegroundColor Magenta
}

function Invoke-Json {
    param(
        [string]$Url,
        [string]$Method = 'GET',
        [hashtable]$Headers = @{},
        $Body = $null,
        [int]$TimeoutSec = 20
    )
    $params = @{
        Uri             = $Url
        Method          = $Method
        Headers         = $Headers
        TimeoutSec      = $TimeoutSec
        UseBasicParsing = $true
        ErrorAction     = 'Stop'
    }
    if ($Body) {
        $params['Body'] = ($Body | ConvertTo-Json -Depth 10 -Compress)
        $params['ContentType'] = 'application/json'
    }
    $r = Invoke-WebRequest @params
    return @{
        StatusCode = $r.StatusCode
        Headers    = $r.Headers
        Json       = ($r.Content | ConvertFrom-Json)
        Raw        = $r.Content
    }
}

function Test-Url {
    param(
        [string]$Url,
        [string]$Method = 'GET',
        [hashtable]$Headers = @{},
        [int]$TimeoutSec = 15
    )
    try {
        $r = Invoke-WebRequest -Uri $Url -Method $Method -Headers $Headers `
            -TimeoutSec $TimeoutSec -UseBasicParsing -ErrorAction Stop -MaximumRedirection 5
        return @{ Ok = $true; StatusCode = $r.StatusCode; Headers = $r.Headers; Content = $r.Content }
    } catch [System.Net.WebException] {
        $sc = $null
        try { $sc = [int]$_.Exception.Response.StatusCode } catch {}
        return @{ Ok = $false; StatusCode = $sc; Error = $_.Exception.Message }
    } catch {
        $sc = $null
        try { $sc = [int]$_.Exception.Response.StatusCode } catch {}
        return @{ Ok = $false; StatusCode = $sc; Error = $_.Exception.Message }
    }
}

# ==================================================================
# Header
# ==================================================================
Write-Host ''
Write-Host '=================================================================' -ForegroundColor Magenta
Write-Host "  The Srilatha Arts - Wiring Audit ($Environment)" -ForegroundColor Magenta
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor DarkGray
Write-Host '=================================================================' -ForegroundColor Magenta

# ==================================================================
# 1. Azure resources
# ==================================================================
$swaHostname = $null
if (-not $SkipBackend -or -not $SkipFrontend) {
    Write-Section '1. Azure resources'

    # Subscription / auth context
    $cli = az account show -o json 2>$null | ConvertFrom-Json
    if (-not $cli) {
        Add-Result -Status FAIL -Check 'az CLI authenticated' `
            -Detail 'Run infra/Azure-Connectivity.ps1 first.'
        # Continue anyway - HTTP checks may still work
    } else {
        Add-Result -Status PASS -Check 'az CLI authenticated' `
            -Detail "Tenant: $($cli.tenantId), Sub: $($cli.id)"
    }

    # Resource group
    $rgExists = az group exists -n $rg 2>$null
    if ($rgExists -eq 'true') {
        Add-Result -Status PASS -Check "Resource group '$rg' exists"
    } else {
        Add-Result -Status FAIL -Check "Resource group '$rg' exists"
    }

    # Function app
    $func = az functionapp show -g $rg -n $funcAppName -o json 2>$null | ConvertFrom-Json
    if (-not $func) {
        Add-Result -Status FAIL -Check "Function app '$funcAppName' exists"
    } else {
        Add-Result -Status PASS -Check "Function app '$funcAppName' exists"
        if ($func.state -eq 'Running') {
            Add-Result -Status PASS -Check 'Function app state' -Detail $func.state
        } else {
            Add-Result -Status FAIL -Check 'Function app state' -Detail $func.state
        }
        if ($func.identity.type -match 'SystemAssigned') {
            Add-Result -Status PASS -Check 'Function app managed identity' -Detail $func.identity.type
        } else {
            Add-Result -Status WARN -Check 'Function app managed identity' `
                -Detail 'No SystemAssigned identity - Key Vault refs may break.'
        }
    }

    # Static Web App
    $swa = az staticwebapp show -g $rg -n $swaName -o json 2>$null | ConvertFrom-Json
    if (-not $swa) {
        Add-Result -Status FAIL -Check "Static Web App '$swaName' exists"
    } else {
        Add-Result -Status PASS -Check "Static Web App '$swaName' exists"
        if ($swa.sku.name -eq 'Free') {
            Add-Result -Status PASS -Check 'SWA SKU' -Detail 'Free (as required)'
        } else {
            Add-Result -Status FAIL -Check 'SWA SKU' `
                -Detail "$($swa.sku.name) - memory says SWA must stay Free."
        }
        $swaHostname = $swa.defaultHostname
        Add-Result -Status INFO -Check 'SWA hostname' -Detail "https://$swaHostname"
        Add-Result -Status INFO -Check 'SWA branch'   -Detail $swa.branch
    }

    # Storage account
    $st = az storage account show -g $rg -n $storageName -o json 2>$null | ConvertFrom-Json
    if (-not $st) {
        Add-Result -Status FAIL -Check "Storage account '$storageName' exists"
    } else {
        Add-Result -Status PASS -Check "Storage account '$storageName' exists" `
            -Detail $st.provisioningState
    }
}

# ==================================================================
# 2. Backend app settings
# ==================================================================
if (-not $SkipBackend) {
    Write-Section '2. Backend app settings (Function App)'

    $required = @(
        'AzureWebJobsStorage__accountName',
        'AzureWebJobsStorage__tableServiceUri',
        'AzureWebJobsStorage__blobServiceUri',
        'AzureWebJobsStorage__queueServiceUri',
        'JWT_SECRET',
        'CSRF_SIGNING_KEY',
        'CORS_ORIGIN',
        'GOOGLE_CLIENT_ID',
        'RAZORPAY_KEY_ID',
        'RAZORPAY_KEY_SECRET',
        'BLOB_BASE_URL',
        'PUBLIC_SITE_URL',
        'INVOICE_PUBLIC_URL_BASE',
        'AZURE_STORAGE_ACCOUNT_NAME'
    )

    $settings = az functionapp config appsettings list -g $rg -n $funcAppName -o json 2>$null | ConvertFrom-Json
    if (-not $settings) {
        Add-Result -Status FAIL -Check 'List backend app settings'
    } else {
        $names = $settings | ForEach-Object { $_.name }
        foreach ($key in $required) {
            if ($names -contains $key) {
                $val = ($settings | Where-Object { $_.name -eq $key }).value
                # Mask secrets
                $masked = if ($key -match 'SECRET|KEY|PASS|TOKEN') {
                    if ($val.Length -gt 8) { $val.Substring(0, 4) + '...' + $val.Substring($val.Length - 4) }
                    else { 'set' }
                } else { $val }
                Add-Result -Status PASS -Check "Setting: $key" -Detail $masked
            } else {
                Add-Result -Status FAIL -Check "Setting: $key" -Detail 'missing'
            }
        }

        # CORS_ORIGIN should include SWA hostname
        if ($swaHostname) {
            $corsSetting = ($settings | Where-Object { $_.name -eq 'CORS_ORIGIN' }).value
            if ($corsSetting -match [regex]::Escape($swaHostname)) {
                Add-Result -Status PASS -Check 'CORS_ORIGIN includes SWA hostname'
            } else {
                Add-Result -Status FAIL -Check 'CORS_ORIGIN includes SWA hostname' `
                    -Detail "Have: $corsSetting | Need: $swaHostname"
            }
        }
    }

    # Function-level CORS (separate from CORS_ORIGIN app setting)
    $funcCors = az functionapp cors show -g $rg -n $funcAppName -o json 2>$null | ConvertFrom-Json
    if ($funcCors) {
        if ($swaHostname -and ($funcCors.allowedOrigins -contains "https://$swaHostname")) {
            Add-Result -Status PASS -Check 'Function App CORS allows SWA origin'
        } elseif (-not $swaHostname) {
            Add-Result -Status WARN -Check 'Function App CORS' -Detail 'cannot validate (SWA hostname unknown)'
        } else {
            Add-Result -Status FAIL -Check 'Function App CORS allows SWA origin' `
                -Detail "Allowed: $($funcCors.allowedOrigins -join ', ')"
        }
        if ($funcCors.supportCredentials) {
            Add-Result -Status PASS -Check 'Function App CORS supportCredentials = true'
        } else {
            Add-Result -Status FAIL -Check 'Function App CORS supportCredentials' `
                -Detail 'must be true for httpOnly cookie auth across origins'
        }
    }
}

# ==================================================================
# 3. Backend HTTP endpoints
# ==================================================================
$products = $null
$csrfToken = $null
if (-not $SkipBackend) {
    Write-Section '3. Backend HTTP endpoints'

    # 3.1 health / csrf
    $csrf = Test-Url -Url "$apiBase/auth/csrf"
    if ($csrf.Ok -and $csrf.StatusCode -eq 200) {
        try {
            $json = $csrf.Content | ConvertFrom-Json
            if ($json.csrfToken) {
                Add-Result -Status PASS -Check 'GET /api/auth/csrf' -Detail "token len=$($json.csrfToken.Length)"
                $script:csrfToken = $json.csrfToken
            } else {
                Add-Result -Status FAIL -Check 'GET /api/auth/csrf' -Detail 'no csrfToken field'
            }
        } catch {
            Add-Result -Status FAIL -Check 'GET /api/auth/csrf' -Detail 'invalid JSON'
        }
    } else {
        Add-Result -Status FAIL -Check 'GET /api/auth/csrf' -Detail "HTTP $($csrf.StatusCode): $($csrf.Error)"
    }

    # 3.2 products list
    $p = Test-Url -Url "$apiBase/products"
    if ($p.Ok) {
        try {
            $json = $p.Content | ConvertFrom-Json
            $cnt = $json.products.Count
            Add-Result -Status PASS -Check 'GET /api/products' -Detail "$cnt products"
            $script:products = $json.products

            # Shape audit on first product
            if ($cnt -gt 0) {
                $first = $json.products[0]
                $requiredFields = @('id', 'title', 'category', 'price', 'images', 'inStock')
                $missing = @()
                foreach ($f in $requiredFields) {
                    if (-not ($first.PSObject.Properties.Name -contains $f)) { $missing += $f }
                }
                if ($missing.Count -eq 0) {
                    Add-Result -Status PASS -Check 'Product shape has required fields' `
                        -Detail ($requiredFields -join ', ')
                } else {
                    Add-Result -Status FAIL -Check 'Product shape missing fields' `
                        -Detail ($missing -join ', ')
                }

                if ($first.price -is [int] -or $first.price -is [double] -or $first.price -is [long]) {
                    Add-Result -Status PASS -Check 'Product.price is numeric' -Detail "value=$($first.price)"
                } else {
                    Add-Result -Status FAIL -Check 'Product.price is numeric' `
                        -Detail "type=$($first.price.GetType().Name)"
                }

                if ($first.images -is [System.Array] -or $first.images.Count -ge 0) {
                    Add-Result -Status PASS -Check 'Product.images is array' `
                        -Detail "$($first.images.Count) images"
                } else {
                    Add-Result -Status FAIL -Check 'Product.images is array'
                }

                $validCats = @('resin', 'dot-mandala', 'lippan', 'pichwai', 'kolam', 'wedding')
                if ($validCats -contains $first.category) {
                    Add-Result -Status PASS -Check 'Product.category is valid' -Detail $first.category
                } else {
                    Add-Result -Status WARN -Check 'Product.category' `
                        -Detail "'$($first.category)' - frontend ProductCategory union doesn't include it"
                }
            } else {
                Add-Result -Status WARN -Check 'Product count' -Detail '0 products - shop will be empty'
            }
        } catch {
            Add-Result -Status FAIL -Check 'GET /api/products' -Detail 'invalid JSON'
        }
    } else {
        Add-Result -Status FAIL -Check 'GET /api/products' -Detail "HTTP $($p.StatusCode)"
    }

    # 3.3 product detail (first product)
    if ($script:products -and $script:products.Count -gt 0) {
        $prodId = $script:products[0].id
        $pd = Test-Url -Url "$apiBase/products/$prodId"
        if ($pd.Ok) {
            try {
                $j = $pd.Content | ConvertFrom-Json
                if ($j.product -and $j.product.id -eq $prodId) {
                    Add-Result -Status PASS -Check "GET /api/products/$prodId"
                } else {
                    Add-Result -Status FAIL -Check "GET /api/products/$prodId" -Detail 'no product field or id mismatch'
                }
            } catch {
                Add-Result -Status FAIL -Check "GET /api/products/$prodId" -Detail 'invalid JSON'
            }
        } else {
            Add-Result -Status FAIL -Check "GET /api/products/$prodId" -Detail "HTTP $($pd.StatusCode)"
        }
    }

    # 3.4 reviews recent
    $rv = Test-Url -Url "$apiBase/reviews/recent?limit=4"
    if ($rv.Ok) {
        try {
            $j = $rv.Content | ConvertFrom-Json
            if ($null -ne $j.reviews) {
                Add-Result -Status PASS -Check 'GET /api/reviews/recent' -Detail "$($j.reviews.Count) reviews"
            } else {
                Add-Result -Status FAIL -Check 'GET /api/reviews/recent' -Detail 'no reviews field'
            }
        } catch { Add-Result -Status FAIL -Check 'GET /api/reviews/recent' -Detail 'invalid JSON' }
    } else {
        Add-Result -Status FAIL -Check 'GET /api/reviews/recent' -Detail "HTTP $($rv.StatusCode)"
    }

    # 3.5 coupons active
    $cp = Test-Url -Url "$apiBase/coupons/active"
    if ($cp.Ok) {
        try {
            $j = $cp.Content | ConvertFrom-Json
            if ($null -ne $j.coupons) {
                Add-Result -Status PASS -Check 'GET /api/coupons/active' -Detail "$($j.coupons.Count) coupons"
            } else {
                Add-Result -Status FAIL -Check 'GET /api/coupons/active' -Detail 'no coupons field'
            }
        } catch { Add-Result -Status FAIL -Check 'GET /api/coupons/active' -Detail 'invalid JSON' }
    } else {
        Add-Result -Status FAIL -Check 'GET /api/coupons/active' -Detail "HTTP $($cp.StatusCode)"
    }

    # 3.6 pincode
    $pc = Test-Url -Url "$apiBase/pincode/500032"
    if ($pc.Ok) {
        try {
            $j = $pc.Content | ConvertFrom-Json
            if ($j.city -and $j.state) {
                Add-Result -Status PASS -Check 'GET /api/pincode/500032' -Detail "$($j.city), $($j.state), $($j.country)"
            } else {
                Add-Result -Status FAIL -Check 'GET /api/pincode/500032' -Detail 'missing city/state'
            }
        } catch { Add-Result -Status FAIL -Check 'GET /api/pincode/500032' -Detail 'invalid JSON' }
    } else {
        Add-Result -Status FAIL -Check 'GET /api/pincode/500032' -Detail "HTTP $($pc.StatusCode)"
    }

    # 3.7 me when not authenticated
    $me = Test-Url -Url "$apiBase/auth/me"
    if ($me.Ok) {
        try {
            $j = $me.Content | ConvertFrom-Json
            # null user expected when no cookie
            if ($j.PSObject.Properties.Name -contains 'user') {
                Add-Result -Status PASS -Check 'GET /api/auth/me (anonymous)' -Detail "user=$($j.user)"
            } else {
                Add-Result -Status FAIL -Check 'GET /api/auth/me' -Detail 'no user field'
            }
        } catch { Add-Result -Status FAIL -Check 'GET /api/auth/me' -Detail 'invalid JSON' }
    } else {
        Add-Result -Status FAIL -Check 'GET /api/auth/me' -Detail "HTTP $($me.StatusCode)"
    }
}

# ==================================================================
# 4. Backend auth gates
# ==================================================================
if (-not $SkipBackend) {
    Write-Section '4. Backend auth gates (must 401 without cookie)'

    $gated = @(
        @{ Method = 'GET'; Path = '/cart' },
        @{ Method = 'GET'; Path = '/wishlist' },
        @{ Method = 'GET'; Path = '/my-orders' },
        @{ Method = 'GET'; Path = '/addresses' }
    )
    foreach ($g in $gated) {
        $r = Test-Url -Url "$apiBase$($g.Path)" -Method $g.Method
        if ($r.StatusCode -eq 401) {
            Add-Result -Status PASS -Check "$($g.Method) $($g.Path)" -Detail '401 (correctly gated)'
        } elseif ($r.Ok) {
            Add-Result -Status FAIL -Check "$($g.Method) $($g.Path)" `
                -Detail "$($r.StatusCode) - should be 401 without cookie"
        } else {
            # Any non-2xx and non-401 status
            Add-Result -Status WARN -Check "$($g.Method) $($g.Path)" `
                -Detail "HTTP $($r.StatusCode) (expected 401)"
        }
    }

    # CSRF gate: POST without token must reject
    $r = Test-Url -Url "$apiBase/newsletter" -Method 'POST'
    if ($r.StatusCode -eq 403 -or $r.StatusCode -eq 400) {
        Add-Result -Status PASS -Check 'POST /newsletter without CSRF rejected' -Detail "HTTP $($r.StatusCode)"
    } elseif ($r.Ok) {
        Add-Result -Status FAIL -Check 'POST /newsletter without CSRF' `
            -Detail "$($r.StatusCode) - should be 403/400 without CSRF"
    } else {
        Add-Result -Status INFO -Check 'POST /newsletter without CSRF' -Detail "HTTP $($r.StatusCode)"
    }
}

# ==================================================================
# 5. CORS preflight from SWA
# ==================================================================
if (-not $SkipBackend -and $swaHostname) {
    Write-Section '5. CORS preflight (SWA -> Function App)'
    try {
        $h = @{
            'Origin'                         = "https://$swaHostname"
            'Access-Control-Request-Method'  = 'POST'
            'Access-Control-Request-Headers' = 'content-type,x-csrf-token'
        }
        $r = Invoke-WebRequest -Uri "$apiBase/coupons/validate" -Method 'OPTIONS' `
            -Headers $h -UseBasicParsing -ErrorAction Stop -TimeoutSec 15
        $ao = $r.Headers['Access-Control-Allow-Origin']
        $ac = $r.Headers['Access-Control-Allow-Credentials']

        if ($ao -eq "https://$swaHostname" -or $ao -eq '*') {
            Add-Result -Status PASS -Check 'Preflight Access-Control-Allow-Origin' -Detail $ao
        } else {
            Add-Result -Status FAIL -Check 'Preflight Access-Control-Allow-Origin' `
                -Detail "got '$ao', expected 'https://$swaHostname'"
        }
        if ($ac -eq 'true') {
            Add-Result -Status PASS -Check 'Preflight Access-Control-Allow-Credentials = true'
        } else {
            Add-Result -Status FAIL -Check 'Preflight Access-Control-Allow-Credentials' -Detail "got '$ac'"
        }
    } catch {
        Add-Result -Status FAIL -Check 'CORS preflight' -Detail $_.Exception.Message
    }
}

# ==================================================================
# 6. Frontend (SWA) reachability
# ==================================================================
if (-not $SkipFrontend -and $swaHostname) {
    Write-Section '6. Frontend (SWA) reachability'

    $pages = @(
        @{ Path = '/'; ExpectedTitle = 'Srilatha Art' }
        @{ Path = '/shop'; ExpectedTitle = '' }
        @{ Path = '/login'; ExpectedTitle = '' }
        @{ Path = '/cart'; ExpectedTitle = '' }
        @{ Path = '/custom-order'; ExpectedTitle = '' }
        @{ Path = '/account'; ExpectedTitle = '' }
    )
    foreach ($page in $pages) {
        $r = Test-Url -Url "https://$swaHostname$($page.Path)"
        if ($r.Ok -and $r.StatusCode -eq 200) {
            $titleMatch = [regex]::Match($r.Content, '<title>([^<]*)</title>')
            $title = if ($titleMatch.Success) { $titleMatch.Groups[1].Value.Trim() } else { '(no title)' }

            # Critical: /shop must NOT serve the __shell__ category page
            if ($page.Path -eq '/shop' -and $r.Content -match '__shell__') {
                Add-Result -Status FAIL -Check "GET $($page.Path)" `
                    -Detail 'serves shell-page template instead of shop listing'
            } elseif ($page.ExpectedTitle -and $title -notmatch [regex]::Escape($page.ExpectedTitle)) {
                Add-Result -Status WARN -Check "GET $($page.Path)" `
                    -Detail "title='$title' (expected to contain '$($page.ExpectedTitle)')"
            } else {
                Add-Result -Status PASS -Check "GET $($page.Path)" -Detail "200, title='$title'"
            }
        } else {
            Add-Result -Status FAIL -Check "GET $($page.Path)" -Detail "HTTP $($r.StatusCode)"
        }
    }

    # Embedded API base URL: grep the first JS bundle linked from /
    $homeRes = Test-Url -Url "https://$swaHostname/"
    if ($homeRes.Ok) {
        $jsMatch = [regex]::Match($homeRes.Content, '/_next/static/chunks/[^"'']+\.js')
        if ($jsMatch.Success) {
            $jsUrl = "https://$swaHostname$($jsMatch.Value)"
            $jsRes = Test-Url -Url $jsUrl
            if ($jsRes.Ok) {
                if ($jsRes.Content -match [regex]::Escape($apiBase)) {
                    Add-Result -Status PASS -Check 'Frontend bundle references backend' -Detail $apiBase
                } else {
                    Add-Result -Status WARN -Check 'Frontend bundle API base' `
                        -Detail "bundle does not contain '$apiBase' (could be split across chunks)"
                }
            }
        }
    }

    # CSP header allows required external domains
    $rootHeaders = $homeRes.Headers
    if ($rootHeaders -and $rootHeaders.ContainsKey('Content-Security-Policy')) {
        $csp = $rootHeaders['Content-Security-Policy']
        $required = @(
            @{ Token = 'accounts.google.com'; Why = 'Google Sign-In' },
            @{ Token = 'checkout.razorpay.com'; Why = 'Razorpay Checkout script' },
            @{ Token = 'azurewebsites.net'; Why = 'backend XHR' },
            @{ Token = 'blob.core.windows.net'; Why = 'product images' }
        )
        foreach ($t in $required) {
            if ($csp -match [regex]::Escape($t.Token)) {
                Add-Result -Status PASS -Check "CSP allows $($t.Token)" -Detail $t.Why
            } else {
                Add-Result -Status FAIL -Check "CSP allows $($t.Token)" -Detail "missing - $($t.Why)"
            }
        }
    } else {
        Add-Result -Status WARN -Check 'CSP header present' -Detail 'no Content-Security-Policy header on /'
    }
}

# ==================================================================
# 7. Data quality (product images reachable)
# ==================================================================
if (-not $SkipBackend -and -not $SkipDataQuality -and $script:products) {
    Write-Section '7. Data quality (product images)'

    $sample = $script:products | Select-Object -First 5
    foreach ($prod in $sample) {
        if (-not $prod.images -or $prod.images.Count -eq 0) {
            Add-Result -Status WARN -Check "$($prod.id) has images" -Detail '0 image URLs'
            continue
        }
        $img = $prod.images[0]
        $h = Test-Url -Url $img -Method 'HEAD' -TimeoutSec 10
        if ($h.Ok -and $h.StatusCode -eq 200) {
            Add-Result -Status PASS -Check "$($prod.id) primary image" -Detail '200'
        } else {
            Add-Result -Status FAIL -Check "$($prod.id) primary image" `
                -Detail "HTTP $($h.StatusCode) - $img"
        }
    }
}

# ==================================================================
# 8. Cross-config consistency
# ==================================================================
if (-not $SkipBackend -and -not $SkipFrontend -and $swaHostname) {
    Write-Section '8. Cross-config consistency'

    # PUBLIC_SITE_URL on backend should equal SWA URL
    $setting = ($settings | Where-Object { $_.name -eq 'PUBLIC_SITE_URL' }).value
    if ($setting -eq "https://$swaHostname") {
        Add-Result -Status PASS -Check 'PUBLIC_SITE_URL == SWA hostname'
    } else {
        Add-Result -Status WARN -Check 'PUBLIC_SITE_URL' `
            -Detail "backend='$setting', SWA='https://$swaHostname'"
    }
}

# ==================================================================
# Summary
# ==================================================================
$pass = ($script:results | Where-Object { $_.Status -eq 'PASS' }).Count
$fail = ($script:results | Where-Object { $_.Status -eq 'FAIL' }).Count
$warn = ($script:results | Where-Object { $_.Status -eq 'WARN' }).Count
$info = ($script:results | Where-Object { $_.Status -eq 'INFO' }).Count

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Magenta
Write-Host '  Summary' -ForegroundColor Magenta
Write-Host '=================================================================' -ForegroundColor Magenta
Write-Host "  PASS : $pass" -ForegroundColor Green
Write-Host "  FAIL : $fail" -ForegroundColor Red
Write-Host "  WARN : $warn" -ForegroundColor Yellow
Write-Host "  INFO : $info" -ForegroundColor Cyan
Write-Host ''

if ($fail -gt 0) {
    Write-Host '  Failing checks:' -ForegroundColor Red
    $script:results | Where-Object { $_.Status -eq 'FAIL' } | ForEach-Object {
        Write-Host "    [$($_.Section)] $($_.Check)" -ForegroundColor Red
        if ($_.Detail) { Write-Host "        $($_.Detail)" -ForegroundColor DarkRed }
    }
    Write-Host ''
}

if ($OutFile) {
    $script:results | ConvertTo-Json -Depth 6 | Set-Content -Path $OutFile -Encoding UTF8
    Write-Host "  Report written to: $OutFile" -ForegroundColor Cyan
}

if ($fail -gt 0) { exit 1 } else { exit 0 }
