/* =====================================================
   Lua — Cycle Calculation Engine
   ===================================================== */

/**
 * @typedef {'menstrual'|'follicular'|'ovulation'|'luteal'} CyclePhase
 *
 * @typedef {Object} CycleInfo
 * @property {number}     cycleDay      - Day 1 = first day of last period
 * @property {number}     cycleLength   - Total cycle length in days
 * @property {number}     periodDuration
 * @property {CyclePhase} phase         - Current phase
 * @property {string}     phaseName     - Localised phase name
 * @property {Date}       nextPeriod    - Estimated next period start
 * @property {Date}       ovulationDay  - Estimated ovulation day
 * @property {Date}       fertileStart  - Start of fertile window
 * @property {Date}       fertileEnd    - End of fertile window
 * @property {string}     fertilityStatus
 */

const PHASE_NAMES = {
  menstrual:  'Menstruação',
  follicular: 'Folicular',
  ovulation:  'Ovulação',
  luteal:     'Lútea',
};

const PHASE_INSIGHTS = {
  menstrual:  'O teu corpo está a renovar-se. Descansa, mantém-te hidratada e ouve o teu corpo.',
  follicular: 'Os teus níveis de energia estão a subir. É um bom momento para começar novos projetos.',
  ovulation:  'Estás na tua fase mais energética e sociável. Aproveita esta janela de vitalidade!',
  luteal:     'Foca-te em rotinas relaxantes. Podem surgir alterações de humor — isso é completamente normal.',
};

/**
 * Calculate current cycle state from a profile.
 * @param {{ last_period_date: string, cycle_length: number, period_duration: number }} profile
 * @param {Date} [today]
 * @returns {CycleInfo}
 */
function calculateCycle(profile, today = new Date()) {
  const { last_period_date, cycle_length, period_duration } = profile;

  const lastPeriod   = startOfDay(new Date(last_period_date));
  const todayNorm    = startOfDay(today);

  // Advance last period until it's the most recent past start
  let periodStart = new Date(lastPeriod);
  while (addDays(periodStart, cycle_length) <= todayNorm) {
    periodStart = addDays(periodStart, cycle_length);
  }

  const cycleDay = daysBetween(periodStart, todayNorm) + 1; // 1-indexed

  const ovulationDay   = addDays(periodStart, cycle_length - 14);
  const fertileStart   = addDays(ovulationDay, -5);
  const fertileEnd     = addDays(ovulationDay, 1);
  const nextPeriod     = addDays(periodStart, cycle_length);

  const phase = getPhase(cycleDay, period_duration, cycle_length);

  const isFertile  = todayNorm >= fertileStart && todayNorm <= fertileEnd;
  const isOvDay    = daysBetween(todayNorm, ovulationDay) === 0;
  const fertilityStatus = isOvDay
    ? 'Ovulação hoje'
    : isFertile
      ? 'Janela fértil'
      : 'Baixa fertilidade';

  return {
    cycleDay,
    cycleLength: cycle_length,
    periodDuration: period_duration,
    phase,
    phaseName:  PHASE_NAMES[phase],
    phaseInsight: PHASE_INSIGHTS[phase],
    nextPeriod,
    ovulationDay,
    fertileStart,
    fertileEnd,
    fertilityStatus,
    periodStart,
  };
}

/**
 * Returns the phase for a given cycle day.
 * @param {number} cycleDay
 * @param {number} periodDuration
 * @param {number} cycleLength
 * @returns {CyclePhase}
 */
function getPhase(cycleDay, periodDuration, cycleLength) {
  const ovulationDay = cycleLength - 14;
  if (cycleDay <= periodDuration)          return 'menstrual';
  if (cycleDay < ovulationDay - 1)         return 'follicular';
  if (cycleDay <= ovulationDay + 1)        return 'ovulation';
  return 'luteal';
}

/**
 * Returns phase info for a specific calendar date.
 * @param {Date} date
 * @param {{ last_period_date: string, cycle_length: number, period_duration: number }} profile
 * @returns {{ phase: CyclePhase, phaseName: string, cycleDay: number }}
 */
function getPhaseForDate(date, profile) {
  const { last_period_date, cycle_length, period_duration } = profile;
  const lastPeriod = startOfDay(new Date(last_period_date));
  const target     = startOfDay(date);

  // Find the cycle start before or on target
  let periodStart = new Date(lastPeriod);
  // Step forward
  while (addDays(periodStart, cycle_length) <= target) {
    periodStart = addDays(periodStart, cycle_length);
  }
  // Step backward if target is before lastPeriod
  while (periodStart > target) {
    periodStart = addDays(periodStart, -cycle_length);
  }

  const cycleDay = daysBetween(periodStart, target) + 1;
  if (cycleDay < 1 || cycleDay > cycle_length) return null;

  const phase = getPhase(cycleDay, period_duration, cycle_length);
  return { phase, phaseName: PHASE_NAMES[phase], cycleDay };
}

/**
 * Returns an array of upcoming cycle events (next 90 days).
 * @param {{ last_period_date: string, cycle_length: number, period_duration: number }} profile
 * @param {Date} [from]
 * @returns {Array<{type: string, date: Date, label: string, phase: CyclePhase}>}
 */
function getUpcomingEvents(profile, from = new Date()) {
  const events = [];
  const today  = startOfDay(from);

  // Generate events for the next 3 cycles
  let { periodStart } = calculateCycle(profile, from);

  for (let i = 0; i < 3; i++) {
    const nextPeriodStart = addDays(periodStart, i === 0 ? profile.cycle_length : profile.cycle_length * i);
    const ovDay           = addDays(periodStart, profile.cycle_length - 14 + profile.cycle_length * i);
    const fertileS        = addDays(ovDay, -5);

    if (nextPeriodStart > today) {
      events.push({ type: 'period',    date: nextPeriodStart, label: 'Início do período',  phase: 'menstrual' });
    }
    if (ovDay > today) {
      events.push({ type: 'ovulation', date: ovDay,           label: 'Ovulação prevista', phase: 'ovulation' });
    }
    if (fertileS > today) {
      events.push({ type: 'fertile',   date: fertileS,        label: 'Início da janela fértil', phase: 'follicular' });
    }
  }

  events.sort((a, b) => a.date - b.date);
  return events.slice(0, 5);
}

// ---- Date utilities ----
function startOfDay(d) {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

function formatDate(d, opts = { day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('pt-PT', opts).format(d);
}

function daysUntil(d) {
  const diff = daysBetween(new Date(), d);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff < 0)  return `há ${Math.abs(diff)} dia${Math.abs(diff) !== 1 ? 's' : ''}`;
  return `em ${diff} dia${diff !== 1 ? 's' : ''}`;
}

// Expose globally
window.luaCycle = {
  calculateCycle,
  getPhase,
  getPhaseForDate,
  getUpcomingEvents,
  PHASE_NAMES,
  PHASE_INSIGHTS,
  startOfDay,
  addDays,
  daysBetween,
  formatDate,
  daysUntil,
};
