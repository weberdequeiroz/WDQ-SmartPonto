// Cálculos de jornada. Funções puras: não acessam DOM nem armazenamento.

export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
const MAX_SHIFT = 20 * HOUR; // turno aberto há mais que isso é tratado como saída esquecida

export const PUNCH_TYPES = {
  in: { label: 'Entrada', short: 'Entrada' },
  break_start: { label: 'Início de intervalo', short: 'Intervalo' },
  break_end: { label: 'Fim de intervalo', short: 'Retorno' },
  out: { label: 'Saída', short: 'Saída' },
};

export const BREAK_REASONS = ['Refeição', 'Café', 'Pessoal', 'Médico', 'Outro'];

export const OCCURRENCES = {
  folga: { label: 'Folga', paid: true },
  feriado: { label: 'Feriado', paid: true },
  ferias: { label: 'Férias', paid: true },
  atestado: { label: 'Atestado médico', paid: true },
  abono: { label: 'Abono', paid: true },
  falta: { label: 'Falta', paid: false },
};

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const pad = (n) => String(n).padStart(2, '0');

/** Data local no formato AAAA-MM-DD. */
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d.getTime());
}

export function daysBetween(startKey, endKey) {
  const out = [];
  for (let k = startKey; k <= endKey; k = addDays(k, 1)) out.push(k);
  return out;
}

