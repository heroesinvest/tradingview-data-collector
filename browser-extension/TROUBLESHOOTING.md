# TradingView Data Collector - Troubleshooting Guide

## Quick Fix Steps

### 1. Installation Check ✅
- Open Chrome/Edge Extensions page: `chrome://extensions/`
- Make sure "Developer mode" is enabled (toggle in top-right)
- Check that "TradingView Data Collector" is installed and enabled
- Verify it shows "Manifest V3" and green toggle

### 2. Test the Extension 🧪
1. Navigate to **any** website first (not TradingView yet)
2. Open the debug page: `chrome-extension://YOUR_EXTENSION_ID/debug.html`
   - **How to find your extension ID**: Go to `chrome://extensions/`, find "TradingView Data Collector", copy the ID under the name
   - Or click "Details" and copy from the URL
3. Run all the tests in the debug console
4. Check for any red error messages

### 3. TradingView Test 📈
1. Navigate to [TradingView.com](https://www.tradingview.com/chart/)
2. Make sure you're on a chart page (URL should contain `/chart/`)
3. Click the extension icon in the Chrome toolbar
4. The popup should appear with "TradingView Data Collector" interface

### 4. Common Issues & Fixes 🔧

**Issue: Extension icon doesn't appear**
- Check if extensions are hidden: Click the puzzle piece icon in Chrome toolbar
- Pin the extension: Click the pin icon next to "TradingView Data Collector"

**Issue: Popup window is blank or doesn't open**
- Right-click the extension icon → "Inspect popup"
- Check the Console tab for JavaScript errors
- Look for red error messages

**Issue: "No error, no window" (your current issue)**
- This usually means the popup HTML/JS has an error
- Try the debug page first to test basic functionality
- Check if you're on a supported website (TradingView)

**Issue: Content script not working**
- Refresh the TradingView page after installing the extension
- Check browser console (F12) for content script errors
- Make sure TradingView didn't update their DOM structure

### 5. Debug Console Tests 🔍

Open `chrome-extension://YOUR_EXTENSION_ID/debug.html` and run:

1. **Test Extension API** - Should show all green checkmarks
2. **Test TradingView URL** - Only works when on TradingView
3. **Test Content Script** - Only works when on TradingView with page refreshed

### 6. Manual Debugging Steps 🛠️

1. **Check extension permissions**:
   ```
   Go to chrome://extensions/ → TradingView Data Collector → Details
   Make sure "On click" and "On tradingview.com" are enabled
   ```

2. **Check console errors**:
   ```
   Right-click extension icon → Inspect popup → Console tab
   Look for red error messages
   ```

3. **Test on TradingView**:
   ```
   1. Go to tradingview.com/chart/
   2. Press F12 → Console tab
   3. Look for "TVPineLogsExtractor initialized" message
   4. If missing, content script didn't load
   ```

### 7. Quick Reset 🔄

If nothing works:
1. Go to `chrome://extensions/`
2. Remove "TradingView Data Collector"
3. Reload the extension folder
4. Test on a fresh TradingView tab

### 8. Get More Info 📋

Add this to your browser console (F12) on any page:
```javascript
console.log('Chrome version:', chrome.runtime?.getManifest?.());
console.log('Extension ID:', chrome.runtime?.id);
console.log('Available APIs:', Object.keys(chrome));
```

---

## Expected Behavior ✅

When working correctly:
1. Extension icon appears in Chrome toolbar
2. Clicking icon opens a dark-themed popup window
3. Popup shows "TV Data Collector" with input fields
4. On TradingView, content script logs "TVPineLogsExtractor initialized"
5. Popup shows green "Content script ready" message

## Getting Help 🆘

If still not working, provide:
1. Chrome/Edge version
2. Operating system
3. Screenshot of `chrome://extensions/` page
4. Console errors from debug page
5. Console errors from popup inspection