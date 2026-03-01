document.addEventListener('DOMContentLoaded', () => {
    console.log('App initialized');

    // Theme setup based on system preference or local storage
    initTheme();

    // Setup bottom navigation
    setupNavigation();

    // Setup App Logic
    initApp();
});

// --- STATE ---
let state = {
    isRunning: false,
    startTime: null,
    totalWorkedToday: 0, // In milliseconds (without active timer)
    extraMinutes: 0,     // Motivation extra minutes
    hourlyRate: 15.0,
    history: []          // Array of daily objects
};

let timerInterval = null;
const WORK_GOAL_MS = 8 * 60 * 60 * 1000; // 8 hours
const PAUSE_MS = 45 * 60 * 1000;         // 45 minutes
let chartInstance = null;

// --- INITIALIZATION ---
function initApp() {
    loadState();
    setupEventListeners();
    updateUI();
    renderHistory();
    renderChart();
}

function loadState() {
    const savedState = localStorage.getItem('timeTrackerState');
    if (savedState) {
        const parsed = JSON.parse(savedState);
        state.isRunning = parsed.isRunning || false;
        state.startTime = parsed.startTime ? new Date(parsed.startTime) : null;
        state.totalWorkedToday = parsed.totalWorkedToday || 0;
        state.extraMinutes = parsed.extraMinutes || 0;
        state.hourlyRate = parsed.hourlyRate || 15.0;
        state.history = parsed.history || [];

        // Check if a new day has started since last save
        checkNewDay();

        if (state.isRunning) {
            startTimerVisuals();
        }
    }

    // Set input values
    document.getElementById('hourly-rate').value = state.hourlyRate;
    document.getElementById('theme-toggle').checked = document.body.classList.contains('dark-mode');
}

function saveState() {
    localStorage.setItem('timeTrackerState', JSON.stringify(state));
}

function checkNewDay() {
    if (state.history.length > 0) {
        const today = new Date().toDateString();
        const lastEntryDate = new Date(state.history[0].date).toDateString();

        if (today !== lastEntryDate && !state.isRunning) {
            // It's a new day, reset daily variables
            state.totalWorkedToday = 0;
            state.extraMinutes = 0;
            saveState();
        }
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        document.body.classList.add('dark-mode');
        document.body.classList.remove('light-mode');
    } else {
        document.body.classList.add('light-mode');
        document.body.classList.remove('dark-mode');
    }
}

function setupEventListeners() {
    // Main Action Button (Start/Stop)
    const mainBtn = document.getElementById('main-action-btn');
    mainBtn.addEventListener('click', handleMainAction);

    // Motivation Buttons (Time)
    document.getElementById('btn-add-15').addEventListener('click', () => addExtraTime(15));
    document.getElementById('btn-add-30').addEventListener('click', () => addExtraTime(30));
    document.getElementById('btn-reset-motivation-time').addEventListener('click', resetMotivation);

    // Motivation Buttons (Money)
    document.getElementById('btn-add-5eur').addEventListener('click', () => addExtraMoney(5));
    document.getElementById('btn-add-10eur').addEventListener('click', () => addExtraMoney(10));
    document.getElementById('btn-reset-motivation-money').addEventListener('click', resetMotivation);

    // Motivation Toggle
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

    // Holiday / Vacation
    document.getElementById('add-holiday-btn').addEventListener('click', addHolidayEntry);

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
        if (chartInstance) renderChart(); // Redraw chart with new theme colors
    });

    document.getElementById('hourly-rate').addEventListener('change', (e) => {
        state.hourlyRate = parseFloat(e.target.value) || 0;
        saveState();
        updateMotivationUI();
    });

    document.getElementById('export-btn').addEventListener('click', exportCSV);

    document.getElementById('reset-btn').addEventListener('click', () => {
        if (confirm('Bist du sicher, dass du alle Daten unwiderruflich löschen möchtest?')) {
            localStorage.removeItem('timeTrackerState');
            location.reload();
        }
    });
}

