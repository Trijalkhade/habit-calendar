// ─── Dashboard ──────────────────────────────────────────────────────────

async function openDashboard() {
    const overlay = document.getElementById('dashboard-overlay');
    const content = document.getElementById('dashboard-content');
    overlay.classList.remove('hidden');
    content.innerHTML = '<div class="empty-state"><div class="empty-state-text">Loading analytics...</div></div>';

    try {
        const stats = await invoke('get_dashboard_stats', { monthsBack: 6 });
        renderDashboard(content, stats);
    } catch (e) {
        console.error('Dashboard error:', e);
        content.innerHTML = '<div class="empty-state"><div class="empty-state-text">Failed to load analytics</div></div>';
    }
}

function renderDashboard(container, stats) {
    container.innerHTML = '';

    // ── Stat cards (all from real data) ──
    const grid = document.createElement('div');
    grid.className = 'stat-grid';

    const cards = [
        { value: stats.current_streak, label: 'Current Streak', unit: 'days' },
        { value: stats.best_streak, label: 'Best Streak', unit: 'days' },
        { value: stats.total_problems_solved, label: 'Problems Solved' },
        { value: `${stats.completion_rate.toFixed(0)}%`, label: 'Completion Rate' },
        { value: stats.contests_participated, label: 'Contests' },
        { value: stats.total_violations, label: 'Blacklist Visits' },
    ];

    cards.forEach(c => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.innerHTML = `
            <div class="stat-value">${c.value}${c.unit ? '<span class="stat-unit">' + c.unit + '</span>' : ''}</div>
            <div class="stat-label">${c.label}</div>
        `;
        grid.appendChild(card);
    });

    container.appendChild(grid);

    // ── Platform breakdown (per-platform real data) ──
    const breakdown = document.createElement('div');
    breakdown.className = 'chart-container';
    const breakdownTitle = document.createElement('div');
    breakdownTitle.className = 'chart-title';
    breakdownTitle.textContent = 'Platform Breakdown';
    breakdown.appendChild(breakdownTitle);

    const platforms = document.createElement('div');
    platforms.className = 'platform-list';

    const platformData = [
        { name: 'LeetCode Problems', count: stats.leetcode_solved },
        { name: 'CodeChef Problems', count: stats.codechef_solved },
        { name: 'LC Daily Problem', count: stats.leetcode_daily_solved },
        { name: 'LC Contests', count: stats.leetcode_contests },
        { name: 'CC Contests', count: stats.codechef_contests },
        { name: 'TUF Modules', count: stats.tuf_modules },
    ];

    const maxVal = Math.max(...platformData.map(p => p.count), 1);

    platformData.forEach(p => {
        const row = document.createElement('div');
        row.className = 'platform-row';
        row.innerHTML = `
            <div class="platform-label">${p.name}</div>
            <div class="platform-bar"><div class="platform-bar-fill" style="width: ${(p.count / maxVal) * 100}%"></div></div>
            <div class="platform-count">${p.count}</div>
        `;
        platforms.appendChild(row);
    });

    breakdown.appendChild(platforms);
    container.appendChild(breakdown);

    // ── Summary stats row ──
    const summaryContainer = document.createElement('div');
    summaryContainer.className = 'chart-container';
    const summaryTitle = document.createElement('div');
    summaryTitle.className = 'chart-title';
    summaryTitle.textContent = 'Activity Summary';
    summaryContainer.appendChild(summaryTitle);

    const summaryGrid = document.createElement('div');
    summaryGrid.className = 'summary-grid';
    summaryGrid.innerHTML = `
        <div class="summary-item">
            <div class="summary-value">${stats.days_tracked}</div>
            <div class="summary-label">Days Active</div>
        </div>
        <div class="summary-item">
            <div class="summary-value">${stats.avg_daily_completions.toFixed(1)}</div>
            <div class="summary-label">Avg Daily</div>
        </div>
        <div class="summary-item">
            <div class="summary-value">${stats.leetcode_solved + stats.codechef_solved}</div>
            <div class="summary-label">Total Solved</div>
        </div>
        <div class="summary-item">
            <div class="summary-value">${stats.contests_participated}</div>
            <div class="summary-label">Total Contests</div>
        </div>
    `;
    summaryContainer.appendChild(summaryGrid);
    container.appendChild(summaryContainer);

    // ── Monthly trend chart (problems + violations) ──
    if (stats.monthly_data && stats.monthly_data.length > 0) {
        const chartContainer = document.createElement('div');
        chartContainer.className = 'chart-container';
        const chartTitle = document.createElement('div');
        chartTitle.className = 'chart-title';
        chartTitle.textContent = 'Monthly Activity';
        chartContainer.appendChild(chartTitle);

        // Legend
        const legend = document.createElement('div');
        legend.className = 'chart-legend';
        legend.innerHTML = `
            <div class="legend-item"><span class="legend-dot legend-problems"></span>Completions</div>
            <div class="legend-item"><span class="legend-dot legend-violations"></span>Violations</div>
        `;
        chartContainer.appendChild(legend);

        const canvas = document.createElement('canvas');
        canvas.className = 'chart-canvas';
        canvas.width = 600;
        canvas.height = 180;
        chartContainer.appendChild(canvas);
        container.appendChild(chartContainer);

        requestAnimationFrame(() => drawBarChart(canvas, stats.monthly_data));
    }

    // ── Top violation domains ──
    if (stats.top_violation_domains && stats.top_violation_domains.length > 0) {
        const violContainer = document.createElement('div');
        violContainer.className = 'chart-container';
        const violTitle = document.createElement('div');
        violTitle.className = 'chart-title';
        violTitle.textContent = 'Top Blacklisted Sites';
        violContainer.appendChild(violTitle);

        const violList = document.createElement('div');
        violList.className = 'platform-list';

        const maxViol = Math.max(...stats.top_violation_domains.map(d => d.count), 1);

        stats.top_violation_domains.forEach(d => {
            const row = document.createElement('div');
            row.className = 'platform-row';
            row.innerHTML = `
                <div class="platform-label">${d.domain}</div>
                <div class="platform-bar violation-bar"><div class="platform-bar-fill violation-fill" style="width: ${(d.count / maxViol) * 100}%"></div></div>
                <div class="platform-count">${d.count}</div>
            `;
            violList.appendChild(row);
        });

        violContainer.appendChild(violList);
        container.appendChild(violContainer);
    }
}

