Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " Prompt-Router Windows Local Startup Uninstaller" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/2] Removing Windows HKCU Run autostart registry entry..." -ForegroundColor Yellow
$regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
if (Get-ItemProperty -Path $regPath -Name "Prompt-Router" -ErrorAction SilentlyContinue) {
    Remove-ItemProperty -Path $regPath -Name "Prompt-Router" -Force
    Write-Host "  [OK] Successfully removed Prompt-Router from Windows HKCU Run." -ForegroundColor Green
} else {
    Write-Host "  [INFO] Registry key already clean." -ForegroundColor Gray
}

Write-Host ""
Write-Host "[2/2] Stopping and deleting local PM2 process..." -ForegroundColor Yellow
try {
    npx pm2 stop prompt-router 2>$null
    npx pm2 delete prompt-router 2>$null
    npx pm2 save --force 2>$null
    Write-Host "  [OK] PM2 prompt-router service deleted." -ForegroundColor Green
} catch {
    Write-Host "  [INFO] PM2 process already stopped." -ForegroundColor Gray
}

Write-Host ""
Write-Host "Prompt-Router local autostart has been completely uninstalled." -ForegroundColor Green
Write-Host "To run Prompt-Router silently in Docker, execute:" -ForegroundColor Cyan
Write-Host "  docker compose up -d --build" -ForegroundColor White
