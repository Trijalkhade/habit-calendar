// ─── Habit Calendar Extension — Background Service Worker ────────────────

const DEFAULT_PORT = 19847;
let serverPort = DEFAULT_PORT;
let serverHost = '127.0.0.1';
let blacklist = [];
let isConnected = false;

// Discover the daemon's port and load blacklist on startup
async function init() {
    // Try to load saved config from storage
    try {
        const data = await chrome.storage.local.get(['serverPort', 'serverHost']);
        if (data.serverPort) serverPort = data.serverPort;
        if (data.serverHost) serverHost = data.serverHost;
    } catch (e) { /* use default */ }

    // Try to connect and fetch blacklist
    await checkHealth();
    if (isConnected) {
        await fetchBlacklist();
    }

    // Retry connection periodically
    setInterval(async () => {
        if (!isConnected) {
            await checkHealth();
            if (isConnected) await fetchBlacklist();
        }
    }, 30000);

    // Refresh blacklist every 10 minutes
    setInterval(fetchBlacklist, 10 * 60 * 1000);
}

// Listen for reconnect messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'reconnect') {
        init(); // reload config and reconnect
    }
});

async function checkHealth() {
    try {
        const resp = await fetch(`http://${serverHost}:${serverPort}/health`, {
            signal: AbortSignal.timeout(3000)
        });
        if (resp.ok) {
            isConnected = true;
            return true;
        }
    } catch (e) { /* offline */ }

    // Try scanning ports if default failed (only on 127.0.0.1)
    if (!isConnected && serverHost === '127.0.0.1') {
        for (let port = 19840; port <= 19860; port++) {
            if (port === serverPort) continue;
            try {
                const resp = await fetch(`http://127.0.0.1:${port}/health`, {
                    signal: AbortSignal.timeout(200)
                });
                if (resp.ok) {
                    serverPort = port;
                    chrome.storage.local.set({ serverPort: port });
                    isConnected = true;
                    return true;
                }
            } catch (e) { /* ignore */ }
        }
    }

    isConnected = false;
    return false;
}

async function fetchBlacklist() {
    try {
        const resp = await fetch(`http://${serverHost}:${serverPort}/blacklist-domains`);
        if (resp.ok) {
            const data = await resp.json();
            blacklist = data.domains || [];
            chrome.storage.local.set({ blacklistCache: blacklist });
        }
    } catch (e) {
        // Use cached if offline
        const data = await chrome.storage.local.get(['blacklistCache']);
        if (data.blacklistCache) blacklist = data.blacklistCache;
    }
}

async function sendEvent(event) {
    if (!isConnected) {
        // Queue for later
        try {
            const data = await chrome.storage.local.get(['eventQueue']);
            const queue = data.eventQueue || [];
            queue.push(event);
            await chrome.storage.local.set({ eventQueue: queue });
        } catch (e) { /* silently fail */ }
        return;
    }

    try {
        await fetch(`http://${serverHost}:${serverPort}/event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event),
        });
    } catch (e) {
        console.error('Failed to send event:', e);
    }
}

async function sendBlacklistVisit(domain, url) {
    if (!isConnected) return;

    try {
        await fetch(`http://${serverHost}:${serverPort}/blacklist-check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                domain,
                url,
                timestamp: new Date().toISOString(),
                browser: getBrowserName(),
            }),
        });
    } catch (e) {
        console.error('Failed to send blacklist visit:', e);
    }
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'leetcode_accepted' || message.type === 'tuf_complete') {
        sendEvent({
            type: message.type,
            title: message.title || null,
            url: message.url || sender.tab?.url || null,
            timestamp: new Date().toISOString(),
        });
        sendResponse({ success: true });
    }
    return true;
});

// Monitor tab navigation for blacklist checking
chrome.webNavigation.onCompleted.addListener((details) => {
    if (details.frameId !== 0) return; // Only main frame

    try {
        const url = new URL(details.url);
        const domain = url.hostname.replace(/^www\./, '');

        const isBlacklisted = blacklist.some(bl =>
            domain === bl || domain.endsWith(`.${bl}`)
        );

        if (isBlacklisted) {
            sendBlacklistVisit(domain, details.url);
        }
    } catch (e) { /* invalid URL */ }
});

function getBrowserName() {
    const ua = navigator.userAgent;
    if (ua.includes('Brave')) return 'brave';
    if (ua.includes('Edg/')) return 'edge';
    if (ua.includes('Firefox')) return 'firefox';
    if (ua.includes('Chrome')) return 'chrome';
    return 'unknown';
}

// Flush event queue when connection is restored
async function flushEventQueue() {
    if (!isConnected) return;
    try {
        const data = await chrome.storage.local.get(['eventQueue']);
        const queue = data.eventQueue || [];
        if (queue.length === 0) return;

        for (const event of queue) {
            await sendEvent(event);
        }
        await chrome.storage.local.set({ eventQueue: [] });
    } catch (e) { /* silently fail */ }
}

// Initialize
init().then(() => flushEventQueue());
