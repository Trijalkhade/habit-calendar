// ─── Month Calendar Rendering ───────────────────────────────────────────

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    const daysInMonth = getDaysInMonth(state.currentYear, state.currentMonth);
    const firstDay = getFirstDayOfMonth(state.currentYear, state.currentMonth);

    // Previous month days (fill)
    const prevMonth = state.currentMonth === 1 ? 12 : state.currentMonth - 1;
    const prevYear = state.currentMonth === 1 ? state.currentYear - 1 : state.currentYear;
    const daysInPrev = getDaysInMonth(prevYear, prevMonth);

    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrev - i;
        const cell = createDayCell(day, prevYear, prevMonth, true);
        grid.appendChild(cell);
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = formatDate(state.currentYear, state.currentMonth, day);
        const dayData = state.monthData.find(d => d.date === dateStr);
        const cell = createDayCell(day, state.currentYear, state.currentMonth, false, dayData);
        grid.appendChild(cell);
    }

    // Next month fill
    const totalCells = firstDay + daysInMonth;
    const remaining = totalCells <= 35 ? 35 - totalCells : 42 - totalCells;
    const nextMonth = state.currentMonth === 12 ? 1 : state.currentMonth + 1;
    const nextYear = state.currentMonth === 12 ? state.currentYear + 1 : state.currentYear;

    for (let day = 1; day <= remaining; day++) {
        const cell = createDayCell(day, nextYear, nextMonth, true);
        grid.appendChild(cell);
    }
}

function createDayCell(day, year, month, isOtherMonth, dayData) {
    const cell = document.createElement('div');
    cell.className = 'day-cell';

    const dateStr = formatDate(year, month, day);

    if (isOtherMonth) cell.classList.add('other-month');
    if (isToday(dateStr)) cell.classList.add('today');
    if (state.selectedDate === dateStr) cell.classList.add('selected');

    if (dayData) {
        if (dayData.completed) cell.classList.add('completed');
        else if (dayData.partial) cell.classList.add('partial');
    }

    // Day number
    const num = document.createElement('div');
    num.className = 'day-number';
    num.textContent = day;
    cell.appendChild(num);

    // Completion indicator
    if (dayData && dayData.completion_count > 0 && !isOtherMonth) {
        const comp = document.createElement('div');
        comp.className = 'day-completion';
        comp.textContent = dayData.completed ? '✓' : `${dayData.completion_count}/${dayData.total_habits}`;
        cell.appendChild(comp);
    }

    // Violation dot
    if (dayData && dayData.has_violations && !isOtherMonth) {
        const dot = document.createElement('div');
        dot.className = 'violation-dot';
        cell.appendChild(dot);
    }

    // Click handler
    cell.addEventListener('click', () => {
        if (!isOtherMonth) {
            selectDay(dateStr);
        } else {
            // Navigate to that month
            state.currentYear = year;
            state.currentMonth = month;
            loadMonthData().then(() => {
                renderCalendar();
                renderMiniCalendar();
                updateHeaderLabel();
                selectDay(dateStr);
            });
        }
    });

    return cell;
}

async function selectDay(dateStr) {
    state.selectedDate = dateStr;
    renderCalendar();
    await openDayPanel(dateStr);
}

// ─── Mini Calendar ──────────────────────────────────────────────────────

function renderMiniCalendar() {
    const container = document.getElementById('mini-calendar');
    container.innerHTML = '';

    // Header with navigation
    const header = document.createElement('div');
    header.className = 'mini-cal-header';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'mini-cal-nav';
    prevBtn.innerHTML = '‹';
    prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateMonth(-1);
    });

    const title = document.createElement('span');
    title.textContent = `${MONTHS[state.currentMonth - 1].substring(0, 3)} ${state.currentYear}`;

    const nextBtn = document.createElement('button');
    nextBtn.className = 'mini-cal-nav';
    nextBtn.innerHTML = '›';
    nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateMonth(1);
    });

    header.appendChild(prevBtn);
    header.appendChild(title);
    header.appendChild(nextBtn);
    container.appendChild(header);

    // Grid
    const grid = document.createElement('div');
    grid.className = 'mini-cal-grid';

    // Day headers
    DAYS_SHORT.forEach(d => {
        const dh = document.createElement('div');
        dh.className = 'mini-cal-day-header';
        dh.textContent = d;
        grid.appendChild(dh);
    });

    const daysInMonth = getDaysInMonth(state.currentYear, state.currentMonth);
    const firstDay = getFirstDayOfMonth(state.currentYear, state.currentMonth);

    // Previous month fill
    const prevM = state.currentMonth === 1 ? 12 : state.currentMonth - 1;
    const prevY = state.currentMonth === 1 ? state.currentYear - 1 : state.currentYear;
    const daysInPrev = getDaysInMonth(prevY, prevM);

    for (let i = firstDay - 1; i >= 0; i--) {
        const cell = document.createElement('div');
        cell.className = 'mini-cal-day other-month';
        cell.textContent = daysInPrev - i;
        grid.appendChild(cell);
    }

    // Current month
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = formatDate(state.currentYear, state.currentMonth, day);
        const dayData = state.monthData.find(d => d.date === dateStr);

        const cell = document.createElement('div');
        cell.className = 'mini-cal-day';
        cell.textContent = day;

        if (isToday(dateStr)) cell.classList.add('today');
        if (state.selectedDate === dateStr) cell.classList.add('selected');
        if (dayData && dayData.completed) cell.classList.add('completed');

        cell.addEventListener('click', () => selectDay(dateStr));
        grid.appendChild(cell);
    }

    // Next month fill
    const totalCells = firstDay + daysInMonth;
    const rows = Math.ceil(totalCells / 7);
    const remaining = rows * 7 - totalCells;

    for (let day = 1; day <= remaining; day++) {
        const cell = document.createElement('div');
        cell.className = 'mini-cal-day other-month';
        cell.textContent = day;
        grid.appendChild(cell);
    }

    container.appendChild(grid);
}

// ─── Year View ──────────────────────────────────────────────────────────

async function renderYearView() {
    const container = document.getElementById('year-view');
    container.innerHTML = '';

    for (let month = 1; month <= 12; month++) {
        let monthData = [];
        try {
            monthData = await invoke('get_month_data', {
                year: state.currentYear,
                month: month
            });
        } catch (e) { /* empty */ }

        const card = document.createElement('div');
        card.className = 'year-month-card';

        const title = document.createElement('div');
        title.className = 'year-month-title';
        title.textContent = MONTHS[month - 1];
        card.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'year-month-grid';

        const daysInMonth = getDaysInMonth(state.currentYear, month);
        const firstDay = getFirstDayOfMonth(state.currentYear, month);

        // Empty cells for alignment
        for (let i = 0; i < firstDay; i++) {
            const empty = document.createElement('div');
            empty.className = 'year-day';
            grid.appendChild(empty);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = formatDate(state.currentYear, month, day);
            const dayData = monthData.find(d => d.date === dateStr);

            const cell = document.createElement('div');
            cell.className = 'year-day';
            cell.textContent = day;

            if (isToday(dateStr)) cell.classList.add('today');
            if (dayData && dayData.completed) cell.classList.add('completed');
            if (dayData && dayData.has_violations) cell.classList.add('has-violation');

            cell.addEventListener('click', () => {
                state.currentMonth = month;
                switchView('month');
                loadMonthData().then(() => {
                    renderCalendar();
                    renderMiniCalendar();
                    updateHeaderLabel();
                    selectDay(dateStr);
                });
            });

            grid.appendChild(cell);
        }

        card.appendChild(grid);
        container.appendChild(card);
    }
}
