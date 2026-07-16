// ─── Day Detail Panel ───────────────────────────────────────────────────

async function openDayPanel(dateStr) {
    const panel = document.getElementById('day-panel');
    const panelDate = document.getElementById('panel-date');
    const panelContent = document.getElementById('panel-content');

    panelDate.textContent = formatDisplayDate(dateStr);
    panelContent.innerHTML = '<div class="empty-state"><div class="empty-state-text">Loading...</div></div>';
    panel.classList.remove('hidden');

    try {
        const detail = await invoke('get_day_detail', { date: dateStr });
        renderDayDetail(panelContent, detail);
    } catch (e) {
        console.error('Failed to load day detail:', e);
        panelContent.innerHTML = '<div class="empty-state"><div class="empty-state-text">Failed to load data</div></div>';
    }
}

function renderDayDetail(container, detail) {
    container.innerHTML = '';

    // ── Habits Section ──
    const habitsSection = document.createElement('div');
    habitsSection.className = 'panel-section';

    const habitsTitle = document.createElement('div');
    habitsTitle.className = 'panel-section-title';
    habitsTitle.textContent = 'Habits';
    habitsSection.appendChild(habitsTitle);

    if (detail.habits.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = '<div class="empty-state-icon">📅</div><div class="empty-state-text">No habits tracked for this day</div>';
        habitsSection.appendChild(empty);
    } else {
        detail.habits.forEach(habit => {
            const item = document.createElement('div');
            item.className = 'habit-item';

            // Icon
            const icon = document.createElement('div');
            icon.className = `habit-icon ${habit.status}`;
            icon.textContent = habit.status === 'completed' ? '✓' : '✕';
            item.appendChild(icon);

            // Info
            const info = document.createElement('div');
            info.className = 'habit-info';

            const name = document.createElement('div');
            name.className = 'habit-name';

            const nameText = document.createElement('span');
            nameText.textContent = habit.habit_name;
            name.appendChild(nameText);

            const platform = document.createElement('span');
            platform.className = 'habit-platform';
            platform.textContent = capitalize(habit.platform);
            name.appendChild(platform);

            info.appendChild(name);
            item.appendChild(info);
            habitsSection.appendChild(item);
        });
    }

    container.appendChild(habitsSection);

    // ── Violations Section (deduplicated set of domains) ──
    if (detail.violations.length > 0) {
        const violationsSection = document.createElement('div');
        violationsSection.className = 'panel-section';

        const violationsTitle = document.createElement('div');
        violationsTitle.className = 'panel-section-title';
        violationsTitle.textContent = `Blacklist Visits (${detail.violations.length})`;
        violationsSection.appendChild(violationsTitle);

        detail.violations.forEach(v => {
            const item = document.createElement('div');
            item.className = 'violation-item';

            const domainEl = document.createElement('div');
            domainEl.className = 'violation-domain';
            domainEl.textContent = v.domain;
            item.appendChild(domainEl);

            const timeEl = document.createElement('div');
            timeEl.className = 'violation-time';
            timeEl.textContent = formatTime(v.visit_time);
            if (v.visit_count > 1) {
                timeEl.textContent += ` (×${v.visit_count})`;
            }
            item.appendChild(timeEl);

            violationsSection.appendChild(item);
        });

        container.appendChild(violationsSection);
    }
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    try {
        const d = new Date(timestamp);
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch {
        return timestamp.substring(11, 16) || '';
    }
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
