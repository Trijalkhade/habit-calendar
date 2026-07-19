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
        // LeetCode's new UI uses specific data attributes and exact text
        const resultEls = [];
        if (element.matches && element.matches('[data-e2e-locator="submission-result"]')) {
            resultEls.push(element);
        }
        if (element.querySelectorAll) {
            resultEls.push(...element.querySelectorAll('[data-e2e-locator="submission-result"]'));
        }

        for (const resultEl of resultEls) {
            const text = resultEl.textContent.trim();
            
            // MUST exactly match "Accepted" to avoid "Not Accepted"
            if (text === 'Accepted' && resultEl.classList.contains('text-green-s')) {
                triggerCompletion();
                return;
            }
        }

        // Fallback for older UI or alternate views: check for specific classes and EXACT text
        const successEls = [];
        if (element.matches && element.matches('.success, .accepted, .text-green, .text-green-60')) {
            successEls.push(element);
        }
        if (element.querySelectorAll) {
            successEls.push(...element.querySelectorAll('.success, .accepted, .text-green, .text-green-60'));
        }

        for (const el of successEls) {
            if (el.textContent.trim() === 'Accepted') {
                triggerCompletion();
                return;
            }
        }
    }

    function triggerCompletion() {
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

    function getProblemTitle() {
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

        const match = window.location.pathname.match(/\/problems\/([^/]+)/);
        if (match) {
            return match[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }

        return 'Unknown Problem';
    }

    observer.observe(document.body, { childList: true, subtree: true });

    // Intercept GraphQL requests to catch submissions robustly
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('content/inject.js');
    script.onload = function() {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(script);

    window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data || event.data.type !== 'LC_SUBMISSION_ACCEPTED') return;
        triggerCompletion();
    });
})();
