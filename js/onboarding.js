/* =====================================================
   Lua — Onboarding Flow
   ===================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const sb = getSupabase();
  if (!sb) return;

  const TOTAL_STEPS = 5;
  let currentStep   = 1;

  const steps       = document.querySelectorAll('.step');
  const progressFill= document.getElementById('progress-fill');
  const progressLbl = document.getElementById('progress-label');
  const btnNext     = document.getElementById('btn-next');
  const btnBack     = document.getElementById('btn-back');
  const errEl       = document.getElementById('onboarding-error');

  // ---- Step data collectors ----
  const data = {
    last_period_date: '',
    period_duration:  5,
    cycle_length:     28,
    regularity:       '',
    goal:             '',
  };

  // ---- Duration pickers ----
  setupDurationPicker('period-duration-value', 'period-duration', 3, 10, 5, v => (data.period_duration = v));
  setupDurationPicker('cycle-length-value',    'cycle-length',   21, 45, 28, v => (data.cycle_length   = v));

  // ---- Option buttons ----
  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.options-grid');
      group.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      // Write to hidden input
      const step = btn.closest('.step');
      if (step.dataset.step === '4') { step.querySelector('#regularity').value = btn.dataset.value; data.regularity = btn.dataset.value; }
      if (step.dataset.step === '5') { step.querySelector('#goal').value        = btn.dataset.value; data.goal       = btn.dataset.value; }
    });
  });

  // ---- Navigation ----
  btnNext.addEventListener('click', async () => {
    if (!validateStep(currentStep)) return;

    collectStep(currentStep);

    if (currentStep < TOTAL_STEPS) {
      goToStep(currentStep + 1);
    } else {
      await submitOnboarding();
    }
  });

  btnBack.addEventListener('click', () => {
    if (currentStep > 1) goToStep(currentStep - 1);
  });

  function goToStep(n) {
    steps[currentStep - 1].classList.remove('active');
    currentStep = n;
    steps[currentStep - 1].classList.add('active');
    progressFill.style.width = `${(currentStep / TOTAL_STEPS) * 100}%`;
    progressLbl.textContent  = `${currentStep} de ${TOTAL_STEPS}`;
    btnBack.hidden            = currentStep === 1;
    btnNext.textContent       = currentStep === TOTAL_STEPS ? 'Começar' : 'Continuar';
    progressFill.parentElement.setAttribute('aria-valuenow', currentStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function collectStep(n) {
    if (n === 1) {
      data.last_period_date = document.getElementById('last-period-date').value;
    }
  }

  function validateStep(n) {
    luaAuth.hideMsg(errEl);
    if (n === 1) {
      const val = document.getElementById('last-period-date').value;
      if (!val) { luaAuth.showMsg(errEl, 'Por favor seleciona a data do último período.'); return false; }
      if (new Date(val) > new Date()) { luaAuth.showMsg(errEl, 'A data não pode ser no futuro.'); return false; }
    }
    if (n === 4 && !data.regularity) { luaAuth.showMsg(errEl, 'Por favor seleciona uma opção.'); return false; }
    if (n === 5 && !data.goal)       { luaAuth.showMsg(errEl, 'Por favor seleciona um objetivo.'); return false; }
    return true;
  }

  async function submitOnboarding() {
    luaAuth.setLoading(btnNext, true);
    luaAuth.hideMsg(errEl);

    const { data: { user } } = await sb.auth.getUser();
    if (!user) { window.location.href = '/'; return; }

    const { error } = await sb.from('profiles').upsert({
      id:                  user.id,
      name:                user.user_metadata?.name || '',
      last_period_date:    data.last_period_date,
      period_duration:     data.period_duration,
      cycle_length:        data.cycle_length,
      regularity:          data.regularity,
      goal:                data.goal,
      onboarding_complete: true,
    });

    if (error) {
      luaAuth.showMsg(errEl, 'Erro ao guardar. Tenta novamente.');
      luaAuth.setLoading(btnNext, false);
      return;
    }

    window.location.href = '/dashboard';
  }

  // ---- Duration picker helper ----
  function setupDurationPicker(displayId, hiddenId, min, max, initial, onChange) {
    const display = document.getElementById(displayId);
    const hidden  = document.getElementById(hiddenId);
    let value     = initial;

    const section = display.closest('.step');
    section.querySelectorAll('.duration-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const delta = btn.classList.contains('plus') ? 1 : -1;
        value = Math.min(max, Math.max(min, value + delta));
        display.textContent = value;
        hidden.value        = value;
        onChange(value);
      });
    });
  }

  // Set default date max to today
  const dateInput = document.getElementById('last-period-date');
  if (dateInput) {
    dateInput.max = new Date().toISOString().split('T')[0];
    // Default to ~28 days ago
    const def = new Date();
    def.setDate(def.getDate() - 28);
    dateInput.value = def.toISOString().split('T')[0];
    data.last_period_date = dateInput.value;
  }
});
