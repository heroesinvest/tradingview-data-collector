<#
.SYNOPSIS
    Converts TradingView JSON data to XGBoost-ready CSV format.

.DESCRIPTION
    This script converts JSON files containing PreData and PostData into CSV format
    suitable for XGBoost training. PreData fields become features, and PostData
    becomes the target (1 for take_profit, 0 otherwise).

.PARAMETER FilePath
    Path to the JSON file to convert.

.PARAMETER OutputPath
    Optional. Path for the output CSV file. If not specified, creates a file
    in the same directory with .csv extension.

.PARAMETER IncludeOpenTrades
    Switch. If specified, includes entries with PreData but no PostData (open trades).
    These will have target = -1 to indicate unknown outcome.

.EXAMPLE
    .\Convert-ToXGBoost.ps1 -FilePath "BTCUSDT.P-60-20200111-20231220.json"

.EXAMPLE
    .\Convert-ToXGBoost.ps1 -FilePath "data.json" -OutputPath "training_data.csv"

.EXAMPLE
    .\Convert-ToXGBoost.ps1 -FilePath "data.json" -IncludeOpenTrades
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$FilePath,
    
    [Parameter(Mandatory=$false)]
    [string]$OutputPath = "",
    
    [Parameter(Mandatory=$false)]
    [switch]$IncludeOpenTrades
)

# Check if file exists
if (-not (Test-Path $FilePath)) {
    Write-Host "ERROR: File not found: $FilePath" -ForegroundColor Red
    exit 1
}

# Determine output path
if ([string]::IsNullOrEmpty($OutputPath)) {
    $OutputPath = [System.IO.Path]::ChangeExtension($FilePath, ".csv")
}

Write-Host ""
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host "  TradingView to XGBoost CSV Converter" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host "Input:  $FilePath" -ForegroundColor White
Write-Host "Output: $OutputPath" -ForegroundColor White
Write-Host ""

# Load JSON
Write-Host "Loading JSON file..." -ForegroundColor Yellow
try {
    $jsonContent = Get-Content -Path $FilePath -Raw | ConvertFrom-Json
    $totalEntries = $jsonContent.Count
    Write-Host "[OK] Loaded $totalEntries entries" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to parse JSON: $_" -ForegroundColor Red
    exit 1
}

# Filter entries with both PreData and PostData
Write-Host ""
Write-Host "Processing entries..." -ForegroundColor Yellow

$validEntries = @()
$skippedNoPreData = 0
$skippedNoPostData = 0
$includedOpenTrades = 0

foreach ($entry in $jsonContent) {
    $hasPreData = $null -ne $entry.preData -and $entry.preData -isnot [string]
    $hasPostData = $null -ne $entry.postData -and $entry.postData -isnot [string]
    
    if (-not $hasPreData) {
        $skippedNoPreData++
        continue
    }
    
    if (-not $hasPostData) {
        if ($IncludeOpenTrades) {
            $includedOpenTrades++
            $validEntries += $entry
        } else {
            $skippedNoPostData++
        }
        continue
    }
    
    $validEntries += $entry
}

$validCount = $validEntries.Count
Write-Host "Valid entries (with PreData + PostData): $validCount" -ForegroundColor Green
if ($skippedNoPreData -gt 0) {
    Write-Host "Skipped (no PreData): $skippedNoPreData" -ForegroundColor Yellow
}
if ($skippedNoPostData -gt 0) {
    Write-Host "Skipped (no PostData - open trades): $skippedNoPostData" -ForegroundColor Yellow
}
if ($includedOpenTrades -gt 0) {
    Write-Host "Included open trades (target=-1): $includedOpenTrades" -ForegroundColor Cyan
}

if ($validCount -eq 0) {
    Write-Host "ERROR: No valid entries to convert!" -ForegroundColor Red
    exit 1
}

# Build CSV structure
Write-Host ""
Write-Host "Building CSV structure..." -ForegroundColor Yellow

$csvData = @()

# Get all PreData keys from first entry to establish column order
$firstEntry = $validEntries[0]
$preDataKeys = $firstEntry.preData.PSObject.Properties.Name | Sort-Object

# Handle OHLCV array fields separately
$ohlcvKeys = @()
$regularKeys = @()

foreach ($key in $preDataKeys) {
    if ($key -eq 'ohlcv') {
        # OHLCV is a nested object with arrays - we'll flatten it
        $ohlcvSubKeys = $firstEntry.preData.ohlcv.PSObject.Properties.Name | Sort-Object
        foreach ($subKey in $ohlcvSubKeys) {
            $arrayLength = $firstEntry.preData.ohlcv.$subKey.Count
            for ($i = 0; $i -lt $arrayLength; $i++) {
                $ohlcvKeys += "ohlcv_${subKey}_$i"
            }
        }
    } else {
        $regularKeys += $key
    }
}

# Build complete column list
$columns = @('symbol', 'timeframe', 'side', 'entry_datetime') + $regularKeys + $ohlcvKeys + @('target')

