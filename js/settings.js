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
    // Cycle settings
    setValue('s-period-duration', profile.period_duration);
    setValue('s-cycle-length',    profile.cycle_length);
    setValue('s-regularity',      profile.regularity);
    setValue('s-goal',            profile.goal);

    // Notification toggles
    setChecked('notif-my-period', profile.notif_period_forecast);
    setChecked('notif-daily-log', profile.notif_daily_reminder);
    setChecked('notif-fertile',   profile.notif_fertile_window);
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

  // ---- Notification toggles ----
  // Maps checkbox id → profiles column
  const notifMap = {
    'notif-my-period': 'notif_period_forecast',  // 7 days before + 1 day before period
    'notif-daily-log': 'notif_daily_reminder',
    'notif-fertile':   'notif_fertile_window',    // follicular start + 1 day before ovulation
  };

  Object.entries(notifMap).forEach(([checkboxId, column]) => {
    document.getElementById(checkboxId)?.addEventListener('change', async (e) => {
      const enabled = e.target.checked;

      if (enabled) {
        const alreadySubscribed = await isPushSubscribed();
        if (!alreadySubscribed) {
          const ok = await luaNotifications.enablePushNotifications();
          if (!ok) {
            e.target.checked = false;  // revert if user denied permission
            return;
          }
        }
      }

      await luaNotifications.saveNotifPreference(column, enabled);
    });
  });
});

// ---- Helpers ----
function setValue(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined && val !== null) el.value = val;
}

function setChecked(id, val) {
  const el = document.getElementById(id);
  if (el) el.checked = !!val;
}

function getValue(id) {
  return document.getElementById(id)?.value;
}

async function isPushSubscribed() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}
