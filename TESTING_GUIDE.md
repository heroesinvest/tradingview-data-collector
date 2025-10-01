# Testing Guide - TradingView Data Collector

## 🎯 Objectives to Validate

### 1. Loop Funcional (Symbol → Date → Scrape)
**Test:** Upload arquivo com 2 símbolos, start date 2023-01-01
**Expected Console Output:**
```
==========================================================
📊 Processing symbol 1/2: BINANCE:BTCUSDT.P
==========================================================

📝 Symbol data before: 0 entries

📅 Processing date 1/1: 2023-01-01
Processing date range 1/1: 2023-01-01 to null
[DEBUG] extractPineLogsFromVirtualList returned X entries
...

📊 Symbol BINANCE:BTCUSDT.P complete: 500 entries collected
💾 Downloading JSON for BINANCE:BTCUSDT.P...
📥 Downloaded: BTCUSDT_P-60-20230101-0000-20231231-2359.json (250 entries)

==========================================================
📊 Processing symbol 2/2: BINANCE:AVAXUSDT.P
==========================================================
...
```

**✅ Success Criteria:**
- [ ] Console shows `Processing symbol 1/2` then `Processing symbol 2/2`
- [ ] Each symbol completes fully before next symbol starts
- [ ] Download happens immediately after each symbol completes

---

### 2. Last Entry Live Updates
**Test:** Start collection and watch UI in real-time
**Expected Console Output:**
```
[DEBUG] ✅ PreData found: 2023-01-01T10:00:00.000Z
[DEBUG] ✅ PostData found: 2023-01-01T11:00:00.000Z
[DEBUG] ✅ PreData found: 2023-01-01T12:00:00.000Z
```

**Expected UI Behavior:**
- PreData box updates immediately when PreData is found
- PostData box updates immediately when PostData is found
- Updates happen DURING scrolling (not just at end)

**✅ Success Criteria:**
- [ ] Console shows `✅ PreData found:` with timestamp for each PreData
- [ ] Console shows `✅ PostData found:` with timestamp for each PostData
- [ ] UI "Last Entry PreData" updates in real-time
- [ ] UI "Last Entry PostData" updates in real-time

---

### 3. Merged Data Structure
**Test:** Download JSON file and inspect structure
**Expected JSON Structure:**
```json
[
  {
    "entry_datetime": "2023-01-01T10:00:00.000Z",
    "symbol": "BINANCE:BTCUSDT.P",
    "timeframe": "60",
    "side": "long",
    "preData": {
      "atr_percentage": 0.008,
      "sma200_distance": 4.902,
      "ema20_distance": -0.158,
      ... (30+ fields)
      "ohlcv": {
        "open": [...],
        "high": [...],
        "low": [...],
        "close": [...]
      }
    },
    "postData": {
      "maxATR": 5.2,
      "barsUntilMaxATR": 12,
      "minATR": -0.8,
      "barsUntilMinATR": 8,
      "exit_reason": "take_profit"
    }
  },
  {
    "entry_datetime": "2023-01-01T15:00:00.000Z",
    "symbol": "BINANCE:BTCUSDT.P",
    "timeframe": "60",
    "side": "short",
    "preData": { ... },
    "postData": null  // Last entry may not have exit yet
  }
]
```

**✅ Success Criteria:**
- [ ] Root level has: `entry_datetime`, `symbol`, `timeframe`, `side`
- [ ] `preData` object contains all 30+ normalized fields + ohlcv
- [ ] `postData` object contains maxATR, minATR, barsUntil*, exit_reason
- [ ] Last entry may have `postData: null` (trade still open)
- [ ] No duplicated `entry_datetime` in same file
- [ ] Console shows: `📊 Merged BTCUSDT_P-60: X PreData + Y PostData = Z entries`

---

### 4. Download Per Symbol
**Test:** Upload 3 symbols, watch Downloads folder
**Expected Downloads:**
```
BTCUSDT_P-60-20230101-1000-20231231-2359.json
AVAXUSDT_P-60-20230101-1200-20231230-1800.json
BNBUSDT-60-20230101-0800-20231229-2200.json
```

