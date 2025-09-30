// ============================================================================
// INJECTED SCRIPT - Deeper DOM Access
// ============================================================================

(function() {
    'use strict';
    
    console.log('TradingView Data Collector injected script loaded');
    
    // Helper functions that run in page context for deeper access
    window.tvDataCollectorHelpers = {
        
        // Get TradingView's internal state if available
        getTVState: function() {
            try {
                // Try to access TradingView's global objects
                if (window.TradingView) {
                    return {
                        symbol: window.TradingView.symbol || null,
                        timeframe: window.TradingView.timeframe || null,
                        isReplayMode: window.TradingView.isReplayMode || false
                    };
                }
                return null;
            } catch (error) {
                console.error('Error accessing TradingView state:', error);
                return null;
            }
        },
        
        // Enhanced Pine Logs detection
        findPineLogsAdvanced: function() {
            try {
                // Look for React components or internal structures
                const allElements = document.querySelectorAll('*');
                
                for (let element of allElements) {
                    // Check for React Fiber properties
                    const fiberKey = Object.keys(element).find(key => 
                        key.startsWith('__reactInternalInstance') || 
                        key.startsWith('__reactFiber')
                    );
                    
                    if (fiberKey) {
                        const fiber = element[fiberKey];
                        if (this.isPineLogsComponent(fiber)) {
                            return element;
                        }
                    }
                    
                    // Check for Vue.js components
                    if (element.__vue__) {
                        const vue = element.__vue__;
                        if (this.isPineLogsVueComponent(vue)) {
                            return element;
                        }
                    }
                }
                
                return null;
            } catch (error) {
                console.error('Error in advanced Pine Logs detection:', error);
                return null;
            }
        },
        
        isPineLogsComponent: function(fiber) {
            if (!fiber) return false;
            
            // Check component name and props
            let current = fiber;
            let depth = 0;
            
            while (current && depth < 10) {
                if (current.type && typeof current.type === 'string') {
                    if (current.type.toLowerCase().includes('log')) {
                        return true;
                    }
                }
                
                if (current.stateNode && current.stateNode.className) {
                    const className = current.stateNode.className;
                    if (typeof className === 'string' && className.includes('log')) {
                        return true;
                    }
                }
                
                current = current.return;
                depth++;
            }
            
            return false;
        },
        
        isPineLogsVueComponent: function(vue) {
            if (!vue) return false;
            
            // Check component name and data
            if (vue.$options && vue.$options.name) {
                const name = vue.$options.name.toLowerCase();
                if (name.includes('log') || name.includes('pine')) {
                    return true;
                }
            }
            
            return false;
        },
        
        // Enhanced virtual list scrolling
        scrollVirtualListAdvanced: function(container) {
            try {
                // Try to access virtual list internals
                const reactKey = Object.keys(container).find(key => 
                    key.startsWith('__reactInternalInstance') || 
                    key.startsWith('__reactFiber')
                );
                
                if (reactKey) {
                    const fiber = container[reactKey];
                    this.scrollReactVirtualList(fiber);
                }
                
                // Try Vue.js virtual list
                if (container.__vue__) {
                    this.scrollVueVirtualList(container.__vue__);
                }
                
                // Fallback to DOM events
                this.scrollWithDOMEvents(container);
                
            } catch (error) {
                console.error('Error in advanced virtual list scrolling:', error);
            }
        },
        
        scrollReactVirtualList: function(fiber) {
            // Try to find and call React virtual list methods
            let current = fiber;
            let depth = 0;
            
            while (current && depth < 10) {
                if (current.stateNode && current.stateNode.scrollToBottom) {
                    current.stateNode.scrollToBottom();
                    return;
                }
                
                if (current.stateNode && current.stateNode.scrollDown) {
                    current.stateNode.scrollDown(1000);
                    return;
                }
                
                current = current.child || current.sibling || current.return;
                depth++;
            }
        },
        
        scrollVueVirtualList: function(vue) {
            // Try to call Vue virtual list methods
            if (vue.scrollToBottom) {
                vue.scrollToBottom();
                return;
            }
            
            if (vue.scrollBy) {
                vue.scrollBy(0, 1000);
                return;
            }
        },
        
        scrollWithDOMEvents: function(container) {
            // Comprehensive DOM event scrolling
            const events = [
                new WheelEvent('wheel', { deltaY: 1000, bubbles: true }),
                new KeyboardEvent('keydown', { key: 'PageDown', keyCode: 34, bubbles: true }),
                new KeyboardEvent('keydown', { key: 'End', keyCode: 35, bubbles: true })
            ];
            
            events.forEach(event => {
                try {
                    container.dispatchEvent(event);
                } catch (error) {
                    console.warn('Event dispatch failed:', error);
                }
            });
            
            // Direct scroll manipulation
            try {
                const maxScroll = container.scrollHeight - container.clientHeight;
                container.scrollTop = Math.min(container.scrollTop + 1000, maxScroll);
            } catch (error) {
                console.warn('Direct scroll failed:', error);
            }
        },
        
        // Extract logs with enhanced parsing
        extractLogsAdvanced: function(container) {
            const logs = [];
            
            try {
                // Try different approaches for log extraction
                const approaches = [
                    () => this.extractFromReactComponents(container),
                    () => this.extractFromVueComponents(container),
                    () => this.extractFromDOMElements(container)
                ];
                
                for (let approach of approaches) {
                    try {
                        const result = approach();
                        if (result && result.length > 0) {
                            logs.push(...result);
                        }
                    } catch (error) {
                        console.warn('Log extraction approach failed:', error);
                    }
                }
                
            } catch (error) {
                console.error('Error in advanced log extraction:', error);
            }
            
            return logs;
        },
        
        extractFromReactComponents: function(container) {
            const logs = [];
            
            // Implementation for React-based log extraction
            // This would require deeper inspection of React components
            
            return logs;
        },
        
        extractFromVueComponents: function(container) {
            const logs = [];
            
            // Implementation for Vue.js-based log extraction
            
            return logs;
        },
        
        extractFromDOMElements: function(container) {
            const logs = [];
            
            // Enhanced DOM-based extraction
            const logElements = container.querySelectorAll('*');
            
            for (let element of logElements) {
                const text = element.textContent;
                if (text && this.isValidLogEntry(text)) {
                    logs.push({
                        timestamp: this.extractTimestamp(element),
                        content: text.trim(),
                        element: element
                    });
                }
            }
            
            return logs;
        },
        
        isValidLogEntry: function(text) {
            return text.includes('"type":"PreData"') || 
                   text.includes('"type":"PostData"');
        },
        
        extractTimestamp: function(element) {
            // Enhanced timestamp extraction
            const timeSelectors = [
                '[class*="time"]',
                '[class*="timestamp"]',
                '[data-time]',
                '.log-time'
            ];
            
            for (let selector of timeSelectors) {
                const timeElement = element.querySelector(selector);
                if (timeElement) {
                    return timeElement.textContent.trim();
                }
            }
            
            // Look in parent elements
            let parent = element.parentElement;
            let depth = 0;
            
            while (parent && depth < 3) {
                for (let selector of timeSelectors) {
                    const timeElement = parent.querySelector(selector);
                    if (timeElement) {
                        return timeElement.textContent.trim();
                    }
                }
                parent = parent.parentElement;
                depth++;
            }
            
            return new Date().toISOString();
        }
    };
    
    // Make helpers available to content script
    window.addEventListener('message', function(event) {
        if (event.source !== window) return;
        
        if (event.data.type === 'TV_DATA_COLLECTOR_REQUEST') {
            const { method, args, id } = event.data;
            
            try {
                const result = window.tvDataCollectorHelpers[method](...(args || []));
                
                window.postMessage({
                    type: 'TV_DATA_COLLECTOR_RESPONSE',
                    id: id,
                    result: result
                }, '*');
                
            } catch (error) {
                window.postMessage({
                    type: 'TV_DATA_COLLECTOR_RESPONSE',
                    id: id,
                    error: error.message
                }, '*');
            }
        }
    });
    
})();