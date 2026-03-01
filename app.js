document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupNavigation();
    initApp();
});

// ═══════════════════════════════════════════════
// SIMULATION MODE
// ═══════════════════════════════════════════════
const OriginalDate = window.Date;
let isSimulationActive = false;
let simulationStartTimeReal = 0;
let simulationTimeOffset = 0;
const SIMULATION_SPEED = 1000;

class SimulatedDate extends OriginalDate {
    constructor(...args) {
        if (args.length > 0) {
            super(...args);
        } else {
            super(SimulatedDate.now());
        }
    }
    static now() {
        let currentOffset = simulationTimeOffset;
        if (isSimulationActive) {
            const elapsed = OriginalDate.now() - simulationStartTimeReal;
            currentOffset += elapsed * (SIMULATION_SPEED - 1);
        }
        return OriginalDate.now() + currentOffset;
    }
}
// Permanently override Date so time jumps are kept
window.Date = SimulatedDate;

function toggleSimulation() {
    isSimulationActive = !isSimulationActive;
    const btn = document.getElementById('simulation-toggle-btn');

    if (isSimulationActive) {
        simulationStartTimeReal = OriginalDate.now();
        btn.classList.add('active');
        document.body.classList.add('simulation-active');
    } else {
        const elapsed = OriginalDate.now() - simulationStartTimeReal;
        simulationTimeOffset += elapsed * (SIMULATION_SPEED - 1);
        btn.classList.remove('active');
        document.body.classList.remove('simulation-active');
    }

    if (state.isRunning) startTimerVisuals();
}

// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
let state = {
    isRunning: false,
    startTime: null,
    totalWorkedToday: 0,
    extraMinutes: 0,
    hourlyRate: 15.0,
    devMode: false,
    history: []
};

let timerInterval = null;
const WORK_GOAL_MS = 8 * 60 * 60 * 1000;
const PAUSE_MS = 45 * 60 * 1000;
const RING_CIRC = 421.1; // 2*pi*67
let chartInstance = null;
let chartMode = 'duration';

// ═══════════════════════════════════════════════
// NRW FEIERTAGE
// ═══════════════════════════════════════════════

function getEasterSunday(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
}

function getNRWHolidays(year) {
    const holidays = new Map();
    const add = (date, name) => holidays.set(date.toISOString().split('T')[0], name);
    const off = (base, days) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };

    add(new Date(year, 0, 1), 'Neujahr');
    add(new Date(year, 4, 1), 'Tag der Arbeit');
    add(new Date(year, 9, 3), 'Tag der Deutschen Einheit');
    add(new Date(year, 10, 1), 'Allerheiligen');
    add(new Date(year, 11, 25), '1. Weihnachtstag');
    add(new Date(year, 11, 26), '2. Weihnachtstag');

    const easter = getEasterSunday(year);
    add(off(easter, -2), 'Karfreitag');
    add(off(easter, 0), 'Ostersonntag');
    add(off(easter, 1), 'Ostermontag');
    add(off(easter, 39), 'Christi Himmelfahrt');
    add(off(easter, 49), 'Pfingstsonntag');
    add(off(easter, 50), 'Pfingstmontag');
    add(off(easter, 60), 'Fronleichnam');

    return holidays;
}

function isNRWHoliday(date) {
    const key = date.toISOString().split('T')[0];
    return getNRWHolidays(date.getFullYear()).get(key) || null;
}

// ═══════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════

function initApp() {
    loadState();
    setupEventListeners();
    updateUI();
    renderHistory();
    renderChart();
}

function loadState() {
    const saved = localStorage.getItem('timeTrackerState');
    if (saved) {
        const p = JSON.parse(saved);
        state.isRunning = p.isRunning || false;
        state.startTime = p.startTime ? new Date(p.startTime) : null;
        state.totalWorkedToday = p.totalWorkedToday || 0;
        state.extraMinutes = p.extraMinutes || 0;
        state.hourlyRate = p.hourlyRate || 15.0;
        state.devMode = p.devMode || false;
        state.history = p.history || [];
        checkNewDay();
        if (state.isRunning) startTimerVisuals();
    }
    document.getElementById('hourly-rate').value = state.hourlyRate;
    document.getElementById('theme-toggle').checked = document.body.classList.contains('dark-mode');
    document.getElementById('dev-mode-toggle').checked = state.devMode;
    document.getElementById('simulation-toggle-btn').style.display = state.devMode ? 'flex' : 'none';
}

