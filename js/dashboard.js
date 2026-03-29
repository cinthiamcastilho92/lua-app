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

  // ---- Phase info modal ----
  const PHASE_DATA = {
    menstrual: {
      icon: '🩸',
      title: 'Fase Menstrual',
      desc: 'O teu corpo está a libertar o revestimento uterino. É normal sentir cólicas, fadiga e alguma sensibilidade emocional. Este é um momento de renovação — honra o teu corpo e descansa o que precisares.',
      stats: [
        { label: 'Duração típica', value: `${info.periodDuration} dias` },
        { label: 'Energia', value: 'Baixa' },
        { label: 'Fertilidade', value: 'Mínima' },
        { label: 'Humor', value: 'Introspetivo' },
      ],
      tips: [
        { icon: '🛁', text: 'Calor no abdómen ajuda a aliviar as cólicas.' },
        { icon: '🍵', text: 'Chá de gengibre ou camomila reduz a inflamação.' },
        { icon: '😴', text: 'Permite-te descansar mais do que o habitual.' },
        { icon: '🚶', text: 'Movimento suave como yoga ou caminhada pode aliviar desconforto.' },
      ],
    },
    follicular: {
      icon: '🌸',
      title: 'Fase Folicular',
      desc: 'Os estrogénios estão a subir e o teu corpo está a preparar-se para a ovulação. A energia e o humor melhoram progressivamente. É uma fase de crescimento, criatividade e abertura ao novo.',
      stats: [
        { label: 'Duração típica', value: '7–10 dias' },
        { label: 'Energia', value: 'A crescer' },
        { label: 'Fertilidade', value: 'Baixa a média' },
        { label: 'Humor', value: 'Otimista' },
      ],
      tips: [
        { icon: '💡', text: 'Ótima fase para começar novos projetos e aprender coisas novas.' },
        { icon: '🏃', text: 'O teu corpo responde bem a treinos mais intensos.' },
        { icon: '🥗', text: 'Alimentos fermentados apoiam o microbioma nesta fase.' },
        { icon: '🤝', text: 'Momento ideal para reuniões e conversas importantes.' },
      ],
    },
    ovulation: {
      icon: '✨',
      title: 'Fase de Ovulação',
      desc: 'Estás no teu pico de energia, confiança e sociabilidade. O óvulo é libertado e esta é a tua janela fértil. Os estrogénios e a LH estão no máximo — podes sentir-te mais atraente e comunicativa.',
      stats: [
        { label: 'Duração típica', value: '3–5 dias' },
        { label: 'Energia', value: 'Máxima' },
        { label: 'Fertilidade', value: 'Muito alta' },
        { label: 'Humor', value: 'Confiante' },
      ],
      tips: [
        { icon: '💬', text: 'A tua comunicação está no melhor — aproveita para conversas difíceis.' },
        { icon: '💪', text: 'Excelente para treinos de alta intensidade e competição.' },
        { icon: '🌡️', text: 'A temperatura basal sobe ligeiramente após a ovulação.' },
        { icon: '❤️', text: 'Libido naturalmente mais elevada nesta fase.' },
      ],
    },
    luteal: {
      icon: '🌙',
      title: 'Fase Lútea',
      desc: 'A progesterona sobe para preparar o corpo para uma possível gravidez. Se não houver fertilização, os níveis hormonal caem e aproximam-se os sintomas pré-menstruais. É uma fase de reflexão e desaceleração.',
      stats: [
        { label: 'Duração típica', value: '10–14 dias' },
        { label: 'Energia', value: 'A diminuir' },
        { label: 'Fertilidade', value: 'Baixa' },
        { label: 'Humor', value: 'Variável' },
      ],
      tips: [
        { icon: '🧘', text: 'Yoga, meditação e respiração ajudam com o stress pré-menstrual.' },
        { icon: '🍫', text: 'Desejo de doce é normal — opta por chocolate negro rico em magnésio.' },
        { icon: '📓', text: 'Escrever um diário ajuda a processar as emoções desta fase.' },
        { icon: '🌛', text: 'Prioriza o sono — a qualidade do descanso é essencial agora.' },
      ],
    },
  };

  const modal       = document.getElementById('phase-modal');
  const btnOpen     = document.getElementById('btn-phase-info');
  const btnClose    = document.getElementById('btn-close-modal');

  function openPhaseModal() {
    const data = PHASE_DATA[info.phase];
    if (!data) return;

    document.getElementById('modal-phase-icon').textContent  = data.icon;
    document.getElementById('modal-phase-title').textContent = data.title;
    document.getElementById('modal-phase-desc').textContent  = data.desc;

    const statsEl = document.getElementById('modal-phase-stats');
    statsEl.innerHTML = data.stats.map(s => `
      <div class="modal-stat">
        <span class="modal-stat-label">${s.label}</span>
        <span class="modal-stat-value">${s.value}</span>
      </div>
    `).join('');

    const tipsEl = document.getElementById('modal-phase-tips');
    tipsEl.innerHTML = `<p class="phase-modal-tips-title">Dicas para esta fase</p>` +
      data.tips.map(t => `
        <div class="modal-tip">
          <span class="modal-tip-icon">${t.icon}</span>
          <span>${t.text}</span>
        </div>
      `).join('');

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closePhaseModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  btnOpen?.addEventListener('click', openPhaseModal);
  btnOpen?.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openPhaseModal(); });
  btnClose?.addEventListener('click', closePhaseModal);
  modal?.addEventListener('click', e => { if (e.target === modal) closePhaseModal(); });
});
