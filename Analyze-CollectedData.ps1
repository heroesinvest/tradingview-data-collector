<#
.SYNOPSIS
    Analyzes TradingView collected data JSON files for data quality issues.

.DESCRIPTION
    This script analyzes JSON files containing PreData and PostData entries.

.PARAMETER FilePath
    Path to the JSON file to analyze.

.EXAMPLE
    .\Analyze-CollectedData.ps1 -FilePath "BTCUSDT_P-60-20230101-20251001.json"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$FilePath
)

# Colors
$colors = @{
    Header = 'Cyan'
    Good = 'Green'
    Warning = 'Yellow'
    Error = 'Red'
    Info = 'White'
    Metric = 'Magenta'
}

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = 'White',
        [switch]$NoNewline
    )
    if ($NoNewline) {
        Write-Host $Message -ForegroundColor $Color -NoNewline
    } else {
        Write-Host $Message -ForegroundColor $Color
    }
}

function Write-Section {
    param([string]$Title)
    Write-Host ""
    $separator = "=" * 80
    Write-ColorOutput $separator -Color $colors.Header
    Write-ColorOutput "  $Title" -Color $colors.Header
    Write-ColorOutput $separator -Color $colors.Header
}

function Write-SubSection {
    param([string]$Title)
    Write-Host ""
    $separator = "-" * 60
    Write-ColorOutput $separator -Color $colors.Info
    Write-ColorOutput "  $Title" -Color $colors.Metric
    Write-ColorOutput $separator -Color $colors.Info
}

# Check if file exists
if (-not (Test-Path $FilePath)) {
    Write-ColorOutput "ERROR: File not found: $FilePath" -Color $colors.Error
    exit 1
}

Write-Section "TradingView Data Collection Analysis"
Write-ColorOutput "File: $FilePath" -Color $colors.Info
Write-ColorOutput "Analysis Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -Color $colors.Info

# Load JSON
Write-Host ""
Write-ColorOutput "Loading JSON file..." -Color $colors.Info
try {
    $jsonContent = Get-Content -Path $FilePath -Raw | ConvertFrom-Json
    $totalEntries = $jsonContent.Count
    Write-ColorOutput "[OK] Loaded $totalEntries entries" -Color $colors.Good
} catch {
    Write-ColorOutput "ERROR: Failed to parse JSON: $_" -Color $colors.Error
    exit 1
}

# Initialize tracking
$yearStats = @{}
$allKeys = @{}
$duplicateKeys = @()
$yearBoundaryIssues = @()

Write-Host ""
Write-ColorOutput "Processing entries..." -Color $colors.Info

# Process each entry
foreach ($entry in $jsonContent) {
    $entryDate = [DateTime]::Parse($entry.entry_datetime)
    $year = $entryDate.Year
    
    # Generate unique key
    $key = "{0}~{1}~{2}~{3}" -f $entry.symbol, $entry.entry_datetime, $entry.side, $entry.timeframe
    
    # Check for duplicates
    if ($allKeys.ContainsKey($key)) {
        $duplicateKeys += [PSCustomObject]@{
            Key = $key
            Symbol = $entry.symbol
            DateTime = $entry.entry_datetime
            Side = $entry.side
            Timeframe = $entry.timeframe
            Year = $year
        }
    }
    $allKeys[$key] = $true
    
    # Initialize year stats
    if (-not $yearStats.ContainsKey($year)) {
        $yearStats[$year] = @{
            TotalObjects = 0
            UniqueKeys = @{}
            WithPreData = 0
            WithPostData = 0
            WithBoth = 0
            PreDataOnly = @()
            PostDataOnly = @()
            CompleteEntries = @()
        }
    }
    
    # Count this entry
    $yearStats[$year].TotalObjects++
    $yearStats[$year].UniqueKeys[$key] = $true
    
    # Check for preData and postData
    $hasPreData = $null -ne $entry.preData -and $entry.preData -isnot [string]
    $hasPostData = $null -ne $entry.postData -and $entry.postData -isnot [string]
    
    if ($hasPreData) { $yearStats[$year].WithPreData++ }
    if ($hasPostData) { $yearStats[$year].WithPostData++ }
    
    if ($hasPreData -and $hasPostData) {
        $yearStats[$year].WithBoth++
        $yearStats[$year].CompleteEntries += $entry
    } elseif ($hasPreData -and -not $hasPostData) {
        $yearStats[$year].PreDataOnly += [PSCustomObject]@{
            Symbol = $entry.symbol
            DateTime = $entry.entry_datetime
            Side = $entry.side
            Timeframe = $entry.timeframe
            Month = $entryDate.Month
            Day = $entryDate.Day
        }
    } elseif ($hasPostData -and -not $hasPreData) {
        $yearStats[$year].PostDataOnly += [PSCustomObject]@{
            Symbol = $entry.symbol
            DateTime = $entry.entry_datetime
            Side = $entry.side
            Timeframe = $entry.timeframe
            Month = $entryDate.Month
            Day = $entryDate.Day
        }
    }
}

