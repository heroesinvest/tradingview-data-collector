# Required Fixes for content.js

## Current Issues
The content.js file has been partially modified and has syntax errors that need to be resolved. The file needs to be restored and then properly modified with the following fixes:

## 1. Year-End Date Stepping (NOT Daily)

### Location: `generateDateList()` method around line 972

**Replace the current simplified single-date logic with:**

```javascript
generateDateList(startDate, endDate) {
    // YEAR-END STEPPING: Build list with start date, Dec 31 of each full year, and end date
    // Force seconds/milliseconds to 00:00 for consistency
    
    if (!startDate && !endDate) {
        console.log('[DEBUG] No date range specified, using current data');
        return [];
    }
    
    const dateList = [];
    
    // Parse dates as UTC midnight
    const parseDate = (dateStr) => {
        if (!dateStr) return null;
        const dt = new Date(dateStr + 'T00:00:00.000Z');
        return dt;
    };
    
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    
    if (!start || !end) {
        console.log('[DEBUG] Invalid date range, using single date');
        return startDate ? [{ start: startDate, end: null }] : [];
    }
    
    // Helper to format as YYYY-MM-DD HH:mm (force 00:00)
    const formatDate = (dt) => {
        const y = dt.getUTCFullYear();
        const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const d = String(dt.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d} 00:00`;
    };
    
    // 1. Add start date
    dateList.push({ start: formatDate(start), end: null });
    console.log(`[DATE GEN] Added start date: ${formatDate(start)}`);
    
    // 2. Add Dec 31 of each full year between start.year and end.year
    const startYear = start.getUTCFullYear();
    const endYear = end.getUTCFullYear();
    
    for (let year = startYear; year < endYear; year++) {
        const dec31 = new Date(Date.UTC(year, 11, 31, 0, 0, 0, 0));
        
        // Only add if Dec 31 is after start date and before/equal to end date
        if (dec31 > start && dec31 <= end) {
            const formattedDec31 = formatDate(dec31);
            
            // Avoid duplicate if start was already Dec 31
            if (dateList[dateList.length - 1].start !== formattedDec31) {
                dateList.push({ start: formattedDec31, end: null });
                console.log(`[DATE GEN] Added year-end: ${formattedDec31}`);
            }
        }
    }
    
    // 3. Add end date if it's not already in the list
    const formattedEnd = formatDate(end);
    if (dateList[dateList.length - 1].start !== formattedEnd) {
        dateList.push({ start: formattedEnd, end: null });
        console.log(`[DATE GEN] Added end date: ${formattedEnd}`);
    }
    
    console.log(`[DATE GEN] Generated ${dateList.length} date points (year-end stepping)`);
    return dateList;
}
```

**Test Case:**
- Start: `2019-03-15`, End: `2025-10-01`
- Expected: `['2019-03-15 00:00', '2019-12-31 00:00', '2020-12-31 00:00', '2021-12-31 00:00', '2022-12-31 00:00', '2023-12-31 00:00', '2024-12-31 00:00', '2025-10-01 00:00']`

## 2. Replay State Management

### Location: Constructor around line 5

**Add to constructor:**
```javascript
// Replay state management (per-symbol tracking)
this.replayInitializedForSymbol = {}; // Track which symbols had replay initialized
this.isReplayPanelOpen = false; // Track if replay panel is currently open
```

### Location: After `handleReplayDialog()` method

**Add new methods:**
```javascript
async ensureReplayReady(phase, symbol) {
    console.log(`[REPLAY] ensureReplayReady called: phase=${phase}, symbol=${symbol}`);
    
    // Only initialize replay if dates are configured
    if (this.dateList.length === 0) {
        console.log('[REPLAY] No dates configured, skipping replay mode');
        return;
    }
    
    // Check if replay is active
    const isReplayActive = this.isReplayModeActive();
    console.log(`[REPLAY] Replay currently active: ${isReplayActive}`);
    
    // If replay is not active, open it
    if (!isReplayActive) {
        console.log('[REPLAY] Opening replay mode...');
        await this.activateReplayMode();
        this.isReplayPanelOpen = true;
        await this.sleep(1500);
    }
    
    // Handle "Continue your last Replay?" modal ONCE per symbol
    if (!this.replayInitializedForSymbol[symbol]) {
        console.log(`[REPLAY] First time for symbol ${symbol}, checking for modal...`);
        const modalHandled = await this.handleReplayDialog();
        if (modalHandled) {
            console.log('[REPLAY] Modal handled: clicked Start new');
            await this.sleep(1000);
        }
        this.replayInitializedForSymbol[symbol] = true;
    } else {
        console.log(`[REPLAY] Symbol ${symbol} already initialized, skipping modal check`);
    }
    
    console.log('[REPLAY] Replay ready');
}