function drawBarChart(canvas, data) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padding = { top: 10, right: 20, bottom: 30, left: 40 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const maxProblems = Math.max(...data.map(d => d.problems), 1);
    const maxViolations = Math.max(...data.map(d => d.violations), 1);
    const maxVal = Math.max(maxProblems, maxViolations);
    const barWidth = Math.min(chartW / data.length * 0.3, 20);
    const barGap = chartW / data.length;

    // Y-axis grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartH * (1 - i / 4));
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(maxVal * i / 4), padding.left - 8, y + 3);
    }

    // Bars — problems (gold) and violations (red) side by side
    data.forEach((d, i) => {
        const centerX = padding.left + i * barGap + barGap / 2;

        // Problems bar (left)
        const px = centerX - barWidth - 1;
        const pH = (d.problems / maxVal) * chartH;
        const py = padding.top + chartH - pH;

        const pGrad = ctx.createLinearGradient(px, py, px, py + pH);
        pGrad.addColorStop(0, 'rgba(196, 149, 106, 0.9)');
        pGrad.addColorStop(1, 'rgba(196, 149, 106, 0.4)');
        ctx.fillStyle = pGrad;
        ctx.beginPath();
        ctx.roundRect(px, py, barWidth, pH, [3, 3, 0, 0]);
        ctx.fill();

        // Violations bar (right)
        if (d.violations > 0) {
            const vx = centerX + 1;
            const vH = (d.violations / maxVal) * chartH;
            const vy = padding.top + chartH - vH;

            const vGrad = ctx.createLinearGradient(vx, vy, vx, vy + vH);
            vGrad.addColorStop(0, 'rgba(220, 80, 80, 0.9)');
            vGrad.addColorStop(1, 'rgba(220, 80, 80, 0.4)');
            ctx.fillStyle = vGrad;
            ctx.beginPath();
            ctx.roundRect(vx, vy, barWidth, vH, [3, 3, 0, 0]);
            ctx.fill();
        }

        // X-axis label
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        const label = d.month.substring(5);
        const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        ctx.fillText(monthNames[parseInt(label)] || label, centerX, h - padding.bottom + 16);
    });
}

// ─── Settings Panel ─────────────────────────────────────────────────────

async function openSettings() {
    const overlay = document.getElementById('settings-overlay');
    const content = document.getElementById('settings-content');
    overlay.classList.remove('hidden');

    try {
        const lcUsername = await invoke('get_setting', { key: 'leetcode_username' }) || '';
        const ccUsername = await invoke('get_setting', { key: 'codechef_username' }) || '';
        const blacklist = await invoke('get_blacklist');
        const diagnostics = await invoke('get_diagnostics');

        renderSettings(content, lcUsername, ccUsername, blacklist, diagnostics);
    } catch (e) {
        console.error('Settings error:', e);
        content.innerHTML = '<div class="empty-state"><div class="empty-state-text">Failed to load settings</div></div>';
    }
}

