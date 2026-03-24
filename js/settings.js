/* =====================================================
   Lua — Settings Page
   ===================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const sb = getSupabase();
  if (!sb) return;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  const { data: profile } = await sb
    .from('profiles').select('*').eq('id', user.id).single();

  if (profile) {
    setValue('s-period-duration', profile.period_duration);
    setValue('s-cycle-length',    profile.cycle_length);
    setValue('s-regularity',      profile.regularity);
    setValue('s-goal',            profile.goal);
  }

  // ---- Save cycle settings ----
  document.getElementById('cycle-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    const ok  = document.getElementById('cycle-settings-success');
    luaAuth.setLoading(btn, true);

    const { error } = await sb.from('profiles').update({
      period_duration: parseInt(getValue('s-period-duration'), 10),
      cycle_length:    parseInt(getValue('s-cycle-length'),    10),
      regularity:      getValue('s-regularity'),
      goal:            getValue('s-goal'),
    }).eq('id', user.id);

    if (!error) { ok.hidden = false; setTimeout(() => { ok.hidden = true; }, 3000); }
    btn.disabled    = false;
    btn.textContent = 'Guardar';
  });
});

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined && val !== null) el.value = val;
}

function getValue(id) {
  return document.getElementById(id)?.value;
}
