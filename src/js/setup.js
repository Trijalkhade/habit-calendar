// ─── Setup Wizard ───────────────────────────────────────────────────────

const SETUP_STEPS = [
    { id: 'welcome', title: 'Welcome', subtitle: 'Step 1 of 5' },
    { id: 'usernames', title: 'Your Profiles', subtitle: 'Step 2 of 5' },
    { id: 'blacklist', title: 'Blacklist', subtitle: 'Step 3 of 5' },
    { id: 'backfill', title: 'History', subtitle: 'Step 4 of 5' },
    { id: 'extension', title: 'Browser Extension', subtitle: 'Step 5 of 5' },
];

let setupStep = 0;
let setupData = {
    leetcodeUsername: '',
    codechefUsername: '',
    blacklistDomains: [],
    backfillMonths: 0,
};

function showSetupWizard() {
    const overlay = document.getElementById('setup-overlay');
    overlay.classList.remove('hidden');

    // Load default blacklist
    invoke('get_blacklist').then(list => {
        setupData.blacklistDomains = list.map(e => e.domain);
        renderSetupStep();
    }).catch(() => {
        setupData.blacklistDomains = ['instagram.com', 'twitter.com', 'x.com', 'reddit.com', 'youtube.com',
            'facebook.com', 'netflix.com', 'tiktok.com', 'snapchat.com', 'twitch.tv'];
        renderSetupStep();
    });
}

