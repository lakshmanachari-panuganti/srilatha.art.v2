@echo off
title Srilatha Art — Setup & Launch
color 0B

echo.
echo  ╔════════════════════════════════════════════════════╗
echo  ║   🎨  SRILATHA ART — SETUP (Next.js 15 + Node 24) ║
echo  ╚════════════════════════════════════════════════════╝
echo.

:: ── Step 1: Verify Node.js ─────────────────────────────────────────────────
echo [1/5] Checking Node.js version...
node -v
for /f "tokens=1 delims=v" %%i in ('node -v') do set NODECHECK=%%i
echo     Node.js OK (requires v24+)
echo.

:: ── Step 2: Delete old next.config.ts workaround ──────────────────────────
echo [2/5] Cleaning up config files...
cd /d "%~dp0frontend"
if exist next.config.mjs (
  del next.config.mjs
  echo     Removed old next.config.mjs (Next.js 15 uses next.config.ts natively)
) else (
  echo     Config files OK
)
echo.

:: ── Step 3: Copy AI-generated artwork images ──────────────────────────────
echo [3/5] Copying artwork images...
set ARTIFACTS=C:\Users\E092721\.gemini\antigravity\brain\b400af4f-fb1b-4dfb-937f-2d2c3dfac11d
set DEST=%~dp0frontend\public\images

if not exist "%DEST%" mkdir "%DEST%"

for %%F in ("%ARTIFACTS%\resin_art_hero_real_*.png")     do copy "%%F" "%DEST%\resin-art-hero.png"    /Y >nul 2>&1
for %%F in ("%ARTIFACTS%\resin_art_geode_real_*.png")    do copy "%%F" "%DEST%\resin-geode.png"        /Y >nul 2>&1
for %%F in ("%ARTIFACTS%\resin_art_ocean_real_*.png")    do copy "%%F" "%DEST%\resin-ocean.png"        /Y >nul 2>&1
for %%F in ("%ARTIFACTS%\resin_tray_gold_*.png")         do copy "%%F" "%DEST%\resin-tray-gold.png"    /Y >nul 2>&1
for %%F in ("%ARTIFACTS%\resin_coasters_real_*.png")     do copy "%%F" "%DEST%\resin-coasters.png"     /Y >nul 2>&1
for %%F in ("%ARTIFACTS%\resin_art_flowers_*.png")       do copy "%%F" "%DEST%\resin-flowers.png"      /Y >nul 2>&1
for %%F in ("%ARTIFACTS%\resin_art_coasters_*.png")      do copy "%%F" "%DEST%\resin-coasters-2.png"   /Y >nul 2>&1
for %%F in ("%ARTIFACTS%\lippan_art_real_*.png")         do copy "%%F" "%DEST%\lippan-art.png"         /Y >nul 2>&1
for %%F in ("%ARTIFACTS%\dot_mandala_real_*.png")        do copy "%%F" "%DEST%\dot-mandala.png"        /Y >nul 2>&1
for %%F in ("%ARTIFACTS%\kolam_art_piece_*.png")         do copy "%%F" "%DEST%\kolam-art.png"          /Y >nul 2>&1
for %%F in ("%ARTIFACTS%\wedding_decor_set_*.png")       do copy "%%F" "%DEST%\wedding-decor.png"      /Y >nul 2>&1
for %%F in ("%ARTIFACTS%\gift_items_collection_*.png")   do copy "%%F" "%DEST%\gift-items.png"         /Y >nul 2>&1

echo     Images copied to public\images\
echo.

:: ── Step 4: Install dependencies ──────────────────────────────────────────
echo [4/5] Installing npm dependencies (Next.js 15 + Node 24)...
call npm install
if errorlevel 1 (
  echo.
  echo ERROR: npm install failed!
  echo Make sure you have Node.js 24 LTS installed from https://nodejs.org
  pause
  exit /b 1
)
echo     Dependencies installed!
echo.

:: ── Step 5: Start dev server ───────────────────────────────────────────────
echo [5/5] Starting dev server with Turbopack...
echo     Opening at: http://localhost:3000
echo     Press Ctrl+C to stop.
echo.
call npm run dev

pause
