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
                
                // Add new entries to our collection
                currentEntries.forEach(entry => {
                    const key = entry.timestamp + '|' + entry.content;
                    if (!entries.some(e => (e.timestamp + '|' + e.content) === key)) {
                        entries.push(entry);
                    }
                });
                
                // Check if we're getting new items
                if (entries.length === previousItemCount) {
                    stableCount++;
                    if (stableCount >= 5) {
                        console.log('No new entries found after 5 scroll attempts, stopping');
                        break;
                    }
                } else {
                    stableCount = 0;
                    previousItemCount = entries.length;
                }
                
                // Scroll to load more items
                await this.scrollVirtualList(virtualList);
                await this.sleep(200); // Wait for new items to load
                
                scrollAttempts++;
                
                // Update progress
                if (scrollAttempts % 10 === 0) {
                    console.log(`Scroll attempt ${scrollAttempts}, entries found: ${entries.length}`);
                }
            }
            
            console.log(`Extraction complete. Found ${entries.length} total entries after ${scrollAttempts} scroll attempts`);
            
        } catch (error) {
            console.error('Error extracting from virtual list:', error);
        }
        
        return entries;
    }
    
    async findPineLogsPanel() {
        // Look for common Pine Logs panel selectors
        const selectors = [
            '[data-name="pine-logs"]',
            '.pine-logs-panel',
            '[class*="pine-logs"]',
            '[class*="logs-panel"]',
            // Add more specific selectors based on TradingView's structure
            '.bottom-area [class*="logs"]',
            '.chart-gui-wrapper [class*="logs"]'
        ];
        
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                console.log(`Found Pine Logs panel using selector: ${selector}`);
                return element;
            }
        }
        
        // Fallback: search by text content
        const allElements = document.querySelectorAll('*');
        for (const element of allElements) {
            if (element.textContent && element.textContent.includes('Pine Logs')) {
                const parent = element.closest('[class*="panel"], [class*="container"]');
                if (parent) {
                    console.log('Found Pine Logs panel by text content');
                    return parent;
                }
            }
        }
        
        return null;
    }
    
    async findVirtualListContainer(logsPanel) {
        // Look for virtual list containers within the logs panel
        const selectors = [
            '[class*="virtual-list"]',
            '[class*="virtualized"]',
            '[class*="list-container"]',
            '[class*="scroll-container"]',
            '.ReactVirtualized__List',
            '[data-testid*="list"]'
        ];
        
        for (const selector of selectors) {
            const element = logsPanel.querySelector(selector);
            if (element) {
                console.log(`Found virtual list using selector: ${selector}`);
                return element;
            }
        }
        
        // Fallback: find scrollable container
        const scrollableElements = logsPanel.querySelectorAll('*');
        for (const element of scrollableElements) {
            const style = window.getComputedStyle(element);
            if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                console.log('Found scrollable container as virtual list');
                return element;
            }
        }
        
        return logsPanel; // Use the panel itself as fallback
    }
    
    async extractVisibleLogEntries(container) {
        const entries = [];
        
        // Look for log entry elements
        const entrySelectors = [
            '[class*="log-entry"]',
            '[class*="log-item"]',
            '[class*="message"]',
            'li',
            '[role="listitem"]',
            '.log-line'
        ];
        
        let logElements = [];
        for (const selector of entrySelectors) {
            logElements = container.querySelectorAll(selector);
            if (logElements.length > 0) {
                break;
            }
        }
        
        for (const element of logElements) {
            try {
                const content = element.textContent?.trim();
                if (!content) continue;
                
                // Check if this looks like a JSON log entry from our indicator
                if (this.isOurLogEntry(content)) {
                    const timestamp = this.extractTimestamp(element) || new Date().toISOString();
                    
                    entries.push({
                        timestamp: timestamp,
                        content: content,
                        element: element
                    });
                }
            } catch (error) {
                console.error('Error processing log element:', error);
            }
        }
        
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
        // Try different scrolling methods
        
        // Method 1: Scroll by wheel event
        try {
            const wheelEvent = new WheelEvent('wheel', {
                deltaY: 1000,
                deltaMode: WheelEvent.DOM_DELTA_PIXEL,
                bubbles: true,
                cancelable: true
            });
            container.dispatchEvent(wheelEvent);
        } catch (error) {
            console.warn('Wheel event scroll failed:', error);
        }
        
        // Method 2: Direct scrollTop manipulation
        try {
            container.scrollTop += 1000;
        } catch (error) {
            console.warn('ScrollTop manipulation failed:', error);
        }
        
        // Method 3: Keyboard event (Page Down)
        try {
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
        
        // Look for replay button or mode
        const replaySelectors = [
            '[data-name="replay"]',
            '[class*="replay"]',
            'button[title*="replay"]',
            'button[title*="Replay"]'
        ];
        
        for (const selector of replaySelectors) {
            const button = document.querySelector(selector);
            if (button) {
                button.click();
                await this.sleep(1000);
                return;
            }
        }
        
        console.warn('Replay mode button not found');
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