function saveState() {
    localStorage.setItem('timeTrackerState', JSON.stringify(state));
}

function checkNewDay() {
    if (state.history.length > 0) {
        const today = new Date().toDateString();
        const lastDate = new Date(state.history[0].date).toDateString();
        if (today !== lastDate && !state.isRunning) {
            state.totalWorkedToday = 0;
            state.extraMinutes = 0;
            saveState();
        }
    }
}

function initTheme() {
    const saved = localStorage.getItem('theme');
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && dark)) {
        document.body.classList.add('dark-mode');
        document.body.classList.remove('light-mode');
    } else {
        document.body.classList.add('light-mode');
        document.body.classList.remove('dark-mode');
    }
}

// ═══════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════

function setupEventListeners() {
    document.getElementById('simulation-toggle-btn').addEventListener('click', toggleSimulation);
    document.getElementById('main-action-btn').addEventListener('click', handleMainAction);
    document.getElementById('btn-add-15').addEventListener('click', () => addExtraTime(15));
    document.getElementById('btn-add-30').addEventListener('click', () => addExtraTime(30));
    document.getElementById('btn-reset-motivation-time').addEventListener('click', resetMotivation);
    document.getElementById('btn-add-5eur').addEventListener('click', () => addExtraMoney(5));
    document.getElementById('btn-add-10eur').addEventListener('click', () => addExtraMoney(10));
    document.getElementById('btn-reset-motivation-money').addEventListener('click', resetMotivation);

    document.getElementById('toggle-time').addEventListener('click', () => {
        document.getElementById('toggle-time').classList.add('active');
        document.getElementById('toggle-money').classList.remove('active');
        document.getElementById('motivation-time-btns').style.display = 'flex';
        document.getElementById('motivation-money-btns').style.display = 'none';
    });
    document.getElementById('toggle-money').addEventListener('click', () => {
        document.getElementById('toggle-money').classList.add('active');
        document.getElementById('toggle-time').classList.remove('active');
        document.getElementById('motivation-money-btns').style.display = 'flex';
        document.getElementById('motivation-time-btns').style.display = 'none';
    });

    document.getElementById('chart-mode-duration').addEventListener('click', () => {
        chartMode = 'duration';
        document.getElementById('chart-mode-duration').classList.add('active');
        document.getElementById('chart-mode-trend').classList.remove('active');
        document.getElementById('chart-legend-duration').style.display = 'inline-flex';
        document.getElementById('chart-legend-trend').style.display = 'none';
        renderChart();
    });
    document.getElementById('chart-mode-trend').addEventListener('click', () => {
        chartMode = 'trend';
        document.getElementById('chart-mode-trend').classList.add('active');
        document.getElementById('chart-mode-duration').classList.remove('active');
        document.getElementById('chart-legend-duration').style.display = 'none';
        document.getElementById('chart-legend-trend').style.display = 'inline-flex';
        renderChart();
    });

    // Dropdown
    const menuBtn = document.getElementById('header-menu-btn');
    const dropdown = document.getElementById('header-dropdown');
    const dropOverlay = document.getElementById('dropdown-overlay');
    const arrowIcon = menuBtn.querySelector('.menu-arrow-icon');

    function openDropdown() {
        dropdown.classList.add('open');
        dropOverlay.style.display = 'block';
        arrowIcon.style.transform = 'rotate(180deg)';
    }
    function closeDropdown() {
        dropdown.classList.remove('open');
        dropOverlay.style.display = 'none';
        arrowIcon.style.transform = '';
    }
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.contains('open') ? closeDropdown() : openDropdown();
    });
    dropOverlay.addEventListener('click', closeDropdown);

    document.getElementById('dropdown-vacation-btn').addEventListener('click', () => {
        closeDropdown();
        showVacationDialog();
    });

    // Vacation modal
    document.getElementById('vacation-cancel-btn').addEventListener('click', hideVacationDialog);
    document.getElementById('modal-backdrop').addEventListener('click', hideVacationDialog);
    document.getElementById('vacation-confirm-btn').addEventListener('click', confirmVacationEntry);
    document.getElementById('vacation-date').addEventListener('change', onVacationDateChange);

    // Settings
    document.getElementById('theme-toggle').addEventListener('change', (e) => {
        if (e.target.checked) {
            document.body.classList.add('dark-mode');
            document.body.classList.remove('light-mode');
            localStorage.setItem('theme', 'dark');
        } else {
            document.body.classList.add('light-mode');
            document.body.classList.remove('dark-mode');
            localStorage.setItem('theme', 'light');
        }
        if (chartInstance) renderChart();
    });
    document.getElementById('dev-mode-toggle').addEventListener('change', (e) => {
        state.devMode = e.target.checked;
        saveState();
        document.getElementById('simulation-toggle-btn').style.display = state.devMode ? 'flex' : 'none';
        if (!state.devMode && isSimulationActive) {
            toggleSimulation(); // Turn it off if development mode is disabled
        }
    });
    document.getElementById('hourly-rate').addEventListener('change', (e) => {
        state.hourlyRate = parseFloat(e.target.value) || 0;
        saveState();
        updateMotivationUI();
    });
    document.getElementById('export-btn').addEventListener('click', exportCSV);
    document.getElementById('reset-btn').addEventListener('click', () => {
        if (confirm('Alle Daten unwiderruflich löschen?')) {
            localStorage.removeItem('timeTrackerState');
            location.reload();
        }
    });
}

