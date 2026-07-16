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

    // Also listen for click events on completion buttons
    document.addEventListener('click', (e) => {
        const target = e.target.closest('input[type="checkbox"], button[class*="mark"], [class*="complete"]');
        if (target) {
            // Small delay to let the DOM update
            setTimeout(() => checkForCompletion(target), 500);
        }
    }, true);

    // Start observing
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'checked', 'data-completed'],
    });
})();
