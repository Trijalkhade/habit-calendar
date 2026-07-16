// ─── LeetCode Content Script ────────────────────────────────────────────
// Detects "Accepted" submissions on LeetCode

(function () {
    'use strict';

    let lastDetectedSubmission = '';

    // Watch for the "Accepted" result appearing in the DOM
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                checkForAccepted(node);
            }
        }
    });

    function checkForAccepted(element) {
        // LeetCode shows "Accepted" in multiple ways:
        // 1. A success result panel with "Accepted" text
        // 2. A green checkmark icon with success status

        const text = element.textContent || '';
        const html = element.innerHTML || '';

        // Check for "Accepted" status in submission result
        if (
            (text.includes('Accepted') && !text.includes('Not Accepted')) ||
            html.includes('data-e2e-locator="submission-result"') ||
            element.querySelector?.('[data-e2e-locator="submission-result"]')
        ) {
            // Verify it's actually an accepted result (green success state)
            const hasSuccess =
                element.classList?.contains('text-green') ||
                element.querySelector?.('.text-green-s, .text-green-60, [class*="success"], [class*="accepted"]') ||
                text.match(/Accepted/i);

            if (hasSuccess) {
                // Extract problem title from the page
                const title = getProblemTitle();
                const submissionKey = `${title}-${Date.now()}`;

                // Debounce: don't send the same submission twice within 5 seconds
                if (submissionKey !== lastDetectedSubmission) {
                    lastDetectedSubmission = submissionKey;

                    chrome.runtime.sendMessage({
                        type: 'leetcode_accepted',
                        title: title,
                        url: window.location.href,
                    });

                    console.log('[Habit Calendar] LeetCode accepted submission detected:', title);
                }
            }
        }
    }

    function getProblemTitle() {
        // Try multiple selectors for the problem title
        const selectors = [
            'a[href*="/problems/"] span',
            '[data-cy="question-title"]',
            '.css-v3d350',
            'h4[class*="title"]',
            '.text-title-large',
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el && el.textContent.trim()) {
                return el.textContent.trim();
            }
        }

        // Fallback: extract from URL
        const match = window.location.pathname.match(/\/problems\/([^/]+)/);
        if (match) {
            return match[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }

        return 'Unknown Problem';
    }

    // Start observing
    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    // Also check for already-loaded accepted results
    setTimeout(() => {
        document.querySelectorAll('[class*="success"], [class*="accepted"]').forEach(checkForAccepted);
    }, 2000);
})();