// --- CORE LOGIC ---
function handleMainAction() {
    const btn = document.getElementById('main-action-btn');
    const icon = document.getElementById('main-action-icon');

    if (!state.isRunning) {
        // Start Timer
        state.isRunning = true;
        state.startTime = new Date();

        // Reset daily stats if it's the first start of a new day
        checkNewDay();

        saveState();
        startTimerVisuals();

    } else {
        // Stop Timer
        const now = new Date();
        const sessionDuration = now.getTime() - state.startTime.getTime();
        state.totalWorkedToday += sessionDuration;

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
    timerInterval = setInterval(() => {
        updateTimerDisplay();
    }, 1000);
}

function stopTimerVisuals() {
    if (timerInterval) clearInterval(timerInterval);
    updateTimerDisplay();
}

function addExtraTime(minutes) {
    state.extraMinutes += minutes;
    saveState();
    updateMotivationUI();
    updateTimerDisplay(); // Update progress ring to reflect new goal/progress
}

function addExtraMoney(amount) {
    // Calculate how many minutes are needed to earn this amount
    // Hourly Rate / 60 = Per Minute Rate
    // Minutes = Amount / Per Minute Rate
    if (state.hourlyRate > 0) {
        const perMinuteRate = state.hourlyRate / 60;
        const minutes = amount / perMinuteRate;
        state.extraMinutes += minutes;
        saveState();
        updateMotivationUI();
        updateTimerDisplay();
    } else {
        alert("Bitte erst einen gültigen Stundenlohn in den Einstellungen hinterlegen.");
    }
}

// --- DATA MANAGEMENT ---
function saveDailyEntry() {
    const today = new Date().toDateString();
    let entryIndex = state.history.findIndex(entry => new Date(entry.date).toDateString() === today);

    // totalGross is purely the actual time tracked/worked.
    // Motivation (extraMinutes) is just a goal and should NEVER be added to actual tracked time.
    const totalGross = state.totalWorkedToday;

    // Deduct pause if total time is greater than pause
    const netTime = Math.max(0, totalGross - PAUSE_MS);

    const entryData = {
        date: new Date().toISOString(),
        grossTimeMs: totalGross,
        netTimeMs: netTime,
        extraMinutes: state.extraMinutes
    };

    if (entryIndex >= 0) {
        state.history[entryIndex] = entryData;
    } else {
        state.history.unshift(entryData); // Add to beginning
    }

    // Keep only last 30 days
    if (state.history.length > 30) {
        state.history.pop();
    }
}

// --- UI UPDATES ---
function updateUI() {
    const btn = document.getElementById('main-action-btn');
    const icon = document.getElementById('main-action-icon');
    const statusText = document.getElementById('timer-status');
    const motivationSection = document.getElementById('motivation-section');
    const earningsSection = document.getElementById('earnings-section');
    const endTimeCard = document.getElementById('end-time-card');

    if (state.isRunning) {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-danger');
        icon.innerText = 'stop';
        statusText.innerText = 'Arbeitet...';
        statusText.classList.add('text-primary');
        statusText.classList.remove('text-secondary');
        motivationSection.style.display = 'block';
        earningsSection.style.display = 'grid';
        endTimeCard.style.display = 'flex';
    } else {
        btn.classList.remove('btn-danger');
        btn.classList.add('btn-primary');
        icon.innerText = 'play_arrow';
        statusText.innerText = 'Pausiert / Bereit';
        statusText.classList.remove('text-primary');
        statusText.classList.add('text-secondary');

        // Only hide if we have NO time logged today and not running
        if (state.totalWorkedToday === 0) {
            motivationSection.style.display = 'none';
            earningsSection.style.display = 'grid'; // Always show earnings
            endTimeCard.style.display = 'none';
        } else {
            // Keep visible if there is data
            motivationSection.style.display = 'block';
            earningsSection.style.display = 'grid';
            endTimeCard.style.display = 'none'; // Only relevant while working
        }
    }

    updateTimerDisplay();
    updateMotivationUI();
    updateEarningsUI();
}

function updateTimerDisplay() {
    let currentSessionMs = 0;
    if (state.isRunning && state.startTime) {
        currentSessionMs = new Date().getTime() - new Date(state.startTime).getTime();
    }

    // The actual elapsed time worked today, strictly without motivation minutes.
    const totalGrossMs = state.totalWorkedToday + currentSessionMs;
    const netMs = Math.max(0, totalGrossMs - PAUSE_MS); // Apply 45 min pause deduction

    // Update Digital Display (Gross time for active timer feels more natural)
    document.getElementById('current-time').innerText = formatMsToHMS(totalGrossMs);

    // Update Net Time Display
    document.getElementById('net-time').innerText = `${formatMsToHM(netMs)} (inkl. Pausenabzug)`;

    // Update Progress Ring (Goal: 8 hours net = 8h 45m gross)
    // Goal scales with motivation extra minutes
    const goalGrossMs = WORK_GOAL_MS + PAUSE_MS + (state.extraMinutes * 60 * 1000);
    let progressPercent = (totalGrossMs / goalGrossMs) * 100;
    if (progressPercent > 100) progressPercent = 100;

    const circle = document.querySelector('.progress-ring__circle');
    const circumference = 565.48; // 2 * pi * r (r=90)
    const offset = circumference - (progressPercent / 100) * circumference;
    circle.style.strokeDashoffset = offset;

    // Update Target End Time if running
    if (state.isRunning && state.startTime) {
        // StartTime + 8h 45m + ExtraMinutes - Zeit die schon vor dieser Session gearbeitet wurde
        const totalSessionMsNeeded = goalGrossMs - state.totalWorkedToday;

        const endTime = new Date(state.startTime.getTime() + totalSessionMsNeeded);

        let endH = endTime.getHours();
        let endM = endTime.getMinutes();
        endH = (endH < 10) ? "0" + endH : endH;
        endM = (endM < 10) ? "0" + endM : endM;

        document.getElementById('target-end-time').innerText = `${endH}:${endM} Uhr`;
    }

    // Update earnings live
    updateEarningsUI(netMs);
}

function updateMotivationUI() {
    const extraMoney = (state.extraMinutes / 60) * state.hourlyRate;
    document.getElementById('extra-money').innerText = extraMoney.toFixed(2).replace('.', ',');

    // Show/hide reset buttons based on whether extra motivation is active
    const showReset = state.extraMinutes > 0 ? 'inline-flex' : 'none';
    document.getElementById('btn-reset-motivation-time').style.display = showReset;
    document.getElementById('btn-reset-motivation-money').style.display = showReset;
}

function resetMotivation() {
    state.extraMinutes = 0;
    saveState();
    updateUI();
    updateMotivationUI();
}

function addHolidayEntry() {
    const isConfirm = confirm("Möchtest du wirklich 8 Stunden als bezahlten Urlaub/Feiertag für heute eintragen?");
    if (!isConfirm) return;

    const holidayMs = 8 * 60 * 60 * 1000;

    const todayStr = new Date().toDateString();
    const existingIndex = state.history.findIndex(entry => new Date(entry.date).toDateString() === todayStr);

    const newEntry = {
        date: new Date().toISOString(),
        grossTimeMs: holidayMs + PAUSE_MS, // so it calculates correctly to 8h net
        netTimeMs: holidayMs,
        extraMinutes: 0
    };

    if (existingIndex >= 0) {
        state.history[existingIndex] = newEntry;
    } else {
        state.history.unshift(newEntry);
    }

    state.totalWorkedToday = newEntry.grossTimeMs;

    saveState();
    updateUI();
    renderHistory();
    renderChart();
    alert("Urlaub/Feiertag erfolgreich eingetragen!");
}

function updateEarningsUI(currentNetMs = null) {
    // 1. Calculate Today's Earnings
    let netTodayMs = currentNetMs;
    if (netTodayMs === null) {
        let sessionMs = 0;
        if (state.isRunning && state.startTime) {
            sessionMs = new Date().getTime() - new Date(state.startTime).getTime();
        }
        const grossToday = state.totalWorkedToday + sessionMs;
        netTodayMs = Math.max(0, grossToday - PAUSE_MS);
    }

    const earnedToday = (netTodayMs / (1000 * 60 * 60)) * state.hourlyRate;
    document.getElementById('earned-today').innerText = `${earnedToday.toFixed(2).replace('.', ',')} €`;

    // 2. Calculate This Month's Earnings
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let totalNetMonthMs = netTodayMs; // start with today's live data

    // add all history entries from this month (excluding today since we added live today above)
    const todayStr = now.toDateString();

    state.history.forEach(entry => {
        const d = new Date(entry.date);
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear && d.toDateString() !== todayStr) {
            totalNetMonthMs += entry.netTimeMs;
        }
    });

    const earnedMonth = (totalNetMonthMs / (1000 * 60 * 60)) * state.hourlyRate;
    document.getElementById('earned-month').innerText = `${earnedMonth.toFixed(2).replace('.', ',')} €`;

    updateWeeklyProgressUI(netTodayMs);
}

