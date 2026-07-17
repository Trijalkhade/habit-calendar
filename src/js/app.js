// ─── App State & Initialization ─────────────────────────────────────────
const { invoke } = window.__TAURI__.core;

const state = {
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
    selectedDate: null,
    currentView: 'month',
    monthData: [],
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// ─── Boot ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const setupComplete = await invoke('is_setup_complete');
        if (!setupComplete) {
            showSetupWizard();
        } else {
            initApp();
        }
    } catch (e) {
        console.error('Failed to check setup status:', e);
        initApp(); // fallback: show calendar anyway
    }
});

async function initApp() {
    bindNavigation();
    bindOverlays();
    await loadMonthData();
    renderCalendar();
    renderMiniCalendar();
    updateHeaderLabel();

    // Listen for real-time data updates from the daemon (instant UI refresh)
    try {
        const { listen } = window.__TAURI__.event;
        let refreshTimeout = null;
        await listen('data-updated', async (event) => {
            // Debounce: max 1 refresh per 2 seconds during bulk imports
            if (refreshTimeout) clearTimeout(refreshTimeout);
            refreshTimeout = setTimeout(async () => {
                await loadMonthData();
                renderCalendar();
                renderMiniCalendar();
            }, 2000);
        });
    } catch (e) {
        console.warn('Could not set up event listener:', e);
    }

    // Refresh data every 5 minutes as fallback
    setInterval(async () => {
        await loadMonthData();
        renderCalendar();
        renderMiniCalendar();
    }, 5 * 60 * 1000);
}

// ─── Data Loading ────────────────────────────────────────────────────────
async function loadMonthData() {
    try {
        state.monthData = await invoke('get_month_data', {
            year: state.currentYear,
            month: state.currentMonth
        });
    } catch (e) {
        console.error('Failed to load month data:', e);
        state.monthData = [];
    }
}

// ─── Navigation ──────────────────────────────────────────────────────────
function bindNavigation() {
    document.getElementById('btn-prev').addEventListener('click', () => navigateMonth(-1));
    document.getElementById('btn-next').addEventListener('click', () => navigateMonth(1));
    document.getElementById('btn-today').addEventListener('click', goToToday);

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === 'ArrowLeft') navigateMonth(-1);
        if (e.key === 'ArrowRight') navigateMonth(1);
        if (e.key === 'Escape') closeAllPanels();
    });

    // View switching
    document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
}

async function navigateMonth(delta) {
    state.currentMonth += delta;
    if (state.currentMonth > 12) { state.currentMonth = 1; state.currentYear++; }
    if (state.currentMonth < 1) { state.currentMonth = 12; state.currentYear--; }

    await loadMonthData();
    renderCalendar();
    renderMiniCalendar();
    updateHeaderLabel();
}

function goToToday() {
    const now = new Date();
    state.currentYear = now.getFullYear();
    state.currentMonth = now.getMonth() + 1;
    loadMonthData().then(() => {
        renderCalendar();
        renderMiniCalendar();
        updateHeaderLabel();
    });
}

function switchView(view) {
    state.currentView = view;

    document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    const calendarView = document.getElementById('calendar-view');
    const yearView = document.getElementById('year-view');

    if (view === 'year') {
        calendarView.classList.add('hidden');
        yearView.classList.remove('hidden');
        renderYearView();
    } else {
        calendarView.classList.remove('hidden');
        yearView.classList.add('hidden');
        renderCalendar();
    }
}

function updateHeaderLabel() {
    const label = document.getElementById('current-month-label');
    label.textContent = `${MONTHS[state.currentMonth - 1]} ${state.currentYear}`;
}

// ─── Overlays ────────────────────────────────────────────────────────────
function bindOverlays() {
    // Dashboard
    document.getElementById('btn-dashboard').addEventListener('click', openDashboard);
    document.getElementById('dashboard-close').addEventListener('click', () => {
        document.getElementById('dashboard-overlay').classList.add('hidden');
    });

    // Settings
    document.getElementById('btn-settings').addEventListener('click', openSettings);
    document.getElementById('settings-close').addEventListener('click', () => {
        document.getElementById('settings-overlay').classList.add('hidden');
    });

    // Devices
    document.getElementById('btn-devices').addEventListener('click', openDevicesPanel);
    document.getElementById('devices-close').addEventListener('click', () => {
        document.getElementById('devices-overlay').classList.add('hidden');
    });

    // Day panel close
    document.getElementById('panel-close').addEventListener('click', closeDayPanel);

    // Close overlays on backdrop click
    ['dashboard-overlay', 'settings-overlay', 'devices-overlay'].forEach(id => {
        document.getElementById(id).addEventListener('click', (e) => {
            if (e.target.id === id) e.target.classList.add('hidden');
        });
    });
}

function closeAllPanels() {
    closeDayPanel();
    document.getElementById('dashboard-overlay').classList.add('hidden');
    document.getElementById('settings-overlay').classList.add('hidden');
    document.getElementById('devices-overlay').classList.add('hidden');
}

function closeDayPanel() {
    document.getElementById('day-panel').classList.add('hidden');
    state.selectedDate = null;
    renderCalendar(); // remove selection highlight
}

// ─── Utility ─────────────────────────────────────────────────────────────
function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
    return new Date(year, month - 1, 1).getDay();
}

function formatDate(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isToday(dateStr) {
    const now = new Date();
    return dateStr === formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function formatDisplayDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
    return d.toLocaleDateString('en-US', options);
}
