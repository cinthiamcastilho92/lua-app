/* =====================================================
   Lua — Daily Notification Cron
   Called by Vercel Cron at 08:00 UTC every day.
   Sends cycle-phase push notifications to subscribed users.
   ===================================================== */
const webpush        = require('web-push');
const { createClient } = require('@supabase/supabase-js');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // service role — bypasses RLS
);

module.exports = async function handler(req, res) {
  // Only Vercel Cron (or manual test with secret) may call this
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers['authorization'] !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Fetch all users who have at least one notification enabled and a period date set
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, cycle_length, period_duration, last_period_date, notif_period_forecast, notif_fertile_window')
    .not('last_period_date', 'is', null)
    .or('notif_period_forecast.eq.true,notif_fertile_window.eq.true');

  if (profilesError) {
    console.error('Error fetching profiles:', profilesError);
    return res.status(500).json({ error: 'DB error fetching profiles' });
  }

  // Today at UTC midnight
  const todayUTC = new Date();
  todayUTC.setUTCHours(0, 0, 0, 0);

  // For each user, calculate today's cycle day and determine which notifications to send
  const userNotifications = [];

  for (const profile of profiles || []) {
    const lastPeriod   = new Date(profile.last_period_date + 'T00:00:00Z');
    const totalElapsed = Math.round((todayUTC - lastPeriod) / 86400000);
    if (totalElapsed <= 0) continue;  // last_period_date is today or future

    const cycleLength    = profile.cycle_length    || 28;
    const periodDuration = profile.period_duration || 5;
    const ovulationDay   = cycleLength - 14;

    // cycleDay: 1-indexed day within the current cycle
    const completedCycles = Math.floor(totalElapsed / cycleLength);
    const cycleDay        = totalElapsed - completedCycles * cycleLength + 1;

    const toSend = [];

    // ── 1. Follicular phase start (day after period ends) ──────────────
    if (profile.notif_fertile_window && cycleDay === periodDuration + 1) {
      toSend.push({
        title: 'Lua',
        body:  'Início fase folicular, melhor fase!',
        url:   '/dashboard',
      });
    }

    // ── 2. One day before ovulation ────────────────────────────────────
    if (profile.notif_fertile_window && cycleDay === ovulationDay - 1) {
      toSend.push({
        title: 'Lua',
        body:  'Atenção, fase de ovulação começa amanhã',
        url:   '/dashboard',
      });
    }

    // ── 3. One week before period (PMS warning) ────────────────────────
    if (profile.notif_period_forecast && cycleDay === cycleLength - 7) {
      toSend.push({
        title: 'Lua',
        body:  'Atenção, pior semana do ciclo começando! Altas emoções!',
        url:   '/dashboard',
      });
    }

    // ── 4. One day before period ───────────────────────────────────────
    if (profile.notif_period_forecast && cycleDay === cycleLength - 1) {
      toSend.push({
        title: 'Lua',
        body:  'Período previsto amanhã',
        url:   '/daily-log',
      });
    }

    if (toSend.length > 0) {
      userNotifications.push({ userId: profile.id, notifications: toSend });
    }
  }

  if (userNotifications.length === 0) {
    return res.status(200).json({ sent: 0, failed: 0 });
  }

  // Fetch push subscriptions for all matching users
  const userIds = userNotifications.map(u => u.userId);
  const { data: subscriptions, error: subError } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', userIds);

  if (subError) {
    console.error('Error fetching subscriptions:', subError);
    return res.status(500).json({ error: 'DB error fetching subscriptions' });
  }

  // Group subscriptions by user_id for fast lookup
  const subsByUser = {};
  for (const sub of subscriptions || []) {
    if (!subsByUser[sub.user_id]) subsByUser[sub.user_id] = [];
    subsByUser[sub.user_id].push(sub);
  }

  const staleEndpoints = [];
  let sent = 0, failed = 0;

  // Send all notifications
  const sends = [];
  for (const { userId, notifications } of userNotifications) {
    const subs = subsByUser[userId] || [];
    for (const sub of subs) {
      for (const notif of notifications) {
        const payload = JSON.stringify({
          title: notif.title,
          body:  notif.body,
          icon:  '/icons/icon-192.png',
          url:   notif.url,
        });
        sends.push(
          webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          ).then(() => { sent++; })
           .catch(err => {
             failed++;
             if (err.statusCode === 410 || err.statusCode === 404) {
               staleEndpoints.push(sub.endpoint);
             }
           })
        );
      }
    }
  }

  await Promise.allSettled(sends);

  // Clean up expired subscriptions
  if (staleEndpoints.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints);
  }

  console.log(`Notifications: ${sent} sent, ${failed} failed`);
  return res.status(200).json({ sent, failed });
};