**✅ Success Criteria:**
- [ ] 3 files appear in Downloads folder
- [ ] Files appear ONE AT A TIME (not all at end)
- [ ] File 1 downloads completely before symbol 2 starts processing
- [ ] Console shows: `📥 Downloaded: [filename] (X entries)` for each file

---

### 5. No Duplicates
**Test:** Check for duplicate entries in downloaded JSON
**Command to test:**
```powershell
$json = Get-Content "BTCUSDT_P-60-*.json" | ConvertFrom-Json
$json | Group-Object entry_datetime | Where-Object Count -gt 1
```

**Expected Output:** (empty - no duplicates)

**✅ Success Criteria:**
- [ ] No duplicate `entry_datetime` in same file
- [ ] Number of PreData ≈ PostData (± 1 for last open trade)
- [ ] Console shows: `Found X unique entries` not `Found X entries, 0 unique`

---

## 🧪 Test Scenarios

### Scenario 1: Single Symbol, Single Date
```
Symbols: BINANCE:BTCUSDT.P
Start Date: 2023-01-01
End Date: (empty)
```
**Expected:** 1 file, structure merged, live updates

### Scenario 2: Multiple Symbols, Date Range
```
Symbols: BINANCE:BTCUSDT.P, BINANCE:AVAXUSDT.P
Start Date: 2023-01-01
End Date: 2023-01-31
```
**Expected:** 2 files, loop through symbols sequentially

### Scenario 3: Symbol File Upload
```
Upload: symbols.txt containing:
BINANCE:BTCUSDT.P
BINANCE:AVAXUSDT.P
BINANCE:BNBUSDT
ACTIVTRADES:EURUSD
```
**Expected:** 4 files, one per symbol

---

## 🐛 Known Issues to Verify Fixed

### Issue 1: Loop Broken
**Before:** All symbols processed simultaneously or only first symbol
**After:** Symbols processed sequentially with await

### Issue 2: Last Entry Not Updating
**Before:** Last Entry only updated at end of scroll
**After:** Updates live after each entry identified

### Issue 3: Separate PreData/PostData Files
**Before:** Two arrays in one file or separate entries
**After:** Single merged structure per entry

### Issue 4: Download Not Happening
**Before:** No files downloaded or download only at very end
**After:** Download immediately after each symbol completes

---

## 📊 Console Output Reference

### Good Output Example:
```
[08:35:25] 📊 Processing symbol 1/4: BINANCE:BTCUSDT.P
[08:35:26] 📅 Processing date 1/1: 2023-01-01
[08:35:30] [DEBUG] ✅ PreData found: 2023-01-01T10:00:00.000Z
[08:35:31] [DEBUG] ✅ PostData found: 2023-01-01T11:00:00.000Z
[08:36:41] 📊 Merged BTCUSDT_P-60: 250 PreData + 249 PostData = 250 entries
[08:36:41] 📥 Downloaded: BTCUSDT_P-60-20230101-1000-20231231-2359.json (250 entries)
[08:36:42] 📊 Processing symbol 2/4: BINANCE:AVAXUSDT.P
...
```

### Bad Output Example (BEFORE FIX):
```
[08:35:25] Processing symbol 1/4: BINANCE:BTCUSDT.P
[08:35:25] Processing symbol 2/4: BINANCE:AVAXUSDT.P  ❌ TOO FAST
[08:35:25] Processing symbol 3/4: BINANCE:BNBUSDT  ❌ NO AWAIT
[08:36:41] Found 1000 entries  ❌ NO LIVE UPDATES
[08:36:41] (no downloads)  ❌ NO FILES
```

---

## 🎯 Final Validation Checklist

Before marking as complete, verify ALL:
- [ ] Console shows sequential symbol processing (1/N → 2/N → 3/N)
- [ ] Console shows live PreData/PostData found messages
- [ ] UI updates Last Entry boxes in real-time during scrolling
- [ ] Downloads folder receives N files (one per symbol)
- [ ] Each JSON file has merged structure (preData + postData objects)
- [ ] No duplicate entry_datetime in any file
- [ ] Number of entries matches: PreData count ≈ PostData count ≈ Merged count
- [ ] Last entry may have postData: null (acceptable)
- [ ] Files download immediately after each symbol (not all at end)
