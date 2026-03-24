/* =====================================================
   Lua — Push Notifications
   ===================================================== */

/**
 * Request push permission and subscribe the user.
 * Saves the subscription to Supabase push_subscriptions table.
 */
async function enablePushNotifications() {
  const sb = getSupabase();
  if (!sb) return false;

  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('O teu browser não suporta notificações push.');
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    alert('Permissão de notificações negada.');
    return false;
  }

  try {
    const reg          = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;

    const subJson = subscription.toJSON();
    await sb.from('push_subscriptions').upsert({
      user_id:  user.id,
      endpoint: subJson.endpoint,
      p256dh:   subJson.keys.p256dh,
      auth:     subJson.keys.auth,
    }, { onConflict: 'user_id' });

    return true;
  } catch (err) {
    console.error('Push subscription failed:', err);
    return false;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// ---- Wire up settings page button ----
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-enable-push')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-enable-push');
    btn.disabled = true;
    const ok = await enablePushNotifications();
    btn.textContent = ok ? 'Notificações ativadas ✓' : 'Tentar novamente';
    btn.disabled    = false;
  });
});

window.luaNotifications = { enablePushNotifications };
