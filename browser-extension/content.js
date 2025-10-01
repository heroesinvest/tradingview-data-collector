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
        this.lastPreDataDatetime = null; // Last PreData datetime
        this.lastPostDataDatetime = null; // Last PostData datetime
        
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
        
        // Add keyboard shortcut to toggle floating window (Ctrl+Shift+T)
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'T') {
                e.preventDefault();
                console.log('[SHORTCUT] Ctrl+Shift+T pressed - Toggling floating window');
                const existing = document.getElementById('tvDataCollectorWindow');
                if (existing) {
                    existing.style.display = existing.style.display === 'none' ? 'block' : 'none';
                } else {
                    this.createFloatingWindow();
                }
            }
        });
        
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
                // Downloads already done per-symbol - just send completion message
                this.sendMessage({ type: 'collectionComplete', data: { 
                    message: `✅ Collection complete! Downloaded ${symbols.length} JSON files with ${this.uniqueKeys.size} total unique entries`
                }});
                console.log(`🎉 Collection complete! ${symbols.length} symbols processed, ${this.uniqueKeys.size} unique entries`);
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
        
        // Update UI buttons
        const startBtn = document.getElementById('startCollectionBtn');
        const stopBtn = document.getElementById('stopCollectionBtn');
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        
        // Send stop message
        this.sendMessage({ type: 'collectionStopped', data: { 
            message: 'Collection stopped by user',
            entriesCollected: this.uniqueKeys.size
        }});
        
        console.log('🛑 Collection stopped by user');
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
            const dateStr = dateRange.start || dateRange.end || '-';
            currentDate.textContent = dateStr; // Already in yyyy-MM-dd format
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
        
        // Update last entry displays - separate PreData and PostData
        const lastPreDataDatetime = document.getElementById('lastPreDataDatetime');
        const lastPostDataDatetime = document.getElementById('lastPostDataDatetime');
        
        if (lastPreDataDatetime && this.lastPreDataDatetime) {
            const dt = new Date(this.lastPreDataDatetime);
            const formatted = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
            lastPreDataDatetime.textContent = formatted;
        }
        
        if (lastPostDataDatetime && this.lastPostDataDatetime) {
            const dt = new Date(this.lastPostDataDatetime);
            const formatted = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
            lastPostDataDatetime.textContent = formatted;
        }
    }
    
    async processSymbol(symbol, symbolIndex) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📊 Processing symbol ${symbolIndex + 1}/${this.currentConfig.symbols.length}: ${symbol}`);
        console.log(`${'='.repeat(60)}\n`);
        
        this.sendMessage({ type: 'symbolStarted', data: { 
            symbol: symbol,
            symbolIndex: symbolIndex
        }});
        
        // Navigate to symbol if needed
        if (this.currentConfig.symbols.length > 1) {
            console.log(`🔄 Navigating to symbol: ${symbol}...`);
            await this.navigateToSymbol(symbol);
            await this.sleep(2000); // Wait for page to load
        }
        
        // Reset symbol-specific data collection
        const symbolDataBefore = this.collectedData.size;
        console.log(`📝 Symbol data before: ${symbolDataBefore} entries`);
        
        // Process each date range for this symbol (usually just 1)
        for (let dateIndex = 0; dateIndex < this.dateList.length && this.isCollecting; dateIndex++) {
            this.currentDateIndex = dateIndex;
            const dateRange = this.dateList[dateIndex];
            
            console.log(`\n📅 Processing date ${dateIndex + 1}/${this.dateList.length}: ${dateRange.start}`);
            await this.processDateRange(symbol, dateRange, dateIndex);
            
            // Small delay between dates
            await this.sleep(500);
        }
        
        // CRITICAL: Download JSON for this symbol IMMEDIATELY before moving to next symbol
        const symbolDataAfter = this.collectedData.size;
        const entriesThisSymbol = symbolDataAfter - symbolDataBefore;
        
        console.log(`\n📊 Symbol ${symbol} complete: ${entriesThisSymbol} entries collected`);
        console.log(`[DOWNLOAD TRACE] Total collectedData size: ${this.collectedData.size}`);
        console.log(`[DOWNLOAD TRACE] Symbol data before: ${symbolDataBefore}, after: ${symbolDataAfter}`);
        
        if (entriesThisSymbol > 0) {
            console.log(`💾 [DOWNLOAD TRACE] Initiating download for ${symbol}...`);
            try {
                await this.saveCollectedDataForSymbol(symbol);
                console.log(`✅ [DOWNLOAD TRACE] Download completed for ${symbol}`);
            } catch (error) {
                console.error(`❌ [DOWNLOAD TRACE] Download FAILED for ${symbol}:`, error);
                console.error('[DOWNLOAD TRACE] Error stack:', error.stack);
            }
        } else {
            console.warn(`⚠️ No entries collected for ${symbol} - SKIP DOWNLOAD`);
        }
    }
    
    async processDateRange(symbol, dateRange, dateIndex) {
        console.log(`Processing date range ${dateIndex + 1}/${this.dateList.length}: ${dateRange.start} to ${dateRange.end}`);
        
        // Reset date-specific counters
        this.currentDateEntriesCount = 0;
        this.resetDateStopwatch();
        
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
            console.log(`[DEBUG] extractPineLogsFromVirtualList returned ${entries.length} entries`);
            
            // Filter and deduplicate entries
            const filteredEntries = this.filterAndDeduplicateEntries(entries, symbol, dateRange);
            console.log(`[DEBUG] filterAndDeduplicateEntries returned ${filteredEntries.length} entries`);
            
            // Count PreData vs PostData
            let preDataCount = 0;
            let postDataCount = 0;
            
            // Add to collected data
            filteredEntries.forEach(entry => {
                const key = this.generateEntryKey(entry);
                if (!this.uniqueKeys.has(key)) {
                    this.uniqueKeys.add(key);
                    this.collectedData.set(key, entry);
                    this.currentDateEntriesCount++;
                    
                    // Count by type
                    if (entry.type === 'PreData') preDataCount++;
                    else if (entry.type === 'PostData') postDataCount++;
                }
            });
            
            console.log(`[SUMMARY] Date ${dateRange.start}: Total=${entries.length}, Unique=${filteredEntries.length}, PreData=${preDataCount}, PostData=${postDataCount}`);
            
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
            
            // Scroll speed will be read from UI on each iteration (can be changed live)
            const getScrollConfig = () => {
                const scrollSpeedSelect = document.getElementById('scrollSpeed');
                const scrollDelay = scrollSpeedSelect ? parseInt(scrollSpeedSelect.value) : 100;
                const scrollIncrement = {
                    25: 10000,
                    50: 5000,
                    100: 3000,
                    200: 1000,
                    500: 500
                }[scrollDelay] || 3000;
                return { scrollDelay, scrollIncrement };
            };
            
            const initialConfig = getScrollConfig();
            console.log(`[CONFIG] Initial scroll speed: ${initialConfig.scrollDelay}ms delay, ${initialConfig.scrollIncrement}px increment`);
            
            const entries = [];
            const seenEntries = new Set();
            let scrollAttempts = 0;
            const maxScrollAttempts = 9999; // No hard limit - will stop when at bottom
            let consecutiveNoNewEntries = 0;
            const maxConsecutiveNoNewEntries = 20; // Stop after 20 scrolls with no new entries
            
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
                    
                    // Check if we've reached the bottom
                    const isAtBottom = (viewport.scrollTop + viewport.clientHeight) >= (viewport.scrollHeight - 100);
                    
                    if (consecutiveNoNewEntries >= maxConsecutiveNoNewEntries) {
                        if (isAtBottom) {
                            console.log(`Reached bottom of list AND no new entries for ${maxConsecutiveNoNewEntries} scrolls, stopping`);
                            break;
                        } else {
                            console.log(`[DEBUG] Not at bottom yet (${Math.round(viewport.scrollTop + viewport.clientHeight)}/${viewport.scrollHeight}), continuing despite no new entries...`);
                            // Reduce the counter to give more chances if not at bottom
                            consecutiveNoNewEntries = Math.floor(maxConsecutiveNoNewEntries / 2);
                        }
                    }
                } else {
                    consecutiveNoNewEntries = 0;
                    entries.push(...newEntries);
                }
                
                // Scroll down (get current config from UI - can be changed live)
                const { scrollDelay, scrollIncrement } = getScrollConfig();
                
                // CRITICAL: Pause scrolling if user has speed dropdown open
                if (this.isSpeedDropdownOpen()) {
                    console.log('[DEBUG] ⏸️ Speed dropdown is open - pausing scroll to allow user interaction');
                    await this.sleep(2000); // Wait 2 seconds for user to make selection
                    continue; // Skip this scroll cycle
                }
                
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
            this.updateFloatingWindowStatus(`Found ${entries.length} unique entries`, 'success');
            
            return entries;
            
        } catch (error) {
            console.error('[ERROR] Extract from virtual list failed:', error);
            throw error;
        }
    }
    
    async findPineLogsContainer() {
        console.log('[DEBUG] findPineLogsContainer() called - searching for scrollable viewport...');
        
        // Step 1: Find the Pine Logs panel/widget
        const panel = await this.findPineLogsPanel();
        if (!panel) {
            console.error('[DEBUG] Pine Logs panel not found!');
            return null;
        }
        
        // Step 2: Find the scrollable container within the panel
        const container = await this.findVirtualListContainer(panel);
        console.log('[DEBUG] Found scrollable container:', container);
        return container;
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
        
        // Secondary: Look for container-* class (the actual scroll container)
        const containerDiv = logsPanel.querySelector('[class*="container-"]');
        if (containerDiv) {
            const style = window.getComputedStyle(containerDiv);
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && 
                containerDiv.scrollHeight > containerDiv.clientHeight + 100) {
                console.log('[DEBUG] Found scrollable container with significant content:', containerDiv);
                console.log('[DEBUG] ScrollHeight:', containerDiv.scrollHeight, 'ClientHeight:', containerDiv.clientHeight);
                return containerDiv;
            }
        }
        
        // Tertiary: Use reference fallback method to find scrollable element with MEANINGFUL scrollHeight
        const allDivs = logsPanel.querySelectorAll('div');
        for (const div of allDivs) {
            const style = window.getComputedStyle(div);
            // Only accept if there's at least 1000px of scrollable content (not just a few pixels)
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && 
                div.scrollHeight > div.clientHeight + 1000) {
                console.log('[DEBUG] Found scrollable div with significant content:', div);
                console.log('[DEBUG] ScrollHeight:', div.scrollHeight, 'ClientHeight:', div.clientHeight);
                return div;
            }
        }
        
        // Quaternary: Look for standard virtual list classes (but validate they scroll)
        console.log('[DEBUG] Trying virtual list selectors...');
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
                const virtualScrollable = element.scrollHeight > element.clientHeight + 100;
                console.log(`[DEBUG] Checking ${selector}: scrollHeight=${element.scrollHeight}, clientHeight=${element.clientHeight}, scrollable=${virtualScrollable}`);
                if (virtualScrollable) {
                    console.log(`[DEBUG] ✅ Found virtual list: ${selector}`);
                    return element;
                }
            }
        }
        
        console.warn('[DEBUG] ⚠️ No scrollable viewport found, using Pine logs widget as fallback');
        console.warn('[DEBUG] ⚠️ Scrolling may NOT WORK - virtual list may not load new items!');
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
                
                // Check if this is our log entry (contains PreData or PostData)
                if (!this.isOurLogEntry(logText)) {
                    skippedNotOurEntry++;
                    // Log first entry to see format
                    if (skippedNotOurEntry === 1) {
                        console.log(`[DEBUG] First skipped entry sample:`, logText.substring(0, 300));
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
                // console.log(`[DEBUG] JSON text (first 200 chars):`, jsonText.substring(0, 200));
                
                try {
                    // Replace NaN with null to make valid JSON
                    const cleanedJson = jsonText.replace(/:\s*NaN/g, ':null');
                    const parsedData = JSON.parse(cleanedJson);
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
                    
                    // Track last entry info for display - separate PreData and PostData
                    this.lastLoggedTime = parsedData.entry_datetime || parsedData.entry_date || parsedData.timestamp;
                    if (parsedData.type === 'PreData') {
                        this.lastPreDataDatetime = parsedData.entry_datetime || parsedData.timestamp;
                        console.log(`[DEBUG] ✅ PreData found: ${this.lastPreDataDatetime}`);
                    } else if (parsedData.type === 'PostData') {
                        this.lastPostDataDatetime = parsedData.entry_datetime || parsedData.timestamp;
                        console.log(`[DEBUG] ✅ PostData found: ${this.lastPostDataDatetime}`);
                    }
                    
                    // Update UI immediately (LIVE updates)
                    this.updateProgressDisplay();
                    
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
        // Format: [timestamp]: {"symbol": "BINANCE:BTCUSDT.P", "type": "PreData" OR "PostData", ...}
        // More flexible check - just needs to have symbol and type fields with PreData or PostData
        return content.includes('"symbol"') && 
               (content.includes('PreData') || content.includes('PostData'));
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
                // Entry is already a parsed object from extractVisibleLogEntries
                const data = entry;
                
                // Skip if no valid data
                if (!data || typeof data !== 'object') {
                    console.warn('[DEBUG] Skipping invalid entry:', typeof data);
                    continue;
                }
                
                // Basic validation
                if (!data.type || !data.symbol) {
                    console.warn('[DEBUG] Skipping entry missing type or symbol:', data);
                    continue;
                }
                
                // Symbol filter (if we're processing specific symbols)
                if (this.currentConfig.symbols.length > 1 && data.symbol !== symbol) {
                    console.log(`[DEBUG] Skipping entry for different symbol: ${data.symbol} (expected: ${symbol})`);
                    continue;
                }
                
                // NOTE: No date filtering - all entries will be before current date anyway
                // The replay mode date selection already ensures we only see historical data
                
                // Generate deduplication key
                const dedupKey = this.generateEntryKey(data);
                if (seen.has(dedupKey)) {
                    console.log(`[DEBUG] Duplicate entry found (key: ${dedupKey})`);
                    continue;
                }
                
                seen.add(dedupKey);
                filtered.push(data);
                
            } catch (error) {
                console.warn('Error processing entry:', error, entry);
            }
        }
        
        console.log(`[DEBUG] Filtered ${entries.length} entries down to ${filtered.length} unique entries`);
        return filtered;
    }
    
    generateEntryKey(data) {
        // Create unique key for deduplication
        return `${data.type}|${data.symbol}|${data.timeframe}|${data.entry_datetime || data.timestamp}|${data.side || ''}`;
    }
    
    generateDateList(startDate, endDate) {
        // Simplified: Collect ONCE per symbol using start date as reference
        // All data will be collected in a single pass through the Pine Logs
        // No need for multiple date iterations - replay mode shows all historical data
        
        if (!startDate && !endDate) {
            // No date specified - collect current live data without replay mode
            return [{ start: null, end: null }];
        }
        
        // If any date is specified, use startDate for replay mode entry point
        // This gives us access to all historical data in Pine Logs
        const replayDate = startDate || endDate;
        return [{ start: replayDate, end: null }];
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
        
        try {
            // Method 1: Click symbol button to open search dialog
            const symbolButton = document.querySelector('.chart-container [data-name="symbol-button"], [data-role="button"][class*="symbol"]');
            if (symbolButton) {
                console.log('[DEBUG] Found symbol button, clicking to open search...');
                symbolButton.click();
                await this.sleep(500);
                
                // Find the search input that appears
                const searchInput = document.querySelector('input[placeholder*="Symbol"], input[placeholder*="Search"], input[data-role="search"]');
                if (searchInput) {
                    console.log('[DEBUG] Found search input, typing symbol:', symbol);
                    searchInput.focus();
                    searchInput.value = symbol;
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    await this.sleep(300);
                    
                    // Press Enter to select
                    const enterEvent = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        bubbles: true,
                        cancelable: true
                    });
                    searchInput.dispatchEvent(enterEvent);
                    await this.sleep(1000);
                    return;
                }
            }
            
            // Method 2: Try direct symbol input fields
            const symbolInputSelectors = [
                'input[data-role="search"]',
                'input[class*="symbol"]',
                'input[placeholder*="symbol"]',
                'input[placeholder*="Symbol"]',
                '.symbol-input input',
                '[class*="symbol-edit"] input'
            ];
            
            for (const selector of symbolInputSelectors) {
                const input = document.querySelector(selector);
                if (input && this.isElementVisible(input)) {
                    console.log(`[DEBUG] Found symbol input with selector: ${selector}`);
                    input.focus();
                    input.value = symbol;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    const enterEvent = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        bubbles: true
                    });
                    input.dispatchEvent(enterEvent);
                    await this.sleep(1000);
                    return;
                }
            }
            
            // Method 3: Try keyboard shortcut to open symbol search (might be different per TradingView version)
            console.log('[DEBUG] Trying keyboard shortcut for symbol search...');
            document.dispatchEvent(new KeyboardEvent('keydown', {
                key: 's',
                code: 'KeyS',
                ctrlKey: false,
                altKey: false,
                bubbles: true
            }));
            await this.sleep(500);
            
            const searchAfterShortcut = document.querySelector('input[data-role="search"], input[placeholder*="Symbol"]');
            if (searchAfterShortcut) {
                console.log('[DEBUG] Symbol search opened via shortcut');
                searchAfterShortcut.focus();
                searchAfterShortcut.value = symbol;
                searchAfterShortcut.dispatchEvent(new Event('input', { bubbles: true }));
                await this.sleep(300);
                
                const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    bubbles: true
                });
                searchAfterShortcut.dispatchEvent(enterEvent);
                await this.sleep(1000);
                return;
            }
            
            console.warn('[DEBUG] Could not find symbol input after trying all methods');
            console.warn('[DEBUG] Symbol may need to be changed manually or URL modification required');
            
        } catch (error) {
            console.error('[DEBUG] Error navigating to symbol:', error);
        }
    }
    
    async navigateToReplayMode() {
        console.log('Entering replay mode');
        
        // First ensure Pine Logs is activated
        await this.activatePineLogsWidget();
        
        // Enhanced replay button search with more specific selectors
        // CRITICAL: Exclude speed button (10x dropdown) from selection
        const replaySelectors = [
            // Specific replay bar button
            '[data-name="replay"]',
            'button[data-name="replay"]',
            '[aria-label*="Replay"][aria-label*="mode"]', // Must contain "mode" to avoid speed button
            
            // Chart control buttons
            '.chart-controls button[title*="Replay"][title*="mode"]',
            
            // Toolbar replay buttons (but not speed controls)
            '[class*="toolbar"] button[class*="replay"]:not([class*="speed"])',
            'div[data-role="button"][title*="Replay"][title*="mode"]'
        ];
        
        for (const selector of replaySelectors) {
            try {
                const button = document.querySelector(selector);
                if (button && this.isElementVisible(button)) {
                    // Additional validation: button should NOT contain speed indicators
                    const text = button.textContent?.toLowerCase() || '';
                    const title = button.getAttribute('title')?.toLowerCase() || '';
                    const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
                    
                    // Skip if this is a speed button
                    if (text.includes('×') || text.includes('x') || 
                        title.includes('speed') || ariaLabel.includes('speed') ||
                        text.match(/\d+x/)) {
                        console.log(`[DEBUG] Skipping speed button with selector: ${selector}`);
                        continue;
                    }
                    
                    console.log(`[DEBUG] Found valid replay mode button with selector: ${selector}`);
                    button.click();
                    await this.sleep(2000);
                    return;
                }
            } catch (e) {
                // Skip invalid selectors
                continue;
            }
        }
        
        // Try finding by text content (exclude speed buttons)
        const allButtons = document.querySelectorAll('button, div[role="button"], [data-role="button"]');
        for (const button of allButtons) {
            const text = button.textContent?.toLowerCase() || '';
            const title = button.getAttribute('title')?.toLowerCase() || '';
            const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
            
            // Must contain 'replay' but NOT speed indicators
            const hasReplay = text.includes('replay') || title.includes('replay') || ariaLabel.includes('replay');
            const isSpeedButton = text.includes('×') || text.includes('speed') || 
                                  title.includes('speed') || ariaLabel.includes('speed') ||
                                  text.match(/\d+x/) || text === '10x' || text === '7x' || text === '5x';
            
            if (hasReplay && !isSpeedButton && this.isElementVisible(button)) {
                console.log('[DEBUG] Found replay mode button by text/attribute search (excluding speed)');
                button.click();
                await this.sleep(2000);
                return;
            }
        }
        
        console.warn('[DEBUG] Replay mode button not found after exhaustive search');
        console.warn('[DEBUG] User may need to activate replay mode manually');
    }
    
    isElementVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0' &&
               element.offsetWidth > 0 &&
               element.offsetHeight > 0;
    }
    
    isSpeedDropdownOpen() {
        // Check if replay speed dropdown is currently open
        // This prevents our scrolling from interfering with user speed selection
        const dropdownSelectors = [
            '[class*="menu"][class*="open"]',
            '[class*="dropdown"][class*="open"]',
            '[role="menu"][style*="display: block"]',
            '[data-name="replay-speed-menu"]',
            '.replay-speed-dropdown.open'
        ];
        
        for (const selector of dropdownSelectors) {
            const dropdown = document.querySelector(selector);
            if (dropdown && this.isElementVisible(dropdown)) {
                // Additional check: dropdown should contain speed options
                const hasSpeedOptions = dropdown.textContent.includes('×') || 
                                       dropdown.textContent.includes('upd per') ||
                                       dropdown.textContent.match(/\d+x/);
                if (hasSpeedOptions) {
                    return true;
                }
            }
        }
        
        return false;
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
        
        // Step 1: Find the "Select date" button using TradingView's structure
        // Look for: <div class="selectDateBar__button-*"> with text "Select date"
        let dateButton = null;
        
        // Try to find button by text content "Select date"
        const allButtons = document.querySelectorAll('div[data-role="button"], button');
        for (const btn of allButtons) {
            const textEl = btn.querySelector('.js-button-text');
            const buttonText = textEl ? textEl.textContent : btn.textContent;
            if (buttonText && buttonText.includes('Select date') && this.isElementVisible(btn)) {
                dateButton = btn;
                console.log('[setReplayDate] Found "Select date" button');
                break;
            }
        }
        
        // Fallback selectors
        if (!dateButton) {
            const fallbackSelectors = [
                '[class*="selectDateBar__button"]',
                '[class*="selectDateBar"] [data-role="button"]',
                '.controls__control_type_selectBar [data-role="button"]'
            ];
            
            for (const selector of fallbackSelectors) {
                const buttons = document.querySelectorAll(selector);
                for (const btn of buttons) {
                    if (this.isElementVisible(btn)) {
                        dateButton = btn;
                        console.log(`[setReplayDate] Found button using: ${selector}`);
                        break;
                    }
                }
                if (dateButton) break;
            }
        }
        
        if (!dateButton) {
            console.warn('[setReplayDate] Replay date button not found');
            return;
        }
        
        // Step 2: Click button to open date picker
        console.log('[setReplayDate] Clicking date selection button');
        dateButton.click();
        await this.sleep(800); // Wait for date picker to open
        
        // Step 3: Find date input with placeholder="YYYY-MM-DD"
        const dateInputSelectors = [
            'input[placeholder="YYYY-MM-DD"]',
            'input[data-qa-id="ui-lib-Input-input"]',
            'input[class*="input-"][class*="size-small"]',
            'input[type="text"][placeholder*="YYYY"]',
            'input[type="date"]'
        ];
        
        let dateInput = null;
        for (const selector of dateInputSelectors) {
            const inputs = document.querySelectorAll(selector);
            for (const input of inputs) {
                if (this.isElementVisible(input)) {
                    dateInput = input;
                    break;
                }
            }
            if (dateInput) break;
        }
        
        if (!dateInput) {
            console.warn('[setReplayDate] Date input not found after clicking button');
            return;
        }
        
        // Step 4: Set date value
        console.log('[setReplayDate] Setting date input value');
        dateInput.focus();
        dateInput.value = date;
        dateInput.dispatchEvent(new Event('input', { bubbles: true }));
        dateInput.dispatchEvent(new Event('change', { bubbles: true }));
        await this.sleep(300);
        
        // Step 5: Press Enter key to confirm (THIS WAS MISSING)
        console.log('[setReplayDate] Pressing Enter to confirm date');
        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        });
        dateInput.dispatchEvent(enterEvent);
        
        // Also dispatch keyup for completeness
        const enterUpEvent = new KeyboardEvent('keyup', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        });
        dateInput.dispatchEvent(enterUpEvent);
        
        await this.sleep(1000); // Wait for chart to load
        console.log(`[setReplayDate] Date set to ${date} and confirmed with Enter`);
    }
    
    async saveCollectedDataForSymbol(symbol) {
        console.log(`[DOWNLOAD TRACE] saveCollectedDataForSymbol called for: ${symbol}`);
        
        // Save data for specific symbol only
        if (this.collectedData.size === 0) {
            console.log('[DOWNLOAD TRACE] No data in collectedData - ABORT');
            return;
        }
        
        console.log(`[DOWNLOAD TRACE] Total collectedData size: ${this.collectedData.size}`);
        
        // Filter entries for this symbol
        const symbolEntries = new Map();
        for (const [key, entry] of this.collectedData) {
            if (entry.symbol === symbol || entry.symbol.endsWith(`:${symbol}`)) {
                symbolEntries.set(key, entry);
            }
        }
        
        console.log(`[DOWNLOAD TRACE] Filtered symbolEntries size: ${symbolEntries.size}`);
        
        if (symbolEntries.size === 0) {
            console.log('[DOWNLOAD TRACE] No entries found for symbol after filter - ABORT');
            return;
        }
        
        // Group data by symbol for file naming
        console.log('[DOWNLOAD TRACE] Calling groupEntriesForSaving...');
        const groupedData = this.groupEntriesForSaving(symbolEntries);
        console.log(`[DOWNLOAD TRACE] Grouped into ${Object.keys(groupedData).length} file(s)`);
        
        // Save each file (usually just 1 per symbol)
        for (const [fileName, data] of Object.entries(groupedData)) {
            console.log(`[DOWNLOAD TRACE] Preparing to download: ${fileName} with ${data.length} entries`);
            await this.downloadJSONFile(fileName, data);
            console.log(`📥 [DOWNLOAD TRACE] Download initiated: ${fileName} (${data.length} entries)`);
        }
        
        // Remove saved entries from collection to free memory
        console.log(`[DOWNLOAD TRACE] Cleaning up ${symbolEntries.size} entries from memory`);
        for (const key of symbolEntries.keys()) {
            this.collectedData.delete(key);
        }
        console.log(`[DOWNLOAD TRACE] Memory cleanup complete, remaining entries: ${this.collectedData.size}`);
    }
    
    async saveCollectedData() {
        if (this.collectedData.size === 0) {
            console.log('No data to save');
            return;
        }
        
        // Group data by symbol and type
        const groupedData = this.groupEntriesForSaving(this.collectedData);
        
        // Save each group as a separate file
        for (const [fileName, data] of Object.entries(groupedData)) {
            await this.downloadJSONFile(fileName, data);
        }
        
        console.log(`Saved ${Object.keys(groupedData).length} files with ${this.collectedData.size} total entries`);
    }
    
    groupEntriesForSaving(entriesMap) {
        const grouped = {};
        
        // Group by symbol+timeframe first
        const symbolGroups = {};
        
        for (const [key, entry] of entriesMap) {
            // Extract symbol ticker for filename
            const symbolParts = entry.symbol.split(':');
            const ticker = symbolParts.length > 1 ? this.escapeSymbolForFilename(symbolParts[1]) : entry.symbol;
            const timeframe = entry.timeframe || '60';
            
            const groupKey = `${ticker}-${timeframe}`;
            if (!symbolGroups[groupKey]) {
                symbolGroups[groupKey] = { preData: [], postData: [] };
            }
            
            // Separate PreData and PostData
            if (entry.type === 'PreData') {
                symbolGroups[groupKey].preData.push(entry);
            } else if (entry.type === 'PostData') {
                symbolGroups[groupKey].postData.push(entry);
            }
        }
        
        // Create merged entries: PreData + PostData matched by entry_datetime
        for (const [groupKey, groups] of Object.entries(symbolGroups)) {
            const { preData, postData } = groups;
            const mergedEntries = [];
            
            // Create index of PostData by entry_datetime for fast lookup
            const postDataMap = new Map();
            postData.forEach(post => {
                const key = `${post.entry_datetime || post.timestamp}|${post.symbol}|${post.timeframe}|${post.side}`;
                postDataMap.set(key, post);
            });
            
            // Merge PreData with matching PostData
            preData.forEach(pre => {
                const matchKey = `${pre.entry_datetime || pre.timestamp}|${pre.symbol}|${pre.timeframe}|${pre.side}`;
                const matchingPost = postDataMap.get(matchKey);
                
                // Create merged object
                const merged = {
                    entry_datetime: pre.entry_datetime || pre.timestamp,
                    symbol: pre.symbol,
                    timeframe: pre.timeframe,
                    side: pre.side,
                    preData: {},
                    postData: matchingPost ? {} : null
                };
                
                // Copy PreData fields (excluding metadata)
                Object.keys(pre).forEach(key => {
                    if (!['type', 'entry_datetime', 'symbol', 'timeframe', 'side', 'timestamp'].includes(key)) {
                        merged.preData[key] = pre[key];
                    }
                });
                
                // Copy PostData fields if exists
                if (matchingPost) {
                    Object.keys(matchingPost).forEach(key => {
                        if (!['type', 'entry_datetime', 'symbol', 'timeframe', 'side', 'timestamp'].includes(key)) {
                            merged.postData[key] = matchingPost[key];
                        }
                    });
                    // Mark as used
                    postDataMap.delete(matchKey);
                }
                
                mergedEntries.push(merged);
            });
            
            // Warn about orphan PostData (shouldn't happen)
            if (postDataMap.size > 0) {
                console.warn(`⚠️ Found ${postDataMap.size} PostData without matching PreData for ${groupKey}`);
            }
            
            // Sort merged entries by entry_datetime
            mergedEntries.sort((a, b) => {
                const timeA = new Date(a.entry_datetime);
                const timeB = new Date(b.entry_datetime);
                return timeA - timeB;
            });
            
            if (mergedEntries.length === 0) continue;
            
            // Get first and last timestamps
            const firstTime = new Date(mergedEntries[0].entry_datetime);
            const lastTime = new Date(mergedEntries[mergedEntries.length - 1].entry_datetime);
            
            const firstDateStr = this.formatDateForFilename(firstTime);
            const lastDateStr = this.formatDateForFilename(lastTime);
            
            // Filename format: {ticker}-{timeframe}-{firstDateTime}-{lastDateTime}.json
            const fileName = `${groupKey}-${firstDateStr}-${lastDateStr}.json`;
            grouped[fileName] = mergedEntries;
            
            console.log(`📊 Merged ${groupKey}: ${preData.length} PreData + ${postData.length} PostData = ${mergedEntries.length} entries`);
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
        console.log(`[DOWNLOAD TRACE] downloadJSONFile START: ${fileName}`);
        try {
            console.log(`[DOWNLOAD TRACE] Stringifying JSON data (${data.length} entries)...`);
            const jsonString = JSON.stringify(data, null, 2);
            const byteSize = new Blob([jsonString]).size;
            console.log(`[DOWNLOAD TRACE] JSON size: ${(byteSize / 1024).toFixed(2)} KB`);
            
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            console.log(`[DOWNLOAD TRACE] Blob URL created: ${url.substring(0, 50)}...`);
            
            // Use Chrome Downloads API
            console.log(`[DOWNLOAD TRACE] Sending download message to background script...`);
            chrome.runtime.sendMessage({
                type: 'download',
                data: {
                    url: url,
                    filename: fileName
                }
            }, (response) => {
                console.log(`[DOWNLOAD TRACE] Background response:`, response);
            });
            
            console.log(`✅ [DOWNLOAD TRACE] Download message sent for: ${fileName}`);
            
            // Wait a bit to ensure download starts
            await this.sleep(500);
            
        } catch (error) {
            console.error(`❌ [DOWNLOAD TRACE] CRITICAL ERROR downloading ${fileName}:`, error);
            console.error('[DOWNLOAD TRACE] Error stack:', error.stack);
            console.error('[DOWNLOAD TRACE] Data sample:', JSON.stringify(data.slice(0, 2), null, 2));
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
        console.log('[DEBUG] showAutoPopupNotification called');
        
        // TEMPORARILY DISABLED: Check if already shown
        // const sessionKey = 'tvDataCollector_floatingWindowShown_' + window.location.hostname;
        // const alreadyShown = sessionStorage.getItem(sessionKey);
        // if (alreadyShown) {
        //     console.log('[DEBUG] Window already shown this session, skipping');
        //     return;
        // }
        
        // Wait for page to fully load, then create window
        console.log('[DEBUG] Setting timeout to create window in 2 seconds...');
        setTimeout(() => {
            console.log('[DEBUG] Timeout fired, creating floating window now...');
            try {
                this.createFloatingWindow();
                console.log('[DEBUG] createFloatingWindow() returned successfully');
                // sessionStorage.setItem(sessionKey, 'true');
            } catch (error) {
                console.error('[DEBUG] ERROR creating floating window:', error);
            }
        }, 2000);
    }
    
    createFloatingWindow() {
        console.log('[DEBUG] createFloatingWindow called');
        
        // Remove any existing window
        const existing = document.getElementById('tvDataCollectorWindow');
        if (existing) {
            console.log('[DEBUG] Removing existing window');
            existing.remove();
        }
        
        // Create floating window container
        console.log('[DEBUG] Creating new window element');
        const window = document.createElement('div');
        window.id = 'tvDataCollectorWindow';
        console.log('[DEBUG] Window element created:', window);
        window.innerHTML = `
            <div id="floatingWindowContainer" style="
                position: fixed;
                bottom: 20px;
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
                    <div style="display: flex; gap: 4px;">
                        <button id="minimizeWindow" style="
                            background: #FF9800;
                            color: white;
                            border: none;
                            width: 24px;
                            height: 24px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 16px;
                            line-height: 16px;
                        " title="Minimize">_</button>
                        <button id="maximizeWindow" style="
                            background: #2196F3;
                            color: white;
                            border: none;
                            width: 24px;
                            height: 24px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 14px;
                            line-height: 14px;
                        " title="Maximize/Restore">□</button>
                    </div>
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
                        <label style="display: block; margin-bottom: 4px; font-size: 12px; color: #ccc;">Scroll Speed: <span id="currentSpeedLabel" style="color: #4CAF50; font-weight: bold;">Normal</span></label>
                        <select id="scrollSpeed" style="
                            width: 100%;
                            padding: 6px;
                            background: #2d2d2d;
                            border: 1px solid #555;
                            color: #fff;
                            border-radius: 4px;
                            font-size: 12px;
                            box-sizing: border-box;
                            cursor: pointer;
                            position: relative;
                            z-index: 1000;
                        ">
                            <option value="25">⚡ Very Fast (25ms, 10000px)</option>
                            <option value="50">🚀 Fast (50ms, 5000px)</option>
                            <option value="100" selected>⏩ Normal (100ms, 3000px)</option>
                            <option value="200">🐢 Slow (200ms, 1000px)</option>
                            <option value="500">🐌 Very Slow (500ms, 500px)</option>
                        </select>
                        <div style="font-size: 10px; color: #888; margin-top: 4px;">💡 Can be changed while scraping</div>
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
                        
            <!-- Current Status - BIGGER DISPLAY with Progress to Right -->
            <div style="margin-bottom: 12px; padding: 8px; background: #252525; border-radius: 4px;">
                <div style="margin-bottom: 8px;">
                    <div style="font-size: 9px; color: #888; margin-bottom: 2px;">Current Symbol</div>
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div id="currentSymbol" style="font-size: 20px; color: #4CAF50; font-weight: bold; font-family: monospace;">-</div>
                        <div id="symbolProgress" style="font-size: 16px; color: #888; font-weight: bold;">0/0</div>
                    </div>
                </div>
                <div>
                    <div style="font-size: 9px; color: #888; margin-bottom: 2px;">Current Date</div>
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div id="currentDate" style="font-size: 20px; color: #2196F3; font-weight: bold; font-family: monospace;">-</div>
                        <div id="dateProgress" style="font-size: 16px; color: #888; font-weight: bold;">0/0</div>
                    </div>
                </div>
            </div>
            
                        <!-- Last Entry Displays - Separated PreData and PostData -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
                            <!-- PreData Last Entry -->
                            <div style="padding: 8px; background: #3a2a1a; border-radius: 4px; border-left: 3px solid #FF9800;">
                                <div style="font-size: 9px; color: #888; margin-bottom: 2px;">Last Entry</div>
                                <div style="font-size: 14px; color: #FF9800; font-weight: bold; margin-bottom: 4px;">PreData</div>
                                <div id="lastPreDataDatetime" style="font-size: 11px; color: #FFB74D; font-family: monospace;">-</div>
                            </div>
                            
                            <!-- PostData Last Entry -->
                            <div style="padding: 8px; background: #1a3a1a; border-radius: 4px; border-left: 3px solid #4CAF50;">
                                <div style="font-size: 9px; color: #888; margin-bottom: 2px;">Last Entry</div>
                                <div style="font-size: 14px; color: #4CAF50; font-weight: bold; margin-bottom: 4px;">PostData</div>
                                <div id="lastPostDataDatetime" style="font-size: 11px; color: #81C784; font-family: monospace;">-</div>
                            </div>
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
        
        console.log('[DEBUG] Adding window to document body');
        document.body.appendChild(window);
        console.log('[DEBUG] Window added to body');
        
        // Make window draggable
        this.makeDraggable(window.querySelector('#floatingWindowContainer'), window.querySelector('#windowHeader'));
        console.log('[DEBUG] Made window draggable');
        
        // Set up event listeners
        this.setupFloatingWindowEvents();
        console.log('[DEBUG] Event listeners setup complete');
        
        // Set default end date to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('endDateInput').value = today;
        
        console.log('[DEBUG] ✅ Floating window creation COMPLETE! Window should be visible now.');
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
            const window = document.getElementById('floatingWindowContainer');
            if (window) {
                window.style.display = 'none';
            }
        });
        
        // Maximize/Restore button
        const maximizeBtn = document.getElementById('maximizeWindow');
        let isMaximized = false;
        let savedPosition = null;
        
        maximizeBtn?.addEventListener('click', () => {
            const window = document.getElementById('floatingWindowContainer');
            if (!window) return;
            
            if (!isMaximized) {
                // Save current position and size
                savedPosition = {
                    top: window.style.top,
                    left: window.style.left,
                    bottom: window.style.bottom,
                    right: window.style.right,
                    width: window.style.width,
                    height: window.style.height
                };
                
                // Maximize
                window.style.top = '10px';
                window.style.left = '10px';
                window.style.right = '10px';
                window.style.bottom = '10px';
                window.style.width = 'auto';
                window.style.height = 'auto';
                
                maximizeBtn.textContent = '❐'; // Restore icon
                isMaximized = true;
            } else {
                // Restore
                if (savedPosition) {
                    window.style.top = savedPosition.top;
                    window.style.left = savedPosition.left;
                    window.style.bottom = savedPosition.bottom;
                    window.style.right = savedPosition.right;
                    window.style.width = savedPosition.width;
                    window.style.height = savedPosition.height;
                }
                
                maximizeBtn.textContent = '□'; // Maximize icon
                isMaximized = false;
            }
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
        
        // Scroll speed selector - update label on change
        const scrollSpeedSelect = document.getElementById('scrollSpeed');
        const speedLabel = document.getElementById('currentSpeedLabel');
        scrollSpeedSelect?.addEventListener('change', (e) => {
            const speedNames = {
                '25': 'Very Fast',
                '50': 'Fast',
                '100': 'Normal',
                '200': 'Slow',
                '500': 'Very Slow'
            };
            if (speedLabel) {
                speedLabel.textContent = speedNames[e.target.value] || 'Normal';
            }
            console.log(`🔄 Scroll speed changed to: ${speedNames[e.target.value]} (${e.target.value}ms)`);
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
            
            // Convert bottom/right positioning to top/left before dragging
            if (element.style.bottom !== '' && element.style.bottom !== 'auto') {
                const rect = element.getBoundingClientRect();
                element.style.top = rect.top + 'px';
                element.style.bottom = 'auto';
            }
            if (element.style.right !== '' && element.style.right !== 'auto') {
                const rect = element.getBoundingClientRect();
                element.style.left = rect.left + 'px';
                element.style.right = 'auto';
            }
            
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