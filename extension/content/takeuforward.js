// ─── TakeUForward Content Script ────────────────────────────────────────
// Detects module completion events on takeuforward.in

(function () {
    'use strict';

    let lastDetected = '';

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            // Watch for attribute changes (checkbox toggles)
            if (mutation.type === 'attributes') {
                checkForCompletion(mutation.target);
            }
            // Watch for added nodes (dynamic content loading)
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    checkForCompletion(node);
                }
            }
        }
    });

    function checkForCompletion(element) {
        // TUF uses checkboxes/buttons for marking problems as complete
        // Look for checked checkboxes, completed states, or "mark as done" interactions

        const selectors = [
            'input[type="checkbox"]:checked',
            '[class*="completed"]',
            '[class*="done"]',
            '[class*="solved"]',
            'button[class*="mark"]',
        ];

        for (const selector of selectors) {
            const matches = element.matches?.(selector) ? [element] :
                (element.querySelectorAll?.(selector) || []);

            for (const match of matches) {
                // Try to find the associated problem/module name
                const title = findModuleTitle(match);
                const key = `${title}-${Date.now()}`;

                if (key !== lastDetected && title) {
                    lastDetected = key;

                    chrome.runtime.sendMessage({
                        type: 'tuf_complete',
                        title: title,
                        url: window.location.href,
                    });

                    console.log('[Habit Calendar] TUF module completion detected:', title);
                }
            }
        }
    }

    function findModuleTitle(element) {
        // Walk up the DOM tree to find a title/heading near the checkbox
        let current = element;
        for (let i = 0; i < 5; i++) {
            current = current?.parentElement;
            if (!current) break;

            // Look for text content that could be a title
            const heading = current.querySelector('h1, h2, h3, h4, a, .title, [class*="title"], [class*="name"]');
            if (heading && heading.textContent.trim().length > 2) {
                return heading.textContent.trim().substring(0, 100);
            }
        }

        // Fallback: use page title or URL
        const pageTitle = document.querySelector('h1, h2');
        if (pageTitle) return pageTitle.textContent.trim().substring(0, 100);

        return document.title || 'TUF Module';
    }

    // --- Fallback: Network Request Interception ---
    // Inject a script into the page context to intercept fetch requests
    // This is much more reliable than DOM scraping for React/Next.js apps
    const script = document.createElement('script');
    script.textContent = `
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
            const response = await originalFetch.apply(this, args);
            try {
                const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
                const method = (args[1]?.method || 'GET').toUpperCase();
                
                // If it's a POST/PUT request to a progress/completion endpoint
                if (method !== 'GET' && (url.includes('progress') || url.includes('complete') || url.includes('solve') || url.includes('mark') || url.includes('status') || url.includes('update'))) {
                    window.postMessage({ type: 'TUF_API_CALL', url: url }, '*');
                }
            } catch(e) {}
            return response;
        };
    `;
    document.documentElement.appendChild(script);
    script.remove();

    window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data || event.data.type !== 'TUF_API_CALL') return;
        
        console.log('[Habit Calendar] TUF progress network request detected:', event.data.url);
        
        const key = `tuf-api-${Date.now()}`;
        if (key !== lastDetected) {
            lastDetected = key;
            chrome.runtime.sendMessage({
                type: 'tuf_complete',
                title: document.title || 'TakeUForward Module',
                url: window.location.href,
            });
        }
    });

    // --- Fallback 1: Broad Click Listener ---
    document.addEventListener('click', (e) => {
        // Broaden click targets to catch any checkmark icon, switch, checkbox, or button
        const target = e.target.closest('input[type="checkbox"], button, svg, [role="button"], [class*="check"], [class*="mark"], [class*="complete"], [class*="status"]');
        if (target) {
            // Small delay to let the DOM update
            setTimeout(() => checkForCompletion(target), 500);
            
            // Just in case it's a global state change, check the whole body
            setTimeout(() => checkForCompletion(document.body), 1000);
        }
    }, true);

    // Start observing DOM changes for standard completion classes
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'checked', 'data-completed', 'data-state'],
    });
})();