// ═══════════════════════════════════════════════
// VACATION DIALOG
// ═══════════════════════════════════════════════

function showVacationDialog() {
    const modal = document.getElementById('vacation-modal');
    const backdrop = document.getElementById('modal-backdrop');
    const dateField = document.getElementById('vacation-date');
    dateField.value = new Date().toISOString().split('T')[0];
    onVacationDateChange();
    modal.style.display = 'flex';
    modal.classList.add('show');
    backdrop.style.display = 'block';
}

function hideVacationDialog() {
    document.getElementById('vacation-modal').style.display = 'none';
    document.getElementById('vacation-modal').classList.remove('show');
    document.getElementById('modal-backdrop').style.display = 'none';
}

function onVacationDateChange() {
    const val = document.getElementById('vacation-date').value;
    const badge = document.getElementById('holiday-detected-badge');
    const badgeName = document.getElementById('holiday-detected-name');
    const holidayRadio = document.querySelector('input[name="vacation-type"][value="holiday"]');
    const vacationRadio = document.querySelector('input[name="vacation-type"][value="vacation"]');

    if (!val) { badge.style.display = 'none'; return; }

    const [y, m, d] = val.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const holidayName = isNRWHoliday(date);

    if (holidayName) {
        badge.style.display = 'flex';
        badgeName.textContent = `NRW-Feiertag erkannt: ${holidayName}`;
        holidayRadio.checked = true;
    } else {
        badge.style.display = 'none';
        vacationRadio.checked = true;
    }
}