function updateWeeklyProgressUI(netTodayMs) {
    const now = new Date();
    // In JS, 0 is Sunday, 1 is Monday. We want Monday to be start of week.
    let currentDayOfWeek = now.getDay();
    if (currentDayOfWeek === 0) currentDayOfWeek = 7; // make Sunday 7

    const monday = new Date(now);
    monday.setDate(now.getDate() - currentDayOfWeek + 1);
    monday.setHours(0,0,0,0);

    let totalNetWeekMs = netTodayMs;
    const todayStr = now.toDateString();

    state.history.forEach(entry => {
        const d = new Date(entry.date);
        if (d >= monday && d.toDateString() !== todayStr) {
            totalNetWeekMs += entry.netTimeMs;
        }
    });

    const totalWeekHours = (totalNetWeekMs / (1000 * 60 * 60));
    const targetHours = 40;

    const progressPercent = Math.min((totalWeekHours / targetHours) * 100, 100);

    document.getElementById('weekly-progress-text').innerText = `${totalWeekHours.toFixed(1).replace('.', ',')}h / ${targetHours}h`;
    document.getElementById('weekly-progress-fill').style.width = `${progressPercent}%`;
}

// --- HELPERS ---
function formatMsToHMS(ms) {
    let seconds = Math.floor((ms / 1000) % 60);
    let minutes = Math.floor((ms / (1000 * 60)) % 60);
    let hours = Math.floor((ms / (1000 * 60 * 60)));

    hours = (hours < 10) ? "0" + hours : hours;
    minutes = (minutes < 10) ? "0" + minutes : minutes;
    seconds = (seconds < 10) ? "0" + seconds : seconds;

    return hours + ":" + minutes + ":" + seconds;
}

