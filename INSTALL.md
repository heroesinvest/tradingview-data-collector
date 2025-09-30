# Installation Guide - TradingView Data Collector

## Quick Setup (5 minutes)

### Step 1: PineScript Indicator

1. **Open TradingView Pine Editor**
   - Go to [tradingview.com/pine-editor](https://www.tradingview.com/pine-editor/)
   - Login to your TradingView account

2. **Install the Indicator**
   - Copy all code from `pinescript/tv-data-collector.pine`
   - Paste into Pine Editor
   - Click "Save" and give it a name: "TV Data Collector"
   - Click "Add to Chart"

3. **Verify Installation**
   - You should see purple SMA200 and gray EMA20 lines
   - Status table should appear in bottom-right corner
   - Pine Logs panel should show at bottom of screen

### Step 2: Browser Extension

1. **Download and Install**
   ```bash
   # If using git
   git clone https://github.com/heroesinvest/TVFinalSonnet4.5Webv2.git
   cd TVFinalSonnet4.5Webv2/browser-extension
   
   # Or download ZIP and extract
   ```

2. **Load in Browser**
   - Open Chrome/Edge
   - Go to `chrome://extensions/` (or `edge://extensions/`)
   - Toggle ON "Developer mode" (top-right)
   - Click "Load unpacked"
   - Select the `browser-extension` folder
   - Extension icon should appear in toolbar

3. **Verify Installation**
   - Click extension icon
   - Popup window should open
   - All fields should be visible and functional

## Step 3: First Data Collection

1. **Setup TradingView**
   - Open any chart (e.g., ES1! 1H)
   - Apply the TV Data Collector indicator
   - Make sure Pine Logs panel is visible (bottom of screen)

2. **Configure Extension**
   - Click extension icon to open
   - Leave symbols empty (will use current chart)
   - Set dates if needed (optional)
   - Click "🚀 Start Collection"

3. **Monitor Progress**
   - Watch status messages
   - Collection should begin immediately
   - JSON file will auto-download when complete

## Common Setup Issues

### PineScript Issues

**Problem**: Indicator doesn't compile
```
Solution: Copy the ENTIRE code, including the first line
//@version=6
```

**Problem**: No signals generated
```
Solution: 
- Check that you're on correct timeframe (1H recommended)
- Ensure EMA20 and SMA200 are visible
- Wait for valid crossover conditions
```

**Problem**: Pine Logs not showing
```
Solution:
- Click the "Pine Logs" tab at bottom of TradingView
- If not visible, right-click chart → "Pine Logs"
- Ensure alerts are enabled in indicator settings
```

### Extension Issues

**Problem**: Extension doesn't load
```
Solution:
- Check Developer mode is ON
- Try reloading the extension
- Check console for errors (F12)
```

**Problem**: Can't find Pine Logs
```
Solution:
- Make sure Pine Logs panel is visible in TradingView
- Try refreshing the TradingView page
- Check if you're on a supported TradingView URL
```

**Problem**: Files not downloading
```
Solution:
- Allow automatic downloads in browser settings
- Check Downloads folder
- Try running in incognito mode
```

## Advanced Configuration

### Custom Symbols List

Create a text file with symbols (one per line):
```
CME_MINI:ES1!
BINANCE:BTCUSDT.P
NASDAQ:AAPL
NYSE:SPY
FOREX:EURUSD
```

### Date-Range Collection

For historical data:
- Set Start Date: 2023-01-01
- Set End Date: 2023-12-31
- Extension will automatically navigate through replay mode

### Multiple Symbol Processing

1. Upload symbols file
2. Extension will process each symbol sequentially
3. Separate JSON files generated for each symbol
4. Progress tracked in real-time

## Testing Your Setup

### Quick Test (2 minutes)

1. **Generate Test Signal**
   - Find a chart with recent EMA/SMA crossover
   - Apply indicator
   - Check Pine Logs for JSON output

2. **Test Extension**
   - Open extension popup
   - Click "Start Collection"
   - Should find and extract the test signal
   - JSON file should download automatically

### Full Test (10 minutes)

1. **Multi-Symbol Test**
   - Create test file with 2-3 symbols
   - Upload to extension
   - Run collection
   - Verify separate files for each symbol

2. **Date Range Test**
   - Set specific date range (e.g., last month)
   - Run collection
   - Verify historical data extraction

## Troubleshooting Commands

### Browser Console (F12)
```javascript
// Check if extension loaded
console.log('Extension status:', !!window.tvDataCollector);

// Check content script
console.log('Content script:', !!window.tvExtractor);

// Manual log extraction test
tvExtractor.extractPineLogsFromVirtualList().then(logs => {
    console.log('Found logs:', logs.length);
});
```

### PineScript Debug
```pine
// Add to indicator to debug signals
if long_signal
    log.info("DEBUG: Long signal triggered")
if short_signal  
    log.info("DEBUG: Short signal triggered")
```

## Performance Optimization

### For Large Data Collections

1. **Batch Processing**
   - Process 10-20 symbols at a time
   - Allow breaks between batches
   - Monitor memory usage

2. **Date Segmentation**
   - Break large date ranges into quarters
   - Process Q1, Q2, Q3, Q4 separately
   - Merge files later if needed

3. **Browser Settings**
   - Close unnecessary tabs
   - Disable other extensions temporarily
   - Use incognito mode for clean state

## Next Steps

After successful installation:

1. **Review Documentation.md** for detailed usage
2. **Test with sample data** before production runs
3. **Setup regular collection schedule** for ongoing data gathering
4. **Integrate with your ML pipeline** for model training

## Support

If you encounter issues:

1. Check this guide first
2. Review console logs (F12)
3. Verify TradingView account permissions
4. Test with simple single-symbol collection first

---

**Total Setup Time**: ~5-10 minutes  
**Tested On**: Chrome 118+, Edge 118+, TradingView Pro  
**Last Updated**: September 30, 2025