# Analyze year boundary issues
$years = $yearStats.Keys | Sort-Object
for ($i = 0; $i -lt $years.Count - 1; $i++) {
    $currentYear = $years[$i]
    $nextYear = $years[$i + 1]
    
    $endOfYearPreData = $yearStats[$currentYear].PreDataOnly | Where-Object { $_.Month -eq 12 }
    $startOfYearPostData = $yearStats[$nextYear].PostDataOnly | Where-Object { $_.Month -eq 1 }
    
    if ($endOfYearPreData.Count -gt 0 -or $startOfYearPostData.Count -gt 0) {
        $transition = "{0} -> {1}" -f $currentYear, $nextYear
        $yearBoundaryIssues += [PSCustomObject]@{
            YearTransition = $transition
            PreDataInDecember = $endOfYearPreData.Count
            PostDataInJanuary = $startOfYearPostData.Count
        }
    }
}

# Display Results
Write-Section "OVERALL STATISTICS"

Write-ColorOutput "Total Entries in File: " -Color $colors.Info -NoNewline
Write-ColorOutput $totalEntries -Color $colors.Metric

Write-ColorOutput "Unique Keys (symbol~datetime~side~timeframe): " -Color $colors.Info -NoNewline
Write-ColorOutput $allKeys.Count -Color $colors.Metric

Write-ColorOutput "Duplicate Keys Found: " -Color $colors.Info -NoNewline
if ($duplicateKeys.Count -eq 0) {
    Write-ColorOutput "0 [OK]" -Color $colors.Good
} else {
    Write-ColorOutput $duplicateKeys.Count -Color $colors.Error
}

Write-ColorOutput "Years Covered: " -Color $colors.Info -NoNewline
$yearList = ($years | Sort-Object) -join ', '
Write-ColorOutput $yearList -Color $colors.Metric

# Year-by-year breakdown
Write-Section "YEAR-BY-YEAR BREAKDOWN"