/** "08:05" */
export function hhmm(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Duração em ms → "7h48" / "-0h12". */
export function fmtDur(ms, { sign = false } = {}) {
  const neg = ms < 0;
  const total = Math.round(Math.abs(ms) / MIN);
  const s = `${Math.floor(total / 60)}h${pad(total % 60)}`;
  if (neg) return `-${s}`;
  return sign && total > 0 ? `+${s}` : s;
}

/** Duração em ms → "07:48" (para planilhas). */
export function fmtClock(ms) {
  const neg = ms < 0;
  const total = Math.round(Math.abs(ms) / MIN);
  return `${neg ? '-' : ''}${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** "08:48" → minutos. */
export function parseHHMM(str) {
  const m = /^(\d{1,2}):?(\d{2})$/.exec(String(str).trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToHHMM(min) {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

/**
 * Agrupa as marcações em dias de trabalho.
 * O turno pertence ao dia da entrada, então quem entra às 22h e sai às 6h tem tudo no dia da entrada.
 * Retorna Map<dayKey, { punches, work, breaks, open, state, issues }>.
 */
export function buildDays(punches, now = Date.now()) {
  const days = new Map();
  const get = (k) => {
    if (!days.has(k)) days.set(k, { punches: [], work: 0, breaks: 0, open: false, issues: [] });
    return days.get(k);
  };
  const sorted = [...punches].sort((a, b) => a.ts - b.ts);

  let state = 'off';
  let shiftDay = null;
  let shiftStart = 0;
  let segStart = 0;

  const closeForgotten = () => {
    get(shiftDay).issues.push('Saída não registrada');
    state = 'off';
  };

  for (const p of sorted) {
    if (state !== 'off' && p.ts - shiftStart > MAX_SHIFT) closeForgotten();

    let type = p.type;
    if (state === 'off' && type === 'break_end') type = 'in';
    if (state === 'break' && type === 'in') type = 'break_end';

    const day = state === 'off' ? dayKey(p.ts) : shiftDay;
    const rec = get(day);
    rec.punches.push(p);

    if (type === 'in') {
      if (state === 'working') { rec.issues.push(`Entrada repetida às ${hhmm(p.ts)}`); continue; }
      state = 'working'; shiftDay = day; shiftStart = p.ts; segStart = p.ts;
    } else if (type === 'break_start') {
      if (state !== 'working') { rec.issues.push(`Intervalo sem entrada às ${hhmm(p.ts)}`); continue; }
      rec.work += p.ts - segStart; state = 'break'; segStart = p.ts;
    } else if (type === 'break_end') {
      if (state !== 'break') { rec.issues.push(`Retorno sem intervalo às ${hhmm(p.ts)}`); continue; }
      rec.breaks += p.ts - segStart; state = 'working'; segStart = p.ts;
    } else if (type === 'out') {
      if (state === 'off') { rec.issues.push(`Saída sem entrada às ${hhmm(p.ts)}`); continue; }
      if (state === 'working') rec.work += p.ts - segStart;
      else rec.breaks += p.ts - segStart;
      state = 'off';
    }
  }

  if (state !== 'off') {
    if (now - shiftStart > MAX_SHIFT) closeForgotten();
    else {
      const rec = get(shiftDay);
      rec.open = true;
      rec.state = state;
      rec.segStart = segStart;
      if (state === 'working') rec.work += Math.max(0, now - segStart);
      else rec.breaks += Math.max(0, now - segStart);
    }
  }
  return days;
}

/** Situação atual: 'off' | 'working' | 'break', com o horário de início e a última marcação. */
export function currentState(punches, now = Date.now()) {
  const days = buildDays(punches, now);
  for (const [key, d] of days) {
    if (d.open) {
      const last = d.punches[d.punches.length - 1];
      return { state: d.state, since: d.segStart, day: key, last };
    }
  }
  return { state: 'off', since: null, day: null, last: null };
}

/** Jornada prevista para o dia, em minutos. */
export function expectedMinutes(key, settings, dayInfo) {
  const info = dayInfo?.[key];
  if (info?.occurrence && OCCURRENCES[info.occurrence]?.paid) return 0;
  return plannedMinutes(key, settings);
}

/** Jornada da escala para o dia, sem considerar ocorrências. */
export function plannedMinutes(key, settings) {
  const cycle = settings.cycle;
  if (settings.scheduleMode === 'cycle' && cycle?.days?.length && cycle.start) {
    // Escala de revezamento (12x36, 6x1…): repete a sequência de dias a partir da data inicial.
    const n = cycle.days.length;
    const diff = Math.round((parseDay(key) - parseDay(cycle.start)) / (24 * HOUR));
    return cycle.days[((diff % n) + n) % n] ?? 0;
  }
  return settings.schedule?.[parseDay(key).getDay()] ?? 0;
}

/** Texto curto da jornada configurada: "44h semanais" ou "Escala 12x36". */
export function scheduleSummary(settings) {
  if (settings.scheduleMode === 'cycle' && settings.cycle?.days?.length) {
    const days = settings.cycle.days;
    const work = days.filter((m) => m > 0).length;
    const total = days.reduce((a, b) => a + b, 0);
    const avgWeek = (total / days.length) * 7;
    return `Escala de ${days.length} dias (${work} de trabalho) · média de ${fmtDur(avgWeek * MIN)} por semana`;
  }
  return `${fmtDur((settings.schedule || []).reduce((a, b) => a + b, 0) * MIN)} semanais`;
}

/**
 * Resumo de um dia: trabalhado, previsto, saldo (com tolerância), alertas.
 * Dias futuros não geram saldo negativo.
 */
export function summarizeDay(key, days, settings, dayInfo, todayKey) {
  const d = days.get(key) || { punches: [], work: 0, breaks: 0, open: false, issues: [] };
  const info = dayInfo?.[key] || {};
  const expected = expectedMinutes(key, settings, dayInfo) * MIN;
  const future = key > todayKey;
  const inProgress = key === todayKey && d.open;

  let balance = 0;
  if (!future) {
    balance = d.work - expected;
    // Hoje, enquanto a jornada não termina, só conta o saldo positivo.
    if (key === todayKey && (inProgress || d.punches.length === 0)) balance = Math.max(0, balance);
    const tol = (settings.tolerance ?? 10) * MIN;
    if (Math.abs(balance) <= tol) balance = 0;
  }

  const warnings = [...d.issues];
  if (!d.open && d.work > 6 * HOUR && d.breaks < HOUR) warnings.push('Intervalo menor que 1h em jornada acima de 6h');
  if (d.work > 10 * HOUR) warnings.push('Mais de 10h trabalhadas no dia');

  const ins = d.punches.filter((p) => p.type === 'in');
  const outs = d.punches.filter((p) => p.type === 'out');
  return {
    key,
    punches: d.punches,
    work: d.work,
    breaks: d.breaks,
    expected,
    balance,
    extra: Math.max(0, balance),
    debt: Math.min(0, balance),
    open: d.open,
    future,
    occurrence: info.occurrence || null,
    note: info.note || '',
    firstIn: ins[0]?.ts ?? null,
    lastOut: outs.length ? outs[outs.length - 1].ts : null,
    warnings,
  };
}

/** Relatório de um período fechado [start, end] (dayKeys). */
export function buildReport(startKey, endKey, punches, settings, dayInfo, now = Date.now()) {
  const days = buildDays(punches, now);
  const todayKey = dayKey(now);
  const rows = daysBetween(startKey, endKey).map((k) => summarizeDay(k, days, settings, dayInfo, todayKey));
  const totals = rows.reduce((t, r) => {
    t.work += r.work;
    t.breaks += r.breaks;
    if (!r.future) t.expected += r.expected;
    t.balance += r.balance;
    t.extra += r.extra;
    t.debt += r.debt;
    if (r.work > 0) t.daysWorked += 1;
    if (r.occurrence === 'falta') t.absences += 1;
    if (r.occurrence && r.occurrence !== 'falta') t.excused += 1;
    t.warnings += r.warnings.length;
    return t;
  }, { work: 0, breaks: 0, expected: 0, balance: 0, extra: 0, debt: 0, daysWorked: 0, absences: 0, excused: 0, warnings: 0 });
  totals.avgPerDay = totals.daysWorked ? totals.work / totals.daysWorked : 0;
  return { start: startKey, end: endKey, rows, totals };
}

/** Banco de horas acumulado desde a data inicial configurada até hoje. */
export function hourBank(punches, settings, dayInfo, now = Date.now()) {
  const today = dayKey(now);
  const first = punches.length ? dayKey(Math.min(...punches.map((p) => p.ts))) : today;
  const start = settings.bankStart || first;
  const initial = (settings.bankInitial || 0) * MIN;
  if (start > today) return initial;
  return initial + buildReport(start, today, punches, settings, dayInfo, now).totals.balance;
}

/** Próxima marcação sugerida a partir do estado atual. */
export function suggestedNext(state) {
  if (state === 'working') return 'out';
  if (state === 'break') return 'break_end';
  return 'in';
}

/** Ações permitidas em cada estado. */
export function allowedActions(state) {
  if (state === 'working') return ['break_start', 'out'];
  if (state === 'break') return ['break_end', 'out'];
  return ['in'];
}

/** Semana (domingo a sábado) que contém o dia. */
export function weekRange(key) {
  const d = parseDay(key);
  const start = addDays(key, -d.getDay());
  return [start, addDays(start, 6)];
}

export function monthRange(key) {
  const d = parseDay(key);
  const start = dayKey(new Date(d.getFullYear(), d.getMonth(), 1).getTime());
  const end = dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime());
  return [start, end];
}

export function yearRange(key) {
  const y = parseDay(key).getFullYear();
  return [`${y}-01-01`, `${y}-12-31`];
}

/** "qui, 09/10/2026" */
export function fmtDay(key, { weekday = true, year = true } = {}) {
  const d = parseDay(key);
  const base = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}${year ? '/' + d.getFullYear() : ''}`;
  return weekday ? `${WEEKDAYS_SHORT[d.getDay()]}, ${base}` : base;
}

export function fmtDayLong(key) {
  const d = parseDay(key);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

export const DEFAULT_SETTINGS = {
  name: '',
  company: '',
  role: '',
  employeeId: '',
  // Minutos previstos por dia da semana (domingo = 0). Padrão: 8h de segunda a sexta (40h semanais).
  schedule: [0, 480, 480, 480, 480, 480, 0],
  // 'weekly' usa schedule; 'cycle' usa uma escala que se repete a partir de cycle.start.
  scheduleMode: 'weekly',
  cycle: { start: '', days: [] },
  // Modelos de jornada criados pelo usuário: { name, mode, schedule, cycle }.
  customPresets: [],
  tolerance: 10,
  bankStart: '',
  bankInitial: 0,
  confirmPunch: false,
  geolocation: false,
  theme: 'system',
  backupReminderDays: 7,
};
