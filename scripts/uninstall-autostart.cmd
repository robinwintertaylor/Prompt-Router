@echo off
echo ========================================================
echo  Prompt-Router Windows Local Startup Uninstaller
echo ========================================================
echo.

echo [1/3] Removing Windows HKCU Run autostart registry key...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "Prompt-Router" /f >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   [OK] Successfully removed HKCU autostart registry key.
) else (
    echo   [INFO] Registry key was already clean or not found.
)

echo.
echo [2/3] Stopping and deleting local PM2 process...
call "%APPDATA%\npm\pm2.cmd" stop prompt-router >nul 2>&1
call "%APPDATA%\npm\pm2.cmd" delete prompt-router >nul 2>&1
call "%APPDATA%\npm\pm2.cmd" save --force >nul 2>&1
echo   [OK] Local PM2 process stopped and removed.

echo.
echo [3/3] Done! Local startup uninstalled.
echo If you wish to run in Docker, simply run:
echo   docker compose up -d --build
echo.
pause
