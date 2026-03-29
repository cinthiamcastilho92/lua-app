/* =====================================================
   Lua — Daily Log
   ===================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const sb = getSupabase();
  if (!sb) return;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  // Determine target date (query param or today)
  const params   = new URLSearchParams(window.location.search);
  const dateStr  = params.get('date') || new Date().toISOString().split('T')[0];
  const dateObj  = new Date(dateStr + 'T12:00:00');

  // Display date
  document.getElementById('log-date').textContent =
    new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(dateObj);

  // ---- Pain slider ----
  const painSlider = document.getElementById('pain-level');
  const painDisplay = document.getElementById('pain-value-display');
  function updatePainSlider(val) {
    painDisplay.textContent = val;
    const pct = (val / 10) * 100;
    painSlider.style.setProperty('--slider-pct', pct + '%');
  }
  painSlider.addEventListener('input', () => updatePainSlider(painSlider.value));
  updatePainSlider(0);

  // ---- Notes char count ----
  const notesEl    = document.getElementById('log-notes');
  const notesCount = document.getElementById('notes-count');
  notesEl.addEventListener('input', () => {
    notesCount.textContent = notesEl.value.length;
  });

  // ---- Load existing log ----
  const { data: existing } = await sb
    .from('daily_logs')
    .select('*')
    .eq('user_id', user.id)
    .eq('log_date', dateStr)
    .maybeSingle();

  if (existing) {
    // Flow
    if (existing.flow) {
      const flowRadio = document.querySelector(`input[name="flow"][value="${existing.flow}"]`);
      if (flowRadio) flowRadio.checked = true;
    }
    // Pain
    painSlider.value = existing.pain_level ?? 0;
    updatePainSlider(painSlider.value);

    // Mood (array)
    (existing.mood || []).forEach(m => {
      const el = document.querySelector(`input[name="mood"][value="${m}"]`);
      if (el) el.checked = true;
    });

    // Symptoms (array)
    (existing.symptoms || []).forEach(s => {
      const el = document.querySelector(`input[name="symptoms"][value="${s}"]`);
      if (el) el.checked = true;
    });

    // Notes
    if (existing.notes) {
      notesEl.value = existing.notes;
      notesCount.textContent = existing.notes.length;
    }
  }

  // ---- Submit ----
  const form    = document.getElementById('daily-log-form');
  const successEl = document.getElementById('log-success');
  const errEl   = document.getElementById('log-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    luaAuth.setLoading(btn, true);
    successEl.hidden = true;
    errEl.hidden     = true;

    const flow     = form.querySelector('input[name="flow"]:checked')?.value || 'none';
    const painLevel = parseInt(painSlider.value, 10);
    const mood     = [...form.querySelectorAll('input[name="mood"]:checked')].map(i => i.value);
    const symptoms = [...form.querySelectorAll('input[name="symptoms"]:checked')].map(i => i.value);
    const notes    = notesEl.value.trim() || null;

    const payload = {
      user_id:    user.id,
      log_date:   dateStr,
      flow,
      pain_level: painLevel,
      mood,
      symptoms,
      notes,
      updated_at: new Date().toISOString(),
    };

    const { error } = await sb.from('daily_logs').upsert(payload, {
      onConflict: 'user_id,log_date',
    });

    if (error) {
      luaAuth.showMsg(errEl, 'Erro ao guardar o registo. Tenta novamente.');
      btn.disabled    = false;
      btn.textContent = 'Guardar Registo';
    } else {
      // Replace button with a direct navigation link (reliable on Chrome iOS)
      btn.textContent = '✓ Guardado — Voltar ao Dashboard';
      btn.disabled = false;
      btn.type = 'button';
      btn.onclick = () => { window.location.href = '/dashboard'; };
    }
  });
});
