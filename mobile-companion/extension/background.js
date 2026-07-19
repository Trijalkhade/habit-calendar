// Habit Calendar Mobile Extension Background Script
// Runs in the background in Safari on iOS

const COMPANION_APP_URL = 'http://127.0.0.1:19848/history';

let pendingHistory = [];
let syncInterval = null;

// Listen to new visits
chrome.history.onVisited.addListener((historyItem) => {
  if (!historyItem.url) return;

  const entry = {
    url: historyItem.url,
    visit_time: new Date(historyItem.lastVisitTime || Date.now()).toISOString(),
    browser: 'Mobile Safari'
  };

  pendingHistory.push(entry);
  
  // Trigger an immediate sync attempt
  syncWithCompanionApp();
});

async function syncWithCompanionApp() {
  if (pendingHistory.length === 0) return;

  try {
    const dataToSend = [...pendingHistory];
    
    const response = await fetch(COMPANION_APP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dataToSend)
    });

    if (response.ok) {
      console.log(\`Successfully synced \${dataToSend.length} items.\`);
      // Remove successfully sent items from the pending queue
      pendingHistory = pendingHistory.filter(item => !dataToSend.includes(item));
    }
  } catch (error) {
    // Expected when the companion app is not running. 
    // We will keep the history in memory and try again later.
    console.log('Companion app not reachable, keeping history in queue.');
  }
}

// Try to sync every 30 seconds in case the app was closed and is now open
syncInterval = setInterval(() => {
  syncWithCompanionApp();
}, 30000);
