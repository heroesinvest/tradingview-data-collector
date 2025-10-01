// TradingView Pre Trade Data Collector - Content Script
(function() {
    'use strict';
    
    // TIMING CONSTANTS - Adjust these multipliers to speed up/slow down operations
    const DELAY_MULTIPLIER = 1.0; // 1.0 = normal speed, 0.5 = half speed, 2.0 = double speed
    const ACTION_DELAY_MULTIPLIER = 0.3; // Faster delays for quick actions like clicks and inputs
    
    // All delays in milliseconds (will be multiplied by respective multipliers)
    const DELAYS = {
        PAGE_LOAD_WAIT: 2000, 
        UI_CREATION_WAIT: 1000, 
        PINE_LOGS_CHECK: 5000,
        SYMBOL_CHANGE_WAIT: 2000,
        REPLAY_ACTIVATION_WAIT: 2000,
        DATE_SELECTION_WAIT: 1500,
        DATE_INPUT_WAIT: 1000,
        SCROLL_STEP: 500, // Increased from 200 to 500 for larger scroll steps
        SCROLL_TO_TOP_WAIT: 2500, // Increased from 1500 to 2500 for more wait time
        LOG_COLLECTION_WAIT: 5000, // Increased from 3000 to 5000 for more collection time
        // Fast action delays
        BUTTON_CLICK_WAIT: 500,
        INPUT_FILL_WAIT: 300,
        UI_UPDATE_WAIT: 200,
        ELEMENT_SEARCH_WAIT: 300
    };
    
    // Helper functions to get adjusted delays
    const getDelay = (delayKey) => DELAYS[delayKey] * DELAY_MULTIPLIER;
    const getActionDelay = (delayKey) => DELAYS[delayKey] * ACTION_DELAY_MULTIPLIER;
    
    let extensionUI = null;
    let isCollecting = false;
    let collectedData = [];
    let currentSymbols = [];
    let currentSymbolIndex = 0;
    let currentDateIndex = 0;
    let datesToProcess = [];
    let startTime = null;
    let currentSymbolStartTime = null;
    let currentDateStartTime = null;
    let lastScrollTime = 0;
    let scrollAttempts = 0;
    let maxScrollAttempts = 500; // Increased from 100 to 500 for more thorough scrolling
    let pineLogsContainer = null;
    let lastLoggedEntryDate = null; // Track the last logged entry date
    let currentDateEntriesCount = 0; // Track entries for current date
    let totalLogsProcessed = 0; // Track total logs processed including duplicates
    
    // Wait for page to load completely
    function waitForPageLoad() {
        return new Promise((resolve) => {
            if (document.readyState === 'complete') {
                setTimeout(resolve, getDelay('PAGE_LOAD_WAIT')); // Additional wait for dynamic content
            } else {
                window.addEventListener('load', () => {
                    setTimeout(resolve, getDelay('PAGE_LOAD_WAIT'));
                });
            }
        });
    }
    
    // Create the extension UI
    function createExtensionUI() {
        const extensionUrl = chrome.runtime.getURL('extension-ui.html');
        
        fetch(extensionUrl)
            .then(response => response.text())
            .then(html => {
                const uiContainer = document.createElement('div');
                uiContainer.innerHTML = html;
                uiContainer.style.cssText = `
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 999999;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                `;
                
                document.body.appendChild(uiContainer);
                extensionUI = uiContainer;
                
                // Load extension UI CSS
                const cssUrl = chrome.runtime.getURL('extension-ui.css');
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = cssUrl;
                document.head.appendChild(link);
                
                // Load extension UI JS
                const scriptUrl = chrome.runtime.getURL('extension-ui.js');
                const script = document.createElement('script');
                script.src = scriptUrl;
                document.head.appendChild(script);
                
                initializeUI();
            })
            .catch(error => {
                console.error('Failed to load extension UI:', error);
                showStatusMessage('Failed to load UI', 'error');
            });
    }
    
    // Initialize UI event handlers
    function initializeUI() {
        const ui = extensionUI;
        if (!ui) return;
        
        // File upload handler
        const fileInput = ui.querySelector('#symbolsFile');
        if (fileInput) {
            fileInput.addEventListener('change', handleFileUpload);
        }
        
        // Start button handler
        const startBtn = ui.querySelector('#startBtn');
        if (startBtn) {
            startBtn.addEventListener('click', startDataCollection);
        }
        
        // Stop button handler
        const stopBtn = ui.querySelector('#stopBtn');
        if (stopBtn) {
            stopBtn.addEventListener('click', stopDataCollection);
        }
        
        // Make window draggable
        const header = ui.querySelector('.window-header');
        if (header) {
            makeDraggable(ui, header);
        }
        
        // Minimize button
        const minimizeBtn = ui.querySelector('#minimizeBtn');
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', toggleMinimize);
        }
        
        // Initial check for Pine logs
        setTimeout(checkPineLogsAvailability, getDelay('UI_CREATION_WAIT'));
    }
    
    // Handle file upload
    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const content = e.target.result;
            currentSymbols = content.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
            
            updateUI('symbolsLoaded', currentSymbols.length);
            showStatusMessage(`Loaded ${currentSymbols.length} symbols`, 'success');
        };
        reader.readAsText(file);
    }
    
    // Check if Pine logs are available and visible
    function checkPineLogsAvailability() {
        pineLogsContainer = findPineLogsContainer();
        
        if (!pineLogsContainer) {
            showStatusMessage('Pine logs widget not found - trying to activate', 'error');
            // Try to activate Pine logs widget
            setTimeout(() => {
                activatePineLogsWidget();
            }, 1000);
        } else {
            // Check if the Pine logs container is actually visible
            const isVisible = isPineLogsVisible(pineLogsContainer);
            if (!isVisible) {
                showStatusMessage('Pine logs found but not visible - trying to activate', 'warning');
                setTimeout(() => {
                    activatePineLogsWidget();
                }, 1000);
            } else {
                showStatusMessage('Pine logs detected and visible', 'success');
            }
        }
        
        // Continue checking periodically
        setTimeout(checkPineLogsAvailability, getDelay('PINE_LOGS_CHECK'));
    }
    
    // Check if Pine logs are visible
    function isPineLogsVisible(container) {
        if (!container) return false;
        
        // Check if the container and its parents are visible
        let element = container;
        while (element && element !== document.body) {
            const style = window.getComputedStyle(element);
            if (style.display === 'none' || 
                style.visibility === 'hidden' || 
                style.opacity === '0' ||
                element.offsetHeight === 0 ||
                element.offsetWidth === 0) {
                return false;
            }
            element = element.parentElement;
        }
        
        // Check if the Pine logs widget is in an active tab
        const widgetPage = container.closest('.widgetbar-page');
        if (widgetPage && !widgetPage.classList.contains('active')) {
            return false;
        }
        
        return true;
    }
    
    // Find Pine logs container
    function findPineLogsContainer() {
        console.log('[DEBUG] Starting enhanced Pine logs container search...');
        
        // Look for Pine logs widget first
        const pineLogsWidget = document.querySelector('[data-test-id-widget-type="pine_logs"]');
        if (!pineLogsWidget) {
            console.log('[DEBUG] No Pine logs widget found');
            return null;
        }
        
        console.log('[DEBUG] Found Pine logs widget:', pineLogsWidget);
        
        // CORRECTED: Target the actual scrollable viewport, not the virtual content
        const scrollViewport = pineLogsWidget.querySelector('.logsList-L0IhqRpX .container-L0IhqRpX');
        if (scrollViewport) {
            const hasScroll = scrollViewport.scrollHeight > scrollViewport.clientHeight;
            const isVisible = scrollViewport.offsetParent !== null;
            
            console.log(`[DEBUG] Found scrollable viewport:`, {
                found: !!scrollViewport,
                hasScroll,
                isVisible,
                scrollHeight: scrollViewport.scrollHeight,
                clientHeight: scrollViewport.clientHeight,
                scrollTop: scrollViewport.scrollTop,
                className: scrollViewport.className
            });
            
            if (hasScroll && isVisible) {
                console.log(`[DEBUG] Selected correct scroll viewport: .container-L0IhqRpX`);
                return scrollViewport;
            }
        }
        
        // Fallback: Use the expert's method to find scrollable element
        console.log('[DEBUG] Using fallback method to find scrollable element...');
        const allDivs = pineLogsWidget.querySelectorAll('div');
        for (const div of allDivs) {
            const style = getComputedStyle(div);
            const hasScrollOverflow = /(auto|scroll)/.test(style.overflowY);
            const isScrollable = div.scrollHeight > div.clientHeight;
            
            if (hasScrollOverflow && isScrollable) {
                console.log(`[DEBUG] Found scrollable element via overflow detection:`, {
                    className: div.className,
                    overflowY: style.overflowY,
                    scrollHeight: div.scrollHeight,
                    clientHeight: div.clientHeight
                });
                return div;
            }
        }
        
        // Final fallback: return the widget itself
        console.log('[DEBUG] No scrollable viewport found, using Pine logs widget as fallback');
        return pineLogsWidget;
    }
    
    // Try to activate Pine logs widget
    function activatePineLogsWidget() {
        console.log('Attempting to activate Pine logs widget...');
        
        // Try to find and click the Pine logs tab in the bottom panel
        const pineLogsTab = document.querySelector('[data-test-id-widget-type="pine_logs"]');
        if (pineLogsTab) {
            // Check if it's in a tab that needs to be clicked
            const tabButton = pineLogsTab.closest('.widgetbar-tab');
            if (tabButton && !tabButton.classList.contains('active')) {
                console.log('Clicking Pine logs tab...');
                tabButton.click();
                showStatusMessage('Activated Pine logs tab', 'info');
                return;
            }
        }
        
        // Try to find Pine logs in the widget bar
        const widgetBarTabs = document.querySelectorAll('.widgetbar-tab');
        for (const tab of widgetBarTabs) {
            const tabText = tab.textContent.toLowerCase();
            if (tabText.includes('pine') || tabText.includes('log')) {
                console.log('Found potential Pine logs tab, clicking...');
                tab.click();
                showStatusMessage('Clicked potential Pine logs tab', 'info');
                return;
            }
        }
        
        // Try keyboard shortcut (if available)
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'l',
            ctrlKey: true,
            bubbles: true
        }));
        
        showStatusMessage('Attempted Pine logs activation methods', 'info');
    }
    
    // Start data collection
    function startDataCollection() {
        if (isCollecting) return;
        
        isCollecting = true;
        startTime = Date.now();
        currentSymbolIndex = 0;
        currentDateIndex = 0;
        collectedData = [];
        
        // Get dates to process
        const startDate = document.querySelector('#startDate')?.value;
        const endDate = document.querySelector('#endDate')?.value;
        datesToProcess = generateDateRange(startDate, endDate);
        
        // Use current symbol if no file uploaded
        if (currentSymbols.length === 0) {
            currentSymbols = [getCurrentSymbolFromPage()];
        }
        
        updateUI('collectionStarted');
        showStatusMessage('Data collection started', 'success');
        
        processNextSymbol();
    }
    
    // Stop data collection
    function stopDataCollection() {
        isCollecting = false;
        updateUI('collectionStopped');
        showStatusMessage('Data collection stopped by user', 'info');
        
        if (collectedData.length > 0) {
            // Final UI update - data has already been downloaded per symbol
            const uniqueCount = new Set(collectedData.map(item => 
                `${item.symbol}_${item.entry_datetime}_${item.exit_datetime}_${item.signal_direction}`
            )).size;
            
            updateUI('logEntry', {
                total: collectedData.length,
                unique: uniqueCount,
                lastEntryDate: lastLoggedEntryDate
            });
            
            showStatusMessage('All symbol data has been downloaded', 'success');
        }
    }
    
    // Generate filename for a specific symbol with new format
    function generateSymbolFilename(symbol, symbolData) {
        // Remove everything before colon ":" for cleaner filename
        const symbolWithoutExchange = symbol.includes(':') ? symbol.split(':')[1] : symbol;
        const cleanSymbol = symbolWithoutExchange.replace(/[^a-zA-Z0-9]/g, '_');
        
        if (symbolData.length === 0) {
            return `${cleanSymbol}_${new Date().toISOString().split('T')[0]}.json`;
        }
        
        // Sort by timestamp for new data structure (using UTC interpretation)
        const sortedData = [...symbolData].sort((a, b) => {
            const aTime = new Date(a.timestamp || a.entry_datetime || a.entry_date);
            const bTime = new Date(b.timestamp || b.entry_datetime || b.entry_date);
            return aTime.getTime() - bTime.getTime();
        });
        
        const earliest = sortedData[0];
        const latest = sortedData[sortedData.length - 1];
        
        // Get timeframe from first entry
        const timeframe = earliest.timeframe || 'unknown';
        
        // Format dates as yyyy-MM-dd_HH-mm (ensuring UTC interpretation)
        const formatDateTime = (dateStr) => {
            try {
                // Ensure UTC interpretation by creating Date in UTC
                const date = new Date(dateStr);
                if (isNaN(date.getTime())) {
                    return 'unknown';
                }
                // Use UTC methods to ensure consistent timezone handling
                const year = date.getUTCFullYear();
                const month = String(date.getUTCMonth() + 1).padStart(2, '0');
                const day = String(date.getUTCDate()).padStart(2, '0');
                const hours = String(date.getUTCHours()).padStart(2, '0');
                const minutes = String(date.getUTCMinutes()).padStart(2, '0');
                return `${year}-${month}-${day}_${hours}-${minutes}`;
            } catch (error) {
                return 'unknown';
            }
        };
        
        const earliestFormatted = formatDateTime(earliest.timestamp || earliest.entry_datetime || earliest.entry_date);
        const latestFormatted = formatDateTime(latest.timestamp || latest.entry_datetime || latest.entry_date);
        
        return `${cleanSymbol}-${timeframe}-${earliestFormatted}-${latestFormatted}.json`;
    }
    
    // Generate filename based on collected data
    function generateDataFilename() {
        if (collectedData.length === 0) {
            return `data_${new Date().toISOString().split('T')[0]}.json`;
        }
        
        // Sort by timestamp to find earliest and latest (using UTC interpretation)
        const sortedData = [...collectedData].sort((a, b) => {
            const aTime = new Date(a.timestamp || a.entry_datetime || a.signal_time);
            const bTime = new Date(b.timestamp || b.entry_datetime || b.signal_time);
            return aTime.getTime() - bTime.getTime();
        });
        
        const earliest = sortedData[0];
        const latest = sortedData[sortedData.length - 1];
        
        // Get symbol (use first symbol found)
        const symbol = earliest.symbol || 'UNKNOWN';
        
        // Format dates as yyyy-MM-dd_HH-mm (ensuring UTC interpretation)
        const formatDateTime = (dateStr) => {
            try {
                // Ensure UTC interpretation by creating Date in UTC
                const date = new Date(dateStr);
                if (isNaN(date.getTime())) {
                    return 'unknown';
                }
                // Use UTC methods to ensure consistent timezone handling
                const year = date.getUTCFullYear();
                const month = String(date.getUTCMonth() + 1).padStart(2, '0');
                const day = String(date.getUTCDate()).padStart(2, '0');
                const hours = String(date.getUTCHours()).padStart(2, '0');
                const minutes = String(date.getUTCMinutes()).padStart(2, '0');
                return `${year}-${month}-${day}_${hours}-${minutes}`;
            } catch (error) {
                return 'unknown';
            }
        };
        
        const earliestFormatted = formatDateTime(earliest.timestamp || earliest.entry_datetime || earliest.signal_time);
        const latestFormatted = formatDateTime(latest.timestamp || latest.entry_datetime || latest.signal_time);
        
        // Generate filename: {Symbol}-{MinTradingSignalDatetime}-{MaxTradingSignalDatetime}.json
        const filename = `${symbol}-${earliestFormatted}-${latestFormatted}.json`;
        
        return filename;
    }
    
    // Process next symbol
    function processNextSymbol() {
        if (!isCollecting || currentSymbolIndex >= currentSymbols.length) {
            // All symbols processed
            stopDataCollection();
            return;
        }
        
        const symbol = currentSymbols[currentSymbolIndex];
        currentSymbolStartTime = Date.now();
        currentDateIndex = 0;
        
        console.log(`[INFO] Starting new symbol: ${symbol}`);
        
        // Reset counters for new symbol
        collectedData = [];
        currentDateEntriesCount = 0;
        totalLogsProcessed = 0;
        lastLoggedEntryDate = null;
        
        // Update UI to show reset counters
        updateUI('logEntry', {
            total: 0,
            unique: 0,
            lastEntryDate: '-'
        });
        updateUI('currentDateEntries', 0);
        
        updateUI('currentSymbol', {
            symbol: symbol,
            index: currentSymbolIndex + 1,
            total: currentSymbols.length
        });
        
        // Change to this symbol
        changeSymbol(symbol).then(() => {
            // Check if collection was stopped during symbol change
            if (!isCollecting) {
                console.log('[DEBUG] Collection stopped during symbol change');
                return;
            }
            processNextDate();
        }).catch(error => {
            console.log(`[WARNING] Primary symbol change method failed, trying alternative method: ${error.message}`);
            
            // Try alternative method
            changeSymbolAlternative(symbol).then(() => {
                if (!isCollecting) {
                    console.log('[DEBUG] Collection stopped during alternative symbol change');
                    return;
                }
                processNextDate();
            }).catch(altError => {
                showStatusMessage(`Failed to change to symbol ${symbol}: ${altError.message}`, 'error');
                currentSymbolIndex++;
                setTimeout(() => {
                    if (isCollecting) processNextSymbol();
                }, getDelay('UI_CREATION_WAIT'));
            });
        });
    }
    
    // Process next date
    function processNextDate() {
        if (!isCollecting || currentDateIndex >= datesToProcess.length) {
            // All dates for this symbol processed - prepare and download file for current symbol
            console.log(`[INFO] Downloading data for ${currentSymbols[currentSymbolIndex]}: ${collectedData.length} unique entries`);
            prepareAndDownloadSymbolData();
            
            // Move to next symbol
            currentSymbolIndex++;
            setTimeout(() => {
                if (isCollecting) processNextSymbol();
            }, 1000);
            return;
        }
        
        const date = datesToProcess[currentDateIndex];
        currentDateStartTime = Date.now();
        currentDateEntriesCount = 0; // Reset counter for new date
        
        updateUI('currentDate', {
            date: date,
            dateIndex: currentDateIndex + 1,
            totalDates: datesToProcess.length
        });
        
        // Update current date entries counter
        updateUI('currentDateEntries', currentDateEntriesCount);
        
        // Navigate to this date
        navigateToDate(date).then(() => {
            // Check if collection was stopped during navigation
            if (!isCollecting) {
                console.log('[DEBUG] Collection stopped during date navigation');
                return;
            }
            
            // Wait for logs to load, then collect data
            setTimeout(() => {
                // Check again before collecting
                if (!isCollecting) {
                    console.log('[DEBUG] Collection stopped before data collection');
                    return;
                }
                
                collectPineLogsData().then(() => {
                    // Check if collection was stopped during data collection
                    if (!isCollecting) {
                        console.log('[DEBUG] Collection stopped after data collection');
                        return;
                    }
                    
                    // Deduplicate data before moving to next date
                    const beforeDedup = collectedData.length;
                    deduplicateCollectedData();
                    const afterDedup = collectedData.length;
                    if (beforeDedup > afterDedup) {
                        console.log(`[INFO] Removed ${beforeDedup - afterDedup} duplicates`);
                    }
                    
                    currentDateIndex++;
                    setTimeout(() => {
                        if (isCollecting) processNextDate();
                    }, 2000);
                });
            }, 3000);
        }).catch(error => {
            showStatusMessage(`Failed to navigate to date ${date}: ${error.message}`, 'error');
            currentDateIndex++;
            setTimeout(() => {
                if (isCollecting) processNextDate();
            }, 1000);
        });
    }
    
    // Change symbol on the page using TradingView's Symbol Search UI
    function changeSymbol(symbol) {
        return new Promise(async (resolve, reject) => {
            try {
                console.log(`[INFO] Changing to symbol using Symbol Search UI: ${symbol}`);
                
                // Step 1: Find and click the Symbol Search button
                const symbolSearchSelectors = [
                    '[data-name*="symbol"][data-name*="search" i]',
                    '[aria-label*="Symbol Search" i]',
                    '[class*="symbol"][class*="search" i] [role="button"]',
                    '[data-name="symbol-search-button"]',
                    '.tv-header__symbol-search-container button',
                    'button[title*="Symbol Search"]'
                ];
                
                let searchButton = null;
                for (const selector of symbolSearchSelectors) {
                    const btn = document.querySelector(selector);
                    if (btn && btn.offsetParent !== null) {
                        searchButton = btn;
                        console.log(`[INFO] Found symbol search button: ${selector}`);
                        break;
                    }
                }
                
                if (!searchButton) {
                    console.log('[WARNING] Symbol search button not found, trying keyboard shortcut');
                    // Try Ctrl+K to open symbol search
                    document.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'k',
                        ctrlKey: true,
                        bubbles: true,
                        cancelable: true
                    }));
                } else {
                    searchButton.click();
                }
                
                // Step 2: Wait for the dialog and input to appear
                const waitForElement = (selector, root = document, timeout = 5000) => {
                    return new Promise((resolve, reject) => {
                        const startTime = performance.now();
                        const interval = setInterval(() => {
                            const element = root.querySelector(selector);
                            if (element) {
                                clearInterval(interval);
                                resolve(element);
                            } else if (performance.now() - startTime > timeout) {
                                clearInterval(interval);
                                reject(new Error(`Timeout waiting for: ${selector}`));
                            }
                        }, 50);
                    });
                };
                
                try {
                    console.log('[INFO] Waiting for symbol search dialog...');
                    const dialog = await waitForElement('[role="dialog"]');
                    console.log('[INFO] Dialog found, waiting for input...');
                    const input = await waitForElement('input[type="text"]', dialog);
                    
                    // Step 3: Set the symbol value using React-safe method
                    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                    valueSetter.call(input, symbol);
                    
                    // Trigger input event for React
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    console.log(`[INFO] Symbol "${symbol}" entered in search input`);
                    
                    // Step 4: Wait for search results and click the best match
                    const findBestMatch = () => {
                        // First try exact data-symbol match
                        const exactMatch = dialog.querySelector(`[data-symbol="${symbol}"]`);
                        if (exactMatch) return exactMatch;
                        
                        // Then try finding in all possible result elements
                        const resultSelectors = [
                            '[data-symbol]',
                            '[role="row"]', 
                            '[class*="item"]',
                            '[class*="result"]',
                            '.tv-screener-table__result-row'
                        ];
                        
                        for (const selector of resultSelectors) {
                            const elements = Array.from(dialog.querySelectorAll(selector));
                            const match = elements.find(el => {
                                const text = (el.textContent || '').toUpperCase();
                                const symbolUpper = symbol.toUpperCase();
                                return text.includes(symbolUpper) || 
                                       text.replace(/[:\s]/g, '') === symbolUpper.replace(/[:\s]/g, '');
                            });
                            if (match) return match;
                        }
                        
                        return null;
                    };
                    
                    console.log('[INFO] Waiting for search results...');
                    const bestMatch = await new Promise(resolve => {
                        const startTime = performance.now();
                        const interval = setInterval(() => {
                            const match = findBestMatch();
                            if (match) {
                                clearInterval(interval);
                                resolve(match);
                            } else if (performance.now() - startTime > 4000) {
                                // Fallback: take first available result
                                clearInterval(interval);
                                const fallback = dialog.querySelector('[data-symbol], [role="row"], [class*="item"]');
                                resolve(fallback);
                            }
                        }, 75);
                    });
                    
                    if (bestMatch) {
                        bestMatch.click();
                        console.log(`[SUCCESS] Symbol changed to ${symbol} - clicked result`);
                        setTimeout(resolve, 1000); // Wait for chart to update
                    } else {
                        console.log('[WARNING] No search results found, symbol may not exist');
                        reject(new Error(`No search results found for symbol: ${symbol}`));
                    }
                    
                } catch (dialogError) {
                    console.log(`[ERROR] Dialog interaction failed: ${dialogError.message}`);
                    reject(dialogError);
                }
                
            } catch (error) {
                console.log(`[ERROR] Failed to change symbol to ${symbol}: ${error.message}`);
                reject(error);
            }
        });
    }
    
    // Helper function to change symbol via TradingView's search dialog
    function changeSymbolViaSearchDialog(symbol) {
        return new Promise((resolve, reject) => {
            try {
                console.log('[INFO] Attempting to open symbol search dialog');
                
                // Method 1: Try TradingViewApi executeActionById
                if (window.TradingViewApi) {
                    // Try different execute methods
                    const executeMethods = [
                        () => window.TradingViewApi.executeActionById && window.TradingViewApi.executeActionById('symbolSearch'),
                        () => window.TradingViewApi.activeChart && window.TradingViewApi.activeChart().executeActionById('symbolSearch'),
                        () => window.TradingViewApi.activateChart && window.TradingViewApi.activateChart().executeActionById('symbolSearch')
                    ];
                    
                    for (const method of executeMethods) {
                        try {
                            const result = method();
                            if (result !== false && result !== undefined) {
                                console.log('[INFO] Symbol search dialog opened via TradingViewApi');
                                
                                // Wait for dialog to open, then simulate typing
                                setTimeout(() => {
                                    simulateSymbolTyping(symbol).then(resolve).catch(reject);
                                }, 800);
                                return;
                            }
                        } catch (e) {
                            console.log(`[DEBUG] Execute method failed: ${e.message}`);
                        }
                    }
                }
                
                // Method 2: Try legacy widget executeActionById
                const widgets = [window.tvWidget, window.widget, window.TradingView?.widget].filter(Boolean);
                
                for (const widget of widgets) {
                    if (widget && widget.activeChart && typeof widget.activeChart === 'function') {
                        try {
                            const chart = widget.activeChart();
                            if (chart && typeof chart.executeActionById === 'function') {
                                chart.executeActionById('symbolSearch');
                                console.log('[INFO] Symbol search dialog opened via legacy widget');
                                
                                setTimeout(() => {
                                    simulateSymbolTyping(symbol).then(resolve).catch(reject);
                                }, 800);
                                return;
                            }
                        } catch (e) {
                            console.log(`[DEBUG] Legacy widget execute failed: ${e.message}`);
                        }
                    }
                }
                
                // Method 3: Try keyboard shortcut to open symbol search
                console.log('[INFO] Trying keyboard shortcut to open symbol search');
                
                // TradingView typically uses Ctrl+K or just typing to open symbol search
                document.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'k',
                    ctrlKey: true,
                    bubbles: true,
                    cancelable: true
                }));
                
                setTimeout(() => {
                    simulateSymbolTyping(symbol).then(resolve).catch(reject);
                }, 800);
                
            } catch (error) {
                console.log(`[ERROR] Symbol search dialog failed: ${error.message}`);
                reject(error);
            }
        });
    }
    
    // Helper function to simulate typing when API methods aren't available
    function simulateSymbolTyping(symbol) {
        return new Promise((resolve, reject) => {
            try {
                console.log(`[INFO] Simulating typing for symbol: ${symbol}`);
                
                // Clear any existing search or dialogs first
                document.dispatchEvent(new KeyboardEvent('keydown', { 
                    key: 'Escape', 
                    bubbles: true, 
                    cancelable: true 
                }));
                
                setTimeout(() => {
                    // Look for any visible input field that might be the symbol search
                    const searchInputs = [
                        'input[placeholder*="symbol"]',
                        'input[placeholder*="Symbol"]', 
                        'input[placeholder*="search"]',
                        'input[placeholder*="Search"]',
                        'input[data-role="search"]',
                        'input[type="text"]:not([style*="display: none"])',
                        '[contenteditable="true"]'
                    ];
                    
                    let targetInput = null;
                    for (const selector of searchInputs) {
                        const input = document.querySelector(selector);
                        if (input && input.offsetParent !== null && !input.disabled) {
                            targetInput = input;
                            console.log(`[INFO] Found target input: ${selector}`);
                            break;
                        }
                    }
                    
                    if (targetInput) {
                        // Use the input directly
                        targetInput.focus();
                        targetInput.value = symbol;
                        
                        // Trigger input events
                        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                        targetInput.dispatchEvent(new Event('change', { bubbles: true }));
                        
                        setTimeout(() => {
                            targetInput.dispatchEvent(new KeyboardEvent('keydown', { 
                                key: 'Enter',
                                bubbles: true,
                                cancelable: true
                            }));
                            setTimeout(resolve, 1000);
                        }, 300);
                    } else {
                        // Last resort: global keyboard events
                        console.log('[INFO] No input found, using global keyboard events');
                        globalKeyboardSimulation(symbol).then(resolve).catch(reject);
                    }
                }, 200);
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    // Last resort: global keyboard event simulation
    function globalKeyboardSimulation(symbol) {
        return new Promise((resolve) => {
            let charIndex = 0;
            
            function typeNextCharacter() {
                if (charIndex >= symbol.length) {
                    // Press Enter to confirm
                    setTimeout(() => {
                        document.dispatchEvent(new KeyboardEvent('keydown', { 
                            key: 'Enter', 
                            bubbles: true, 
                            cancelable: true 
                        }));
                        setTimeout(resolve, 1000);
                    }, 200);
                    return;
                }
                
                const char = symbol[charIndex];
                
                // Dispatch character event
                document.dispatchEvent(new KeyboardEvent('keydown', {
                    key: char,
                    bubbles: true,
                    cancelable: true
                }));
                
                charIndex++;
                setTimeout(typeNextCharacter, 100);
            }
            
            typeNextCharacter();
        });
    }
    
    // Alternative method: Simplified symbol search UI approach
    function changeSymbolAlternative(symbol) {
        return new Promise(async (resolve, reject) => {
            try {
                console.log(`[INFO] Trying alternative symbol search for: ${symbol}`);
                
                // Try different ways to open symbol search
                const openMethods = [
                    // Method 1: Try any visible button with symbol/search in text or attributes
                    () => {
                        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
                        const searchBtn = buttons.find(btn => {
                            const text = (btn.textContent || '').toLowerCase();
                            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                            const dataName = (btn.getAttribute('data-name') || '').toLowerCase();
                            return (text.includes('symbol') || text.includes('search')) ||
                                   (ariaLabel.includes('symbol') || ariaLabel.includes('search')) ||
                                   (dataName.includes('symbol') || dataName.includes('search'));
                        });
                        if (searchBtn && searchBtn.offsetParent !== null) {
                            searchBtn.click();
                            return true;
                        }
                        return false;
                    },
                    
                    // Method 2: Keyboard shortcut Ctrl+K
                    () => {
                        document.dispatchEvent(new KeyboardEvent('keydown', {
                            key: 'k',
                            ctrlKey: true,
                            bubbles: true,
                            cancelable: true
                        }));
                        return true;
                    },
                    
                    // Method 3: Try clicking any input that might open symbol search
                    () => {
                        const inputs = document.querySelectorAll('input[type="text"]');
                        for (const input of inputs) {
                            const placeholder = (input.placeholder || '').toLowerCase();
                            if (placeholder.includes('symbol') || placeholder.includes('search')) {
                                input.click();
                                input.focus();
                                return true;
                            }
                        }
                        return false;
                    }
                ];
                
                let dialogOpened = false;
                for (const method of openMethods) {
                    try {
                        if (method()) {
                            // Wait a bit to see if dialog appears
                            await new Promise(resolve => setTimeout(resolve, 500));
                            const dialog = document.querySelector('[role="dialog"]');
                            if (dialog) {
                                dialogOpened = true;
                                break;
                            }
                        }
                    } catch (e) {
                        console.log('[DEBUG] Open method failed:', e.message);
                    }
                }
                
                if (!dialogOpened) {
                    throw new Error('Could not open symbol search dialog');
                }
                
                // Follow the same pattern as main method
                const dialog = document.querySelector('[role="dialog"]');
                const input = dialog.querySelector('input[type="text"]');
                
                if (!input) {
                    throw new Error('Symbol search input not found');
                }
                
                // Set value and trigger events
                input.value = symbol;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                
                // Wait for results and click first match
                setTimeout(() => {
                    const firstResult = dialog.querySelector('[data-symbol], [role="row"], [class*="item"]');
                    if (firstResult) {
                        firstResult.click();
                        console.log(`[SUCCESS] Alternative method succeeded for: ${symbol}`);
                        setTimeout(resolve, 1000);
                    } else {
                        reject(new Error('No search results found'));
                    }
                }, 1000);
                
            } catch (error) {
                console.log(`[ERROR] Alternative symbol change failed: ${error.message}`);
                reject(error);
            }
        });
    }
    
    // Helper to find and fill symbol input manually
    function findAndFillSymbolInput(symbol) {
        return new Promise((resolve, reject) => {
            // More comprehensive search for symbol input fields
            const inputSelectors = [
                // TradingView specific selectors
                '[data-name="symbol-search-input"]',
                '[class*="symbol-search"] input',
                '[class*="SymbolSearch"] input',
                '.tv-symbol-header input',
                '[placeholder*="Search symbols"]',
                '[placeholder*="Enter symbol"]',
                // Generic search inputs
                'input[role="searchbox"]',
                'input[type="search"]',
                'input[aria-label*="symbol"]',
                'input[aria-label*="search"]',
                // Any visible text input
                'input[type="text"]:not([style*="display: none"]):not([hidden])'
            ];
            
            let targetInput = null;
            for (const selector of inputSelectors) {
                const inputs = document.querySelectorAll(selector);
                for (const input of inputs) {
                    // Check if input is visible and interactable
                    const rect = input.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0 && !input.disabled && !input.readOnly) {
                        targetInput = input;
                        console.log(`[INFO] Found symbol input with selector: ${selector}`);
                        break;
                    }
                }
                if (targetInput) break;
            }
            
            if (targetInput) {
                // Clear and set the symbol
                targetInput.focus();
                targetInput.select();
                targetInput.value = '';
                
                // Set new value
                targetInput.value = symbol;
                
                // Trigger all possible events
                targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                targetInput.dispatchEvent(new Event('change', { bubbles: true }));
                targetInput.dispatchEvent(new Event('keyup', { bubbles: true }));
                
                setTimeout(() => {
                    // Press Enter
                    targetInput.dispatchEvent(new KeyboardEvent('keydown', { 
                        key: 'Enter',
                        keyCode: 13,
                        bubbles: true,
                        cancelable: true
                    }));
                    
                    targetInput.dispatchEvent(new KeyboardEvent('keypress', { 
                        key: 'Enter',
                        keyCode: 13,
                        bubbles: true,
                        cancelable: true
                    }));
                    
                    console.log(`[SUCCESS] Symbol input filled and submitted: ${symbol}`);
                    setTimeout(resolve, 1000);
                }, 500);
            } else {
                reject(new Error('No suitable symbol input field found'));
            }
        });
    }
    
    // Navigate to specific date
    function navigateToDate(date) {
        return new Promise((resolve, reject) => {
            try {
                console.log(`[DEBUG] Starting navigation to date: ${date}`);
                
                // First, check if replay mode is already active
                const replayButton = document.querySelector('[aria-label="Bar Replay"], #header-toolbar-replay, button[data-tooltip="Bar Replay"]');
                const isReplayActive = replayButton && (
                    replayButton.getAttribute('aria-pressed') === 'true' ||
                    replayButton.classList.contains('active') ||
                    replayButton.classList.contains('selected')
                );
                
                if (isReplayActive) {
                    console.log('[DEBUG] Replay mode already active, skipping activation and going directly to date selection');
                    selectDate(date).then(resolve).catch(reject);
                } else {
                    console.log('[DEBUG] Replay mode not active, activating first...');
                    // First, activate replay mode
                    activateReplayMode().then(() => {
                        setTimeout(() => {
                            selectDate(date).then(resolve).catch(reject);
                        }, 1500); // Reduced wait time since we already confirmed activation
                    }).catch(reject);
                }
            } catch (error) {
                reject(error);
            }
        });
    }
    
    // Activate replay mode
    function activateReplayMode() {
        return new Promise((resolve, reject) => {
            try {
                console.log('[DEBUG] Starting replay mode activation...');
                
                // Try multiple selectors for the replay button
                const replaySelectors = [
                    '[aria-label="Bar Replay"]',
                    '#header-toolbar-replay',
                    'button[data-tooltip="Bar Replay"]',
                    '.button-ptpAHg8E[aria-pressed]',
                    'button:has(svg path[d*="20V9l-6 5.5"])',
                    '.tv-header__replay-button',
                    'button[data-name="replay"]',
                    '.tv-replay-button'
                ];
                
                let replayButton = null;
                for (const selector of replaySelectors) {
                    const buttons = document.querySelectorAll(selector);
                    console.log(`[DEBUG] Found ${buttons.length} elements for selector: ${selector}`);
                    
                    for (const button of buttons) {
                        if (button.offsetParent !== null) { // Check if visible
                            replayButton = button;
                            console.log(`[DEBUG] Found visible replay button with selector: ${selector}`);
                            break;
                        }
                    }
                    if (replayButton) break;
                }
                
                if (!replayButton) {
                    console.log('[DEBUG] No replay button found, searching in entire document...');
                    // Search for any button containing "replay" text
                    const allButtons = document.querySelectorAll('button');
                    for (const button of allButtons) {
                        const text = button.textContent.toLowerCase();
                        const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
                        const tooltip = (button.getAttribute('data-tooltip') || '').toLowerCase();
                        
                        if (text.includes('replay') || ariaLabel.includes('replay') || tooltip.includes('replay')) {
                            console.log(`[DEBUG] Found potential replay button: ${button.outerHTML.substring(0, 100)}...`);
                            if (button.offsetParent !== null) {
                                replayButton = button;
                                break;
                            }
                        }
                    }
                }
                
                if (!replayButton) {
                    throw new Error('Replay button not found after exhaustive search');
                }
                
                console.log(`[DEBUG] Using replay button: ${replayButton.outerHTML.substring(0, 200)}...`);
                
                // Check if replay mode is already active
                const isActive = replayButton.getAttribute('aria-pressed') === 'true' ||
                                replayButton.classList.contains('active') ||
                                replayButton.classList.contains('selected');
                
                console.log(`[DEBUG] Replay mode currently active: ${isActive}`);
                
                if (!isActive) {
                    console.log('[DEBUG] Activating replay mode...');
                    showStatusMessage('Activating replay mode...', 'info');
                    
                    // Ensure button is visible and clickable
                    replayButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    setTimeout(() => {
                        // Try clicking the button
                        console.log('[DEBUG] Clicking replay button...');
                        replayButton.click();
                        
                        // Also dispatch mouse events as backup
                        const clickEvent = new MouseEvent('click', {
                            view: window,
                            bubbles: true,
                            cancelable: true,
                            clientX: replayButton.getBoundingClientRect().left + 10,
                            clientY: replayButton.getBoundingClientRect().top + 10
                        });
                        replayButton.dispatchEvent(clickEvent);
                        
                        setTimeout(() => {
                            // Verify replay mode is now active
                            const isNowActive = replayButton.getAttribute('aria-pressed') === 'true' ||
                                              replayButton.classList.contains('active');
                            
                            if (isNowActive) {
                                console.log('[DEBUG] Replay mode successfully activated');
                                showStatusMessage('Replay mode activated', 'success');
                                resolve();
                            } else {
                                console.log('[DEBUG] Replay mode activation uncertain, continuing...');
                                showStatusMessage('Replay mode activation uncertain, continuing...', 'warning');
                                resolve(); // Continue anyway
                            }
                        }, getDelay('UI_CREATION_WAIT'));
                    }, getDelay('BUTTON_CLICK_WAIT'));
                } else {
                    showStatusMessage('Replay mode already active', 'success');
                    resolve();
                }
            } catch (error) {
                console.error('Error activating replay mode:', error);
                reject(error);
            }
        });
    }
    
    // Select specific date
    function selectDate(date) {
        return new Promise((resolve, reject) => {
            try {
                console.log(`[DEBUG] Starting date selection for: ${date}`);
                
                // Wait a bit for replay mode to be fully active
                setTimeout(() => {
                    console.log('[DEBUG] Searching for select date button...');
                    
                    // Try multiple selectors for the "Select date" button
                    const selectDateSelectors = [
                        '.selectDateBar__button-rEmcWy54',
                        '[data-role="button"]:has(.js-button-text:contains("Select date"))',
                        'div[data-role="button"]:has(svg path[d*="M9 5V3H8v2H6a3"])',
                        '.selectDateBar__button_withText-rEmcWy54',
                        '.tv-replay-date-selector-button',
                        '.date-picker-button'
                    ];
                    
                    let selectDateBtn = null;
                    for (const selector of selectDateSelectors) {
                        const buttons = document.querySelectorAll(selector);
                        console.log(`[DEBUG] Found ${buttons.length} elements for selector: ${selector}`);
                        
                        for (const button of buttons) {
                            if (button.offsetParent !== null) { // Check if visible
                                selectDateBtn = button;
                                console.log(`[DEBUG] Found visible select date button with selector: ${selector}`);
                                break;
                            }
                        }
                        if (selectDateBtn) break;
                    }
                    
                    // Also try finding by text content
                    if (!selectDateBtn) {
                        console.log('[DEBUG] Searching by text content...');
                        const buttons = document.querySelectorAll('[data-role="button"], button, .button');
                        for (const btn of buttons) {
                            const text = btn.textContent.toLowerCase();
                            if (text.includes('select date') || text.includes('date') && btn.offsetParent !== null) {
                                console.log(`[DEBUG] Found potential date button: ${btn.outerHTML.substring(0, 100)}...`);
                                selectDateBtn = btn;
                                break;
                            }
                        }
                    }
                    
                    if (!selectDateBtn) {
                        throw new Error('Select date button not found after exhaustive search');
                    }
                    
                    console.log(`[DEBUG] Using select date button: ${selectDateBtn.outerHTML.substring(0, 200)}...`);
                    console.log('[DEBUG] Clicking select date button...');
                    showStatusMessage('Opening date selector...', 'info');
                    
                    // Ensure button is visible
                    selectDateBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    setTimeout(() => {
                        // Click the select date button
                        selectDateBtn.click();
                        
                        // Also dispatch mouse events as backup
                        const clickEvent = new MouseEvent('click', {
                            view: window,
                            bubbles: true,
                            cancelable: true
                        });
                        selectDateBtn.dispatchEvent(clickEvent);
                        
                        setTimeout(() => {
                            console.log('[DEBUG] Looking for date input field...');
                            fillDateInput(date).then(resolve).catch(reject);
                        }, getDelay('DATE_SELECTION_WAIT')); // Wait longer for date picker to appear
                    }, getDelay('BUTTON_CLICK_WAIT'));
                }, getDelay('UI_CREATION_WAIT'));
            } catch (error) {
                console.error('Error selecting date:', error);
                reject(error);
            }
        });
    }
    
    // Fill date input field
    function fillDateInput(date) {
        return new Promise((resolve, reject) => {
            try {
                console.log(`[DEBUG] Filling date input with: ${date}`);
                
                // Try multiple selectors for date input
                const dateInputSelectors = [
                    'input[placeholder="YYYY-MM-DD"]',
                    'input[data-qa-id="ui-lib-Input-input"]',
                    '.input-RUSovanF',
                    'input[type="text"][placeholder*="YYYY"]',
                    'input[value][placeholder*="YYYY"]',
                    '.date-input',
                    'input[placeholder*="date"]'
                ];
                
                let dateInput = null;
                for (const selector of dateInputSelectors) {
                    const inputs = document.querySelectorAll(selector);
                    console.log(`[DEBUG] Found ${inputs.length} inputs for selector: ${selector}`);
                    
                    for (const input of inputs) {
                        if (input.offsetHeight > 0 && input.offsetParent !== null) {
                            dateInput = input;
                            console.log(`[DEBUG] Found visible date input with selector: ${selector}`);
                            break;
                        }
                    }
                    if (dateInput) break;
                }
                
                if (!dateInput) {
                    throw new Error('Date input field not found');
                }
                
                console.log('Filling date input with:', date);
                showStatusMessage(`Setting date to ${date}...`, 'info');
                
                // Focus the input first
                dateInput.focus();
                
                // Clear existing value
                dateInput.value = '';
                dateInput.dispatchEvent(new Event('input', { bubbles: true }));
                
                setTimeout(() => {
                    // Set the new value
                    dateInput.value = date;
                    
                    // Dispatch multiple events to ensure TradingView recognizes the change
                    dateInput.dispatchEvent(new Event('input', { bubbles: true }));
                    dateInput.dispatchEvent(new Event('change', { bubbles: true }));
                    dateInput.dispatchEvent(new Event('blur', { bubbles: true }));
                    
                    // Also try setting with React-style events
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                    nativeInputValueSetter.call(dateInput, date);
                    
                    const inputEvent = new Event('input', { bubbles: true });
                    dateInput.dispatchEvent(inputEvent);
                    
                    setTimeout(() => {
                        // Press Enter to confirm
                        console.log('Pressing Enter to confirm date...');
                        const enterEvent = new KeyboardEvent('keydown', {
                            key: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true
                        });
                        dateInput.dispatchEvent(enterEvent);
                        
                        // Also try on the document
                        document.dispatchEvent(enterEvent);
                        
                        // Verify the date was set
                        setTimeout(() => {
                            if (dateInput.value === date) {
                                showStatusMessage(`Date set to ${date}`, 'success');
                            } else {
                                showStatusMessage(`Date setting uncertain (${dateInput.value} vs ${date})`, 'warning');
                            }
                            resolve();
                        }, 500);
                    }, 250);
                }, 300);
            } catch (error) {
                console.error('Error filling date input:', error);
                reject(error);
            }
        });
    }
    
    // Collect Pine logs data with CORRECTED virtual scrolling approach
    function collectPineLogsData() {
        return new Promise((resolve) => {
            const scrollViewport = findPineLogsContainer();
            if (!scrollViewport) {
                showStatusMessage('Pine logs scroll viewport not found', 'error');
                resolve();
                return;
            }
            
            console.log('[DEBUG] Starting Pine logs collection with CORRECT scroll viewport:', scrollViewport.className);
            
            // Clear any previous processing markers
            document.querySelectorAll('[data-copilot-processed]').forEach(el => {
                el.removeAttribute('data-copilot-processed');
            });
            console.log('[DEBUG] Cleared previous processing markers');
            
            // Initialize collection state
            scrollAttempts = 0;
            lastScrollTime = Date.now();
            let previousLogCount = 0;
            let stableScrollCount = 0;
            
            // Set up mutation observer to detect new log entries
            const logObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.addedNodes.length > 0) {
                        // New nodes added, collect any new logs
                        console.log('[DEBUG] Mutation detected, collecting new logs...');
                        collectCurrentLogs();
                    }
                });
            });
            
            // Start observing the scroll viewport for new log entries
            logObserver.observe(scrollViewport, {
                childList: true,
                subtree: true
            });
            
            // CORRECTED scroll function targeting the actual viewport
            function performCorrectScroll() {
                // Check if collection was stopped
                if (!isCollecting) {
                    console.log('[DEBUG] Collection stopped by user, ending scroll');
                    logObserver.disconnect();
                    resolve();
                    return;
                }
                
                const currentLogCount = document.querySelectorAll('.msg-zsZSd11H').length;
                const unprocessedCount = document.querySelectorAll('.msg-zsZSd11H:not([data-copilot-processed])').length;
                console.log(`[DEBUG] Total logs visible: ${currentLogCount}, unprocessed: ${unprocessedCount}, previous total: ${previousLogCount}`);
                
                // Collect current visible logs
                const newLogsCollected = collectCurrentLogs();
                
                // Check if we have new visible logs OR unprocessed logs
                const hasNewVisibleLogs = currentLogCount > previousLogCount;
                const hasUnprocessedLogs = unprocessedCount > 0;
                
                if (!hasNewVisibleLogs && !hasUnprocessedLogs && newLogsCollected === 0) {
                    stableScrollCount++;
                    console.log(`[DEBUG] No progress: no new visible logs, no unprocessed logs, stable count: ${stableScrollCount}`);
                } else {
                    stableScrollCount = 0;
                    previousLogCount = currentLogCount;
                    console.log(`[DEBUG] Progress made: newVisible=${hasNewVisibleLogs}, unprocessed=${hasUnprocessedLogs}, collected=${newLogsCollected}, resetting stable count`);
                }
                
                // Stop only after EXTREMELY MANY attempts with no progress (increased from 200 to 500 for massive lists)
                if (stableScrollCount >= 500 || scrollAttempts >= (maxScrollAttempts * 3)) {
                    console.log(`[DEBUG] Stopping collection: stableScrollCount=${stableScrollCount}, scrollAttempts=${scrollAttempts}, totalCollected=${collectedData.length}`);
                    logObserver.disconnect();
                    resolve();
                    return;
                }
                
                // Get current scroll position of the VIEWPORT (not the content)
                const currentScrollTop = scrollViewport.scrollTop;
                const scrollHeight = scrollViewport.scrollHeight;
                const clientHeight = scrollViewport.clientHeight;
                
                console.log(`[DEBUG] Viewport scroll position: ${currentScrollTop}/${scrollHeight} (viewport height: ${clientHeight})`);
                
                // Check if we're near the bottom - but be EXTREMELY patient
                const isNearBottom = (currentScrollTop + clientHeight) >= (scrollHeight - 10);  // Very very close to bottom
                if (isNearBottom && stableScrollCount >= 100) {  // Increased from 40 to 100 - be extremely patient at bottom
                    console.log(`[DEBUG] Near bottom AND stable for ${stableScrollCount} attempts, collecting final logs and stopping`);
                    collectCurrentLogs(); // Final collection
                    logObserver.disconnect();
                    resolve();
                    return;
                }
                
                // ENHANCED: Larger scroll amount for faster throughput
                const scrollAmount = Math.min(3000, clientHeight * 4.0);  // LARGE scroll: 3000px or 400% of viewport (doubled from 1500px and 200%)
                
                // Method 1: Direct viewport scrolling (PRIMARY)
                scrollViewport.scrollTop += scrollAmount;
                
                // Method 2: Smooth scroll for better virtual list handling
                scrollViewport.scrollTo({
                    top: currentScrollTop + scrollAmount,
                    behavior: 'auto'  // Use 'auto' for virtual lists
                });
                
                // Method 3: Dispatch scroll event on viewport
                scrollViewport.dispatchEvent(new Event('scroll', {
                    bubbles: true,
                    cancelable: true
                }));
                
                scrollAttempts++;
                lastScrollTime = Date.now();
                
                console.log(`[DEBUG] ENHANCED THOROUGH scroll from ${currentScrollTop} to ${scrollViewport.scrollTop}, attempt ${scrollAttempts}/${maxScrollAttempts * 3}`);
                
                // Wait MORE time for thorough data loading
                setTimeout(() => {
                    // Check if collection was stopped before next iteration
                    if (!isCollecting) {
                        console.log('[DEBUG] Collection stopped by user during scroll iteration');
                        logObserver.disconnect();
                        resolve();
                        return;
                    }
                    performCorrectScroll();
                }, Math.max(getActionDelay('SCROLL_STEP') * 0.8, 400)); // THOROUGH speed: 400ms minimum wait (increased from 100ms)
            }
            
            // Start with scroll to top of the VIEWPORT
            console.log('[DEBUG] Scrolling viewport to top first...');
            scrollViewport.scrollTop = 0;
            
            // Wait for initial render, then start collection
            setTimeout(() => {
                console.log('[DEBUG] Starting corrected scroll collection...');
                performCorrectScroll();
            }, getActionDelay('SCROLL_TO_TOP_WAIT'));
        });
    }
    
    // Prepare and download data for current symbol
    function prepareAndDownloadSymbolData() {
        if (collectedData.length === 0) {
            console.log(`[WARNING] No data collected for ${currentSymbols[currentSymbolIndex]}`);
            showStatusMessage(`No data collected for ${currentSymbols[currentSymbolIndex]}`, 'warning');
            return;
        }
        
        const currentSymbol = currentSymbols[currentSymbolIndex];
        
        // Debug: Show what symbols we actually have in collected data
        const uniqueSymbols = [...new Set(collectedData.map(item => item.symbol))];
        console.log(`[DEBUG] Symbol: ${currentSymbol}, Collected symbols: [${uniqueSymbols.join(', ')}]`);
        
        // Try multiple filtering strategies to find matching data
        let symbolData = collectedData.filter(item => item.symbol === currentSymbol);
        
        if (symbolData.length === 0) {
            // Try filtering by symbol without exchange prefix
            const symbolWithoutExchange = currentSymbol.includes(':') ? currentSymbol.split(':')[1] : currentSymbol;
            symbolData = collectedData.filter(item => 
                item.symbol === symbolWithoutExchange || 
                item.symbol.includes(symbolWithoutExchange) ||
                symbolWithoutExchange.includes(item.symbol)
            );
            console.log(`[DEBUG] Trying without exchange prefix "${symbolWithoutExchange}": found ${symbolData.length} entries`);
        }
        
        if (symbolData.length === 0) {
            // Try partial matching
            symbolData = collectedData.filter(item => 
                currentSymbol.includes(item.symbol) || 
                item.symbol.includes(currentSymbol)
            );
            console.log(`[DEBUG] Trying partial matching: found ${symbolData.length} entries`);
        }
        
        if (symbolData.length === 0) {
            console.log(`[WARNING] No data found for symbol ${currentSymbol}`);
            showStatusMessage(`No data found for symbol ${currentSymbol}`, 'warning');
            return;
        }
        
        // Create report
        const report = {
            symbol: currentSymbol,
            collection_summary: {
                total_entries: symbolData.length,
                date_range: {
                    start: datesToProcess[0] || 'unknown',
                    end: datesToProcess[datesToProcess.length - 1] || 'unknown'
                },
                signal_sides: {
                    long: symbolData.filter(item => item.signal_side === 'long').length,
                    short: symbolData.filter(item => item.signal_side === 'short').length
                },
                timeframes: [...new Set(symbolData.map(item => item.timeframe))],
                timestamp_range: {
                    min: Math.min(...symbolData.map(item => new Date(item.timestamp || 0).getTime())),
                    max: Math.max(...symbolData.map(item => new Date(item.timestamp || 0).getTime())),
                    min_datetime: new Date(Math.min(...symbolData.map(item => new Date(item.timestamp || 0).getTime()))).toISOString(),
                    max_datetime: new Date(Math.max(...symbolData.map(item => new Date(item.timestamp || 0).getTime()))).toISOString()
                }
            },
            data: symbolData,
            generated_at: new Date().toISOString(),
            generator: 'TradingView Pre Trade Extension'
        };
        
        // Download the file with new filename format
        const filename = generateSymbolFilename(currentSymbol, symbolData);
        const jsonContent = JSON.stringify(report, null, 2);
        downloadFile(jsonContent, filename, 'application/json');
        
        console.log(`[SUCCESS] Downloaded ${symbolData.length} entries as ${filename}`);
        
        // Data will be cleared at the beginning of next symbol processing
    }

    // Deduplicate collected data
    function deduplicateCollectedData() {
        const uniqueData = [];
        const seen = new Set();
        
        for (const item of collectedData) {
            // Create a unique key based on specified fields for deduplication
            // Using: symbol, timeframe, signal_side, atr_percentage, sma200_distance, ema20_distance, 
            // ema_sma_spread, ema20_slope_5bar, sma200_slope_20bar, return_5bar, return_20bar, 
            // return_50bar, bar_range, bar_body, upper_wick, lower_wick, volume_ratio, 
            // volume_zscore, pullback_up, pullback_down
            const keyFields = [
                item.symbol,
                item.timeframe,
                item.signal_side,
                item.atr_percentage,
                item.sma200_distance,
                item.ema20_distance,
                item.ema_sma_spread,
                item.ema20_slope_5bar,
                item.sma200_slope_20bar,
                item.return_5bar,
                item.return_20bar,
                item.return_50bar,
                item.bar_range,
                item.bar_body,
                item.upper_wick,
                item.lower_wick,
                item.volume_ratio,
                item.volume_zscore,
                item.pullback_up,
                item.pullback_down
            ];
            
            const key = keyFields.join('_');
            
            if (!seen.has(key)) {
                seen.add(key);
                uniqueData.push(item);
            }
        }
        
        collectedData = uniqueData;
    }

    // Enhanced current logs collection with DOM element tracking
    function collectCurrentLogs() {
        // Find all log messages in the Pine logs container
        const logSelectors = [
            '.msg-zsZSd11H',                    // Primary log message selector
            '[class*="msg-"]',                  // Any message class variant
            '.pine-console .log-entry',         // Console log entries
            '.pine-logs .log-item'              // Pine logs items
        ];
        
        let logElements = [];
        for (const selector of logSelectors) {
            const found = document.querySelectorAll(selector);
            if (found.length > 0) {
                logElements = Array.from(found);
                console.log(`[DEBUG] Found ${found.length} logs with selector: ${selector}`);
                break;
            }
        }
        
        let newLogsFound = 0;
        
        logElements.forEach(logElement => {
            // Skip if we've already processed this DOM element
            if (logElement.hasAttribute('data-copilot-processed')) {
                return;
            }
            
            const logText = logElement.textContent.trim();
            if (logText.includes('{"symbol"')) {
                try {
                    // Extract JSON from the log message
                    const timestampMatch = logText.match(/^\[(.*?)\]:\s*/);
                    if (timestampMatch) {
                        const jsonText = logText.substring(timestampMatch[0].length);
                        const logData = JSON.parse(jsonText);
                        
                        // Add metadata with UTC interpretation
                        // Normalize timestamp to standard JavaScript datetime format
                        const normalizedTimestamp = normalizeToJSDatetime(timestampMatch[1]);
                        logData.timestamp = normalizedTimestamp;
                        logData.collected_at = new Date().toISOString();
                        
                        // Normalize any other datetime fields in the log data
                        if (logData.entry_datetime) {
                            logData.entry_datetime = normalizeToJSDatetime(logData.entry_datetime);
                        }
                        if (logData.exit_datetime) {
                            logData.exit_datetime = normalizeToJSDatetime(logData.exit_datetime);
                        }
                        if (logData.entry_date) {
                            logData.entry_date = normalizeToJSDatetime(logData.entry_date);
                        }
                        if (logData.exit_date) {
                            logData.exit_date = normalizeToJSDatetime(logData.exit_date);
                        }
                        if (logData.signal_time) {
                            logData.signal_time = normalizeToJSDatetime(logData.signal_time);
                        }
                        
                        // Always increment counters for every log found
                        currentDateEntriesCount++;
                        totalLogsProcessed++;
                        
                        // Track the last entry for "Last Logged" display - handle new format
                        // The new format might have different date fields, so check multiple possibilities
                        if (logData.entry_datetime) {
                            lastLoggedEntryDate = logData.entry_datetime;
                        } else if (logData.entry_date) {
                            lastLoggedEntryDate = logData.entry_date;
                        } else if (logData.timestamp) {
                            lastLoggedEntryDate = logData.timestamp;
                        }
                        
                        // Enhanced deduplication for new data structure using specified fields
                        const isDuplicate = collectedData.some(existing => {
                            // Check if all specified deduplication fields match
                            const keyFields = [
                                'symbol', 'timeframe', 'signal_side', 'atr_percentage', 'sma200_distance', 
                                'ema20_distance', 'ema_sma_spread', 'ema20_slope_5bar', 'sma200_slope_20bar', 
                                'return_5bar', 'return_20bar', 'return_50bar', 'bar_range', 'bar_body', 
                                'upper_wick', 'lower_wick', 'volume_ratio', 'volume_zscore', 'pullback_up', 'pullback_down'
                            ];
                            
                            return keyFields.every(field => existing[field] === logData[field]);
                        });
                        
                        if (!isDuplicate) {
                            collectedData.push(logData);
                            newLogsFound++;
                        }
                        
                        // Mark this DOM element as processed regardless of duplicate status
                        logElement.setAttribute('data-copilot-processed', 'true');
                    }
                } catch (error) {
                    console.warn('Failed to parse log data:', error);
                    // Still mark as processed to avoid reprocessing
                    logElement.setAttribute('data-copilot-processed', 'true');
                }
            }
        });
        
        if (newLogsFound > 0) {
            console.log(`[INFO] Collected ${newLogsFound} new entries (${totalLogsProcessed} total processed)`);
        }
        
        // Always update UI regardless of whether new logs were added (to show current date entries and last logged)
        const uniqueCount = new Set(collectedData.map(item => 
            `${item.symbol}_${item.timeframe}_${item.signal_side}_${item.timestamp}`
        )).size;
        
        updateUI('logEntry', {
            total: totalLogsProcessed, // Use total processed including duplicates
            unique: uniqueCount,
            lastEntryDate: lastLoggedEntryDate
        });
        
        updateUI('currentDateEntries', currentDateEntriesCount);
        
        return newLogsFound;
    }
    
    // Generate date range
    function generateDateRange(startDate, endDate) {
        const dates = [];
        
        if (!startDate && !endDate) {
            // No dates specified, return empty array (use current data)
            return dates;
        }
        
        if (startDate && !endDate) {
            // Only start date specified
            dates.push(startDate);
            return dates;
        }
        
        if (!startDate && endDate) {
            // Only end date specified
            dates.push(endDate);
            return dates;
        }
        
        // Both dates specified - generate range (treating as UTC)
        const start = new Date(startDate + 'T00:00:00.000Z');
        const end = new Date(endDate + 'T23:59:59.999Z');
        
        let current = new Date(start);
        
        while (current <= end) {
            // Add December 31st of each year (using UTC)
            const year = current.getUTCFullYear();
            const endOfYear = new Date(Date.UTC(year, 11, 31)); // December 31st UTC
            
            if (current.getTime() === start.getTime()) {
                // First iteration - use start date
                dates.push(formatDate(current));
            } else if (endOfYear <= end) {
                // End of year is within range
                dates.push(formatDate(endOfYear));
            } else {
                // Last iteration - use end date
                dates.push(formatDate(end));
                break;
            }
            
            // Move to next year
            current = new Date(Date.UTC(year + 1, 0, 1)); // January 1st of next year UTC
        }
        
        return dates;
    }
    
    // Enhanced error handling and retry logic
    function withRetry(fn, maxAttempts = 3, delay = 1000) {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            
            function attempt() {
                attempts++;
                
                fn().then(resolve).catch(error => {
                    if (attempts >= maxAttempts) {
                        reject(error);
                    } else {
                        showStatusMessage(`Attempt ${attempts} failed, retrying...`, 'warning');
                        setTimeout(attempt, delay * attempts);
                    }
                });
            }
            
            attempt();
        });
    }
    
    // Enhanced Pine logs detection
    function findPineLogsContainerEnhanced() {
        // Try multiple selectors for Pine logs
        const selectors = [
            '[data-test-id-widget-type="pine_logs"] .list-L0IhqRpX',
            '.widgetbar-widget-pine_logs .list-L0IhqRpX',
            '[data-study-title="Pre Trade"] .list-L0IhqRpX',
            '.pine_logs .virtualScroll-L0IhqRpX'
        ];
        
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                return element;
            }
        }
        
        return null;
    }
    
    // Enhanced deduplication
    function deduplicateEntries(entries) {
        const seen = new Set();
        const duplicates = [];
        const unique = [];
        
        entries.forEach(entry => {
            // Create a unique key based on specified fields for deduplication
            const keyFields = [
                entry.symbol,
                entry.timeframe,
                entry.signal_side,
                entry.atr_percentage,
                entry.sma200_distance,
                entry.ema20_distance,
                entry.ema_sma_spread,
                entry.ema20_slope_5bar,
                entry.sma200_slope_20bar,
                entry.return_5bar,
                entry.return_20bar,
                entry.return_50bar,
                entry.bar_range,
                entry.bar_body,
                entry.upper_wick,
                entry.lower_wick,
                entry.volume_ratio,
                entry.volume_zscore,
                entry.pullback_up,
                entry.pullback_down
            ];
            
            const key = keyFields.join('_');
            
            if (seen.has(key)) {
                duplicates.push(entry);
            } else {
                seen.add(key);
                unique.push(entry);
            }
        });
        
        return { unique, duplicates };
    }
    
    // Enhanced CSV export
    function exportToCsv(data, filename) {
        if (!data || data.length === 0) {
            showStatusMessage('No data to export', 'warning');
            return;
        }
        
        // Get all unique keys from all objects
        const allKeys = new Set();
        data.forEach(item => {
            Object.keys(item).forEach(key => allKeys.add(key));
        });
        
        const headers = Array.from(allKeys);
        const csvContent = [
            headers.join(','),
            ...data.map(item => 
                headers.map(header => {
                    const value = item[header];
                    if (value === null || value === undefined) return '';
                    if (typeof value === 'object') return JSON.stringify(value);
                    return String(value).replace(/"/g, '""');
                }).map(value => `"${value}"`).join(',')
            )
        ].join('\n');
        
        downloadFile(csvContent, filename, 'text/csv');
    }
    
    // Enhanced file download
    function downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showStatusMessage(`Downloaded ${filename}`, 'success');
    }
    
    // Listen for export requests from UI
    window.addEventListener('message', function(event) {
        if (event.data.type === 'TRADINGVIEW_EXPORT_JSON') {
            if (collectedData.length > 0) {
                const filename = `tradingview_data_${new Date().toISOString().split('T')[0]}.json`;
                downloadFile(JSON.stringify(collectedData, null, 2), filename, 'application/json');
            } else {
                showStatusMessage('No data to export', 'warning');
            }
        } else if (event.data.type === 'TRADINGVIEW_EXPORT_CSV') {
            if (collectedData.length > 0) {
                const filename = `tradingview_data_${new Date().toISOString().split('T')[0]}.csv`;
                exportToCsv(collectedData, filename);
            } else {
                showStatusMessage('No data to export', 'warning');
            }
        }
    });
    
    // Format date as YYYY-MM-DD (already in UTC via toISOString)
    function formatDate(date) {
        return date.toISOString().split('T')[0];
    }
    
    // Normalize any datetime string to standard JavaScript format (YYYY-MM-DDTHH:mm:ss.000Z)
    function normalizeToJSDatetime(dateTimeStr) {
        try {
            // Handle common Pine script timestamp formats and ensure UTC interpretation
            let normalizedStr = dateTimeStr;
            
            // If the string doesn't contain timezone info, treat as UTC
            if (!dateTimeStr.includes('Z') && !dateTimeStr.includes('+') && !dateTimeStr.includes('-') && !dateTimeStr.includes('GMT') && !dateTimeStr.includes('UTC')) {
                // Add 'Z' suffix to indicate UTC if no timezone info present
                if (dateTimeStr.includes('T')) {
                    normalizedStr = dateTimeStr + 'Z';
                } else if (dateTimeStr.includes(' ')) {
                    // Replace space with 'T' and add 'Z'
                    normalizedStr = dateTimeStr.replace(' ', 'T') + 'Z';
                }
            }
            
            // Create Date object (will be interpreted as UTC if 'Z' suffix is present)
            const date = new Date(normalizedStr);
            
            if (isNaN(date.getTime())) {
                console.warn(`Failed to parse datetime: ${dateTimeStr}`);
                return new Date().toISOString(); // Fallback to current UTC time
            }
            
            // Return in standard JavaScript format with milliseconds
            return date.toISOString();
            
        } catch (error) {
            console.warn(`Error normalizing datetime "${dateTimeStr}":`, error);
            return new Date().toISOString(); // Fallback to current UTC time
        }
    }
    
    // Get current symbol from page
    function getCurrentSymbolFromPage() {
        // Method 1: Try to extract current symbol from TradingView's DOM
        const symbolSelectors = [
            '[data-name="legend-source-title"]',    // Chart legend
            '.tv-symbol-header__symbol',            // Symbol header
            '[data-name="symbol-name-label"]',      // Symbol name label
            '.js-symbol-name',                      // Generic symbol name class
            '[class*="symbol"]'                     // Any element with symbol in class
        ];
        
        for (const selector of symbolSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent && element.textContent.trim()) {
                const symbolText = element.textContent.trim();
                // Filter out obvious non-symbol text
                if (symbolText.length > 0 && symbolText.length < 20 && !symbolText.includes(' ')) {
                    console.log(`[INFO] Found current symbol from DOM: ${symbolText}`);
                    return symbolText;
                }
            }
        }
        
        // Method 2: Try to get symbol from first available log entry
        const logElements = document.querySelectorAll('.pine-console .log-entry, .log-item, [class*="log"]');
        for (const logElement of logElements) {
            try {
                const logText = logElement.textContent || '';
                const parsedLog = parseLogText(logText);
                if (parsedLog && parsedLog.symbol) {
                    console.log(`[INFO] Found current symbol from log entry: ${parsedLog.symbol}`);
                    return parsedLog.symbol;
                }
            } catch (e) {
                // Continue to next log element
            }
        }
        
        // Method 3: Check URL for symbol information
        const url = window.location.href;
        const urlSymbolMatch = url.match(/symbol=([^&]+)/);
        if (urlSymbolMatch) {
            const urlSymbol = decodeURIComponent(urlSymbolMatch[1]);
            console.log(`[INFO] Found current symbol from URL: ${urlSymbol}`);
            return urlSymbol;
        }
        
        // Fallback to a common default
        console.log('[WARNING] Could not determine current symbol, using default: ES1!');
        return 'ES1!';
    }
    
    // Helper function to parse log text and extract data
    function parseLogText(logText) {
        if (!logText || !logText.includes('{"symbol"')) {
            return null;
        }
        
        try {
            // Extract JSON from the log message
            const timestampMatch = logText.match(/^\[(.*?)\]:\s*/);
            if (timestampMatch) {
                const jsonText = logText.substring(timestampMatch[0].length);
                return JSON.parse(jsonText);
            }
        } catch (e) {
            // Not a valid JSON log entry
        }
        
        return null;
    }
    
    // Update UI elements
    function updateUI(action, data) {
        if (!extensionUI) return;
        
        const ui = extensionUI;
        
        switch (action) {
            case 'symbolsLoaded':
                const symbolsCount = ui.querySelector('#symbolsCount');
                if (symbolsCount) symbolsCount.textContent = data;
                break;
                
            case 'collectionStarted':
                const startBtn = ui.querySelector('#startBtn');
                const stopBtn = ui.querySelector('#stopBtn');
                if (startBtn) startBtn.disabled = true;
                if (stopBtn) stopBtn.disabled = false;
                
                const stopwatch = ui.querySelector('#stopwatch');
                if (stopwatch) {
                    updateStopwatch();
                }
                break;
                
            case 'collectionStopped':
                const startBtn2 = ui.querySelector('#startBtn');
                const stopBtn2 = ui.querySelector('#stopBtn');
                if (startBtn2) startBtn2.disabled = false;
                if (stopBtn2) stopBtn2.disabled = true;
                break;
                
            case 'currentSymbol':
                const currentSymbolEl = ui.querySelector('#currentSymbol');
                const symbolProgress = ui.querySelector('#symbolProgress');
                const symbolStopwatch = ui.querySelector('#symbolStopwatch');
                
                // Remove everything before colon ":" for cleaner display
                const cleanSymbolName = data.symbol.includes(':') ? data.symbol.split(':')[1].trim() : data.symbol;
                
                if (currentSymbolEl) currentSymbolEl.textContent = cleanSymbolName;
                if (symbolProgress) symbolProgress.textContent = `(${data.index}/${data.total})`;
                if (symbolStopwatch) {
                    updateSymbolStopwatch();
                }
                break;
                
            case 'currentDate':
                const currentDateEl = ui.querySelector('#currentDate');
                const dateProgress = ui.querySelector('#dateProgress');
                const dateStopwatch = ui.querySelector('#dateStopwatch');
                
                if (currentDateEl) currentDateEl.textContent = data.date;
                if (dateProgress && data.dateIndex && data.totalDates) {
                    dateProgress.textContent = `(${data.dateIndex}/${data.totalDates})`;
                }
                if (dateStopwatch) {
                    updateDateStopwatch();
                }
                break;
                
            case 'logEntry':
                const totalLogs = ui.querySelector('#totalLogs');
                const uniqueLogs = ui.querySelector('#uniqueLogs');
                const lastLogged = ui.querySelector('#lastLogged');
                
                // Handle both object format and simple number format
                if (typeof data === 'object' && data !== null) {
                    if (totalLogs) totalLogs.textContent = data.total || 0;
                    if (uniqueLogs) uniqueLogs.textContent = data.unique || 0;
                    if (lastLogged) {
                        lastLogged.textContent = data.lastEntryDate || lastLoggedEntryDate || '-';
                    }
                } else {
                    // Fallback for simple number format
                    if (totalLogs) totalLogs.textContent = data || 0;
                    if (uniqueLogs) uniqueLogs.textContent = data || 0;
                    if (lastLogged) {
                        lastLogged.textContent = lastLoggedEntryDate || '-';
                    }
                }
                break;
                
            case 'currentDateEntries':
                const currentDateEntries = ui.querySelector('#currentDateEntries');
                if (currentDateEntries) currentDateEntries.textContent = data;
                break;
        }
    }
    
    // Update main stopwatch
    function updateStopwatch() {
        if (!isCollecting || !startTime) return;
        
        const elapsed = Date.now() - startTime;
        const formatted = formatElapsedTime(elapsed);
        
        const stopwatch = extensionUI?.querySelector('#stopwatch');
        if (stopwatch) {
            stopwatch.textContent = formatted;
        }
        
        setTimeout(updateStopwatch, 1000);
    }
    
    // Update symbol stopwatch
    function updateSymbolStopwatch() {
        if (!isCollecting || !currentSymbolStartTime) return;
        
        const elapsed = Date.now() - currentSymbolStartTime;
        const formatted = formatElapsedTime(elapsed);
        
        const symbolStopwatch = extensionUI?.querySelector('#symbolStopwatch');
        if (symbolStopwatch) {
            symbolStopwatch.textContent = formatted;
        }
        
        setTimeout(updateSymbolStopwatch, 1000);
    }
    
    // Update date stopwatch
    function updateDateStopwatch() {
        if (!isCollecting || !currentDateStartTime) return;
        
        const elapsed = Date.now() - currentDateStartTime;
        const formatted = formatElapsedTime(elapsed);
        
        const dateStopwatch = extensionUI?.querySelector('#dateStopwatch');
        if (dateStopwatch) {
            dateStopwatch.textContent = formatted;
        }
        
        setTimeout(updateDateStopwatch, 1000);
    }
    
    // Format elapsed time
    function formatElapsedTime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000) % 60;
        const minutes = Math.floor(milliseconds / (1000 * 60)) % 60;
        const hours = Math.floor(milliseconds / (1000 * 60 * 60));
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // Show status message
    function showStatusMessage(message, type = 'info') {
        const statusContainer = extensionUI?.querySelector('#statusMessages');
        if (!statusContainer) return;
        
        const messageEl = document.createElement('div');
        messageEl.className = `status-message status-${type}`;
        messageEl.innerHTML = `
            <span class="status-icon">${getStatusIcon(type)}</span>
            <span class="status-text">${message}</span>
        `;
        
        statusContainer.appendChild(messageEl);
        
        // Remove old messages if too many
        const messages = statusContainer.children;
        if (messages.length > 5) {
            statusContainer.removeChild(messages[0]);
        }
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.parentNode.removeChild(messageEl);
            }
        }, 10000);
    }
    
    // Get status icon
    function getStatusIcon(type) {
        switch (type) {
            case 'success': return '✅';
            case 'error': return '❌';
            case 'warning': return '⚠️';
            default: return 'ℹ️';
        }
    }
    
    // Make window draggable
    function makeDraggable(element, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        handle.onmousedown = dragMouseDown;
        
        function dragMouseDown(e) {
            e = e || window.event;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }
        
        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
        }
        
        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }
    
    // Toggle minimize
    function toggleMinimize() {
        const content = extensionUI?.querySelector('.window-content');
        const minimizeBtn = extensionUI?.querySelector('#minimizeBtn');
        
        if (content && minimizeBtn) {
            if (content.style.display === 'none') {
                content.style.display = 'block';
                minimizeBtn.textContent = '−';
            } else {
                content.style.display = 'none';
                minimizeBtn.textContent = '+';
            }
        }
    }
    
    // Initialize when page loads
    waitForPageLoad().then(() => {
        detectTradingViewAPIs();
        createExtensionUI();
    });
    
    // Detect available TradingView APIs and log them
    function detectTradingViewAPIs() {
        console.log('[DEBUG] Detecting TradingView APIs...');
        
        // Check for main TradingViewApi (from screenshots)
        if (window.TradingViewApi) {
            console.log('[INFO] Found window.TradingViewApi:', window.TradingViewApi);
            
            // Check available methods
            const methods = [
                'setSymbol',
                'activeChart', 
                'activateChart',
                'executeActionById'
            ];
            
            methods.forEach(method => {
                if (typeof window.TradingViewApi[method] === 'function') {
                    console.log(`[INFO] TradingViewApi.${method}() available`);
                }
            });
            
            // Check chart methods if activeChart exists
            try {
                if (window.TradingViewApi.activeChart) {
                    const chart = window.TradingViewApi.activeChart();
                    if (chart) {
                        console.log('[INFO] TradingViewApi.activeChart() returned:', chart);
                        if (typeof chart.setSymbol === 'function') {
                            console.log('[INFO] chart.setSymbol() available');
                        }
                        if (typeof chart.executeActionById === 'function') {
                            console.log('[INFO] chart.executeActionById() available');
                        }
                    }
                }
            } catch (e) {
                console.log('[DEBUG] Error checking activeChart:', e.message);
            }
        }
        
        // Check for legacy widget APIs
        const possibleAPIs = [
            'window.tvWidget',
            'window.widget', 
            'window.TradingView'
        ];
        
        possibleAPIs.forEach(apiPath => {
            const parts = apiPath.split('.');
            let current = window;
            for (const part of parts.slice(1)) {
                current = current?.[part];
            }
            
            if (current) {
                console.log(`[INFO] Found ${apiPath}:`, current);
                if (current.activeChart && typeof current.activeChart === 'function') {
                    console.log(`[INFO] ${apiPath} has activeChart() method`);
                    try {
                        const chart = current.activeChart();
                        if (chart?.setSymbol) {
                            console.log(`[INFO] ${apiPath}.activeChart() has setSymbol() method`);
                        }
                        if (chart?.executeActionById) {
                            console.log(`[INFO] ${apiPath}.activeChart() has executeActionById() method`);
                        }
                    } catch (e) {
                        console.log(`[WARNING] Error accessing ${apiPath}.activeChart():`, e.message);
                    }
                }
            }
        });
        
        // Also check for dynamically added APIs after delay
        setTimeout(() => {
            console.log('[DEBUG] Re-checking for TradingView APIs after delay...');
            if (window.TradingViewApi && !window.tradingViewAPIDetected) {
                console.log('[INFO] Late detection: Found TradingViewApi');
                window.tradingViewAPIDetected = true;
            }
        }, 5000);
    }
    
    // Listen for activation event from popup
    window.addEventListener('tradingview-extension-activate', () => {
        if (!extensionUI) {
            createExtensionUI();
        }
    });
    
})();