function renderSetupStep() {
    const container = document.getElementById('setup-steps');
    const step = SETUP_STEPS[setupStep];
    container.innerHTML = '';

    const stepEl = document.createElement('div');
    stepEl.className = 'setup-step';

    switch (step.id) {
        case 'welcome':
            stepEl.innerHTML = `
                <div class="setup-step-header">
                    <div class="setup-step-number">${step.subtitle}</div>
                    <h2>Your Coding Calendar</h2>
                    <p>This app passively tracks your coding practice across LeetCode, CodeChef, and TakeUForward. It also monitors visits to sites you'd rather avoid.</p>
                    <p style="margin-top: 12px; color: var(--text-tertiary); font-size: 12px;">Everything stays on your machine. No cloud, no accounts, no sharing.</p>
                </div>
                <div class="setup-actions">
                    <div></div>
                    <button class="setup-btn primary" data-action="nextSetupStep">Get Started</button>
                </div>
            `;
            break;

        case 'usernames':
            stepEl.innerHTML = `
                <div class="setup-step-header">
                    <div class="setup-step-number">${step.subtitle}</div>
                    <h2>Your Profiles</h2>
                    <p>Enter your usernames so we can track your submissions.</p>
                </div>
                <div class="setup-form-group">
                    <label class="setup-label">LeetCode Username</label>
                    <input type="text" class="setup-input" id="setup-leetcode" placeholder="e.g., johndoe"
                        value="${setupData.leetcodeUsername}" oninput="setupData.leetcodeUsername = this.value">
                    <div class="validation-status" id="lc-validation"></div>
                </div>
                <div class="setup-form-group">
                    <label class="setup-label">CodeChef Username</label>
                    <input type="text" class="setup-input" id="setup-codechef" placeholder="e.g., johndoe"
                        value="${setupData.codechefUsername}" oninput="setupData.codechefUsername = this.value">
                    <div class="validation-status" id="cc-validation"></div>
                </div>
                <div class="setup-actions">
                    <button class="setup-btn secondary" data-action="prevSetupStep">Back</button>
                    <button class="setup-btn primary" data-action="validateAndNext">Continue</button>
                </div>
            `;

            // Auto-validate on blur
            setTimeout(() => {
                const lcInput = document.getElementById('setup-leetcode');
                const ccInput = document.getElementById('setup-codechef');
                if (lcInput) lcInput.addEventListener('blur', () => validateField('leetcode', lcInput.value));
                if (ccInput) ccInput.addEventListener('blur', () => validateField('codechef', ccInput.value));
            }, 100);
            break;

        case 'blacklist':
            stepEl.innerHTML = `
                <div class="setup-step-header">
                    <div class="setup-step-number">${step.subtitle}</div>
                    <h2>Blacklist</h2>
                    <p>Sites you want to track visits for. You can always change this later.</p>
                </div>
                <div class="blacklist-tags" id="setup-blacklist-tags"></div>
                <div class="blacklist-add-row">
                    <input type="text" class="setup-input" id="setup-blacklist-input" placeholder="Add domain (e.g., pinterest.com)">
                    <button class="setup-btn primary" data-action="addBlacklistDomain" style="padding: 8px 16px;">Add</button>
                </div>
                <div class="setup-actions">
                    <button class="setup-btn secondary" data-action="prevSetupStep">Back</button>
                    <button class="setup-btn primary" data-action="nextSetupStep">Continue</button>
                </div>
            `;

            setTimeout(() => {
                renderBlacklistTags();
                const input = document.getElementById('setup-blacklist-input');
                if (input) {
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') addBlacklistDomain();
                    });
                }
            }, 50);
            break;

        case 'backfill':
            stepEl.innerHTML = `
                <div class="setup-step-header">
                    <div class="setup-step-number">${step.subtitle}</div>
                    <h2>Import History</h2>
                    <p>Optionally pull your past submission history to pre-populate the calendar.</p>
                </div>
                <div class="backfill-options">
                    <div class="backfill-option ${setupData.backfillMonths === 0 ? 'selected' : ''}" data-action="selectBackfill" data-value="0">
                        <div style="font-weight: 600;">None</div>
                        <div style="font-size: 11px; color: var(--text-tertiary); margin-top: 4px;">Start fresh</div>
                    </div>
                    <div class="backfill-option ${setupData.backfillMonths === 6 ? 'selected' : ''}" data-action="selectBackfill" data-value="6">
                        <div style="font-weight: 600;">6 Months</div>
                        <div style="font-size: 11px; color: var(--text-tertiary); margin-top: 4px;">Recent history</div>
                    </div>
                    <div class="backfill-option ${setupData.backfillMonths === 12 ? 'selected' : ''}" data-action="selectBackfill" data-value="12">
                        <div style="font-weight: 600;">1 Year</div>
                        <div style="font-size: 11px; color: var(--text-tertiary); margin-top: 4px;">Past year</div>
                    </div>
                    <div class="backfill-option ${setupData.backfillMonths === 24 ? 'selected' : ''}" data-action="selectBackfill" data-value="24">
                        <div style="font-weight: 600;">2 Years</div>
                        <div style="font-size: 11px; color: var(--text-tertiary); margin-top: 4px;">Maximum</div>
                    </div>
                </div>
                <div class="setup-actions">
                    <button class="setup-btn secondary" data-action="prevSetupStep">Back</button>
                    <button class="setup-btn primary" data-action="nextSetupStep">Continue</button>
                </div>
            `;
            break;

        case 'extension':
            stepEl.innerHTML = `
                <div class="setup-step-header">
                    <div class="setup-step-number">${step.subtitle}</div>
                    <h2>Browser Extension</h2>
                    <p>Install the extension for real-time tracking of LeetCode submissions and TakeUForward progress. This is optional but recommended.</p>
                </div>
                <div style="background: var(--bg-card); border-radius: var(--radius-md); padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                    <div style="font-size: 13px; color: var(--text-secondary);">
                        <strong style="color: var(--text-primary);">How to install:</strong>
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.7;">
                        1. Open your browser's extension page<br>
                        &nbsp;&nbsp;&nbsp;&nbsp;Chrome/Brave/Edge: <code style="background: var(--bg-hover); padding: 2px 6px; border-radius: 3px;">chrome://extensions</code><br>
                        &nbsp;&nbsp;&nbsp;&nbsp;Firefox: <code style="background: var(--bg-hover); padding: 2px 6px; border-radius: 3px;">about:addons</code><br>
                        2. Enable "Developer mode" (toggle in top-right)<br>
                        3. Click "Load unpacked" and select the <code style="background: var(--bg-hover); padding: 2px 6px; border-radius: 3px;">extension/</code> folder<br>
                        4. The extension will connect automatically
                    </div>
                </div>
                <div style="font-size: 11px; color: var(--text-tertiary); text-align: center;">
                    You can do this later from Settings. The app works without the extension too.
                </div>
                <div class="setup-actions">
                    <button class="setup-btn secondary" data-action="prevSetupStep">Back</button>
                    <button class="setup-btn primary" data-action="finishSetup">Finish Setup</button>
                </div>
            `;
            break;
    }

    // Progress dots
    const progress = document.createElement('div');
    progress.className = 'setup-progress';
    SETUP_STEPS.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.className = 'progress-dot';
        if (i === setupStep) dot.classList.add('active');
        if (i < setupStep) dot.classList.add('completed');
        progress.appendChild(dot);
    });

    container.appendChild(stepEl);
    container.appendChild(progress);
}

function nextSetupStep() {
    if (setupStep < SETUP_STEPS.length - 1) {
        setupStep++;
        renderSetupStep();
    }
}

function prevSetupStep() {
    if (setupStep > 0) {
        setupStep--;
        renderSetupStep();
    }
}

function selectBackfill(months) {
    setupData.backfillMonths = months;
    renderSetupStep();
}