function confirmVacationEntry() {
    const val = document.getElementById('vacation-date').value;
    if (!val) { alert('Bitte wähle ein Datum.'); return; }

    const [y, m, d] = val.split('-').map(Number);
    const selected = new Date(y, m - 1, d);
    const holidayName = isNRWHoliday(selected);
    const typeValue = document.querySelector('input[name="vacation-type"]:checked').value;
    const entryType = holidayName ? 'holiday' : typeValue;
    const entryLabel = holidayName || (typeValue === 'vacation' ? 'Urlaub' : 'Feiertag');

    const eightH = 8 * 60 * 60 * 1000;
    const newEntry = {
        date: selected.toISOString(),
        grossTimeMs: eightH + PAUSE_MS,
        netTimeMs: eightH,
        extraMinutes: 0,
        type: entryType,
        label: entryLabel
    };

    const selectedStr = selected.toDateString();
    const idx = state.history.findIndex(e => new Date(e.date).toDateString() === selectedStr);
    if (idx >= 0) {
        state.history[idx] = newEntry;
    } else {
        state.history.unshift(newEntry);
        state.history.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    if (selectedStr === new Date().toDateString()) {
        state.totalWorkedToday = newEntry.grossTimeMs;
    }
    if (state.history.length > 30) state.history.pop();

    saveState();
    hideVacationDialog();
    updateUI();
    renderHistory();
    renderChart();
}

// ═══════════════════════════════════════════════
// CORE LOGIC
// ═══════════════════════════════════════════════

function handleMainAction() {
    if (!state.isRunning) {
        state.isRunning = true;
        state.startTime = new Date();
        checkNewDay();
        saveState();
        startTimerVisuals();
    } else {
        const now = new Date();
        state.totalWorkedToday += now.getTime() - new Date(state.startTime).getTime();
        state.isRunning = false;
        saveDailyEntry();
        state.startTime = null;
        saveState();
        stopTimerVisuals();
        renderHistory();
        renderChart();
    }
    updateUI();
}

function startTimerVisuals() {
    if (timerInterval) clearInterval(timerInterval);
    const interval = isSimulationActive ? 100 : 1000;
    timerInterval = setInterval(updateTimerDisplay, interval);
}

function stopTimerVisuals() {
    if (timerInterval) clearInterval(timerInterval);
    updateTimerDisplay();
}

function addExtraTime(minutes) {
    state.extraMinutes += minutes;
    saveState(); updateMotivationUI(); updateTimerDisplay();
}

function addExtraMoney(amount) {
    if (state.hourlyRate > 0) {
        state.extraMinutes += amount / (state.hourlyRate / 60);
        saveState(); updateMotivationUI(); updateTimerDisplay();
    } else {
        alert('Bitte erst Stundenlohn in Einstellungen hinterlegen.');
    }
}

// ═══════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════

function saveDailyEntry() {
    const today = new Date().toDateString();
    const idx = state.history.findIndex(e => new Date(e.date).toDateString() === today);
    const netTime = Math.max(0, state.totalWorkedToday - PAUSE_MS);
    const now = new Date();

    let entryStartTime = state.startTime ? state.startTime.toISOString() : now.toISOString();
    let entryEndTime = now.toISOString();

    if (idx >= 0 && state.history[idx].startTime) {
        entryStartTime = state.history[idx].startTime;
    }

    const entry = {
        date: now.toISOString(),
        grossTimeMs: state.totalWorkedToday,
        netTimeMs: netTime,
        extraMinutes: state.extraMinutes,
        type: 'work',
        label: null,
        startTime: entryStartTime,
        endTime: entryEndTime
    };

    if (idx >= 0) {
        // Preserve vacation/holiday type if set
        if (state.history[idx].type !== 'work') {
            entry.type = state.history[idx].type;
            entry.label = state.history[idx].label;
            entry.startTime = state.history[idx].startTime;
            entry.endTime = state.history[idx].endTime;
        }
        state.history[idx] = entry;
    } else {
        state.history.unshift(entry);
    }
    if (state.history.length > 30) state.history.pop();
}

// ═══════════════════════════════════════════════
// UI UPDATES
// ═══════════════════════════════════════════════

function updateUI() {
    const btn = document.getElementById('main-action-btn');
    const icon = document.getElementById('main-action-icon');
    const statusText = document.getElementById('timer-status');
    const endCard = document.getElementById('end-time-card');

    if (state.isRunning) {
        btn.classList.replace('btn-primary', 'btn-danger');
        icon.innerText = 'stop';
        statusText.innerText = 'Arbeitet...';
        statusText.className = 'text-primary';
        endCard.style.display = 'flex';
    } else {
        btn.classList.replace('btn-danger', 'btn-primary');
        icon.innerText = 'play_arrow';
        statusText.innerText = 'Pausiert / Bereit';
        statusText.className = 'text-secondary';
        endCard.style.display = 'none';
    }

    updateTimerDisplay();
    updateMotivationUI();
    updateEarningsUI();
}

function updateTimerDisplay() {
    let sessionMs = 0;
    if (state.isRunning && state.startTime) {
        sessionMs = Date.now() - new Date(state.startTime).getTime();
    }
    const totalGrossMs = state.totalWorkedToday + sessionMs;
    document.getElementById('current-time').innerText = formatMsToHMS(totalGrossMs);

    const netMs = Math.max(0, totalGrossMs - PAUSE_MS);

    // ── Main progress ring (0–8h gross work) ──
    const goalMs = WORK_GOAL_MS + PAUSE_MS + (state.extraMinutes * 60000);
    const pct = Math.min((totalGrossMs / goalMs) * 100, 100);
    document.querySelector('.progress-ring__circle').style.strokeDashoffset =
        RING_CIRC - (pct / 100) * RING_CIRC;

    // ── Overtime ring (0–2h net overtime after 8h net) ──
    const OT_CIRC = 471.2; // 2*pi*75
    const OT_MAX_H = 2;
    const otMs = Math.max(0, netMs - WORK_GOAL_MS);
    const otPct = Math.min(otMs / (OT_MAX_H * 3600000), 1);
    const otRing = document.querySelector('.progress-ring__ot');
    const svgContainer = document.querySelector('.progress-ring-container');
    if (otRing) {
        otRing.style.strokeDashoffset = OT_CIRC - otPct * OT_CIRC;
    }
    if (svgContainer) {
        svgContainer.classList.toggle('ot-active', otMs > 0);
    }

    // ── Feierabend card ──
    if (state.isRunning && state.startTime) {
        const needed = goalMs - state.totalWorkedToday;
        const endTime = new Date(new Date(state.startTime).getTime() + needed);
        const fmt = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} Uhr`;
        document.getElementById('target-end-time').innerText = fmt(endTime);

        // Daily progress % (avoids duplicate € display)
        const dayPct = Math.min(Math.round((netMs / WORK_GOAL_MS) * 100), 100);
        const dayPctEl = document.getElementById('feierabend-day-pct');
        if (dayPctEl) dayPctEl.innerText = `${dayPct}%`;

        // Progress bar inside feierabend card
        const barFill = document.getElementById('feierabend-bar-fill');
        const barLabel = document.getElementById('feierabend-bar-label');
        if (barFill) barFill.style.width = `${dayPct}%`;
        if (barLabel) barLabel.innerText = `${dayPct}%`;

        // Extra time row (extended Feierabend)
        const extraMs = state.extraMinutes * 60000;
        const extendedEndTime = new Date(endTime.getTime() + extraMs);
        const extMins = document.getElementById('feierabend-extra-mins');
        const extTime = document.getElementById('feierabend-extra-time');
        if (extMins) extMins.innerText = state.extraMinutes;
        if (extTime) extTime.innerText = state.extraMinutes > 0 ? fmt(extendedEndTime) : fmt(endTime);
    }

    updateEarningsUI(netMs);
}


function updateMotivationUI() {
    const extra = (state.extraMinutes / 60) * state.hourlyRate;
    document.getElementById('extra-money').innerText = extra.toFixed(2).replace('.', ',');
    const show = state.extraMinutes > 0 ? 'inline-flex' : 'none';
    document.getElementById('btn-reset-motivation-time').style.display = show;
    document.getElementById('btn-reset-motivation-money').style.display = show;
}

function resetMotivation() {
    state.extraMinutes = 0;
    saveState();
    updateUI();
}

function updateEarningsUI(currentNetMs = null) {
    if (currentNetMs === null) {
        let sessMs = 0;
        if (state.isRunning && state.startTime) sessMs = Date.now() - new Date(state.startTime).getTime();
        currentNetMs = Math.max(0, state.totalWorkedToday + sessMs - PAUSE_MS);
    }

    const earned = (currentNetMs / 3600000) * state.hourlyRate;
    const earnedStr = `${earned.toFixed(2).replace('.', ',')} €`;

    // Today's earnings card
    const todayEl = document.getElementById('earned-today');
    if (todayEl) todayEl.innerText = earnedStr;

    // Monthly earnings card
    const now = new Date();
    const cMonth = now.getMonth(), cYear = now.getFullYear(), todayStr = now.toDateString();
    let monthMs = currentNetMs;
    state.history.forEach(e => {
        const d = new Date(e.date);
        if (d.getMonth() === cMonth && d.getFullYear() === cYear && d.toDateString() !== todayStr)
            monthMs += e.netTimeMs;
    });
    document.getElementById('earned-month').innerText =
        `${((monthMs / 3600000) * state.hourlyRate).toFixed(2).replace('.', ',')} €`;

    updateWeeklyProgressUI(currentNetMs);
}

// ═══════════════════════════════════════════════
// WEEKLY PROGRESS – Single overlay bar
// ═══════════════════════════════════════════════

function updateWeeklyProgressUI(netTodayMs) {
    const now = new Date();

    // Get Monday of the current week
    let dow = now.getDay();
    if (dow === 0) dow = 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - dow + 1);
    monday.setHours(0, 0, 0, 0);

    // Sum history for this week (excluding today – covered by live netTodayMs)
    const todayStr = now.toDateString();
    let totalNetWeekMs = netTodayMs;
    state.history.forEach(e => {
        const d = new Date(e.date);
        if (d >= monday && d.toDateString() !== todayStr) totalNetWeekMs += e.netTimeMs;
    });

    const actualH = totalNetWeekMs / 3600000;
    const targetH = 40;
    const maxH = 50;

    const actualPct = Math.min((actualH / maxH) * 100, 100);
    const expectedPct = (targetH / maxH) * 100; // 80%

    const fmtH = h => `${h.toFixed(1).replace('.', ',')}h`;

    // Header text
    document.getElementById('weekly-progress-text').innerText =
        `${fmtH(actualH)} / ${targetH}h`;

    // Sub-labels
    document.getElementById('week-ist-label').innerText = `Ist: ${fmtH(actualH)}`;
    document.getElementById('week-soll-label').innerText = `Ziel: ${targetH}h`;

    // Soll notch position (always at 40h out of 50h = 80%)
    const notch = document.getElementById('week-soll-notch');
    if (notch) {
        notch.style.left = `${expectedPct}%`;
        notch.style.opacity = '1';
    }

    const fill = document.getElementById('week-bar-fill');
    const diffTxt = document.getElementById('week-diff-text');
    const diffIco = document.getElementById('week-diff-icon');
    const chip = document.getElementById('week-diff-chip');

    // Always positive, light blue gradient filling left to right
    if (fill) {
        fill.style.width = `${actualPct}%`;
        fill.style.left = '0';
        fill.style.background = 'linear-gradient(90deg, #8ab4f8, #1a73e8)';
    }

    if (actualH >= targetH) {
        diffTxt.innerText = `Wochenziel erreicht! 🎉`;
        diffIco.innerText = 'emoji_events';
        chip.style.background = 'rgba(56,142,60,0.12)';
        chip.style.color = '#2e7d32'; // green when achieved
    } else {
        diffTxt.innerText = `Auf gutem Weg`;
        diffIco.innerText = 'trending_up';
        chip.style.background = 'rgba(26,115,232,0.10)';
        chip.style.color = 'var(--primary-color)'; // blue when in progress
    }
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

function formatMsToHMS(ms) {
    const s = Math.floor((ms / 1000) % 60);
    const m = Math.floor((ms / 60000) % 60);
    const h = Math.floor(ms / 3600000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatMsToHM(ms) {
    const m = Math.floor((ms / 60000) % 60);
    const h = Math.floor(ms / 3600000);
    return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
}

// ═══════════════════════════════════════════════
// HISTORY & CHART
// ═══════════════════════════════════════════════

function renderHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '';

    if (state.history.length === 0) {
        list.innerHTML = '<p class="text-secondary" style="text-align:center; padding:22px;">Noch keine Einträge vorhanden.</p>';
        return;
    }

    let totalWeekNetMs = 0;
    let sumStartMins = 0;
    let countStarts = 0;

    const todayStr = new Date().toDateString();

    // Quick calculations for the summary cards
    const now = new Date();
    let dow = now.getDay();
    if (dow === 0) dow = 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - dow + 1);
    monday.setHours(0, 0, 0, 0);

    state.history.forEach((entry, index) => {
        const dateObj = new Date(entry.date);

        // Sum total net time for the week
        if (dateObj >= monday) {
            totalWeekNetMs += entry.netTimeMs;
        }

        // Avg start time calculation
        if (entry.type === 'work' && entry.startTime) {
            const sTime = new Date(entry.startTime);
            sumStartMins += sTime.getHours() * 60 + sTime.getMinutes();
            countStarts++;
        }

        const dateStr = dateObj.toLocaleDateString('de-DE', {
            weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric'
        });
        const type = entry.type || 'work';

        // Prepare timeline math
        let sLeftPct = 0;
        let wPct = 100;
        let sTimeStr = '';
        let eTimeStr = '';

        if (type === 'work' && entry.startTime && entry.endTime) {
            const sDate = new Date(entry.startTime);
            const eDate = new Date(entry.endTime);
            sTimeStr = `${String(sDate.getHours()).padStart(2, '0')}:${String(sDate.getMinutes()).padStart(2, '0')}`;
            eTimeStr = `${String(eDate.getHours()).padStart(2, '0')}:${String(eDate.getMinutes()).padStart(2, '0')}`;

            const startHourDec = sDate.getHours() + sDate.getMinutes() / 60;
            let endHourDec = eDate.getHours() + eDate.getMinutes() / 60;
            if (endHourDec < startHourDec) endHourDec += 24; // Cross-midnight

            // Map 06:00 to 20:00 range onto 0-100% loosely
            const MIN_H = 6;
            const MAX_H = 20;
            const RANGE = MAX_H - MIN_H;

            // clamp for visual sanity
            const clampedStart = Math.min(Math.max(startHourDec, MIN_H), MAX_H);
            const clampedEnd = Math.min(Math.max(endHourDec, MIN_H), MAX_H);

            sLeftPct = ((clampedStart - MIN_H) / RANGE) * 100;
            wPct = ((clampedEnd - clampedStart) / RANGE) * 100;

            // Fallbacks for micro-sessions
            if (wPct < 5) wPct = 10;
            if (sLeftPct + wPct > 100) sLeftPct = 100 - wPct;
        }

        // Badges HTML
        let metaHtml = '';
        if (type === 'work') {
            metaHtml += `<span class="meta-chip negative"><span class="material-icons-round">coffee</span>-45m</span>`;
            if (entry.extraMinutes > 0) {
                metaHtml += `<span class="meta-chip positive"><span class="material-icons-round">add_circle</span>+${Math.round(entry.extraMinutes)}m</span>`;
            }
        } else {
            const label = entry.label || (type === 'vacation' ? 'Urlaub' : 'Feiertag');
            const bIcon = type === 'holiday' ? 'auto_awesome' : 'beach_access';
            metaHtml += `<span class="meta-chip"><span class="material-icons-round">${bIcon}</span>${label}</span>`;
            // For holiday/vacation, full bar
            sTimeStr = label;
            eTimeStr = '8h';
        }

        const item = document.createElement('div');
        item.className = 'history-card';
        item.dataset.type = type;
        item.innerHTML = `
            <div class="history-card-header">
                <span class="history-card-date">${dateStr}</span>
                <span class="history-card-duration">${formatMsToHM(entry.netTimeMs)}</span>
            </div>
            
            <div class="history-timeline-container">
                <div class="history-timeline-bar" style="left: ${sLeftPct}%; width: ${wPct}%;">
                    ${sTimeStr ? `<span>${sTimeStr}</span>` : ''}
                    ${eTimeStr ? `<span>${eTimeStr}</span>` : ''}
                </div>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items:flex-end;">
                <div class="history-card-meta">
                    ${metaHtml}
                </div>
                <div class="history-card-edit">
                    <button class="icon-btn edit-btn" data-index="${index}" title="Bearbeiten">
                        <span class="material-icons-round" style="font-size:18px;">edit</span>
                    </button>
                </div>
            </div>
        `;
        list.appendChild(item);
    });

    // Populate Top Cards
    if (state.totalWorkedToday > 0 && !(monday <= now && now <= new Date(monday.getTime() + 6 * 24 * 3600000) && dateObj && dateObj.toDateString() === todayStr)) {
        // handle active day safely - totalWeekNetMs calculation handled above
    }
    document.getElementById('history-stat-hours').innerText = (totalWeekNetMs / 3600000).toFixed(1).replace('.', ',') + 'h';

    if (countStarts > 0) {
        const avgMins = sumStartMins / countStarts;
        const hh = Math.floor(avgMins / 60);
        const mm = Math.round(avgMins % 60);
        document.getElementById('history-stat-start').innerText = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} Uhr`;
    } else {
        document.getElementById('history-stat-start').innerText = '--:--';
    }

    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const idx = e.currentTarget.getAttribute('data-index');
            const entry = state.history[idx];
            const cur = (entry.netTimeMs / 3600000).toFixed(2);
            const val = prompt('Netto-Arbeitszeit (Stunden, z.B. 8.5):', cur);
            if (val !== null && !isNaN(val) && val !== '') {
                const ms = parseFloat(val) * 3600000;
                entry.netTimeMs = ms;
                entry.grossTimeMs = ms + PAUSE_MS;
                saveState(); renderHistory(); renderChart();
                if (new Date(entry.date).toDateString() === new Date().toDateString()) {
                    state.totalWorkedToday = entry.grossTimeMs;
                    updateUI();
                }
            }
        });
    });
}

