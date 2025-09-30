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
            
            // Process each symbol
            for (let i = 0; i < symbols.length && this.isCollecting; i++) {
                this.currentSymbolIndex = i;
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
        console.log('Collection stopped');
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
            
        } catch (error) {
            console.error(`Error processing date range ${dateRange.start}-${dateRange.end}:`, error);
        }
    }
    
    async extractPineLogsFromVirtualList() {
        const entries = [];
        let scrollAttempts = 0;
        const maxScrollAttempts = 100;
        
        console.log('Starting Pine Logs extraction from virtual list');
        
        try {
            // Find the Pine Logs panel
            const logsPanel = await this.findPineLogsPanel();
            if (!logsPanel) {
                throw new Error('Pine Logs panel not found');
            }
            
            // Find the virtual list container
            const virtualList = await this.findVirtualListContainer(logsPanel);
            if (!virtualList) {
                throw new Error('Virtual list container not found');
            }
            
            let previousItemCount = 0;
            let stableCount = 0;
            
        while (scrollAttempts < maxScrollAttempts && this.isCollecting) {
            // Extract currently visible log entries
            const currentEntries = await this.extractVisibleLogEntries(virtualList);
            
            // Add new entries to our collection with deduplication
            let newEntriesAdded = 0;
            currentEntries.forEach(entry => {
                const key = entry.timestamp + '|' + entry.content;
                if (!entries.some(e => (e.timestamp + '|' + e.content) === key)) {
                    entries.push(entry);
                    newEntriesAdded++;
                }
            });
            
            console.log(`[DEBUG] Scroll ${scrollAttempts}: Found ${currentEntries.length} current, added ${newEntriesAdded} new, total: ${entries.length}`);
            
            // Check if we're getting new items
            if (entries.length === previousItemCount) {
                stableCount++;
                console.log(`[DEBUG] No new entries (stable count: ${stableCount}/10)`);
                if (stableCount >= 10) { // Increased from 5 to 10 for more thorough collection
                    console.log('No new entries found after 10 scroll attempts, stopping');
                    break;
                }
            } else {
                stableCount = 0;
                previousItemCount = entries.length;
            }
            
            // Check scroll position to detect if we've reached the end
            const currentScrollTop = virtualList.scrollTop;
            const maxScroll = virtualList.scrollHeight - virtualList.clientHeight;
            
            if (currentScrollTop >= maxScroll - 10) {
                console.log('[DEBUG] Reached end of scroll area');
                // Try a few more times in case there's lazy loading
                if (stableCount >= 3) {
                    break;
                }
            }
            
            // Scroll to load more items
            await this.scrollVirtualList(virtualList);
            await this.sleep(500); // Increased wait time for virtual DOM updates
            
            scrollAttempts++;
            
            // Update progress more frequently
            if (scrollAttempts % 5 === 0) {
                console.log(`[PROGRESS] Scroll attempt ${scrollAttempts}/${maxScrollAttempts}, entries: ${entries.length}`);
                this.sendMessage({ type: 'extractionProgress', data: {
                    scrollAttempts,
                    maxScrollAttempts,
                    entriesFound: entries.length,
                    currentScrollTop: virtualList.scrollTop,
                    maxScroll: virtualList.scrollHeight
                }});
            }
        }            console.log(`Extraction complete. Found ${entries.length} total entries after ${scrollAttempts} scroll attempts`);
            
        } catch (error) {
            console.error('Error extracting from virtual list:', error);
        }
        
        return entries;
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
    
    async extractVisibleLogEntries(container) {
        const entries = [];
        
        // Use reference implementation selectors for log messages
        const logSelectors = [
            '.msg-zsZSd11H',                    // TradingView's log message class
            '[class*="msg-"]',                  // Any message class variant
            '.pine-console .log-entry',         // Pine console log entries
            '.pine-logs .log-item',             // Pine logs items
            '[class*="log-entry"]',
            '[class*="log-item"]',
            '[class*="message"]',
            'li',
            '[role="listitem"]'
        ];
        
        let logElements = [];
        for (const selector of logSelectors) {
            const elements = container.querySelectorAll(selector);
            if (elements.length > 0) {
                logElements = Array.from(elements);
                console.log(`[DEBUG] Found ${elements.length} log elements using selector: ${selector}`);
                break;
            }
        }
        
        console.log(`[DEBUG] Processing ${logElements.length} log elements`);
        
        logElements.forEach(logElement => {
            try {
                const content = logElement.textContent?.trim();
                if (!content) return;
                
                // Check if this looks like a JSON log entry from our indicator
                if (this.isOurLogEntry(content)) {
                    const timestamp = this.extractTimestamp(logElement) || new Date().toISOString();
                    
                    // Try to parse the JSON to validate structure
                    try {
                        const parsedData = JSON.parse(content);
                        if (parsedData.symbol && parsedData.timeframe) {
                            entries.push({
                                timestamp: timestamp,
                                content: content,
                                element: logElement,
                                parsed: parsedData
                            });
                            console.log('[DEBUG] Found valid log entry:', parsedData.symbol, parsedData.type);
                        }
                    } catch (parseError) {
                        console.warn('[DEBUG] Failed to parse log entry JSON:', parseError);
                    }
                }
            } catch (error) {
                console.error('Error processing log element:', error);
            }
        });
        
        console.log(`[DEBUG] Extracted ${entries.length} valid log entries`);
        return entries;
    }
    
    isOurLogEntry(content) {
        // Check if the content looks like our JSON data
        return (content.includes('"type":"PreData"') || 
                content.includes('"type":"PostData"')) &&
               content.includes('"symbol":"') &&
               content.includes('"timeframe":"');
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
        
        const scrollStep = 500; // Larger scroll steps for better coverage
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
    
    showAutoPopupNotification() {
        // Check if we should show the auto-popup (only once per session)
        const sessionKey = 'tvDataCollector_autoPopupShown_' + window.location.hostname;
        if (sessionStorage.getItem(sessionKey)) {
            return; // Already shown this session
        }
        
        // Wait for page to fully load
        setTimeout(() => {
            this.createAutoPopupNotification();
            sessionStorage.setItem(sessionKey, 'true');
        }, 3000);
    }
    
    createAutoPopupNotification() {
        // Create floating notification
        const notification = document.createElement('div');
        notification.id = 'tvDataCollectorNotification';
        notification.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
                color: #4CAF50;
                padding: 16px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                border: 1px solid #4CAF50;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                max-width: 300px;
                animation: slideIn 0.3s ease-out;
            ">
                <div style="display: flex; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 18px; margin-right: 8px;">🚀</span>
                    <strong>TradingView Data Collector Ready!</strong>
                </div>
                <div style="color: #ccc; font-size: 12px; margin-bottom: 12px;">
                    Click the extension icon to start collecting Pine Logs data
                </div>
                <div style="display: flex; gap: 8px;">
                    <button id="openCollector" style="
                        background: #4CAF50;
                        color: white;
                        border: none;
                        padding: 6px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 12px;
                        font-weight: bold;
                    ">Open Collector</button>
                    <button id="dismissNotification" style="
                        background: transparent;
                        color: #888;
                        border: 1px solid #444;
                        padding: 6px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 12px;
                    ">Dismiss</button>
                </div>
            </div>
        `;
        
        // Add animation styles
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(notification);
        
        // Add event listeners
        const openBtn = notification.querySelector('#openCollector');
        const dismissBtn = notification.querySelector('#dismissNotification');
        
        openBtn.addEventListener('click', () => {
            // Try to trigger extension popup
            this.sendMessage({ type: 'requestPopupOpen', data: {} });
            this.removeNotification(notification);
        });
        
        dismissBtn.addEventListener('click', () => {
            this.removeNotification(notification);
        });
        
        // Auto-dismiss after 10 seconds
        setTimeout(() => {
            if (document.getElementById('tvDataCollectorNotification')) {
                this.removeNotification(notification);
            }
        }, 10000);
    }
    
    removeNotification(notification) {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
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