async function validateField(platform, username) {
    if (!username.trim()) return;

    const statusEl = document.getElementById(platform === 'leetcode' ? 'lc-validation' : 'cc-validation');
    const inputEl = document.getElementById(platform === 'leetcode' ? 'setup-leetcode' : 'setup-codechef');

    statusEl.className = 'validation-status checking';
    statusEl.innerHTML = '<div class="spinner" style="width:14px;height:14px;border:2px solid var(--text-tertiary);border-top-color:var(--text-primary);border-radius:50%;animation:spin 1s linear infinite;"></div><style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>';

    try {
        const valid = await invoke('validate_username', { platform, username: username.trim() });
        if (valid) {
            statusEl.className = 'validation-status valid';
            statusEl.innerHTML = '<span style="color:var(--green-complete);font-weight:bold;">✓</span>';
            inputEl.classList.add('valid');
            inputEl.classList.remove('invalid');
        } else {
            statusEl.className = 'validation-status invalid';
            statusEl.innerHTML = '<span style="color:var(--red-violation);font-weight:bold;">✕</span>';
            inputEl.classList.add('invalid');
            inputEl.classList.remove('valid');
        }
    } catch (e) {
        statusEl.className = 'validation-status';
        statusEl.innerHTML = '<span style="color:var(--text-tertiary);font-weight:bold;">✕</span>';
        inputEl.classList.remove('valid', 'invalid');
    }
}

async function validateAndNext() {
    // Save whatever they entered, even if not validated
    setupData.leetcodeUsername = document.getElementById('setup-leetcode')?.value?.trim() || '';
    setupData.codechefUsername = document.getElementById('setup-codechef')?.value?.trim() || '';
    nextSetupStep();
}

function renderBlacklistTags() {
    const container = document.getElementById('setup-blacklist-tags');
    if (!container) return;
    container.innerHTML = '';

    setupData.blacklistDomains.forEach((domain, i) => {
        const tag = document.createElement('span');
        tag.className = 'blacklist-tag';
        tag.innerHTML = `${domain} <button data-action="removeSetupBlacklist" data-index="${i}">×</button>`;
        container.appendChild(tag);
    });
}

function addBlacklistDomain() {
    const input = document.getElementById('setup-blacklist-input');
    const domain = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (domain && !setupData.blacklistDomains.includes(domain)) {
        setupData.blacklistDomains.push(domain);
        input.value = '';
        renderBlacklistTags();
    }
}

function removeSetupBlacklist(index) {
    setupData.blacklistDomains.splice(index, 1);
    renderBlacklistTags();
}

async function finishSetup() {
    try {
        // Save usernames
        if (setupData.leetcodeUsername) {
            await invoke('save_setting', { key: 'leetcode_username', value: setupData.leetcodeUsername });
        }
        if (setupData.codechefUsername) {
            await invoke('save_setting', { key: 'codechef_username', value: setupData.codechefUsername });
        }

        // Save blacklist (clear and re-add)
        const currentBlacklist = await invoke('get_blacklist');
        for (const entry of currentBlacklist) {
            await invoke('remove_blacklist_domain', { id: entry.id });
        }
        for (const domain of setupData.blacklistDomains) {
            await invoke('add_blacklist_domain', { domain, category: null });
        }

        // Run backfill if requested
        if (setupData.backfillMonths > 0) {
            if (setupData.leetcodeUsername) {
                await invoke('run_backfill', { platform: 'leetcode', months: setupData.backfillMonths });
            }
            if (setupData.codechefUsername) {
                await invoke('run_backfill', { platform: 'codechef', months: setupData.backfillMonths });
            }
        }

        // Mark setup as complete
        await invoke('save_setting', { key: 'setup_complete', value: 'true' });

        // Enable autostart so the app launches on boot
        try {
            await invoke('plugin:autostart|enable');
        } catch (e) {
            console.warn('Could not enable autostart:', e);
        }

        // Hide wizard and init app
        document.getElementById('setup-overlay').classList.add('hidden');
        initApp();
    } catch (e) {
        console.error('Setup error:', e);
        // Still try to init the app
        document.getElementById('setup-overlay').classList.add('hidden');
        initApp();
    }
}

// Global click handler for setup wizard to replace inline onclick
document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.getAttribute('data-action');
    if (action === 'nextSetupStep') nextSetupStep();
    if (action === 'prevSetupStep') prevSetupStep();
    if (action === 'validateAndNext') validateAndNext();
    if (action === 'addBlacklistDomain') addBlacklistDomain();
    if (action === 'finishSetup') finishSetup();
    if (action === 'selectBackfill') {
        const val = parseInt(target.getAttribute('data-value'), 10);
        selectBackfill(val);
    }
    if (action === 'removeSetupBlacklist') {
        const idx = parseInt(target.getAttribute('data-index'), 10);
        removeSetupBlacklist(idx);
    }
});
