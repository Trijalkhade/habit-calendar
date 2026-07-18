// ─── TakeUForward Content Script ────────────────────────────────────────
// Detects module completion events on takeuforward.in

(function () {
    'use strict';

    let lastDetected = '';

    // Only trigger when the user actually checks a checkbox
    document.addEventListener('change', (e) => {
        if (e.target.tagName.toLowerCase() === 'input' && e.target.type === 'checkbox' && e.target.checked) {
            checkForCompletion(e.target);
        }
    });

    // Or if they click a button that explicitly says "Mark" or "Complete"
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn) {
            const text = btn.textContent.toLowerCase();
            if (text.includes('mark as done') || text.includes('mark completed')) {
                // Wait briefly for UI to update
                setTimeout(() => checkForCompletion(btn), 300);
            }
        }
    });

    function checkForCompletion(element) {
        const title = findModuleTitle(element);
        triggerCompletion(title);
    }

    function triggerCompletion(title) {
        const key = `${title}-${Date.now()}`;

        // Debounce
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

    function findModuleTitle(element) {
        // Walk up the DOM tree to find a title/heading near the interaction
        let current = element;
        for (let i = 0; i < 5; i++) {
            current = current?.parentElement;
            if (!current) break;

            const heading = current.querySelector('h1, h2, h3, h4, a, .title, [class*="title"], [class*="name"]');
            if (heading && heading.textContent.trim().length > 2) {
                return heading.textContent.trim().substring(0, 100);
            }
        }

        // Fallback: use page title
        const pageTitle = document.querySelector('h1, h2');
        if (pageTitle) return pageTitle.textContent.trim().substring(0, 100);

        return document.title || 'TUF Module';
    }

    // --- Network Request Interception ---
    // More precise: Only intercept non-GET requests to explicitly named completion endpoints
    const script = document.createElement('script');
    script.textContent = `
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
            const response = await originalFetch.apply(this, args);
            try {
                const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
                const method = (args[1]?.method || 'GET').toUpperCase();
                
                // Must be a successful mutation request specifically for marking completion
                if (response.ok && method !== 'GET' && (url.includes('progress') || url.includes('complete') || url.includes('solve') || url.includes('mark-done'))) {
                    // Avoid generic 'update' or 'status' endpoints which trigger on page load
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
        triggerCompletion(document.title || 'TakeUForward Module');
    });

})();
