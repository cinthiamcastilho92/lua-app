/* =====================================================
   Lua — Partner Sharing
   ===================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const sb = getSupabase();
  if (!sb) return;

  // Check if this is a partner viewing via invite token
  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get('invite');

  if (inviteToken) {
    await renderPartnerView(sb, inviteToken);
    return;
  }

  // Normal auth user view
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  // Check for existing partner relationship
  const { data: relationship } = await sb
    .from('partner_relationships')
    .select('*, partner:partner_user_id(id, raw_user_meta_data)')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (relationship?.partner_user_id) {
    showConnectedSection(relationship, user);
  } else {
    showNoPartnerSection();
  }

  // ---- Generate invite ----
  document.getElementById('btn-generate-invite')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-generate-invite');
    luaAuth.setLoading(btn, true);

    // Generate a random token
    const token   = crypto.randomUUID();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const { error } = await sb.from('partner_invites').upsert({
      owner_id:   user.id,
      token,
      expires_at: expires.toISOString(),
      used:       false,
    }, { onConflict: 'owner_id' });

    if (error) {
      luaAuth.showMsg(document.getElementById('partner-error'), 'Erro ao gerar convite.');
      luaAuth.setLoading(btn, false);
      return;
    }

    const link = `${window.location.origin}/partner.html?invite=${token}`;
    const input = document.getElementById('invite-link-input');
    input.value = link;
    document.getElementById('invite-expiry').textContent = `Expira em: ${new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium' }).format(expires)}`;
    document.getElementById('invite-link-box').hidden = false;
    btn.disabled    = false;
    btn.textContent = 'Gerar novo link';
  });

  // ---- Copy link ----
  document.getElementById('btn-copy-link')?.addEventListener('click', async () => {
    const val = document.getElementById('invite-link-input').value;
    await navigator.clipboard.writeText(val);
    const btn = document.getElementById('btn-copy-link');
    btn.textContent = 'Copiado!';
    setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
  });

  // ---- Revoke invite ----
  document.getElementById('btn-revoke-invite')?.addEventListener('click', async () => {
    await sb.from('partner_invites').delete().eq('owner_id', user.id);
    document.getElementById('invite-link-box').hidden = true;
    document.getElementById('btn-generate-invite').textContent = 'Gerar link de convite';
  });

  // ---- Remove partner ----
  document.getElementById('btn-remove-partner')?.addEventListener('click', async () => {
    if (!confirm('Tens a certeza que queres remover o parceiro?')) return;
    await sb.from('partner_relationships').delete().eq('owner_id', user.id);
    window.location.reload();
  });

  // ---- Save permissions ----
  document.getElementById('btn-save-permissions')?.addEventListener('click', async () => {
    const prefs = {
      perm_phase:     document.getElementById('perm-phase')?.checked,
      perm_calendar:  document.getElementById('perm-calendar')?.checked,
      perm_mood:      document.getElementById('perm-mood')?.checked,
      perm_symptoms:  document.getElementById('perm-symptoms')?.checked,
      notif_period_start: document.getElementById('notif-period-start')?.checked,
      notif_period_soon:  document.getElementById('notif-period-soon')?.checked,
      notif_ovulation:    document.getElementById('notif-ovulation')?.checked,
      notif_pms:          document.getElementById('notif-pms')?.checked,
    };
    await sb.from('partner_relationships').update(prefs).eq('owner_id', user.id);
    const ok = document.getElementById('partner-success');
    luaAuth.showMsg(ok, 'Preferências guardadas!');
    setTimeout(() => { ok.hidden = true; }, 3000);
  });
});

function showNoPartnerSection() {
  document.getElementById('no-partner-section').hidden    = false;
  document.getElementById('partner-connected-section').hidden = true;
  document.getElementById('partner-view-section').hidden  = true;
}

function showConnectedSection(rel, user) {
  document.getElementById('no-partner-section').hidden    = true;
  document.getElementById('partner-connected-section').hidden = false;
  document.getElementById('partner-view-section').hidden  = true;

  const name = rel.partner?.raw_user_meta_data?.name || 'Parceiro';
  document.getElementById('partner-name').textContent   = name;
  document.getElementById('partner-avatar').textContent = name.charAt(0).toUpperCase();
  document.getElementById('partner-joined').textContent =
    `Ligado desde ${new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium' }).format(new Date(rel.created_at))}`;

  // Restore permissions
  setCheck('perm-phase',     rel.perm_phase     ?? true);
  setCheck('perm-calendar',  rel.perm_calendar  ?? true);
  setCheck('perm-mood',      rel.perm_mood      ?? false);
  setCheck('perm-symptoms',  rel.perm_symptoms  ?? false);
  setCheck('notif-period-start', rel.notif_period_start ?? true);
  setCheck('notif-period-soon',  rel.notif_period_soon  ?? true);
  setCheck('notif-ovulation',    rel.notif_ovulation    ?? false);
  setCheck('notif-pms',          rel.notif_pms          ?? false);
}

async function renderPartnerView(sb, token) {
  document.getElementById('no-partner-section').hidden    = true;
  document.getElementById('partner-connected-section').hidden = true;
  document.getElementById('partner-view-section').hidden  = false;

  // Validate invite
  const { data: invite } = await sb
    .from('partner_invites')
    .select('owner_id, expires_at, used')
    .eq('token', token)
    .maybeSingle();

  if (!invite || invite.used || new Date(invite.expires_at) < new Date()) {
    luaAuth.showMsg(document.getElementById('partner-error'), 'Link inválido ou expirado.');
    return;
  }

  // Fetch owner's profile
  const { data: profile } = await sb
    .from('profiles')
    .select('name, last_period_date, cycle_length, period_duration, perm_phase, perm_calendar')
    .eq('id', invite.owner_id)
    .single();

  if (!profile) return;

  document.getElementById('pv-name').textContent = profile.name || 'A tua pessoa especial';

  if (profile.perm_phase !== false && profile.last_period_date) {
    const { calculateCycle, formatDate } = window.luaCycle;
    const info = calculateCycle(profile);
    document.getElementById('pv-phase').textContent      = info.phaseName;
    document.getElementById('pv-day').textContent        = `Dia ${info.cycleDay} do ciclo`;
    document.getElementById('pv-next-period').textContent = formatDate(info.nextPeriod);
  }

  // Mark invite as used if partner is logged in and accepts
  const { data: { user } } = await sb.auth.getSession();
  if (user && user.id !== invite.owner_id) {
    await sb.from('partner_relationships').upsert({
      owner_id:        invite.owner_id,
      partner_user_id: user.id,
    }, { onConflict: 'owner_id' });
    await sb.from('partner_invites').update({ used: true }).eq('token', token);
  }
}

function setCheck(id, val) {
  const el = document.getElementById(id);
  if (el) el.checked = val;
}
