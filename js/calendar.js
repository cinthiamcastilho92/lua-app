/* =====================================================
   Lua — Calendar
   ===================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const sb = getSupabase();
  if (!sb) return;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  const { data: profile } = await sb
    .from('profiles').select('*').eq('id', user.id).single();
  if (!profile?.last_period_date) return;

  const { getPhaseForDate, formatDate, PHASE_NAMES } = window.luaCycle;

  let viewDate = new Date();

  // ---- Fetch logs for a month range ----
  async function fetchLogs(year, month) {
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to   = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;
    const { data } = await sb
      .from('daily_logs')
      .select('log_date, flow, pain_level')
      .eq('user_id', user.id)
      .gte('log_date', from)
      .lte('log_date', to);
    const map = {};
    (data || []).forEach(l => { map[l.log_date] = l; });
    return map;
  }

  async function renderMonth(date) {
    const year  = date.getFullYear();
    const month = date.getMonth();

    document.getElementById('calendar-month-label').textContent =
      new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' }).format(date);

    const logs = await fetchLogs(year, month);
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    const firstDay  = new Date(year, month, 1).getDay(); // 0=Sun
    const daysCount = new Date(year, month + 1, 0).getDate();
    const today     = new Date();

    // Empty cells before 1st
    for (let i = 0; i < firstDay; i++) {
      const cell = document.createElement('div');
      cell.className = 'cal-day empty';
      cell.setAttribute('role', 'gridcell');
      grid.appendChild(cell);
    }

    for (let d = 1; d <= daysCount; d++) {
      const dateObj  = new Date(year, month, d);
      const dateStr  = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const phaseInfo = getPhaseForDate(dateObj, profile);
      const isToday  = dateObj.toDateString() === today.toDateString();
      const hasLog   = !!logs[dateStr];

      const cell = document.createElement('div');
      cell.className = `cal-day${isToday ? ' today' : ''}${phaseInfo ? ` phase-${phaseInfo.phase}` : ''}`;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', `${d} de ${new Intl.DateTimeFormat('pt-PT', { month: 'long' }).format(dateObj)}${phaseInfo ? `, ${phaseInfo.phaseName}` : ''}`);
      cell.dataset.date = dateStr;

      cell.innerHTML = `
        <span class="cal-day-num">${d}</span>
        ${phaseInfo ? '<span class="cal-phase-dot"></span>' : ''}
        ${hasLog    ? '<span class="cal-log-dot"></span>'   : ''}
      `;

      cell.addEventListener('click', () => selectDay(dateStr, dateObj, phaseInfo, logs[dateStr]));
      grid.appendChild(cell);
    }
  }

  function selectDay(dateStr, dateObj, phaseInfo, log) {
    document.querySelectorAll('.cal-day.selected').forEach(c => c.classList.remove('selected'));
    document.querySelector(`.cal-day[data-date="${dateStr}"]`)?.classList.add('selected');

    const detail = document.getElementById('day-detail');
    detail.hidden = false;

    document.getElementById('day-detail-date').textContent =
      formatDate(dateObj, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const phaseEl = document.getElementById('day-detail-phase');
    if (phaseInfo) {
      phaseEl.textContent  = phaseInfo.phaseName;
      phaseEl.style.background = `var(--phase-${phaseInfo.phase}-bg)`;
      phaseEl.style.color      = `var(--phase-${phaseInfo.phase})`;
    } else {
      phaseEl.textContent = '';
    }

    const logEl = document.getElementById('day-detail-log');
    logEl.innerHTML = '';
    if (log) {
      if (log.flow && log.flow !== 'none') {
        const chip = document.createElement('span');
        chip.className = 'log-chip';
        chip.textContent = `Fluxo: ${log.flow}`;
        logEl.appendChild(chip);
      }
      if (log.pain_level > 0) {
        const chip = document.createElement('span');
        chip.className = 'log-chip';
        chip.textContent = `Dor: ${log.pain_level}/10`;
        logEl.appendChild(chip);
      }
      if (!logEl.children.length) {
        logEl.innerHTML = '<p class="no-log">Registo sem detalhes.</p>';
      }
    } else {
      logEl.innerHTML = '<p class="no-log">Sem registo para este dia.</p>';
    }

    const logLink = document.getElementById('day-detail-log-link');
    logLink.href = `/daily-log.html?date=${dateStr}`;

    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---- Month nav ----
  document.getElementById('btn-prev-month').addEventListener('click', () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    renderMonth(viewDate);
  });
  document.getElementById('btn-next-month').addEventListener('click', () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
    renderMonth(viewDate);
  });

  await renderMonth(viewDate);
});