function renderSettings(container, lcUsername, ccUsername, blacklist, diagnostics) {
    container.innerHTML = '';

    // Usernames section
    const usernamesSection = document.createElement('div');
    usernamesSection.className = 'settings-section';
    usernamesSection.innerHTML = `
        <div class="settings-section-title">Profiles</div>
        <div class="settings-row">
            <label>LeetCode</label>
            <input type="text" id="settings-leetcode" value="${diagnostics.leetcode_username || ''}">
        </div>
        <div class="settings-row">
            <label>CodeChef</label>
            <input type="text" id="settings-codechef" value="${diagnostics.codechef_username || ''}">
        </div>
        <button class="settings-save-btn" data-action="saveUsernames">Save</button>
    `;
    container.appendChild(usernamesSection);

    // Blacklist section
    const blacklistSection = document.createElement('div');
    blacklistSection.className = 'settings-section';

    const blTitle = document.createElement('div');
    blTitle.className = 'settings-section-title';
    blTitle.textContent = 'Blacklisted Domains';
    blacklistSection.appendChild(blTitle);

    const tags = document.createElement('div');
    tags.className = 'blacklist-tags';
    tags.id = 'settings-blacklist-tags';
    blacklist.forEach(entry => {
        const tag = document.createElement('span');
        tag.className = 'blacklist-tag';
        tag.innerHTML = `${entry.domain} <button data-action="removeBlacklistEntry" data-id="${entry.id}">×</button>`;
        tags.appendChild(tag);
    });
    blacklistSection.appendChild(tags);

    const addRow = document.createElement('div');
    addRow.className = 'blacklist-add-row';
    addRow.innerHTML = `
        <input type="text" class="setup-input" id="settings-blacklist-input" placeholder="Add domain">
        <button class="setup-btn primary" data-action="addSettingsBlacklist" style="padding: 8px 16px;">Add</button>
    `;
    blacklistSection.appendChild(addRow);
    container.appendChild(blacklistSection);

    // Autostart section
    const autostartSection = document.createElement('div');
    autostartSection.className = 'settings-section';
    autostartSection.innerHTML = `
        <div class="settings-section-title">Startup</div>
        <div class="settings-row" style="justify-content: space-between; align-items: center;">
            <div>
                <label style="margin-bottom: 2px;">Launch on login</label>
                <div style="font-size: 11px; color: var(--text-tertiary);">Start Habit Calendar automatically when you log in</div>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" id="autostart-toggle" data-action="toggleAutostart">
                <span class="toggle-slider"></span>
            </label>
        </div>
    `;
    container.appendChild(autostartSection);

    // Check autostart status asynchronously
    invoke('plugin:autostart|is_enabled').then(enabled => {
        const toggle = document.getElementById('autostart-toggle');
        if (toggle) toggle.checked = enabled;
    }).catch(() => {});

    // Full Disk Access check (macOS only)
    invoke('check_full_disk_access').then(hasAccess => {
        if (!hasAccess) {
            const fdaWarning = document.createElement('div');
            fdaWarning.className = 'settings-section';
            fdaWarning.innerHTML = `
                <div class="settings-section-title" style="color: var(--red-violation);">⚠ Full Disk Access Required</div>
                <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.6;">
                    Habit Calendar needs Full Disk Access to scan browser history for blacklisted sites.<br>
                    <strong>Go to:</strong> System Settings → Privacy & Security → Full Disk Access → Enable "Habit Calendar"
                </div>
            `;
            container.insertBefore(fdaWarning, container.firstChild);
        }
    }).catch(() => {});

    // Data Management section
    const dataSection = document.createElement('div');
    dataSection.className = 'settings-section';
    dataSection.innerHTML = `
        <div class="settings-section-title">Data Management</div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="settings-action-btn" data-action="triggerResetAndBackfill" id="btn-reset-backfill">Force Sync (Backfill)</button>
        </div>
        <div id="reset-status" style="font-size: 12px; color: var(--text-tertiary); margin-top: 8px;"></div>
    `;
    container.appendChild(dataSection);

    // Diagnostics section
    const diagSection = document.createElement('div');
    diagSection.className = 'settings-section diagnostics-section';
    diagSection.innerHTML = `<div class="settings-section-title">Diagnostics</div>`;

    const syncList = document.createElement('div');
    syncList.className = 'sync-status-list';

    if (diagnostics.sync_statuses && diagnostics.sync_statuses.length > 0) {
        diagnostics.sync_statuses.forEach(s => {
            const item = document.createElement('div');
            item.className = 'sync-status-item';
            item.innerHTML = `
                <div class="sync-dot ${s.status}"></div>
                <div class="sync-source">${formatSyncSource(s.source)}</div>
                <div class="sync-time">${formatRelativeTime(s.timestamp)}</div>
            `;
            syncList.appendChild(item);
        });
    } else {
        syncList.innerHTML = '<div style="font-size: 12px; color: var(--text-tertiary); padding: 8px;">No sync activity yet. Data will appear after the first poll cycle.</div>';
    }

    diagSection.appendChild(syncList);

    // Server port info
    const portInfo = document.createElement('div');
    portInfo.style.cssText = 'font-size: 11px; color: var(--text-tertiary); margin-top: 12px; line-height: 1.5;';
    portInfo.innerHTML = `Extension server: 127.0.0.1:${diagnostics.server_port}<br>
    Local Wi-Fi IP (for Mobile Sync): <strong style="color: var(--text-primary)">${diagnostics.local_ip}:${diagnostics.server_port}</strong><br>
    DB: ${diagnostics.db_path}`;
    diagSection.appendChild(portInfo);

    container.appendChild(diagSection);
}