isReplayModeActive() {
    const replayButton = this.findReplayButton();
    if (replayButton) {
        const isActive = replayButton.getAttribute('aria-pressed') === 'true' ||
                       replayButton.classList.contains('active') ||
                       replayButton.classList.contains('isActive');
        if (isActive) return true;
    }
    
    // Check for replay timeline/controls
    const replayTimeline = document.querySelector('[class*="replay"][class*="timeline"], [class*="replay"][class*="control"]');
    if (replayTimeline && this.isElementVisible(replayTimeline)) {
        return true;
    }
    
    return false;
}

findReplayButton() {
    const replaySelectors = [
        'button[data-name="replay"]:not([data-name*="speed"])',
        '[aria-label*="Replay"][aria-label*="mode"][role="button"]',
        'div[data-role="button"][title*="Replay"][title*="mode"]',
        '[class*="toolbar"] button[class*="replay"]:not([class*="speed"])'
    ];
    
    for (const selector of replaySelectors) {
        const btn = document.querySelector(selector);
        if (btn && this.isElementVisible(btn)) {
            return btn;
        }
    }
    
    return null;
}

async activateReplayMode() {
    console.log('[REPLAY] Activating replay mode...');
    
    const replayButton = this.findReplayButton();
    if (!replayButton) {
        console.warn('[REPLAY] Replay button not found');
        return;
    }
    
    replayButton.click();
    console.log('[REPLAY] Clicked replay button');
    await this.sleep(1500);
}
```

### Location: Update `handleReplayDialog()` method

**Modify return value:**
```javascript
async handleReplayDialog() {
    const dialogs = document.querySelectorAll('[role="dialog"]');
    for (const dialog of dialogs) {
        const dialogText = dialog.textContent || '';
        if (dialogText.includes('Continue') && dialogText.includes('Replay') && dialogText.includes('last')) {
            console.log('[DEBUG] Found "Continue your last Replay?" dialog');
            
            // Find "Start new" button
            const buttons = dialog.querySelectorAll('button, [role="button"], [data-role="button"]');
            for (const btn of buttons) {
                const btnText = (btn.textContent || '').toLowerCase();
                if (btnText.includes('start') && btnText.includes('new')) {
                    console.log('[DEBUG] Clicking "Start new" button');
                    btn.click();
                    await this.sleep(800);
                    return true; // Modal handled
                }
            }
        }
    }
    return false; // No modal found
}
```

## 3. Processed-Node Marking

### Location: `extractVisibleLogEntries()` method

**Add at the start of the loop:**
```javascript
for (const logElement of logElements) {
    // Skip if already processed (using data attribute marking)
    if (logElement.hasAttribute('data-tv-processed')) {
        skippedAlreadyProcessed++;
        continue;
    }
    
    // ... rest of existing code
```

**Add after successful parse:**
```javascript
    entries.push({
        // ... existing fields
    });
    processedCount++;
    
    // Mark this DOM node as processed
    logElement.setAttribute('data-tv-processed', 'true');
```

**Add in error handler:**
```javascript
} catch (parseError) {
    console.warn('[DEBUG] Failed to parse JSON:', parseError.message);
    failedParse++;
    // Still mark as processed to avoid retry
    logElement.setAttribute('data-tv-processed', 'true');
}
```

## 4. Update processDateRange

### Location: `processDateRange()` method around line 340

**Replace the replay navigation section with:**
```javascript
try {
    // Ensure replay mode is ready (idempotent, handles modal once per symbol)
    if (dateRange.start || dateRange.end) {
        await this.ensureReplayReady('processDateRange', symbol);
        
        // Set replay date
        console.log(`[REPLAY] Setting date to: ${dateRange.start}`);
        await this.setReplayDate(dateRange.start);
        await this.sleep(1500); // Wait for chart to load at this date
```

## 5. Restore Download Mechanism

### Location: `downloadJSONFile()` method

**Ensure this method exists and works:**
```javascript
async downloadJSONFile(fileName, data) {
    console.log(`[DOWNLOAD TRACE] downloadJSONFile START: ${fileName}`);
    try {
        // Create JSON blob
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // Create download link
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        
        // Trigger download
        link.click();
        
        // Cleanup
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
        
        console.log(`[DOWNLOAD TRACE] ✓ Download triggered: ${fileName}`);
    } catch (error) {
        console.error(`[DOWNLOAD TRACE] ✗ Download failed: ${error.message}`);
        throw error;
    }
}
```

## 6. Add ERROR File Generation

### Location: `saveCollectedDataForSymbol()` method

**Modify the empty entries section:**
```javascript
if (symbolEntries.size === 0) {
    console.log(`[DOWNLOAD] ⚠️ Zero entries for ${symbol}, creating ERROR file`);
    
    const errorFileName = `${this.escapeSymbolForFilename(symbol)}-ERROR-${this.formatDateForFilename(new Date())}.json`;
    const errorData = {
        error: 'No data collected',
        symbol: symbol,
        ticker: ticker,
        totalCollectedEntries: this.collectedData.size,
        allSymbolsInLogs: Array.from(allSymbols),
        timestamp: new Date().toISOString()
    };
    
    await this.downloadJSONFile(errorFileName, errorData);
    console.log(`[DOWNLOAD] ERROR file created: ${errorFileName}`);
    return;
}
```

## 7. Enhanced Diagnostics

### Location: Various console.log statements

**Add phase banners in processSymbol:**
```javascript
console.log(`\n${'='.repeat(60)}`);
console.log(`📊 [PHASE: SYMBOL] Processing ${symbolIndex + 1}/${this.currentConfig.symbols.length}: ${symbol}`);
console.log(`📋 Total dates to process: ${this.dateList.length}`);
console.log(`🔄 Replay initialized for: ${Object.keys(this.replayInitializedForSymbol).join(', ') || 'none'}`);
console.log(`${'='.repeat(60)}\n`);
```

**Add in saveCollectedDataForSymbol:**
```javascript
console.log(`🔍 [DIAGNOSTIC] Distinct symbols in logs:`);
const symbolCounts = {};
for (const sym of allSymbols) {
    symbolCounts[sym] = (symbolCounts[sym] || 0) + 1;
    console.log(`   - ${sym}: ${symbolCounts[sym]} entries`);
}
console.log(`🎯 [DIAGNOSTIC] Target symbol: ${symbol}`);
```

## Current File State

The content.js file currently has syntax errors that need to be fixed first. The navigateToSymbol method has a broken catch block that needs to be completed.

## Recovery Steps

1. First, restore the file from git or backup
2. Then apply each fix section above in order
3. Test each section before moving to the next

## Alternative: Use Git Patch

If you have git, you can apply the comprehensive patch that fixes all issues at once. The patch file is available as content.js.patch in the root directory.

```bash
git apply content.js.patch
```

## Testing Checklist

After applying all fixes:

- [ ] Year-end dates generate correctly (test with 2019-03-15 to 2025-10-01)
- [ ] Replay modal is handled only once per symbol
- [ ] Symbol changes are verified before proceeding
- [ ] Processed nodes are not re-parsed (check console for "Already processed" count)
- [ ] JSON files download for each symbol
- [ ] ERROR files are created when no data is found
- [ ] No infinite loops or page reloads
- [ ] Console shows phase banners and diagnostic info
