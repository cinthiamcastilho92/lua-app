/* =====================================================
   Lua — Dashboard
   ===================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const sb = getSupabase();
  if (!sb) return;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  const { data: profile, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !profile?.last_period_date) return;

  const { calculateCycle, getUpcomingEvents, formatDate, daysUntil } = window.luaCycle;
  const info = calculateCycle(profile);

  // ---- Ring ----
  const pct    = info.cycleDay / info.cycleLength;
  const circ   = 2 * Math.PI * 80; // r=80
  const offset = circ - pct * circ;
  const ring   = document.getElementById('ring-progress');
  ring.style.strokeDashoffset = offset;
  ring.classList.add(`phase-${info.phase}`);

  // ---- Text ----
  document.getElementById('cycle-day').textContent   = info.cycleDay;
  document.getElementById('cycle-phase').textContent = info.phaseName;
  document.getElementById('phase-name').textContent  = info.phaseName;
  document.getElementById('next-period').textContent = formatDate(info.nextPeriod);
  document.getElementById('fertility-status').textContent = info.fertilityStatus;

  // ---- Quick log card: check if already logged today ----
  const today = new Date().toISOString().split('T')[0];
  const { data: todayLog } = await sb
    .from('daily_logs')
    .select('id')
    .eq('user_id', user.id)
    .eq('log_date', today)
    .maybeSingle();

  const card = document.getElementById('quick-log-card');
  if (todayLog) {
    card.querySelector('.quick-log-title').textContent = 'Registo de hoje feito ✓';
    card.querySelector('.quick-log-sub').textContent   = 'Toca para editar';
  }

  // ---- Upcoming events ----
  const eventsList = document.getElementById('events-list');
  const events = getUpcomingEvents(profile);
  eventsList.innerHTML = '';

  if (!events.length) {
    eventsList.innerHTML = '<p style="font-size:var(--font-size-sm);color:var(--color-text-muted)">Sem eventos próximos.</p>';
  } else {
    events.forEach(ev => {
      const item = document.createElement('div');
      item.className = 'event-item';
      item.innerHTML = `
        <div class="event-dot phase-${ev.phase}"></div>
        <div class="event-info">
          <div class="event-name">${ev.label}</div>
          <div class="event-date">${formatDate(ev.date, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
        </div>
        <div class="event-days">${daysUntil(ev.date)}</div>
      `;
      eventsList.appendChild(item);
    });
  }

  // ---- Insight ----
  document.getElementById('insight-text').textContent = info.phaseInsight;

  // ---- Settings button ----
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    window.location.href = '/settings.html';
  });
});