async function triggerResetAndBackfill() {
    const btn = document.getElementById('btn-reset-backfill');
    const status = document.getElementById('reset-status');
    btn.disabled = true;
    btn.textContent = 'Resetting...';
    status.textContent = 'Clearing data and backfilling from APIs...';

    try {
        const result = await invoke('reset_and_backfill');
        status.textContent = result;
        btn.textContent = 'Done ✓';
        btn.style.background = 'var(--green-complete)';
        // Refresh calendar data
        await loadMonthData();
        renderCalendar();
        renderMiniCalendar();
    } catch (e) {
        status.textContent = `Error: ${e}`;
        btn.textContent = 'Reset & Backfill (6 months)';
        btn.disabled = false;
    }
}

async function saveUsernames() {
    const lc = document.getElementById('settings-lc').value.trim();
    const cc = document.getElementById('settings-cc').value.trim();
    await invoke('save_setting', { key: 'leetcode_username', value: lc });
    await invoke('save_setting', { key: 'codechef_username', value: cc });

    // Visual feedback
    const btn = document.querySelector('.settings-save-btn');
    btn.textContent = 'Saved ✓';
    btn.style.background = 'var(--green-complete)';
    setTimeout(() => {
        btn.textContent = 'Save';
        btn.style.background = '';
    }, 1500);
}

async function removeBlacklistEntry(id) {
    await invoke('remove_blacklist_domain', { id });
    openSettings(); // refresh
}

async function addSettingsBlacklist() {
    const input = document.getElementById('settings-bl-input');
    const domain = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (domain) {
        await invoke('add_blacklist_domain', { domain, category: null });
        input.value = '';
        openSettings(); // refresh
    }
}

function formatSyncSource(source) {
    const map = {
        'leetcode_api': 'LeetCode',
        'codechef_scraper': 'CodeChef',
        'history_scan': 'History',
        'extension': 'Extension',
        'phone_sync': 'Phone',
    };
    return map[source] || source;
}

function formatRelativeTime(timestamp) {
    if (!timestamp) return 'Never';
    try {
        const d = new Date(timestamp + 'Z');
        const now = new Date();
        const diff = Math.floor((now - d) / 1000);

        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    } catch {
        return timestamp;
    }
}

async function toggleAutostart(enabled) {
    try {
        if (enabled) {
            await invoke('plugin:autostart|enable');
        } else {
            await invoke('plugin:autostart|disable');
        }
    } catch (e) {
        console.error('Autostart toggle failed:', e);
        // Revert the checkbox
        const toggle = document.getElementById('autostart-toggle');
        if (toggle) toggle.checked = !enabled;
    }
}

document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.getAttribute('data-action');
    if (action === 'saveUsernames') saveUsernames();
    if (action === 'addSettingsBlacklist') addSettingsBlacklist();
    if (action === 'triggerResetAndBackfill') triggerResetAndBackfill();
    if (action === 'removeBlacklistEntry') {
        const id = parseInt(target.getAttribute('data-id'), 10);
        removeBlacklistEntry(id);
    }
});

document.addEventListener('change', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    
    if (target.getAttribute('data-action') === 'toggleAutostart') {
        toggleAutostart(target.checked);
    }
});
