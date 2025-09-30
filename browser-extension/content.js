// ============================================================================
// CONTENT SCRIPT - Pine Logs Data Extraction
// ============================================================================

class TVPineLogsExtractor {
    constructor() {
        this.isCollecting = false;
        this.collectedData = new Map(); // Use Map for deduplication
        this.uniqueKeys = new Set(); // For tracking unique entries
        this.currentConfig = null;
        this.currentSymbolIndex = 0;
        this.currentDateIndex = 0;
        this.dateList = [];
        this.abortController = null;
        
        // Stopwatch timers
        this.collectionStartTime = null;
        this.symbolStartTime = null;
        this.dateStartTime = null;
        this.stopwatchInterval = null;
        
        // Progress tracking
        this.totalEntriesCount = 0;
        this.currentDateEntriesCount = 0;
        this.currentSymbolEntriesCount = 0;
        this.lastLoggedTime = null;
        
        this.init();
    }
    
    init() {
        // Listen for messages from popup
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'showClickExtensionHint') {
                this.showClickExtensionHint();
                sendResponse({ success: true });
                return;
            }
            this.handleMessage(message, sendResponse);
        });
        
        // Inject helper script for deeper DOM access
        this.injectHelperScript();
        
        console.log('TVPineLogsExtractor initialized on:', window.location.href);
        
        // Send ready signal to popup
        this.sendMessage({ type: 'contentScriptReady', data: { url: window.location.href } });
        
        // Auto-show popup notification on TradingView
        this.showAutoPopupNotification();
    }
    
    injectHelperScript() {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('injected.js');
        script.onload = function() {
            this.remove();
        };
        (document.head || document.documentElement).appendChild(script);
    }
    
    async handleMessage(message, sendResponse) {
        console.log('Content script received message:', message);
        
        try {
            switch (message.command) {
                case 'startCollection':
                    console.log('Starting collection from content script');
                    await this.startCollection(message);
                    break;
                case 'stopCollection':
                    console.log('Stopping collection from content script');
                    this.stopCollection();
                    break;
                case 'test':
                    console.log('Test message received:', message.message);
                    sendResponse({ success: true, message: 'Content script is working!' });
                    return; // Don't continue to the end
                default:
                    console.log('Unknown command:', message.command);
            }
        } catch (error) {
            console.error('Error handling message:', error);
            this.sendMessage({ type: 'collectionError', data: { message: error.message } });
        }
        
        sendResponse({ success: true });
    }
    
    async startCollection(config) {
        if (this.isCollecting) {
            console.log('Collection already in progress');
            return;
        }
        
        this.isCollecting = true;
        this.currentConfig = config;
        this.collectedData.clear();
        this.uniqueKeys.clear();
        this.currentSymbolIndex = 0;
        this.currentDateIndex = 0;
        
        // Reset progress counters
        this.totalEntriesCount = 0;
        this.currentDateEntriesCount = 0;
        this.currentSymbolEntriesCount = 0;
        this.lastLoggedTime = null;
        
        // Start stopwatches
        this.startStopwatches();
        
        this.abortController = new AbortController();
        
        console.log('Starting collection with config:', config);
        
        try {
            // Determine symbols to process
            const symbols = config.symbols && config.symbols.length > 0 
                ? config.symbols 
                : [this.getCurrentSymbol()];
            
            // Generate date list
            this.dateList = this.generateDateList(config.startDate, config.endDate);
            
            this.sendMessage({ type: 'collectionProgress', data: { 
                message: `Starting collection for ${symbols.length} symbols across ${this.dateList.length} date ranges`,
                symbolIndex: 0,
                totalEntries: 0,
                uniqueEntries: 0
            }});
            
            // Update UI
            this.updateProgressDisplay();
            
            // Process each symbol
            for (let i = 0; i < symbols.length && this.isCollecting; i++) {
                this.currentSymbolIndex = i;
                this.resetSymbolStopwatch();
                await this.processSymbol(symbols[i], i);
                
                // Small delay between symbols
                await this.sleep(1000);
            }
            
            if (this.isCollecting) {
                await this.saveCollectedData();
                this.sendMessage({ type: 'collectionComplete', data: { 
                    message: `Collected ${this.uniqueKeys.size} unique entries from ${symbols.length} symbols`
                }});
            }
            
        } catch (error) {
            console.error('Collection error:', error);
            this.sendMessage({ type: 'collectionError', data: { message: error.message } });
        } finally {
            this.isCollecting = false;
        }
    }
    
    stopCollection() {
        this.isCollecting = false;
        if (this.abortController) {
            this.abortController.abort();
        }
        this.stopStopwatches();
        console.log('Collection stopped');
    }
    
    updateProgressDisplay() {
        // Update all progress fields in the UI
        const totalEntries = document.getElementById('totalEntries');
        const uniqueEntries = document.getElementById('uniqueEntries');
        const entriesCurrentDate = document.getElementById('entriesCurrentDate');
        const entriesThisSymbol = document.getElementById('entriesThisSymbol');
        const currentSymbol = document.getElementById('currentSymbol');
        const currentDate = document.getElementById('currentDate');
        const symbolProgress = document.getElementById('symbolProgress');
        const dateProgress = document.getElementById('dateProgress');
        const lastLogged = document.getElementById('lastLogged');
        
        if (totalEntries) totalEntries.textContent = this.totalEntriesCount;
        if (uniqueEntries) uniqueEntries.textContent = this.uniqueKeys.size;
        if (entriesCurrentDate) entriesCurrentDate.textContent = this.currentDateEntriesCount;
        if (entriesThisSymbol) entriesThisSymbol.textContent = this.currentSymbolEntriesCount;
        
        if (currentSymbol && this.currentConfig) {
            const symbols = this.currentConfig.symbols || [];
            if (symbols.length > 0 && this.currentSymbolIndex < symbols.length) {
                const sym = symbols[this.currentSymbolIndex];
                // Extract ticker only (after colon)
                const ticker = sym.includes(':') ? sym.split(':')[1] : sym;
                currentSymbol.textContent = ticker;
            }
        }
        
        if (currentDate && this.dateList && this.currentDateIndex < this.dateList.length) {
            const dateRange = this.dateList[this.currentDateIndex];
            currentDate.textContent = dateRange.startDate || '-';
        }
        
        if (symbolProgress && this.currentConfig) {
            const symbols = this.currentConfig.symbols || [];
            symbolProgress.textContent = `${this.currentSymbolIndex + 1}/${symbols.length}`;
        }
        
        if (dateProgress && this.dateList) {
            dateProgress.textContent = `${this.currentDateIndex + 1}/${this.dateList.length}`;
        }
        
        if (lastLogged && this.lastLoggedTime) {
            // Format as yyyy-MM-dd HH:mm
            const dt = new Date(this.lastLoggedTime);
            const formatted = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
            lastLogged.textContent = formatted;
        }
    }
    
    async processSymbol(symbol, symbolIndex) {
        console.log(`Processing symbol ${symbolIndex + 1}/${this.currentConfig.symbols.length}: ${symbol}`);
        
        this.sendMessage({ type: 'symbolStarted', data: { 
            symbol: symbol,
            symbolIndex: symbolIndex
        }});
        
        // Navigate to symbol if needed
        if (this.currentConfig.symbols.length > 1) {
            await this.navigateToSymbol(symbol);
            await this.sleep(2000); // Wait for page to load
        }
        
        // Process each date range for this symbol
        for (let dateIndex = 0; dateIndex < this.dateList.length && this.isCollecting; dateIndex++) {
            this.currentDateIndex = dateIndex;
            const dateRange = this.dateList[dateIndex];
            
            await this.processDateRange(symbol, dateRange, dateIndex);
            
            // Small delay between dates
            await this.sleep(500);
        }
    }
    
    async processDateRange(symbol, dateRange, dateIndex) {
        console.log(`Processing date range ${dateIndex + 1}/${this.dateList.length}: ${dateRange.start} to ${dateRange.end}`);
        
        this.sendMessage({ type: 'dateStarted', data: { 
            date: `${dateRange.start} → ${dateRange.end}`,
            dateIndex: dateIndex
        }});
        
        try {
            // Navigate to replay mode if needed
            if (dateRange.start || dateRange.end) {
                await this.navigateToReplayMode();
                await this.setReplayDate(dateRange.start);
                await this.sleep(1000); // Wait for chart to load
            }
            
            // Extract logs for this date range
            const entries = await this.extractPineLogsFromVirtualList();
            
            // Filter and deduplicate entries
            const filteredEntries = this.filterAndDeduplicateEntries(entries, symbol, dateRange);
            
            // Add to collected data
            filteredEntries.forEach(entry => {
                const key = this.generateEntryKey(entry);
                if (!this.uniqueKeys.has(key)) {
                    this.uniqueKeys.add(key);
                    this.collectedData.set(key, entry);
                }
            });
            
            this.sendMessage({ type: 'entriesFound', data: {
                total: entries.length,
                unique: filteredEntries.length,
                today: filteredEntries.length,
                lastLogged: filteredEntries.length > 0 
                    ? new Date().toLocaleTimeString() 
                    : null
            }});
            
            // Update floating window
            this.updateFloatingWindowStatus(`Found ${entries.length} entries, ${filteredEntries.length} unique`, 'success');
            const currentSymbolEl = document.getElementById('currentSymbol');
            if (currentSymbolEl) currentSymbolEl.textContent = symbol;
            
        } catch (error) {
            console.error(`Error processing date range ${dateRange.start}-${dateRange.end}:`, error);
        }
    }
    
    async extractPineLogsFromVirtualList() {
        console.log('Starting Pine Logs extraction from virtual list');
        
        try {
            const viewport = await this.findPineLogsContainer();
            if (!viewport) {
                throw new Error('Pine Logs virtual list viewport not found');
            }
            
            // Get scroll speed configuration
            const scrollSpeedSelect = document.getElementById('scrollSpeed');
            const scrollDelay = scrollSpeedSelect ? parseInt(scrollSpeedSelect.value) : 100;
            const scrollIncrement = {
                25: 10000,
                50: 5000,
                100: 3000,
                200: 1000,
                500: 500
            }[scrollDelay] || 3000;
            
            console.log(`[CONFIG] Scroll speed: ${scrollDelay}ms delay, ${scrollIncrement}px increment`);
            
            const entries = [];
            const seenEntries = new Set();
            let scrollAttempts = 0;
            const maxScrollAttempts = 500; // Increased from 100
            let consecutiveNoNewEntries = 0;
            const maxConsecutiveNoNewEntries = 20; // Increased from 10
            
            // Scroll to top first
            console.log('[DEBUG] Scrolling to top of list...');
            viewport.scrollTop = 0;
            await this.sleep(500);
            console.log('[DEBUG] At top, starting extraction from position:', viewport.scrollTop);
            console.log('[DEBUG] Viewport scrollHeight:', viewport.scrollHeight, 'clientHeight:', viewport.clientHeight);
            
            // Extract entries while scrolling
            while (scrollAttempts < maxScrollAttempts && consecutiveNoNewEntries < maxConsecutiveNoNewEntries) {
                // Extract entries at current scroll position
                const currentEntries = await this.extractVisibleLogEntries();
                
                // Filter for new unique entries
                const newEntries = currentEntries.filter(entry => {
                    const key = this.generateEntryKey(entry);
                    if (seenEntries.has(key)) {
                        return false;
                    }
                    seenEntries.add(key);
                    return true;
                });
                
                console.log(`[DEBUG] Scroll ${scrollAttempts}: Found ${currentEntries.length} current, added ${newEntries.length} new, total: ${entries.length}`);
                
                if (newEntries.length === 0) {
                    consecutiveNoNewEntries++;
                    console.log(`[DEBUG] No new entries (stable count: ${consecutiveNoNewEntries}/${maxConsecutiveNoNewEntries})`);
                    if (consecutiveNoNewEntries >= maxConsecutiveNoNewEntries) {
                        // Check if we've reached the bottom
                        const isAtBottom = (viewport.scrollTop + viewport.clientHeight) >= (viewport.scrollHeight - 100);
                        console.log(`[DEBUG] At bottom? ${isAtBottom} (scrollTop: ${viewport.scrollTop}, scrollHeight: ${viewport.scrollHeight})`);
                        if (isAtBottom) {
                            console.log('Reached bottom of list, stopping');
                            break;
                        }
                    }
                } else {
                    consecutiveNoNewEntries = 0;
                    entries.push(...newEntries);
                }
                
                // Scroll down
                await this.scrollVirtualList(viewport, scrollIncrement);
                scrollAttempts++;
                
                // Configurable delay between scrolls
                await this.sleep(scrollDelay);
                
                // Log progress every 10 scrolls
                if (scrollAttempts % 10 === 0) {
                    console.log(`[PROGRESS] Scroll ${scrollAttempts}/${maxScrollAttempts}, entries: ${entries.length}, scroll: ${Math.round(viewport.scrollTop)}/${viewport.scrollHeight}`);
                }
            }
            
            console.log(`Extraction complete. Found ${entries.length} total entries after ${scrollAttempts} scroll attempts`);
            this.updateProgressDisplay();
            
            // Update floating window
            const filteredEntries = this.filterDuplicates(entries);
            this.updateFloatingWindowStatus(`Found ${entries.length} entries, ${filteredEntries.length} unique`, 'success');
            
            return filteredEntries;
            
        } catch (error) {
            console.error('[ERROR] Extract from virtual list failed:', error);
            throw error;
        }
    }
    
    async findPineLogsPanel() {
        console.log('[DEBUG] Starting enhanced Pine logs container search...');
        
        // Primary method: Look for Pine logs widget by test ID (from reference)
        const pineLogsWidget = document.querySelector('[data-test-id-widget-type="pine_logs"]');
        if (pineLogsWidget) {
            console.log('[DEBUG] Found Pine logs widget by test ID:', pineLogsWidget);
            return pineLogsWidget;
        }
        
        // Secondary: Look for widgetbar Pine logs
        const widgetBarPineLogs = document.querySelector('.widgetbar-widget-pine_logs');
        if (widgetBarPineLogs) {
            console.log('[DEBUG] Found Pine logs in widgetbar:', widgetBarPineLogs);
            return widgetBarPineLogs;
        }
        
        // Tertiary: Look for study title containing "Pre Trade"
        const preTradeStudy = document.querySelector('[data-study-title="Pre Trade"]');
        if (preTradeStudy) {
            console.log('[DEBUG] Found Pre Trade study:', preTradeStudy);
            return preTradeStudy.closest('[class*="widget"], [class*="panel"]') || preTradeStudy;
        }
        
        // Quaternary: Text-based search for Pine logs
        const allElements = document.querySelectorAll('*');
        for (const element of allElements) {
            const text = element.textContent;
            if (text && (text.includes('Pine Logs') || text.includes('pine_logs'))) {
                const widget = element.closest('[data-test-id-widget-type], [class*="widget"], [class*="panel"]');
                if (widget) {
                    console.log('[DEBUG] Found Pine logs by text search:', widget);
                    return widget;
                }
            }
        }
        
        console.log('[DEBUG] No Pine logs panel found');
        return null;
    }
    
    async findVirtualListContainer(logsPanel) {
        console.log('[DEBUG] Searching for virtual list container in:', logsPanel);
        
        // Primary: Look for the exact scrollable viewport from reference (corrected path)
        const scrollViewport = logsPanel.querySelector('.logsList-L0IhqRpX .container-L0IhqRpX');
        if (scrollViewport) {
            console.log('[DEBUG] Found scroll viewport:', scrollViewport);
            const style = window.getComputedStyle(scrollViewport);
            console.log('[DEBUG] Viewport overflow-y:', style.overflowY);
            console.log('[DEBUG] Viewport height:', scrollViewport.offsetHeight);
            console.log('[DEBUG] Viewport scroll height:', scrollViewport.scrollHeight);
            return scrollViewport;
        }
        
        // Secondary: Use reference fallback method to find scrollable element
        const allDivs = logsPanel.querySelectorAll('div');
        for (const div of allDivs) {
            const style = window.getComputedStyle(div);
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && 
                div.scrollHeight > div.offsetHeight) {
                console.log('[DEBUG] Found scrollable div with content:', div);
                console.log('[DEBUG] ScrollHeight:', div.scrollHeight, 'OffsetHeight:', div.offsetHeight);
                return div;
            }
        }
        
        // Tertiary: Look for standard virtual list classes
        const virtualSelectors = [
            '.list-L0IhqRpX',
            '.virtualScroll-L0IhqRpX', 
            '[class*="list-"]',
            '[class*="virtual"]',
            '[class*="scroll"]'
        ];
        
        for (const selector of virtualSelectors) {
            const element = logsPanel.querySelector(selector);
            if (element) {
                console.log(`[DEBUG] Found virtual list using selector: ${selector}`);
                return element;
            }
        }
        
        console.log('[DEBUG] No scrollable viewport found, using Pine logs widget as fallback');
        return logsPanel;
    }
    
    async extractVisibleLogEntries() {
        const logElements = document.querySelectorAll('.msg-zsZSd11H');
        console.log(`[DEBUG] Found ${logElements.length} log elements using selector: .msg-zsZSd11H`);
        
        const entries = [];
        console.log(`[DEBUG] Processing ${logElements.length} log elements`);
        
        let processedCount = 0;
        let skippedAlreadyProcessed = 0;
        let skippedNotOurEntry = 0;
        let failedParse = 0;
        
        for (const logElement of logElements) {
            // Skip if already processed
            if (logElement.hasAttribute('data-tv-processed')) {
                skippedAlreadyProcessed++;
                continue;
            }
            
            try {
                // Get the text content
                const logText = logElement.textContent.trim();
                
                // DEBUG: Log first 200 chars of every 10th element
                if (processedCount % 10 === 0) {
                    console.log(`[DEBUG Sample ${processedCount}]:`, logText.substring(0, 200));
                }
                
                // Check if this is our log entry (contains PreData or PostData)
                if (!this.isOurLogEntry(logText)) {
                    skippedNotOurEntry++;
                    if (processedCount % 10 === 0) {
                        console.log(`[DEBUG] Not our entry (no PreData/PostData found)`);
                    }
                    continue;
                }
                
                console.log(`[DEBUG] Found our entry! Type:`, logText.includes('PreData') ? 'PreData' : 'PostData');
                
                // Extract JSON from log text (after timestamp)
                // Format: [2023-01-01 12:00:00]: {"symbol": "BINANCE:BTCUSDT.P", ...}
                const timestampMatch = logText.match(/^\[(.*?)\]:\s*/);
                if (!timestampMatch) {
                    console.warn('[DEBUG] No timestamp found in log entry:', logText.substring(0, 100));
                    continue;
                }
                
                const timestamp = timestampMatch[1];
                const jsonText = logText.substring(timestampMatch[0].length);
                console.log(`[DEBUG] Timestamp: ${timestamp}`);
                console.log(`[DEBUG] JSON text (first 200 chars):`, jsonText.substring(0, 200));
                
                try {
                    const parsedData = JSON.parse(jsonText);
                    console.log(`[DEBUG] Successfully parsed JSON:`, Object.keys(parsedData));
                    
                    // Normalize timestamp to ISO 8601
                    if (parsedData.entry_datetime) {
                        parsedData.entry_datetime = this.normalizeTimestamp(parsedData.entry_datetime);
                    } else if (parsedData.entry_date) {
                        parsedData.entry_date = this.normalizeTimestamp(parsedData.entry_date);
                    } else if (timestamp) {
                        // Use log timestamp if no entry timestamp
                        parsedData.timestamp = this.normalizeTimestamp(timestamp);
                    }
                    
                    entries.push(parsedData);
                    
                    // Mark as processed
                    logElement.setAttribute('data-tv-processed', 'true');
                    
                    // Increment progress counters
                    this.totalEntriesCount++;
                    this.currentDateEntriesCount++;
                    this.currentSymbolEntriesCount++;
                    
                    // Track last logged time
                    this.lastLoggedTime = parsedData.entry_datetime || parsedData.entry_date || parsedData.timestamp;
                    
                    console.log(`[DEBUG] ✅ Successfully added entry #${entries.length}`);
                    
                } catch (parseError) {
                    failedParse++;
                    console.warn('[DEBUG] ❌ Failed to parse JSON:', parseError.message);
                    console.warn('[DEBUG] JSON text:', jsonText.substring(0, 300));
                }
                
                processedCount++;
                
            } catch (error) {
                console.warn('[DEBUG] Error processing log element:', error.message);
            }
        }
        
        console.log(`[DEBUG] Extraction stats:`);
        console.log(`  - Total elements found: ${logElements.length}`);
        console.log(`  - Already processed (skipped): ${skippedAlreadyProcessed}`);
        console.log(`  - Not our entry (skipped): ${skippedNotOurEntry}`);
        console.log(`  - Failed JSON parse: ${failedParse}`);
        console.log(`  - Successfully extracted: ${entries.length}`);
        
        return entries;
    }
    
    isOurLogEntry(content) {
        // Check if the content looks like our JSON data
        // Format: [timestamp]: {"symbol": "BINANCE:BTCUSDT.P", ...}
        return content.includes('{"symbol"') && 
               (content.includes('"type":"PreData"') || content.includes('"type":"PostData"'));
    }
    
    normalizeTimestamp(dateStr) {
        // Convert various timestamp formats to ISO 8601 UTC
        if (!dateStr) return new Date().toISOString();
        
        try {
            // Handle format: "2023-01-01 12:00:00" or "2023-01-01 12:00"
            if (dateStr.match(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/)) {
                // Assume UTC and convert to ISO format
                const parts = dateStr.split(/[\s:]/);
                const datePart = parts[0]; // YYYY-MM-DD
                const hour = parts[1] || '00';
                const minute = parts[2] || '00';
                const second = parts[3] || '00';
                return `${datePart}T${hour}:${minute}:${second}.000Z`;
            }
            
            // Already ISO format
            if (dateStr.includes('T') && dateStr.includes('Z')) {
                return dateStr;
            }
            
            // Try to parse and convert
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                return date.toISOString();
            }
            
            // Fallback
            return new Date().toISOString();
        } catch (error) {
            console.error('Error normalizing timestamp:', error);
            return new Date().toISOString();
        }
    }
    
    extractTimestamp(element) {
        // Try to find timestamp in various ways
        const timestampSelectors = [
            '[class*="timestamp"]',
            '[class*="time"]',
            '.log-time'
        ];
        
        for (const selector of timestampSelectors) {
            const timestampElement = element.querySelector(selector);
            if (timestampElement) {
                return timestampElement.textContent.trim();
            }
        }
        
        // Look for timestamp in parent elements
        let parent = element.parentElement;
        let depth = 0;
        while (parent && depth < 3) {
            for (const selector of timestampSelectors) {
                const timestampElement = parent.querySelector(selector);
                if (timestampElement) {
                    return timestampElement.textContent.trim();
                }
            }
            parent = parent.parentElement;
            depth++;
        }
        
        return null;
    }
    
    async scrollVirtualList(container) {
        console.log('[DEBUG] Scrolling virtual list, current scrollTop:', container.scrollTop);
        
        const scrollStep = 1000; // Increased from 500 to 1000 for faster scrolling
        const initialScrollTop = container.scrollTop;
        
        // Method 1: Direct scrollTop manipulation (most reliable)
        try {
            container.scrollTop += scrollStep;
            console.log('[DEBUG] Scrolled to:', container.scrollTop);
        } catch (error) {
            console.warn('ScrollTop manipulation failed:', error);
        }
        
        // Method 2: Wheel event for virtual scroll triggering
        try {
            const wheelEvent = new WheelEvent('wheel', {
                deltaY: scrollStep,
                deltaMode: WheelEvent.DOM_DELTA_PIXEL,
                bubbles: true,
                cancelable: true
            });
            container.dispatchEvent(wheelEvent);
        } catch (error) {
            console.warn('Wheel event scroll failed:', error);
        }
        
        // Method 3: Keyboard Page Down event
        try {
            container.focus(); // Ensure element has focus
            const keyEvent = new KeyboardEvent('keydown', {
                key: 'PageDown',
                code: 'PageDown',
                keyCode: 34,
                bubbles: true,
                cancelable: true
            });
            container.dispatchEvent(keyEvent);
        } catch (error) {
            console.warn('Keyboard scroll failed:', error);
        }
        
        // Method 4: Try scrolling parent container if this one didn't scroll
        if (container.scrollTop === initialScrollTop && container.parentElement) {
            console.log('[DEBUG] Container did not scroll, trying parent');
            try {
                container.parentElement.scrollTop += scrollStep;
            } catch (error) {
                console.warn('Parent scroll failed:', error);
            }
        }
    }
    
    filterAndDeduplicateEntries(entries, symbol, dateRange) {
        const filtered = [];
        const seen = new Set();
        
        for (const entry of entries) {
            try {
                // Parse JSON content
                const data = JSON.parse(entry.content);
                
                // Basic validation
                if (!data.type || !data.symbol) continue;
                
                // Symbol filter (if we're processing specific symbols)
                if (this.currentConfig.symbols.length > 1 && data.symbol !== symbol) {
                    continue;
                }
                
                // Date filter
                if (dateRange.start || dateRange.end) {
                    const entryDate = new Date(data.entry_datetime || data.timestamp);
                    const startDate = dateRange.start ? new Date(dateRange.start) : null;
                    const endDate = dateRange.end ? new Date(dateRange.end) : null;
                    
                    if (startDate && entryDate < startDate) continue;
                    if (endDate && entryDate > endDate) continue;
                }
                
                // Generate deduplication key
                const dedupKey = this.generateEntryKey(data);
                if (seen.has(dedupKey)) continue;
                
                seen.add(dedupKey);
                filtered.push(data);
                
            } catch (error) {
                console.warn('Error parsing log entry:', error, entry.content);
            }
        }
        
        return filtered;
    }
    
    generateEntryKey(data) {
        // Create unique key for deduplication
        return `${data.type}|${data.symbol}|${data.timeframe}|${data.entry_datetime || data.timestamp}|${data.side || ''}`;
    }
    
    generateDateList(startDate, endDate) {
        const dates = [];
        
        if (!startDate && !endDate) {
            // No date filter - return empty array (will collect current data)
            return [{ start: null, end: null }];
        }
        
        if (!startDate || !endDate) {
            // Single date
            const singleDate = startDate || endDate;
            return [{ start: singleDate, end: singleDate }];
        }
        
        // Multiple dates - generate year-based ranges
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        // Start with the exact start date
        dates.push({ start: startDate, end: null });
        
        let currentYear = start.getFullYear();
        const endYear = end.getFullYear();
        
        // Add end of each year until we reach the end year
        while (currentYear < endYear) {
            const yearEnd = `${currentYear}-12-31`;
            dates.push({ start: null, end: yearEnd });
            currentYear++;
        }
        
        // Add the exact end date
        if (startDate !== endDate) {
            dates.push({ start: null, end: endDate });
        }
        
        return dates;
    }
    
    getCurrentSymbol() {
        // Extract current symbol from TradingView URL or page
        const url = window.location.href;
        const symbolMatch = url.match(/symbol=([^&]+)/);
        if (symbolMatch) {
            return decodeURIComponent(symbolMatch[1]);
        }
        
        // Fallback: look for symbol in page elements
        const symbolElements = document.querySelectorAll('[class*="symbol"], [data-name*="symbol"]');
        for (const element of symbolElements) {
            const text = element.textContent?.trim();
            if (text && text.includes(':')) {
                return text;
            }
        }
        
        return 'UNKNOWN:SYMBOL';
    }
    
    async navigateToSymbol(symbol) {
        console.log(`Navigating to symbol: ${symbol}`);
        
        // Try to change symbol without changing URL (using TradingView's API)
        try {
            // Look for symbol search/input field
            const symbolInputs = document.querySelectorAll('input[class*="symbol"], input[placeholder*="symbol"]');
            for (const input of symbolInputs) {
                input.value = symbol;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                
                // Press Enter
                const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    bubbles: true
                });
                input.dispatchEvent(enterEvent);
                
                return; // Success
            }
            
            // Fallback: modify URL (though this might restart the extension)
            console.warn('Could not find symbol input, URL change may be required');
            
        } catch (error) {
            console.error('Error navigating to symbol:', error);
        }
    }
    
    async navigateToReplayMode() {
        console.log('Entering replay mode');
        
        // First ensure Pine Logs is activated
        await this.activatePineLogsWidget();
        
        // Look for replay button or mode
        const replaySelectors = [
            '[data-name="replay"]',
            '[class*="replay"]',
            'button[title*="replay"]',
            'button[title*="Replay"]',
            '[data-test-id="replay-button"]'
        ];
        
        for (const selector of replaySelectors) {
            const button = document.querySelector(selector);
            if (button) {
                console.log(`Found replay button: ${selector}`);
                button.click();
                await this.sleep(2000);
                return;
            }
        }
        
        console.warn('Replay mode button not found');
    }
    
    async activatePineLogsWidget() {
        console.log('[DEBUG] Attempting to activate Pine logs widget...');
        
        // Method 1: Try to find and click the Pine logs tab
        const pineLogsTab = document.querySelector('[data-test-id-widget-type="pine_logs"]');
        if (pineLogsTab) {
            console.log('[DEBUG] Found Pine logs tab, clicking...');
            pineLogsTab.click();
            await this.sleep(1000);
            return true;
        }
        
        // Method 2: Try to find Pine logs in the widget bar
        const widgetBarTabs = document.querySelectorAll('.widgetbar-tab');
        for (const tab of widgetBarTabs) {
            if (tab.textContent && (tab.textContent.includes('Pine') || tab.textContent.includes('Logs'))) {
                console.log('[DEBUG] Found Pine logs in widget bar, clicking...');
                tab.click();
                await this.sleep(1000);
                return true;
            }
        }
        
        // Method 3: Try keyboard shortcut
        try {
            document.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'l',
                ctrlKey: true,
                bubbles: true
            }));
            console.log('[DEBUG] Sent Ctrl+L keyboard shortcut');
        } catch (error) {
            console.warn('[DEBUG] Keyboard shortcut failed:', error);
        }
        
        return false;
    }
    
    async setReplayDate(date) {
        if (!date) return;
        
        console.log(`Setting replay date to: ${date}`);
        
        // Look for date picker or input
        const dateSelectors = [
            'input[type="date"]',
            '[class*="date-picker"]',
            '[class*="calendar"]',
            'input[placeholder*="date"]'
        ];
        
        for (const selector of dateSelectors) {
            const input = document.querySelector(selector);
            if (input) {
                input.value = date;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                await this.sleep(500);
                return;
            }
        }
        
        console.warn('Date input not found');
    }
    
    async saveCollectedData() {
        if (this.collectedData.size === 0) {
            console.log('No data to save');
            return;
        }
        
        // Group data by symbol and type
        const groupedData = this.groupDataForSaving();
        
        // Save each group as a separate file
        for (const [fileName, data] of Object.entries(groupedData)) {
            await this.downloadJSONFile(fileName, data);
        }
        
        console.log(`Saved ${Object.keys(groupedData).length} files with ${this.collectedData.size} total entries`);
    }
    
    groupDataForSaving() {
        const grouped = {};
        
        for (const [key, entry] of this.collectedData) {
            // Extract symbol ticker for filename
            const symbolParts = entry.symbol.split(':');
            const ticker = symbolParts.length > 1 ? this.escapeSymbolForFilename(symbolParts[1]) : entry.symbol;
            
            // Generate filename
            const fileName = `${ticker}-${entry.timeframe}-${this.formatDateForFilename(new Date())}.json`;
            
            if (!grouped[fileName]) {
                grouped[fileName] = [];
            }
            
            grouped[fileName].push(entry);
        }
        
        // Sort entries in each group by timestamp
        for (const fileName of Object.keys(grouped)) {
            grouped[fileName].sort((a, b) => {
                const timeA = new Date(a.entry_datetime || a.timestamp || 0);
                const timeB = new Date(b.entry_datetime || b.timestamp || 0);
                return timeA - timeB;
            });
        }
        
        return grouped;
    }
    
    escapeSymbolForFilename(symbol) {
        // Clean symbol for filename
        return symbol.replace(/[^a-zA-Z0-9.-]/g, '_');
    }
    
    formatDateForFilename(date) {
        // Format: yyyyMMdd-HHmm
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        
        return `${year}${month}${day}-${hours}${minutes}`;
    }
    
    async downloadJSONFile(fileName, data) {
        try {
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            // Use Chrome Downloads API
            chrome.runtime.sendMessage({
                type: 'download',
                data: {
                    url: url,
                    filename: fileName
                }
            });
            
            console.log(`Initiated download for: ${fileName}`);
            
        } catch (error) {
            console.error(`Error downloading file ${fileName}:`, error);
        }
    }
    
    sendMessage(message) {
        try {
            chrome.runtime.sendMessage(message);
        } catch (error) {
            console.error('Error sending message:', error);
        }
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // ====================================================================
    // STOPWATCH METHODS
    // ====================================================================
    
    initializeStopwatches() {
        this.collectionStartTime = null;
        this.symbolStartTime = null;
        this.dateStartTime = null;
        this.stopwatchInterval = null;
    }
    
    startStopwatches() {
        this.collectionStartTime = Date.now();
        this.symbolStartTime = Date.now();
        this.dateStartTime = Date.now();
        
        // Update stopwatches every second
        if (this.stopwatchInterval) {
            clearInterval(this.stopwatchInterval);
        }
        this.stopwatchInterval = setInterval(() => {
            this.updateStopwatchDisplays();
        }, 1000);
    }
    
    stopStopwatches() {
        if (this.stopwatchInterval) {
            clearInterval(this.stopwatchInterval);
            this.stopwatchInterval = null;
        }
    }
    
    resetSymbolStopwatch() {
        this.symbolStartTime = Date.now();
        this.currentSymbolEntriesCount = 0;
    }
    
    resetDateStopwatch() {
        this.dateStartTime = Date.now();
        this.currentDateEntriesCount = 0;
    }
    
    updateStopwatchDisplays() {
        const formatTime = (ms) => {
            const totalSeconds = Math.floor(ms / 1000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        };
        
        const now = Date.now();
        
        if (this.collectionStartTime) {
            document.getElementById('collectionStopwatch').textContent = formatTime(now - this.collectionStartTime);
        }
        if (this.symbolStartTime) {
            document.getElementById('symbolStopwatch').textContent = formatTime(now - this.symbolStartTime);
        }
        if (this.dateStartTime) {
            document.getElementById('dateStopwatch').textContent = formatTime(now - this.dateStartTime);
        }
    }
    
    // ====================================================================
    // END STOPWATCH METHODS
    // ====================================================================
    
    showAutoPopupNotification() {
        // Check if we should show the floating window (only once per session)
        const sessionKey = 'tvDataCollector_floatingWindowShown_' + window.location.hostname;
        if (sessionStorage.getItem(sessionKey)) {
            return; // Already shown this session
        }
        
        // Wait for page to fully load
        setTimeout(() => {
            this.createFloatingWindow();
            sessionStorage.setItem(sessionKey, 'true');
        }, 2000); // Reduced from 3000 to 2000
    }
    
    createFloatingWindow() {
        // Remove any existing window
        const existing = document.getElementById('tvDataCollectorWindow');
        if (existing) existing.remove();
        
        // Create floating window container
        const window = document.createElement('div');
        window.id = 'tvDataCollectorWindow';
        window.innerHTML = `
            <div id="floatingWindowContainer" style="
                position: fixed;
                top: 80px;
                right: 20px;
                width: 380px;
                min-height: 500px;
                z-index: 999999;
                background: #1e1e1e;
                color: #ffffff;
                border: 2px solid #4CAF50;
                border-radius: 8px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.8);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                flex-direction: column;
            ">
                <!-- Header -->
                <div id="windowHeader" style="
                    background: #2d2d2d;
                    padding: 12px 16px;
                    border-radius: 6px 6px 0 0;
                    cursor: move;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid #4CAF50;
                ">
                    <div style="display: flex; align-items: center;">
                        <span style="font-size: 18px; margin-right: 8px;">🚀</span>
                        <strong style="color: #4CAF50;">TV Data Collector</strong>
                    </div>
                    <button id="minimizeWindow" style="
                        background: #f44336;
                        color: white;
                        border: none;
                        width: 24px;
                        height: 24px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 16px;
                    ">×</button>
                </div>
                
                <!-- Content -->
                <div style="padding: 16px; flex: 1; overflow-y: auto;">
                    <!-- File Upload for Symbols -->
                    <div style="margin-bottom: 12px;">
                        <label style="display: block; margin-bottom: 4px; font-size: 12px; color: #ccc;">Upload Symbols (.txt file):</label>
                        <input id="symbolsFileInput" type="file" accept=".txt" style="
                            width: 100%;
                            padding: 6px;
                            background: #2d2d2d;
                            border: 1px solid #555;
                            color: #fff;
                            border-radius: 4px;
                            font-size: 11px;
                            box-sizing: border-box;
                        ">
                        <div style="font-size: 10px; color: #888; margin-top: 4px;">Symbols loaded: <span id="symbolsLoaded" style="color: #4CAF50;">0</span></div>
                    </div>
                    
                    <!-- Manual Symbol Input (alternative) -->
                    <div style="margin-bottom: 12px;">
                        <label style="display: block; margin-bottom: 4px; font-size: 12px; color: #ccc;">Or enter manually:</label>
                        <input id="symbolsInput" type="text" placeholder="BINANCE:BTCUSDT.P, BINANCE:ETHUSDT.P" style="
                            width: 100%;
                            padding: 8px;
                            background: #2d2d2d;
                            border: 1px solid #555;
                            color: #fff;
                            border-radius: 4px;
                            font-size: 12px;
                            box-sizing: border-box;
                        ">
                    </div>
                    
                    <!-- Date Range -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                        <div>
                            <label style="display: block; margin-bottom: 4px; font-size: 12px; color: #ccc;">Start Date:</label>
                            <input id="startDateInput" type="date" value="2023-01-01" style="
                                width: 100%;
                                padding: 6px;
                                background: #2d2d2d;
                                border: 1px solid #555;
                                color: #fff;
                                border-radius: 4px;
                                font-size: 12px;
                                box-sizing: border-box;
                            ">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 4px; font-size: 12px; color: #ccc;">End Date:</label>
                            <input id="endDateInput" type="date" style="
                                width: 100%;
                                padding: 6px;
                                background: #2d2d2d;
                                border: 1px solid #555;
                                color: #fff;
                                border-radius: 4px;
                                font-size: 12px;
                                box-sizing: border-box;
                            ">
                        </div>
                    </div>
                    
                    <!-- Scroll Speed Selector -->
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 4px; font-size: 12px; color: #ccc;">Scroll Speed:</label>
                        <select id="scrollSpeed" style="
                            width: 100%;
                            padding: 6px;
                            background: #2d2d2d;
                            border: 1px solid #555;
                            color: #fff;
                            border-radius: 4px;
                            font-size: 12px;
                            box-sizing: border-box;
                        ">
                            <option value="25">⚡ Very Fast (25ms, 10000px)</option>
                            <option value="50">🚀 Fast (50ms, 5000px)</option>
                            <option value="100" selected>⏩ Normal (100ms, 3000px)</option>
                            <option value="200">🐢 Slow (200ms, 1000px)</option>
                            <option value="500">🐌 Very Slow (500ms, 500px)</option>
                        </select>
                    </div>
                    
                    <!-- Progress Display -->
                    <div style="margin-bottom: 12px; padding: 10px; background: #2d2d2d; border-radius: 4px;">
                        <!-- Stopwatches -->
                        <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #444;">
                            <div style="font-size: 11px; color: #888; margin-bottom: 6px;">⏱️ Timers</div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; text-align: center;">
                                <div>
                                    <div style="font-size: 9px; color: #666;">Collection</div>
                                    <div id="collectionStopwatch" style="font-size: 14px; color: #2196F3; font-family: monospace;">00:00:00</div>
                                </div>
                                <div>
                                    <div style="font-size: 9px; color: #666;">Symbol</div>
                                    <div id="symbolStopwatch" style="font-size: 14px; color: #FF9800; font-family: monospace;">00:00:00</div>
                                </div>
                                <div>
                                    <div style="font-size: 9px; color: #666;">Date</div>
                                    <div id="dateStopwatch" style="font-size: 14px; color: #9C27B0; font-family: monospace;">00:00:00</div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Current Status -->
                        <div style="margin-bottom: 8px;">
                            <div style="font-size: 10px; color: #888;">Current Symbol: <span id="currentSymbol" style="color: #fff; font-weight: bold;">-</span> (<span id="symbolProgress">0/0</span>)</div>
                            <div style="font-size: 10px; color: #888;">Current Date: <span id="currentDate" style="color: #fff; font-weight: bold;">-</span> (<span id="dateProgress">0/0</span>)</div>
                        </div>
                        
                        <!-- Entry Counts -->
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 8px;">
                            <div style="text-align: center;">
                                <div style="font-size: 9px; color: #888;">Total</div>
                                <div id="totalEntries" style="font-size: 16px; font-weight: bold; color: #2196F3;">0</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 9px; color: #888;">Unique</div>
                                <div id="uniqueEntries" style="font-size: 16px; font-weight: bold; color: #4CAF50;">0</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 9px; color: #888;">Current Date</div>
                                <div id="entriesCurrentDate" style="font-size: 16px; font-weight: bold; color: #FF9800;">0</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 9px; color: #888;">This Symbol</div>
                                <div id="entriesThisSymbol" style="font-size: 16px; font-weight: bold; color: #9C27B0;">0</div>
                            </div>
                        </div>
                        
                        <!-- Last Logged -->
                        <div style="font-size: 10px; color: #888; text-align: center;">
                            Last Logged: <span id="lastLogged" style="color: #4CAF50; font-family: monospace;">-</span>
                        </div>
                    </div>
                    
                    <!-- Control Buttons -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px;">
                        <button id="startCollectionBtn" style="
                            background: #4CAF50;
                            color: white;
                            border: none;
                            padding: 12px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: bold;
                        ">🚀 Start</button>
                        <button id="stopCollectionBtn" style="
                            background: #f44336;
                            color: white;
                            border: none;
                            padding: 12px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: bold;
                        " disabled>⏹️ Stop</button>
                    </div>
                    
                    <!-- Status Messages -->
                    <div style="margin-top: 16px;">
                        <div style="font-size: 12px; font-weight: bold; color: #4CAF50; margin-bottom: 8px;">📝 Status:</div>
                        <div id="statusMessages" style="
                            max-height: 150px;
                            overflow-y: auto;
                            background: #1a1a1a;
                            border: 1px solid #444;
                            border-radius: 4px;
                            padding: 8px;
                            font-size: 11px;
                        ">
                            <div style="color: #4CAF50;">✅ Ready to collect data</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(window);
        
        // Make window draggable
        this.makeDraggable(window.querySelector('#floatingWindowContainer'), window.querySelector('#windowHeader'));
        
        // Set up event listeners
        this.setupFloatingWindowEvents();
        
        // Set default end date to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('endDateInput').value = today;
    }
    
    removeNotification(notification) {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }
    
    setupFloatingWindowEvents() {
        // File upload handler - FIXED: Handle Windows/Unix newlines correctly
        const fileInput = document.getElementById('symbolsFileInput');
        fileInput?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file && file.name.endsWith('.txt')) {
                const text = await file.text();
                // Split by newline (Windows \r\n or Unix \n) AND comma, remove empty
                const symbols = text.split(/[\r\n,]+/)
                    .map(s => s.trim())
                    .filter(s => s.length > 0);
                
                // Update UI
                document.getElementById('symbolsLoaded').textContent = symbols.length;
                document.getElementById('symbolsInput').value = symbols.join(', ');
                
                console.log(`📁 Loaded ${symbols.length} symbols:`, symbols);
                this.updateFloatingWindowStatus(`📁 Loaded ${symbols.length} symbols from file`, 'success');
            } else {
                this.updateFloatingWindowStatus('⚠️ Please select a .txt file', 'error');
            }
        });
        
        // Minimize button
        const minimizeBtn = document.getElementById('minimizeWindow');
        minimizeBtn?.addEventListener('click', () => {
            const window = document.getElementById('tvDataCollectorWindow');
            if (window) window.style.display = 'none';
        });
        
        // Start collection button
        const startBtn = document.getElementById('startCollectionBtn');
        startBtn?.addEventListener('click', () => {
            this.startCollectionFromFloatingWindow();
        });
        
        // Stop collection button
        const stopBtn = document.getElementById('stopCollectionBtn');
        stopBtn?.addEventListener('click', () => {
            this.stopCollection();
            this.updateFloatingWindowStatus('Collection stopped', 'warning');
            startBtn.disabled = false;
            stopBtn.disabled = true;
        });
        
        // Initialize stopwatches
        this.initializeStopwatches();
    }
    
    startCollectionFromFloatingWindow() {
        const symbolsInput = document.getElementById('symbolsInput').value;
        const startDate = document.getElementById('startDateInput').value;
        const endDate = document.getElementById('endDateInput').value;
        
        // Parse symbols
        const symbols = symbolsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
        
        if (symbols.length === 0) {
            this.updateFloatingWindowStatus('⚠️ Please enter at least one symbol', 'error');
            return;
        }
        
        // Disable start, enable stop
        document.getElementById('startCollectionBtn').disabled = true;
        document.getElementById('stopCollectionBtn').disabled = false;
        
        // Start collection
        this.startCollection({
            symbols: symbols,
            startDate: startDate,
            endDate: endDate,
            command: 'startCollection'
        });
        
        this.updateFloatingWindowStatus('🚀 Collection started...', 'success');
    }
    
    updateFloatingWindowStatus(message, type = 'info') {
        const statusContainer = document.getElementById('statusMessages');
        if (!statusContainer) return;
        
        const colors = {
            info: '#2196F3',
            success: '#4CAF50',
            warning: '#FF9800',
            error: '#f44336'
        };
        
        const statusLine = document.createElement('div');
        statusLine.style.color = colors[type] || colors.info;
        statusLine.style.marginBottom = '4px';
        statusLine.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        
        statusContainer.appendChild(statusLine);
        statusContainer.scrollTop = statusContainer.scrollHeight;
        
        // Keep only last 20 messages
        while (statusContainer.children.length > 20) {
            statusContainer.removeChild(statusContainer.firstChild);
        }
        
        // Also update stats if this is a progress message
        if (message.includes('entries')) {
            const match = message.match(/(\d+)/);
            if (match) {
                const totalEl = document.getElementById('totalEntries');
                const uniqueEl = document.getElementById('uniqueEntries');
                if (totalEl) totalEl.textContent = match[1];
                if (uniqueEl) uniqueEl.textContent = this.uniqueKeys.size.toString();
            }
        }
    }
    
    makeDraggable(element, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        handle.onmousedown = dragMouseDown;
        
        function dragMouseDown(e) {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }
        
        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + 'px';
            element.style.left = (element.offsetLeft - pos1) + 'px';
            element.style.right = 'auto'; // Disable right positioning while dragging
        }
        
        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }
    
    showClickExtensionHint() {
        // Show a hint to click the extension icon
        const hint = document.createElement('div');
        hint.innerHTML = `
            <div style="
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 10001;
                background: rgba(0,0,0,0.9);
                color: #4CAF50;
                padding: 20px;
                border-radius: 8px;
                text-align: center;
                font-family: Arial, sans-serif;
                border: 2px solid #4CAF50;
            ">
                <div style="font-size: 24px; margin-bottom: 10px;">👆</div>
                <div style="font-size: 16px; font-weight: bold;">Click the extension icon in your browser toolbar!</div>
                <div style="font-size: 12px; color: #888; margin-top: 8px;">Look for the TradingView Data Collector icon</div>
            </div>
        `;
        
        document.body.appendChild(hint);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (hint.parentNode) {
                hint.parentNode.removeChild(hint);
            }
        }, 3000);
    }
}

// Initialize the extractor
const tvExtractor = new TVPineLogsExtractor();

console.log('TradingView Pine Logs Extractor loaded');