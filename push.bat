@echo off
echo ===================================================
echo Srilatha Art - Auto Git Push
echo ===================================================
echo.

set msg="auto-commit: update frontend auth and UI"

echo.
echo [1/3] Staging all files...
git add .

echo.
echo [2/3] Committing changes...
git commit -m "%msg%"

echo.
echo [3/3] Pushing to remote 'develop' branch...
git push origin develop

echo.
echo ===================================================
echo ✅ Done! Changes pushed successfully.
echo ===================================================