function formatMsToHM(ms) {
    let minutes = Math.floor((ms / (1000 * 60)) % 60);
    let hours = Math.floor((ms / (1000 * 60 * 60)));

    hours = (hours < 10) ? "0" + hours : hours;
    minutes = (minutes < 10) ? "0" + minutes : minutes;

    return hours + "h " + minutes + "m";
}

// --- HISTORY & CHART ---
function renderHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '';

    if (state.history.length === 0) {
        list.innerHTML = '<p class="text-secondary" style="text-align:center; padding: 20px;">Noch keine Einträge vorhanden.</p>';
        return;
    }

    state.history.forEach((entry, index) => {
        const dateObj = new Date(entry.date);
        const dateString = dateObj.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

        const netTimeString = formatMsToHM(entry.netTimeMs);

        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <div>
                <div class="history-date">${dateString}</div>
                <div class="history-times text-secondary">
                    Inkl. ${entry.extraMinutes > 0 ? entry.extraMinutes + 'm Extra | ' : ''}-45m Pause
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 16px;">
                <div class="history-duration">${netTimeString}</div>
                <div class="history-actions">
                    <button class="icon-btn edit-btn" data-index="${index}">
                        <span class="material-icons-round" style="font-size: 18px;">edit</span>
                    </button>
                </div>
            </div>
        `;
        list.appendChild(item);
    });

    // Edit functionality (simple prompt for now)
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = e.currentTarget.getAttribute('data-index');
            const entry = state.history[index];
            const currentHours = (entry.netTimeMs / (1000 * 60 * 60)).toFixed(2);

            const newHours = prompt(`Netto-Arbeitszeit bearbeiten (in Stunden, z.B. 8.5 für 8h 30m):`, currentHours);
            if (newHours !== null && !isNaN(newHours) && newHours !== "") {
                const newNetMs = parseFloat(newHours) * 60 * 60 * 1000;
                entry.netTimeMs = newNetMs;
                entry.grossTimeMs = newNetMs + PAUSE_MS; // strictly actual gross time without motivation
                saveState();
                renderHistory();
                renderChart();
                // If editing today, update dashboard state
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

    // Get up to 7 last days, reversed for chronological order (left to right)
    const recentHistory = state.history.slice(0, 7).reverse();

    const labels = recentHistory.map(entry => {
        const d = new Date(entry.date);
        return d.toLocaleDateString('de-DE', { weekday: 'short' });
    });

    const dataPoints = recentHistory.map(entry => entry.netTimeMs / (1000 * 60 * 60)); // Convert to hours

    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#9aa0a6' : '#5f6368';
    const gridColor = isDark ? '#3c4043' : '#dadce0';
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#1a73e8';

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Netto Stunden',
                data: dataPoints,
                backgroundColor: primaryColor,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 12,
                    grid: { color: gridColor },
                    ticks: { color: textColor }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: textColor }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let val = context.raw;
                            let h = Math.floor(val);
                            let m = Math.round((val - h) * 60);
                            return `${h}h ${m}m`;
                        }
                    }
                }
            }
        }
    });
}

// --- EXPORT ---
function exportCSV() {
    if (state.history.length === 0) {
        alert("Keine Daten zum Exportieren vorhanden.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Datum,Bruttozeit (Stunden),Nettozeit (Stunden),Extra Motivation (Minuten)\n";

    state.history.forEach(entry => {
        const date = new Date(entry.date).toLocaleDateString('de-DE');
        const grossHrs = (entry.grossTimeMs / (1000 * 60 * 60)).toFixed(2).replace('.', ',');
        const netHrs = (entry.netTimeMs / (1000 * 60 * 60)).toFixed(2).replace('.', ',');
        const extra = entry.extraMinutes;

        csvContent += `${date},${grossHrs},${netHrs},${extra}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "arbeitszeiten_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            // Remove active class from all items
            navItems.forEach(nav => nav.classList.remove('active'));
            views.forEach(view => view.classList.remove('active'));

            // Add active class to clicked item and corresponding view
            item.classList.add('active');
            const targetId = item.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });
}
