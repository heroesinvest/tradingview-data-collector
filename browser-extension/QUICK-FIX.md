# TradingView Data Collector - Quick Test Instructions

## 🚨 IMMEDIATE FIX TEST

**Step 1: Try the Debug Version**
1. Rename `manifest.json` to `manifest-original.json`
2. Rename `manifest-debug.json` to `manifest.json`
3. Go to `chrome://extensions/`
4. Click "Reload" on the TradingView Data Collector extension
5. Click the extension icon - you should see a simple test popup

**Step 2: If Test Popup Works**
- The issue is with the main popup UI complexity
- Rename files back and we'll fix the main popup

**Step 3: If Test Popup Doesn't Work**
- There's a fundamental extension loading issue
- Check the steps below

---

## 🔧 COMPLETE REINSTALL (if needed)

```powershell
# Navigate to your extension folder
cd "C:\dev\TVFinalSonnet4.5Webv2\browser-extension"

# Make sure all files are present
dir
```

**Files you should see:**
- manifest.json ✅
- popup.html ✅  
- popup.js ✅
- content.js ✅
- background.js ✅
- injected.js ✅
- icons/ folder ✅

**Extension Install:**
1. Open Chrome/Edge
2. Go to `chrome://extensions/`
3. Enable "Developer mode" (toggle top-right)
4. Click "Remove" if extension exists
5. Click "Load unpacked"
6. Select the `browser-extension` folder
7. Extension should appear with green toggle

**Test Steps:**
1. Go to [TradingView Chart](https://www.tradingview.com/chart/)
2. Look for extension icon in toolbar (puzzle piece if hidden)
3. Click extension icon
4. Popup should appear immediately

---

## 📊 WHAT THE CONSOLE TELLS US

**Good Signs (from your log):**
✅ `TVPineLogsExtractor initialized` - Content script loads
✅ `TradingView Pine Logs Extractor loaded` - Extension active
✅ `injected script loaded` - All components working

**The Issue:**
- Extension components load correctly
- Popup window just isn't opening when clicked
- This is usually a manifest or popup HTML/JS error

---

## 🎯 QUICK DIAGNOSIS

**Test 1: Extension Icon**
- Is the extension icon visible in Chrome toolbar?
- Try clicking the puzzle piece icon to pin it

**Test 2: Right-click Extension Icon**
- Right-click extension icon → "Inspect popup"
- Any red errors in console?

**Test 3: Try Debug Console**
- Navigate to: `chrome-extension://YOUR_EXTENSION_ID/debug.html`
- Replace YOUR_EXTENSION_ID with actual ID from chrome://extensions/

---

## 💡 MOST LIKELY FIXES

**Fix 1: Manifest issue**
```json
// Try the debug manifest (simpler popup)
Use manifest-debug.json instead of manifest.json
```

**Fix 2: Popup permissions**
```json
// Add to manifest.json permissions:
"tabs",
"activeTab"
```

**Fix 3: Clear extension data**
```
1. chrome://extensions/
2. Click "Details" on your extension  
3. Click "Extension options" 
4. Click "Remove extension"
5. Reinstall from folder
```

Run the debug manifest test first - that will tell us if it's the popup UI or something more fundamental!