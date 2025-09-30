// ============================================================================
// BACKGROUND SCRIPT - Service Worker
// ============================================================================

class TVDataCollectorBackground {
    constructor() {
        this.init();
    }
    
    init() {
        // Listen for messages from content script and popup
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async responses
        });
        
        // Handle extension installation
        chrome.runtime.onInstalled.addListener((details) => {
            console.log('TradingView Data Collector installed:', details);
        });
        
        console.log('TradingView Data Collector background script initialized');
    }
    
    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'download':
                    await this.handleDownload(message.data);
                    break;
                case 'requestPopupOpen':
                    await this.handlePopupOpenRequest(sender);
                    break;
                case 'collectionProgress':
                case 'collectionComplete':
                case 'collectionError':
                case 'symbolStarted':
                case 'dateStarted':
                case 'entriesFound':
                    // Forward these messages to popup if it's open
                    await this.forwardToPopup(message);
                    break;
                default:
                    console.log('Unknown message type in background:', message.type);
            }
        } catch (error) {
            console.error('Error handling message in background:', error);
        }
        
        sendResponse({ success: true });
    }
    
    async handleDownload(data) {
        try {
            await chrome.downloads.download({
                url: data.url,
                filename: data.filename,
                saveAs: false // Auto-save to downloads folder
            });
            
            console.log(`Download initiated: ${data.filename}`);
            
        } catch (error) {
            console.error('Download error:', error);
        }
    }
    
    async handlePopupOpenRequest(sender) {
        try {
            // Show notification to user about clicking extension icon
            console.log('Popup open requested from tab:', sender.tab?.id);
            
            // We can't programmatically open the popup, but we can send a notification
            if (sender.tab?.id) {
                await chrome.tabs.sendMessage(sender.tab.id, {
                    type: 'showClickExtensionHint'
                });
            }
            
        } catch (error) {
            console.error('Error handling popup open request:', error);
        }
    }
    
    async forwardToPopup(message) {
        try {
            // Get all extension views (popup, options, etc.)
            const views = chrome.extension.getViews({ type: 'popup' });
            
            // If popup is open, forward the message
            if (views.length > 0) {
                views.forEach(view => {
                    if (view.tvDataCollector) {
                        view.tvDataCollector.handleMessage(message);
                    }
                });
            }
            
        } catch (error) {
            console.error('Error forwarding to popup:', error);
        }
    }
}

// Initialize background script
const tvBackground = new TVDataCollectorBackground();