Write-Host "Total columns: $($columns.Count)" -ForegroundColor Cyan
Write-Host "  - Metadata: 4 (symbol, timeframe, side, entry_datetime)" -ForegroundColor White
Write-Host "  - PreData features: $($regularKeys.Count)" -ForegroundColor White
Write-Host "  - OHLCV features: $($ohlcvKeys.Count)" -ForegroundColor White
Write-Host "  - Target: 1 (take_profit: 1, else: 0)" -ForegroundColor White

# Convert each entry to CSV row
$rowCount = 0
foreach ($entry in $validEntries) {
    $rowCount++
    if ($rowCount % 100 -eq 0) {
        Write-Host "  Processing row $rowCount / $validCount..." -ForegroundColor Gray
    }
    
    $row = [ordered]@{}
    
    # Add metadata
    $row['symbol'] = $entry.symbol
    $row['timeframe'] = $entry.timeframe
    $row['side'] = $entry.side
    $row['entry_datetime'] = $entry.entry_datetime
    
    # Add regular PreData fields
    foreach ($key in $regularKeys) {
        $value = $entry.preData.$key
        if ($null -eq $value) {
            $row[$key] = ""
        } else {
            $row[$key] = $value
        }
    }
    
    # Add OHLCV fields (flattened)
    if ($entry.preData.ohlcv) {
        $ohlcvSubKeys = $entry.preData.ohlcv.PSObject.Properties.Name | Sort-Object
        foreach ($subKey in $ohlcvSubKeys) {
            $array = $entry.preData.ohlcv.$subKey
            for ($i = 0; $i -lt $array.Count; $i++) {
                $colName = "ohlcv_${subKey}_$i"
                $row[$colName] = $array[$i]
            }
        }
    }
    
    # Add target (1 = take_profit, 0 = other, -1 = unknown/open)
    if ($null -ne $entry.postData -and $entry.postData -isnot [string]) {
        $exitReason = $entry.postData.exit_reason
        if ($exitReason -eq "take_profit") {
            $row['target'] = 1
        } else {
            $row['target'] = 0
        }
    } else {
        # Open trade - no PostData
        $row['target'] = -1
    }
    
    $csvData += [PSCustomObject]$row
}

Write-Host "[OK] Converted $rowCount entries" -ForegroundColor Green

# Export to CSV
Write-Host ""
Write-Host "Writing CSV file..." -ForegroundColor Yellow
try {
    $csvData | Export-Csv -Path $OutputPath -NoTypeInformation -Encoding UTF8
    $fileInfo = Get-Item $OutputPath
    $fileSizeMB = [math]::Round($fileInfo.Length / 1MB, 2)
    Write-Host "[OK] CSV file created successfully" -ForegroundColor Green
    Write-Host "     File size: $fileSizeMB MB" -ForegroundColor Cyan
    Write-Host "     Rows: $($csvData.Count)" -ForegroundColor Cyan
    Write-Host "     Columns: $($columns.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "ERROR: Failed to write CSV: $_" -ForegroundColor Red
    exit 1
}

# Generate summary statistics
Write-Host ""
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host "  Summary Statistics" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan

$targetCounts = $csvData | Group-Object -Property target
foreach ($group in $targetCounts) {
    $count = $group.Count
    $pct = [math]::Round(($count / $csvData.Count) * 100, 2)
    
    $label = switch ($group.Name) {
        "1" { "Take Profit (target=1)" }
        "0" { "Stop Loss / Other (target=0)" }
        "-1" { "Open Trades (target=-1)" }
        default { "Unknown (target=$($group.Name))" }
    }
    
    $color = switch ($group.Name) {
        "1" { "Green" }
        "0" { "Red" }
        "-1" { "Yellow" }
        default { "White" }
    }
    
    Write-Host "$label : $count ($pct%)" -ForegroundColor $color
}

Write-Host ""
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host "  Conversion Complete!" -ForegroundColor Green
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Load the CSV in Python/R" -ForegroundColor White
Write-Host "  2. Separate features (columns 5 to N-1) from target (last column)" -ForegroundColor White
Write-Host "  3. Handle any missing values if necessary" -ForegroundColor White
Write-Host "  4. Train your XGBoost model" -ForegroundColor White
Write-Host ""
Write-Host "Example Python code:" -ForegroundColor Cyan
Write-Host @"
import pandas as pd
from sklearn.model_selection import train_test_split
import xgboost as xgb

# Load data
df = pd.read_csv('$([System.IO.Path]::GetFileName($OutputPath))')

# Remove open trades if included (target == -1)
df = df[df['target'] != -1]

# Separate features and target
feature_cols = df.columns[4:-1]  # Skip metadata, keep features
X = df[feature_cols]
y = df['target']

# Split data
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train XGBoost
model = xgb.XGBClassifier(objective='binary:logistic', random_state=42)
model.fit(X_train, y_train)

# Evaluate
accuracy = model.score(X_test, y_test)
print(f'Accuracy: {accuracy:.4f}')
"@ -ForegroundColor Gray
Write-Host ""
