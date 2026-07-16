document.addEventListener('DOMContentLoaded', async () => {
    const ipInput = document.getElementById('ipAddress');
    const saveBtn = document.getElementById('saveBtn');
    const statusDiv = document.getElementById('status');

    // Load saved IP
    const data = await chrome.storage.local.get(['serverHost']);
    if (data.serverHost) {
        ipInput.value = data.serverHost;
    }

    saveBtn.addEventListener('click', async () => {
        const val = ipInput.value.trim();
        await chrome.storage.local.set({ serverHost: val || '127.0.0.1' });
        
        // Notify background script to reconnect
        chrome.runtime.sendMessage({ action: 'reconnect' });

        statusDiv.textContent = 'Saved! Trying to connect...';
        statusDiv.style.color = '#2563eb';

        setTimeout(() => {
            window.close();
        }, 1500);
    });
});