foreach ($year in ($years | Sort-Object)) {
    $stats = $yearStats[$year]
    $uniqueCount = $stats.UniqueKeys.Count
    $duplicatesInYear = $stats.TotalObjects - $uniqueCount
    
    Write-SubSection "Year $year"
    
    Write-ColorOutput "  Total Objects: " -Color $colors.Info -NoNewline
    Write-ColorOutput $stats.TotalObjects -Color $colors.Metric
    
    Write-ColorOutput "  Unique Objects: " -Color $colors.Info -NoNewline
    Write-ColorOutput $uniqueCount -Color $colors.Metric
    
    if ($duplicatesInYear -gt 0) {
        Write-ColorOutput "  Duplicates in Year: " -Color $colors.Info -NoNewline
        Write-ColorOutput $duplicatesInYear -Color $colors.Error
    }
    
    Write-ColorOutput "  With PreData: " -Color $colors.Info -NoNewline
    Write-ColorOutput $stats.WithPreData -Color $colors.Metric
    
    Write-ColorOutput "  With PostData: " -Color $colors.Info -NoNewline
    Write-ColorOutput $stats.WithPostData -Color $colors.Metric
    
    Write-ColorOutput "  With BOTH (Complete): " -Color $colors.Info -NoNewline
    Write-ColorOutput $stats.WithBoth -Color $colors.Good
    
    # Calculate alignment percentage
    $alignmentPct = if ($stats.TotalObjects -gt 0) { 
        [math]::Round(($stats.WithBoth / $stats.TotalObjects) * 100, 2) 
    } else { 0 }
    
    Write-ColorOutput "  Alignment Rate: " -Color $colors.Info -NoNewline
    if ($alignmentPct -ge 95) {
        Write-ColorOutput "$alignmentPct% [GOOD]" -Color $colors.Good
    } elseif ($alignmentPct -ge 80) {
        Write-ColorOutput "$alignmentPct% [WARNING]" -Color $colors.Warning
    } else {
        Write-ColorOutput "$alignmentPct% [ERROR]" -Color $colors.Error
    }
    
    # Orphaned entries
    $preDataOnlyCount = $stats.PreDataOnly.Count
    $postDataOnlyCount = $stats.PostDataOnly.Count
    
    if ($preDataOnlyCount -gt 0) {
        Write-ColorOutput "  PreData Only (orphaned): " -Color $colors.Info -NoNewline
        Write-ColorOutput $preDataOnlyCount -Color $colors.Warning
        
        $endOfYear = $stats.PreDataOnly | Where-Object { $_.Month -eq 12 } | Sort-Object DateTime
        if ($endOfYear.Count -gt 0) {
            $decCount = $endOfYear.Count
            Write-ColorOutput "    -> $decCount in December (potential year-end boundary)" -Color $colors.Warning
        }
    }
    
    if ($postDataOnlyCount -gt 0) {
        Write-ColorOutput "  PostData Only (orphaned): " -Color $colors.Info -NoNewline
        Write-ColorOutput $postDataOnlyCount -Color $colors.Warning
        
        $startOfYear = $stats.PostDataOnly | Where-Object { $_.Month -eq 1 } | Sort-Object DateTime
        if ($startOfYear.Count -gt 0) {
            $janCount = $startOfYear.Count
            Write-ColorOutput "    -> $janCount in January (potential year-start boundary)" -Color $colors.Warning
        }
    }
}

# Issues Summary
Write-Section "ISSUES SUMMARY"

$totalIssues = 0

# Duplicates
if ($duplicateKeys.Count -gt 0) {
    $totalIssues++
    Write-ColorOutput "[!] DUPLICATE KEYS DETECTED" -Color $colors.Error
    $dupCount = $duplicateKeys.Count
    Write-ColorOutput "  Found $dupCount duplicate entries" -Color $colors.Error
    Write-Host ""
    Write-ColorOutput "  First 10 duplicates:" -Color $colors.Info
    $duplicateKeys | Select-Object -First 10 | ForEach-Object {
        $line = "    - {0} : {1} : {2} : TF:{3}" -f $_.DateTime, $_.Symbol, $_.Side, $_.Timeframe
        Write-ColorOutput $line -Color $colors.Error
    }
    if ($duplicateKeys.Count -gt 10) {
        $remaining = $duplicateKeys.Count - 10
        Write-ColorOutput "    ... and $remaining more" -Color $colors.Error
    }
    Write-Host ""
}

# Year boundary issues
if ($yearBoundaryIssues.Count -gt 0) {
    $totalIssues++
    Write-ColorOutput "[!] YEAR BOUNDARY ISSUES DETECTED" -Color $colors.Warning
    Write-ColorOutput "  Orphaned entries at year boundaries:" -Color $colors.Warning
    Write-Host ""
    foreach ($issue in $yearBoundaryIssues) {
        $trans = $issue.YearTransition
        Write-ColorOutput "  $trans :" -Color $colors.Info
        if ($issue.PreDataInDecember -gt 0) {
            $decPre = $issue.PreDataInDecember
            Write-ColorOutput "    - $decPre PreData entries in December without PostData" -Color $colors.Warning
        }
        if ($issue.PostDataInJanuary -gt 0) {
            $janPost = $issue.PostDataInJanuary
            Write-ColorOutput "    - $janPost PostData entries in January without PreData" -Color $colors.Warning
        }
    }
    Write-Host ""
    Write-ColorOutput "  Note: These may be legitimate if trades crossed year boundaries." -Color $colors.Info
    Write-ColorOutput "        Manual review recommended to match December PreData with January PostData." -Color $colors.Info
    Write-Host ""
}

