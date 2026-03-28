/* =====================================================
   Lua — Auth (login, register, session guard)
   ===================================================== */

// ---- Session guard ----
// Pages that require auth: redirect to / if no session
// Pages that should NOT have auth: redirect to /dashboard if session exists
(async function sessionGuard() {
  const sb   = getSupabase();
  if (!sb) return;

  const { data: { session } } = await sb.auth.getSession();
  const path = window.location.pathname;

  const publicPaths = ['/', '/index.html', '/forgot-password.html', '/forgot-password'];
  const isPublic    = publicPaths.some(p => path === p || path === '') ;

  if (session && isPublic) {
    const { data: profile } = await sb
      .from('profiles')
      .select('onboarding_complete')
      .eq('id', session.user.id)
      .single();

    window.location.replace(profile?.onboarding_complete ? '/dashboard' : '/onboarding');
    return;
  }

  const onboardingPaths = ['/onboarding', '/onboarding.html'];
  if (!session && !isPublic && !onboardingPaths.includes(path)) {
    window.location.replace('/');
    return;
  }
})();

// ---- Login / Register tabs ----
document.addEventListener('DOMContentLoaded', () => {
  const sb = getSupabase();
  if (!sb) return;

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`${btn.dataset.tab}-form`)?.classList.add('active');
    });
  });

  // Login
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = loginForm.querySelector('button[type=submit]');
      const err = document.getElementById('login-error');
      setLoading(btn, true);
      hideMsg(err);

      const { error } = await sb.auth.signInWithPassword({
        email:    loginForm.email.value.trim(),
        password: loginForm.password.value,
      });

      if (error) {
        showMsg(err, 'Email ou palavra-passe incorretos.');
      } else {
        await redirectAfterAuth(sb);
      }
      setLoading(btn, false);
    });
  }

  // Register
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = registerForm.querySelector('button[type=submit]');
      const err = document.getElementById('register-error');
      setLoading(btn, true);
      hideMsg(err);

      const { data, error } = await sb.auth.signUp({
        email:    registerForm.email.value.trim(),
        password: registerForm.password.value,
        options:  { data: { name: registerForm['register-name']?.value.trim() || '' } },
      });

      if (error) {
        showMsg(err, error.message);
      } else if (data.user && !data.session) {
        showMsg(err, 'Verifica o teu email para confirmar a conta.');
        err.style.background = 'var(--color-success-bg)';
        err.style.color = 'var(--color-success)';
        err.hidden = false;
      } else {
        window.location.replace('/onboarding');
      }
      setLoading(btn, false);
    });
  }

  // Forgot password
  const forgotForm = document.getElementById('forgot-form');
  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = forgotForm.querySelector('button[type=submit]');
      const err = document.getElementById('forgot-error');
      const ok  = document.getElementById('forgot-success');
      setLoading(btn, true);
      hideMsg(err); hideMsg(ok);

      const { error } = await sb.auth.resetPasswordForEmail(
        forgotForm.email.value.trim(),
        { redirectTo: `${window.location.origin}/` }
      );

      if (error) { showMsg(err, error.message); }
      else        { ok.hidden = false; }
      setLoading(btn, false);
    });
  }

  // Settings logout / delete
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.replace('/');
  });

  document.getElementById('btn-delete-account')?.addEventListener('click', async () => {
    if (!confirm('Tens a certeza que queres eliminar a tua conta? Esta ação é irreversível.')) return;
    const { error } = await sb.rpc('delete_own_account');
    if (!error) { await sb.auth.signOut(); window.location.href = '/'; }
  });

  // Settings page: populate profile info
  if (document.getElementById('settings-name')) {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      document.getElementById('settings-name').textContent = user.user_metadata?.name || '—';
      document.getElementById('settings-email').textContent = user.email || '—';
    })();
  }
});

// ---- Helpers ----
async function redirectAfterAuth(sb) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  const { data: profile } = await sb
    .from('profiles')
    .select('onboarding_complete')
    .eq('id', user.id)
    .single();
  window.location.replace(profile?.onboarding_complete ? '/dashboard' : '/onboarding');
}

function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.textContent = loading ? 'A carregar…' : btn.dataset.label || btn.textContent;
}

function showMsg(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

function hideMsg(el) {
  if (!el) return;
  el.hidden = true;
  el.textContent = '';
}

// Expose for other modules
window.luaAuth = { redirectAfterAuth, showMsg, hideMsg, setLoading };
