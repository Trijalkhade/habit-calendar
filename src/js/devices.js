// ─── Connect Devices Panel ──────────────────────────────────────────────

async function openDevicesPanel() {
    const overlay = document.getElementById('devices-overlay');
    const content = document.getElementById('devices-content');
    overlay.classList.remove('hidden');
    content.innerHTML = '<div class="empty-state"><div class="empty-state-text">Loading devices...</div></div>';

    try {
        const devices = await invoke('get_devices');
        renderDevicesPanel(content, devices);
    } catch (e) {
        console.error('Devices panel error:', e);
        content.innerHTML = '<div class="empty-state"><div class="empty-state-text">Failed to load devices</div></div>';
    }
}

function renderDevicesPanel(container, devices) {
    container.innerHTML = '';

    // Device list
    if (devices.length > 0) {
        const list = document.createElement('div');
        list.className = 'device-list';

        devices.forEach(device => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.id = `device-${device.id}`;

            const statusClass = device.status || 'offline';
            const statusLabel = statusClass === 'online' ? 'Online' :
                                statusClass === 'syncing' ? 'Syncing...' : 'Offline';

            const lastSync = device.last_connected ?
                formatRelativeTime(device.last_connected) : 'Never synced';

            card.innerHTML = `
                <div class="device-info">
                    <div class="device-name">
                        <span>${getDeviceIcon(device.name)}</span>
                        ${device.name}
                        <span class="device-status ${statusClass}">
                            <span class="status-dot"></span>
                            ${statusLabel}
                        </span>
                    </div>
                    <div class="device-meta">
                        <span>${device.ip}:${device.port}</span>
                        <span>Last sync: ${lastSync}</span>
                    </div>
                </div>
                <div class="device-actions">
                    <button class="device-action-btn" onclick="syncSingleDevice('${device.id}', this)">Sync Now</button>
                    <button class="device-action-btn danger" onclick="removeDeviceConfirm('${device.id}', '${device.name}')">Remove</button>
                </div>
            `;
            list.appendChild(card);
        });

        container.appendChild(list);
    } else {
        const empty = document.createElement('div');
        empty.className = 'devices-empty';
        empty.innerHTML = `
            <div class="devices-empty-icon">📱</div>
            <div class="devices-empty-text">
                No devices connected yet.<br>
                Add your Android or iOS phone below to sync browser history.
            </div>
        `;
        container.appendChild(empty);
    }

    // Add device form
    const addForm = document.createElement('div');
    addForm.className = 'add-device-form';
    addForm.innerHTML = `
        <div style="font-size: 13px; font-weight: 600; color: var(--text-primary);">Add Device</div>
        <div class="form-row">
            <input type="text" id="device-ip-input" placeholder="Device IP (e.g., 192.168.1.42)">
            <input type="text" id="device-name-input" placeholder="Name (e.g., My Phone)" style="max-width: 160px;">
            <button class="add-device-btn" onclick="addNewDevice()" id="btn-add-device">Connect</button>
        </div>
        <div id="add-device-status" style="font-size: 12px; color: var(--text-tertiary);"></div>
    `;
    container.appendChild(addForm);

    // Setup instructions
    const instructions = document.createElement('div');
    instructions.className = 'device-instructions';
    instructions.innerHTML = `
        <strong>How to connect your phone:</strong><br>
        1. Install the <strong>Habit Calendar Companion</strong> app on your Android/iOS device<br>
        2. Open the companion app — it will show your phone's IP address<br>
        3. Make sure both devices are on the <strong>same WiFi network</strong><br>
        4. Enter the phone's IP address above and click Connect<br>
        <br>
        <em>The app will automatically sync browser history whenever both devices are on the same network.</em>
    `;
    container.appendChild(instructions);
}

async function addNewDevice() {
    const ipInput = document.getElementById('device-ip-input');
    const nameInput = document.getElementById('device-name-input');
    const btn = document.getElementById('btn-add-device');
    const status = document.getElementById('add-device-status');

    const ip = ipInput.value.trim();
    const name = nameInput.value.trim() || 'Phone';

    if (!ip) {
        status.textContent = 'Please enter the device IP address';
        status.style.color = 'var(--red-violation)';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Connecting...';
    status.textContent = 'Trying to reach companion app...';
    status.style.color = 'var(--text-tertiary)';

    try {
        const deviceId = await invoke('add_device', { ip, name });
        status.textContent = `✓ Connected! Device ID: ${deviceId}`;
        status.style.color = 'var(--green-complete)';
        btn.textContent = 'Connected ✓';

        // Refresh the devices list
        setTimeout(() => openDevicesPanel(), 1500);
    } catch (e) {
        status.textContent = `✕ Connection failed: ${e}`;
        status.style.color = 'var(--red-violation)';
        btn.disabled = false;
        btn.textContent = 'Connect';
    }
}

async function syncSingleDevice(deviceId, btnElement) {
    const originalText = btnElement.textContent;
    btnElement.textContent = 'Syncing...';
    btnElement.disabled = true;

    try {
        const result = await invoke('sync_device', { deviceId });
        btnElement.textContent = 'Done ✓';
        btnElement.style.color = 'var(--green-complete)';
        setTimeout(() => {
            btnElement.textContent = originalText;
            btnElement.style.color = '';
            btnElement.disabled = false;
        }, 2000);
    } catch (e) {
        btnElement.textContent = 'Failed';
        btnElement.style.color = 'var(--red-violation)';
        setTimeout(() => {
            btnElement.textContent = originalText;
            btnElement.style.color = '';
            btnElement.disabled = false;
        }, 2000);
    }
}

async function removeDeviceConfirm(deviceId, deviceName) {
    // Simple confirmation
    if (!confirm(`Remove "${deviceName}" from connected devices?`)) return;

    try {
        await invoke('remove_device', { deviceId });
        openDevicesPanel(); // refresh
    } catch (e) {
        console.error('Failed to remove device:', e);
    }
}

function getDeviceIcon(name) {
    const lower = name.toLowerCase();
    if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('ios')) return '🍎';
    if (lower.includes('pixel') || lower.includes('samsung') || lower.includes('android')) return '🤖';
    return '📱';
}