function renderChart() {
    const ctx = document.getElementById('history-chart');
    if (!ctx) return;

    const recent = state.history.slice(0, 7).reverse();
    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#9aa0a6' : '#5f6368';
    const gridColor = isDark ? '#3c4043' : '#e8eaed';

    if (chartInstance) chartInstance.destroy();

    if (chartMode === 'trend') {
        let minHour = 24;
        let maxHour = 0;
        let hasValidData = false;

        const trendData = recent.map(e => {
            if (e.type !== 'work' || !e.startTime || !e.endTime) {
                return null;
            }
            const s = new Date(e.startTime);
            const end = new Date(e.endTime);
            const sVal = s.getHours() + s.getMinutes() / 60;
            let eVal = end.getHours() + end.getMinutes() / 60;

            if (eVal < sVal) eVal += 24; // Handle passing past midnight loosely

            if (sVal < minHour) minHour = sVal;
            if (eVal > maxHour) maxHour = eVal;
            hasValidData = true;

            return [sVal, eVal];
        });

        minHour = hasValidData ? Math.max(0, Math.floor(minHour) - 1) : 6;
        maxHour = hasValidData ? Math.min(24, Math.ceil(maxHour) + 1) : 20;

        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: recent.map(e => new Date(e.date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit' })),
                datasets: [{
                    data: trendData,
                    backgroundColor: isDark ? 'rgba(138,180,248,0.9)' : 'rgba(26,115,232,0.85)',
                    borderRadius: 6,
                    borderSkipped: false,
                    barPercentage: 0.6
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: {
                        min: minHour, max: maxHour,
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor, font: { size: 10 },
                            callback: v => {
                                const h = v >= 24 ? v - 24 : v;
                                return `${String(Math.floor(h)).padStart(2, '0')}:00`;
                            }
                        }
                    },
                    x: { grid: { display: false }, ticks: { color: textColor, font: { size: 10 } } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                const raw = ctx.raw;
                                if (!raw) return 'Keine Zeitdaten';
                                const formatTime = val => {
                                    const h = Math.floor(val >= 24 ? val - 24 : val);
                                    const m = Math.round((val - Math.floor(val)) * 60);
                                    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                                };
                                return `${formatTime(raw[0])} - ${formatTime(raw[1])} Uhr`;
                            }
                        }
                    }
                }
            }
        });

    } else {
        const colors = recent.map(e => {
            if ((e.type || 'work') === 'holiday') return isDark ? 'rgba(206,147,216,0.85)' : 'rgba(156,39,176,0.75)';
            if ((e.type || 'work') === 'vacation') return isDark ? 'rgba(77,182,172,0.85)' : 'rgba(0,137,123,0.75)';
            return isDark ? 'rgba(138,180,248,0.9)' : 'rgba(26,115,232,0.85)';
        });

        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: recent.map(e => new Date(e.date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit' })),
                datasets: [{
                    data: recent.map(e => e.netTimeMs / 3600000),
                    backgroundColor: colors,
                    borderRadius: 6, borderSkipped: false
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true, max: 10,
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { size: 10 }, callback: v => v + 'h' }
                    },
                    x: { grid: { display: false }, ticks: { color: textColor, font: { size: 10 } } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                const e = recent[ctx.dataIndex];
                                const h = Math.floor(ctx.raw), m = Math.round((ctx.raw - h) * 60);
                                const tag = e.type !== 'work' ? ` (${e.label || e.type})` : '';
                                return `${h}h ${m}m${tag}`;
                            }
                        }
                    }
                }
            }
        });
    }
}

// ═══════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════

function exportCSV() {
    if (!state.history.length) { alert('Keine Daten vorhanden.'); return; }
    let csv = 'data:text/csv;charset=utf-8,Datum,Typ,Nettozeit (h),Bruttozeit (h),Extra (min),Label\n';
    state.history.forEach(e => {
        const date = new Date(e.date).toLocaleDateString('de-DE');
        const net = (e.netTimeMs / 3600000).toFixed(2).replace('.', ',');
        const gross = (e.grossTimeMs / 3600000).toFixed(2).replace('.', ',');
        csv += `${date},${e.type || 'work'},${net},${gross},${e.extraMinutes},${e.label || ''}\n`;
    });
    const link = document.createElement('a');
    link.href = encodeURI(csv);
    link.download = 'arbeitszeiten.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ═══════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));
            item.classList.add('active');
            const target = document.getElementById(item.getAttribute('data-target'));
            if (target) target.classList.add('active');
            if (item.getAttribute('data-target') === 'history-view') setTimeout(renderChart, 50);
        });
    });
}