# Overall orphaned entries
$totalOrphanedPreData = ($yearStats.Values | ForEach-Object { $_.PreDataOnly.Count } | Measure-Object -Sum).Sum
$totalOrphanedPostData = ($yearStats.Values | ForEach-Object { $_.PostDataOnly.Count } | Measure-Object -Sum).Sum

if ($totalOrphanedPreData -gt 0 -or $totalOrphanedPostData -gt 0) {
    $totalIssues++
    Write-ColorOutput "[!] ORPHANED ENTRIES DETECTED" -Color $colors.Warning
    Write-Host ""
    if ($totalOrphanedPreData -gt 0) {
        Write-ColorOutput "  Total PreData without PostData: " -Color $colors.Info -NoNewline
        Write-ColorOutput $totalOrphanedPreData -Color $colors.Warning
        
        $allPreDataOnly = $yearStats.Values | ForEach-Object { $_.PreDataOnly } | Sort-Object DateTime -Descending | Select-Object -First 5
        if ($allPreDataOnly.Count -gt 0) {
            Write-ColorOutput "  Most recent (likely still open):" -Color $colors.Info
            $allPreDataOnly | ForEach-Object {
                $line = "    - {0} : {1} : {2}" -f $_.DateTime, $_.Symbol, $_.Side
                Write-ColorOutput $line -Color $colors.Warning
            }
        }
    }
    Write-Host ""
    if ($totalOrphanedPostData -gt 0) {
        Write-ColorOutput "  Total PostData without PreData: " -Color $colors.Info -NoNewline
        Write-ColorOutput $totalOrphanedPostData -Color $colors.Error
        Write-ColorOutput "    -> This indicates a data collection issue!" -Color $colors.Error
        
        $allPostDataOnly = $yearStats.Values | ForEach-Object { $_.PostDataOnly } | Sort-Object DateTime | Select-Object -First 5
        if ($allPostDataOnly.Count -gt 0) {
            Write-ColorOutput "  Examples:" -Color $colors.Info
            $allPostDataOnly | ForEach-Object {
                $line = "    - {0} : {1} : {2}" -f $_.DateTime, $_.Symbol, $_.Side
                Write-ColorOutput $line -Color $colors.Error
            }
        }
    }
    Write-Host ""
}

# Final assessment
Write-Section "FINAL ASSESSMENT"

if ($totalIssues -eq 0) {
    Write-ColorOutput "[OK] NO ISSUES DETECTED" -Color $colors.Good
    Write-ColorOutput "  Data collection appears to be working correctly." -Color $colors.Good
    Write-ColorOutput "  All entries have proper PreData and PostData alignment." -Color $colors.Good
} else {
    Write-ColorOutput "[!] $totalIssues ISSUE TYPE(S) DETECTED" -Color $colors.Warning
    Write-Host ""
    
    if ($duplicateKeys.Count -gt 0) {
        Write-ColorOutput "  1. Duplicates: Review deduplication logic in content.js" -Color $colors.Error
    }
    if ($totalOrphanedPostData -gt 0) {
        Write-ColorOutput "  2. Orphaned PostData: Data collection missed PreData entries" -Color $colors.Error
        Write-ColorOutput "     -> Check if collection started mid-year or after signals were already triggered" -Color $colors.Error
    }
    if ($yearBoundaryIssues.Count -gt 0) {
        Write-ColorOutput "  3. Year Boundaries: Manual matching may be needed across year transitions" -Color $colors.Warning
    }
    if ($totalOrphanedPreData -gt 5) {
        Write-ColorOutput "  4. Many orphaned PreData: Check if these are recent open trades" -Color $colors.Warning
        Write-ColorOutput "     -> If old dates, may indicate PostData collection issues" -Color $colors.Warning
    }
}

Write-Host ""
$separator = "=" * 80
Write-ColorOutput $separator -Color $colors.Header
Write-ColorOutput "Analysis Complete" -Color $colors.Header
Write-ColorOutput $separator -Color $colors.Header
Write-Host ""
