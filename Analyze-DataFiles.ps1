# Script to analyze data files and extract metadata
# Output: CSV file with asset name, date range, and record count

$dataFolder = "c:\dev\TVFinalSonnet4.5Webv2\data"
$outputFile = "c:\dev\TVFinalSonnet4.5Webv2\data-analysis.csv"

# Initialize results array
$results = @()

# Get all JSON files in the data folder
$files = Get-ChildItem -Path $dataFolder -Filter "*.json"

Write-Host "Processing $($files.Count) files..."

foreach ($file in $files) {
    Write-Host "Processing: $($file.Name)"
    
    # Extract asset name (before first dash or underscore)
    $assetName = ($file.BaseName -split '[-_]')[0]
    
    # Extract dates from filename
    # Pattern: ASSET-TIMEFRAME-YYYYMMDD-HHMM-YYYYMMDD-HHMM
    $parts = $file.BaseName -split '-'
    
    if ($parts.Length -ge 5) {
        # Extract date parts
        $startDate = $parts[2]  # YYYYMMDD format
        $endDate = $parts[4]    # YYYYMMDD format
        
        # Convert to yyyy-MM-dd format
        if ($startDate -match '^\d{8}$') {
            $startDateFormatted = $startDate.Substring(0,4) + "-" + $startDate.Substring(4,2) + "-" + $startDate.Substring(6,2)
        } else {
            $startDateFormatted = "N/A"
        }
        
        if ($endDate -match '^\d{8}$') {
            $endDateFormatted = $endDate.Substring(0,4) + "-" + $endDate.Substring(4,2) + "-" + $endDate.Substring(6,2)
        } else {
            $endDateFormatted = "N/A"
        }
        
        # Determine smallest and biggest dates
        if ($startDateFormatted -ne "N/A" -and $endDateFormatted -ne "N/A") {
            if ([DateTime]::ParseExact($startDateFormatted, "yyyy-MM-dd", $null) -lt [DateTime]::ParseExact($endDateFormatted, "yyyy-MM-dd", $null)) {
                $smallestDate = $startDateFormatted
                $biggestDate = $endDateFormatted
            } else {
                $smallestDate = $endDateFormatted
                $biggestDate = $startDateFormatted
            }
        } else {
            $smallestDate = "N/A"
            $biggestDate = "N/A"
        }
    } else {
        $smallestDate = "N/A"
        $biggestDate = "N/A"
    }
    
    # Count JSON objects in the root array
    try {
        $jsonContent = Get-Content -Path $file.FullName -Raw | ConvertFrom-Json
        if ($jsonContent -is [Array]) {
            $recordCount = $jsonContent.Count
        } else {
            $recordCount = 1
        }
    } catch {
        Write-Host "  Warning: Could not parse JSON for $($file.Name): $($_.Exception.Message)"
        $recordCount = 0
    }
    
    # Add to results
    $results += [PSCustomObject]@{
        AssetName = $assetName
        SmallestDate = $smallestDate
        BiggestDate = $biggestDate
        RecordCount = $recordCount
        FileName = $file.Name
    }
}

# Export to CSV
$results | Export-Csv -Path $outputFile -NoTypeInformation -Encoding UTF8

Write-Host "`nAnalysis complete!"
Write-Host "Results saved to: $outputFile"
Write-Host "Total files processed: $($results.Count)"
