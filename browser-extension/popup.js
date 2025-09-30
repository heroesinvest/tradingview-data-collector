// ============================================================================
// POPUP SCRIPT - Main UI Controller
// ============================================================================

class TVDataCollectorUI {
    constructor() {
        this.isCollecting = false;
        this.symbols = [];
        this.currentSymbolIndex = 0;
        this.collectionStartTime = null;
        this.symbolStartTime = null;
        this.dateStartTime = null;
        this.timers = {};
        this.stats = {
            totalEntries: 0,
            uniqueEntries: 0,
            entriesToday: 0,
            lastLogged: null
        };
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupTimers();
        this.loadState();
        this.updateUI();
        this.setupDragAndResize();
    }
    
    setupEventListeners() {
        // File upload
        document.getElementById('symbolsFile').addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files[0]);
        });
        
        // Control buttons
        document.getElementById('startCollection').addEventListener('click', () => {
            this.startCollection();
        });
        
        document.getElementById('stopCollection').addEventListener('click', () => {
            this.stopCollection();
        });
        
        // Date inputs
        document.getElementById('startDate').addEventListener('change', () => {
            this.saveState();
        });
        
        document.getElementById('endDate').addEventListener('change', () => {
            this.saveState();
        });
        
        // Set default end date to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('endDate').value = today;
    }
    
    setupTimers() {
        // Update timers every second
        setInterval(() => {
            this.updateTimers();
        }, 1000);
    }
    
    setupDragAndResize() {
        const dragHandle = document.querySelector('.drag-handle');
        const resizeHandle = document.querySelector('.resize-handle');
        let isDragging = false;
        let isResizing = false;
        let startX, startY, startWidth, startHeight, startLeft, startTop;
        
        // Drag functionality
        dragHandle.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = document.body.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            e.preventDefault();
        });
        
        // Resize functionality
        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = parseInt(document.defaultView.getComputedStyle(document.body).width, 10);
            startHeight = parseInt(document.defaultView.getComputedStyle(document.body).height, 10);
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                document.body.style.position = 'fixed';
                document.body.style.left = (startLeft + deltaX) + 'px';
                document.body.style.top = (startTop + deltaY) + 'px';
            } else if (isResizing) {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                document.body.style.width = (startWidth + deltaX) + 'px';
                document.body.style.height = (startHeight + deltaY) + 'px';
            }
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
            isResizing = false;
        });
    }
    
    async handleFileUpload(file) {
        if (!file) return;
        
        try {
            const text = await file.text();
            this.symbols = text.split('\\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
            
            this.updateStatus(`Loaded ${this.symbols.length} symbols from file`, 'success');
            this.updateUI();
            this.saveState();
        } catch (error) {
            this.updateStatus(`Error loading file: ${error.message}`, 'error');
        }
    }
    
    async startCollection() {
        if (this.isCollecting) return;
        
        console.log('Starting collection...');
        
        this.isCollecting = true;
        this.collectionStartTime = Date.now();
        this.currentSymbolIndex = 0;
        
        document.getElementById('startCollection').disabled = true;
        document.getElementById('stopCollection').disabled = false;
        
        this.updateStatus('Starting data collection...', 'info');
        
        try {
            // Send message to content script to start collection
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            console.log('Current tab:', tab);
            
            if (!tab.url.includes('tradingview.com')) {
                throw new Error('Please navigate to TradingView first');
            }
            
            const collectionConfig = {
                symbols: this.symbols,
                startDate: document.getElementById('startDate').value,
                endDate: document.getElementById('endDate').value,
                command: 'startCollection'
            };
            
            console.log('Sending message to content script:', collectionConfig);
            
            const response = await chrome.tabs.sendMessage(tab.id, collectionConfig);
            console.log('Content script response:', response);
            
            this.updateStatus('Collection started successfully', 'success');
            
        } catch (error) {
            console.error('Error starting collection:', error);
            this.updateStatus(`Error starting collection: ${error.message}`, 'error');
            this.stopCollection();
        }
    }
    
    async stopCollection() {
        if (!this.isCollecting) return;
        
        this.isCollecting = false;
        this.collectionStartTime = null;
        this.symbolStartTime = null;
        this.dateStartTime = null;
        
        document.getElementById('startCollection').disabled = false;
        document.getElementById('stopCollection').disabled = true;
        
        this.updateStatus('Collection stopped by user', 'warning');
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.tabs.sendMessage(tab.id, { command: 'stopCollection' });
        } catch (error) {
            console.error('Error stopping collection:', error);
        }
        
        this.updateUI();
        this.saveState();
    }
    
    updateTimers() {
        const now = Date.now();
        
        // Collection timer
        if (this.collectionStartTime) {
            const elapsed = Math.floor((now - this.collectionStartTime) / 1000);
            document.getElementById('collectionTimer').textContent = this.formatTime(elapsed);
        }
        
        // Symbol timer
        if (this.symbolStartTime) {
            const elapsed = Math.floor((now - this.symbolStartTime) / 1000);
            document.getElementById('symbolTimer').textContent = this.formatTime(elapsed);
        }
        
        // Date timer
        if (this.dateStartTime) {
            const elapsed = Math.floor((now - this.dateStartTime) / 1000);
            document.getElementById('dateTimer').textContent = this.formatTime(elapsed);
        }
    }
    
    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    updateStatus(message, type = 'info') {
        const statusMessages = document.getElementById('statusMessages');
        const timestamp = new Date().toLocaleTimeString();
        
        const messageElement = document.createElement('div');
        messageElement.className = `status-message status-${type}`;
        messageElement.textContent = `[${timestamp}] ${message}`;
        
        statusMessages.appendChild(messageElement);
        statusMessages.scrollTop = statusMessages.scrollHeight;
        
        // Keep only last 50 messages
        while (statusMessages.children.length > 50) {
            statusMessages.removeChild(statusMessages.firstChild);
        }
    }
    
    updateUI() {
        // Update symbols info
        document.getElementById('symbolsLoaded').textContent = this.symbols.length;
        
        if (this.symbols.length > 0 && this.currentSymbolIndex < this.symbols.length) {
            const symbol = this.symbols[this.currentSymbolIndex];
            const escaped = this.escapeSymbol(symbol);
            const progress = `(${this.currentSymbolIndex + 1}/${this.symbols.length})`;
            document.getElementById('currentSymbol').textContent = `${escaped} ${progress}`;
        } else {
            document.getElementById('currentSymbol').textContent = '-';
        }
        
        // Update progress bar
        if (this.symbols.length > 0) {
            const progress = (this.currentSymbolIndex / this.symbols.length) * 100;
            document.getElementById('progressFill').style.width = `${progress}%`;
        }
        
        // Update statistics
        document.getElementById('totalEntries').textContent = this.stats.totalEntries.toString().padStart(3, '0');
        document.getElementById('uniqueEntries').textContent = this.stats.uniqueEntries.toString().padStart(3, '0');
        document.getElementById('entriesToday').textContent = this.stats.entriesToday.toString().padStart(3, '0');
        document.getElementById('lastLogged').textContent = this.stats.lastLogged || '-';
    }
    
    escapeSymbol(symbol) {
        // Extract ticker from symbol (e.g., "CME_MINI:ES1!" -> "ES")
        const parts = symbol.split(':');
        if (parts.length > 1) {
            const ticker = parts[1];
            // Handle special cases
            if (ticker.includes('1!')) {
                return ticker.replace('1!', '');
            }
            if (ticker.includes('.P')) {
                return ticker; // Keep .P for crypto perpetuals
            }
            return ticker;
        }
        return symbol;
    }
    
    async saveState() {
        const state = {
            symbols: this.symbols,
            currentSymbolIndex: this.currentSymbolIndex,
            isCollecting: this.isCollecting,
            stats: this.stats,
            startDate: document.getElementById('startDate').value,
            endDate: document.getElementById('endDate').value
        };
        
        try {
            await chrome.storage.local.set({ tvDataCollectorState: state });
        } catch (error) {
            console.error('Error saving state:', error);
        }
    }
    
    async loadState() {
        try {
            const result = await chrome.storage.local.get(['tvDataCollectorState']);
            if (result.tvDataCollectorState) {
                const state = result.tvDataCollectorState;
                this.symbols = state.symbols || [];
                this.currentSymbolIndex = state.currentSymbolIndex || 0;
                this.stats = state.stats || this.stats;
                
                if (state.startDate) {
                    document.getElementById('startDate').value = state.startDate;
                }
                if (state.endDate) {
                    document.getElementById('endDate').value = state.endDate;
                }
            }
        } catch (error) {
            console.error('Error loading state:', error);
        }
    }
    
    // Message handling from content script
    handleMessage(message) {
        console.log('Popup received message:', message);
        
        switch (message.type) {
            case 'contentScriptReady':
                this.updateStatus(`Content script ready on: ${message.data.url}`, 'success');
                break;
            case 'collectionProgress':
                this.handleCollectionProgress(message.data);
                break;
            case 'collectionComplete':
                this.handleCollectionComplete(message.data);
                break;
            case 'collectionError':
                this.handleCollectionError(message.data);
                break;
            case 'symbolStarted':
                this.handleSymbolStarted(message.data);
                break;
            case 'dateStarted':
                this.handleDateStarted(message.data);
                break;
            case 'entriesFound':
                this.handleEntriesFound(message.data);
                break;
            default:
                console.log('Unknown message type:', message.type);
        }
    }
    
    handleCollectionProgress(data) {
        this.currentSymbolIndex = data.symbolIndex;
        this.stats.totalEntries = data.totalEntries;
        this.stats.uniqueEntries = data.uniqueEntries;
        this.updateStatus(`Progress: ${data.message}`, 'info');
        this.updateUI();
        this.saveState();
    }
    
    handleCollectionComplete(data) {
        this.isCollecting = false;
        this.collectionStartTime = null;
        this.symbolStartTime = null;
        this.dateStartTime = null;
        
        document.getElementById('startCollection').disabled = false;
        document.getElementById('stopCollection').disabled = true;
        
        this.updateStatus(`Collection completed! ${data.message}`, 'success');
        this.updateUI();
        this.saveState();
    }
    
    handleCollectionError(data) {
        this.updateStatus(`Error: ${data.message}`, 'error');
        this.stopCollection();
    }
    
    handleSymbolStarted(data) {
        this.symbolStartTime = Date.now();
        this.currentSymbolIndex = data.symbolIndex;
        this.updateStatus(`Started processing symbol: ${data.symbol}`, 'info');
        this.updateUI();
    }
    
    handleDateStarted(data) {
        this.dateStartTime = Date.now();
        document.getElementById('currentDate').textContent = data.date;
        this.updateStatus(`Processing date: ${data.date}`, 'info');
    }
    
    handleEntriesFound(data) {
        this.stats.totalEntries += data.total;
        this.stats.uniqueEntries += data.unique;
        this.stats.entriesToday = data.today;
        this.stats.lastLogged = data.lastLogged;
        this.updateUI();
        this.saveState();
    }
}

// Initialize UI when popup loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('Popup DOM loaded, initializing UI...');
    window.tvDataCollector = new TVDataCollectorUI();
    
    // Add debugging info
    console.log('TradingView Data Collector Popup initialized');
    
    // Test if we're on TradingView
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            const url = tabs[0].url;
            console.log('Current tab URL:', url);
            if (url.includes('tradingview.com')) {
                console.log('✅ On TradingView - extension should work');
            } else {
                console.log('❌ Not on TradingView - extension may not work');
                window.tvDataCollector.updateStatus('Please navigate to TradingView first', 'warning');
            }
        }
    });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Popup received runtime message:', message);
    if (window.tvDataCollector) {
        window.tvDataCollector.handleMessage(message);
    } else {
        console.warn('tvDataCollector not initialized yet');
    }
    sendResponse({ received: true });
});