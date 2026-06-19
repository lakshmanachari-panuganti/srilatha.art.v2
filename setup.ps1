# ============================================================
# Srilatha Art — Project Setup Script
# Run this ONCE after cloning the repository
# ============================================================
# Usage: powershell -ExecutionPolicy Bypass -File setup.ps1
# ============================================================

Write-Host "🎨 Setting up Srilatha Art v2..." -ForegroundColor Cyan
Write-Host ""

# ─── 1. Copy AI-generated artwork images to frontend/public ──────────────────
Write-Host "📸 Copying artwork images..." -ForegroundColor Yellow

$artifactDir = "C:\Users\E092721\.gemini\antigravity\brain\b400af4f-fb1b-4dfb-937f-2d2c3dfac11d"
$publicDir   = "$PSScriptRoot\frontend\public\images"

if (-not (Test-Path $publicDir)) {
    New-Item -ItemType Directory -Path $publicDir -Force | Out-Null
    Write-Host "   Created: frontend/public/images/"
}

# Map: source filename pattern → destination name
$imageMap = @{
    "resin_art_hero_real_*.png"    = "resin-art-hero.png"
    "resin_art_geode_real_*.png"   = "resin-geode.png"
    "resin_art_ocean_real_*.png"   = "resin-ocean.png"
    "resin_tray_gold_*.png"        = "resin-tray-gold.png"
    "resin_coasters_real_*.png"    = "resin-coasters.png"
    "resin_art_flowers_*.png"      = "resin-flowers.png"
    "lippan_art_real_*.png"        = "lippan-art.png"
    "dot_mandala_real_*.png"       = "dot-mandala.png"
    "kolam_art_piece_*.png"        = "kolam-art.png"
    "wedding_decor_set_*.png"      = "wedding-decor.png"
    "gift_items_collection_*.png"  = "gift-items.png"
}

foreach ($pattern in $imageMap.Keys) {
    $dest = $imageMap[$pattern]
    $matches = Get-ChildItem -Path $artifactDir -Filter $pattern -ErrorAction SilentlyContinue
    if ($matches) {
        $src = $matches[0].FullName
        Copy-Item -Path $src -Destination "$publicDir\$dest" -Force
        Write-Host "   ✓ $dest" -ForegroundColor Green
    } else {
        Write-Host "   ⚠ Not found: $pattern (skipping)" -ForegroundColor DarkYellow
    }
}

# ─── 2. Install Frontend Dependencies ────────────────────────────────────────
Write-Host ""
Write-Host "📦 Installing frontend dependencies..." -ForegroundColor Yellow

Set-Location "$PSScriptRoot\frontend"
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ npm install failed. Please check your Node.js installation." -ForegroundColor Red
    exit 1
}
Write-Host "✓ Frontend dependencies installed" -ForegroundColor Green

# ─── 3. Create .env.local ────────────────────────────────────────────────────
Write-Host ""
Write-Host "🔐 Creating .env.local template..." -ForegroundColor Yellow

$envContent = @"
# ─── Azure AD App Registration ───────────────────────────────────────────────
AZURE_CLIENT_ID=your_MY_APPREG_CLIENT_ID_here
AZURE_CLIENT_SECRET=your_MY_APPREG_CLIENT_SECRET_here
AZURE_TENANT_ID=your_MY_APPREG_TENANT_ID_here

# ─── Azure Storage ───────────────────────────────────────────────────────────
AZURE_STORAGE_ACCOUNT_NAME=srilathaart
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...

# ─── Razorpay ────────────────────────────────────────────────────────────────
NEXT_PUBLIC_RAZORPAY_KEY_ID=your_RAZORPAY_KEY_ID_here
RAZORPAY_KEY_SECRET=your_RAZORPAY_KEY_SECRET_here
RAZORPAY_WEBHOOK_SECRET=your_RAZORPAY_WEBHOOK_SECRET_here

# ─── WhatsApp Cloud API ───────────────────────────────────────────────────────
WHATSAPP_ACCESS_TOKEN=your_WHATSAPP_ACCESS_TOKEN_here
WHATSAPP_PHONE_NUMBER_ID=your_WHATSAPP_PHONE_NUMBER_ID_here
WHATSAPP_WABA_ID=your_WHATSAPP_WABA_ID_here

# ─── App Settings ─────────────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:7071/api
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_WHATSAPP_NUMBER=919052380325

# ─── JWT Secret (generate a strong random string) ─────────────────────────────
JWT_SECRET=your_strong_jwt_secret_here_min_32_chars

# ─── Admin Credentials ────────────────────────────────────────────────────────
ADMIN_PASSWORD_HASH=srilatha2025
"@

$envContent | Out-File -FilePath ".env.local" -Encoding utf8
Write-Host "✓ .env.local created (fill in your actual values)" -ForegroundColor Green

# ─── 4. Start Dev Server ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "🚀 Starting development server..." -ForegroundColor Cyan
Write-Host "   Opening at: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop the server." -ForegroundColor DarkGray
Write-Host ""

npm run dev
