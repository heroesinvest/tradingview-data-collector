# Extension Popup Debug Script
# Run this in PowerShell to diagnose the popup issue

Write-Host "🔍 TradingView Data Collector - Popup Diagnostic" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# Check if files exist
$extensionPath = "C:\dev\TVFinalSonnet4.5Webv2\browser-extension"
Write-Host "`n📁 Checking files..." -ForegroundColor Yellow

$requiredFiles = @(
    "manifest.json",
    "minimal.html", 
    "popup-test.html",
    "background.js",
    "content.js"
)

foreach ($file in $requiredFiles) {
    $path = Join-Path $extensionPath $file
    if (Test-Path $path) {
        Write-Host "✅ $file exists" -ForegroundColor Green
    } else {
        Write-Host "❌ $file MISSING" -ForegroundColor Red
    }
}

# Check icons
$iconPath = Join-Path $extensionPath "icons"
if (Test-Path $iconPath) {
    $iconFiles = Get-ChildItem $iconPath -Name "*.png"
    Write-Host "✅ Icons folder: $($iconFiles.Count) PNG files" -ForegroundColor Green
} else {
    Write-Host "❌ Icons folder missing" -ForegroundColor Red
}

Write-Host "`n🧪 Manual Test Steps:" -ForegroundColor Yellow
Write-Host "1. Open Chrome and go to: chrome://extensions/" -ForegroundColor White
Write-Host "2. Make sure 'Developer mode' is ON (top right)" -ForegroundColor White  
Write-Host "3. Find 'TradingView Data Collector' and click 'Reload'" -ForegroundColor White
Write-Host "4. Go to: https://tradingview.com/chart/" -ForegroundColor White
Write-Host "5. Click the extension icon in toolbar" -ForegroundColor White
Write-Host "6. You should see: 'TEST POPUP - If you see this, popup works!'" -ForegroundColor White

Write-Host "`n🔧 If still no popup:" -ForegroundColor Yellow
Write-Host "1. Right-click extension icon → 'Inspect popup'" -ForegroundColor White
Write-Host "2. Check Console tab for errors" -ForegroundColor White
Write-Host "3. Try clicking extension icon while DevTools is open" -ForegroundColor White

Write-Host "`n💡 Alternative test:" -ForegroundColor Yellow
Write-Host "Navigate to: chrome-extension://YOUR_EXTENSION_ID/minimal.html" -ForegroundColor White
Write-Host "(Replace YOUR_EXTENSION_ID with actual ID from chrome://extensions/)" -ForegroundColor White

Write-Host "`nDiagnostic complete! Try the steps above." -ForegroundColor Cyan