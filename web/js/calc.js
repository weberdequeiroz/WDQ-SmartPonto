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

// Motivos de pausa. paid = o tempo conta como trabalho (pausas concedidas pela empresa, serviço externo, curso).
export const BREAK_REASONS = [
  { label: 'Refeição', hint: 'Almoço, jantar ou lanche', paid: false, icon: 'meal' },
  { label: 'Café', hint: 'Pausa curta para café ou lanche', paid: true, icon: 'break_start' },
  { label: 'Descanso', hint: 'Pausa de descanso (NR-17)', paid: true, icon: 'pause' },
  { label: 'A serviço', hint: 'Banco, cliente, entrega, cartório', paid: true, icon: 'car' },
  { label: 'Treinamento', hint: 'Curso, palestra ou reunião externa', paid: true, icon: 'book' },
  { label: 'Médico', hint: 'Consulta ou exame', paid: false, icon: 'health' },
  { label: 'Pessoal', hint: 'Assunto particular', paid: false, icon: 'user' },
  { label: 'Outro', hint: 'Qualquer outro motivo', paid: false, icon: 'more' },
];
export const isPaidBreak = (reason) => !!BREAK_REASONS.find((r) => r.label === reason)?.paid;

// Modalidade de trabalho registrada na entrada.
export const WORK_MODES = {
  presencial: 'Presencial',
  remoto: 'Home office',
  externo: 'Externo / cliente',
  viagem: 'Viagem',
};

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
    if (!days.has(k)) days.set(k, { punches: [], work: 0, breaks: 0, paidBreaks: 0, open: false, issues: [] });
    return days.get(k);
  };
  const sorted = [...punches].sort((a, b) => a.ts - b.ts);

  let state = 'off';
  let shiftDay = null;
  let shiftStart = 0;
  let segStart = 0;
  let breakPaid = false;
  let lastOut = null;

  const closeForgotten = () => {
    get(shiftDay).issues.push('Saída não registrada');
    state = 'off';
    lastOut = null;
  };
  // Tempo de pausa: a remunerada soma ao trabalhado.
  const addBreak = (rec, ms) => {
    if (breakPaid) { rec.work += ms; rec.paidBreaks += ms; } else rec.breaks += ms;
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
      if (lastOut !== null && p.ts - lastOut < 11 * HOUR) {
        rec.issues.push(`Descanso entre jornadas de ${fmtDur(p.ts - lastOut)} (mínimo 11h)`);
      }
      state = 'working'; shiftDay = day; shiftStart = p.ts; segStart = p.ts;
      rec.mode = p.mode || rec.mode;
    } else if (type === 'break_start') {
      if (state !== 'working') { rec.issues.push(`Intervalo sem entrada às ${hhmm(p.ts)}`); continue; }
      rec.work += p.ts - segStart; state = 'break'; segStart = p.ts; breakPaid = isPaidBreak(p.reason);
    } else if (type === 'break_end') {
      if (state !== 'break') { rec.issues.push(`Retorno sem intervalo às ${hhmm(p.ts)}`); continue; }
      addBreak(rec, p.ts - segStart); state = 'working'; segStart = p.ts;
    } else if (type === 'out') {
      if (state === 'off') { rec.issues.push(`Saída sem entrada às ${hhmm(p.ts)}`); continue; }
      if (state === 'working') rec.work += p.ts - segStart;
      else addBreak(rec, p.ts - segStart);
      state = 'off';
      lastOut = p.ts;
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
      else addBreak(rec, Math.max(0, now - segStart));
      rec.breakPaid = state === 'break' && breakPaid;
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
  if (settings.workPlan) return shiftMinutes(shiftFor(key, settings));
  const cycle = settings.cycle;
  if (settings.scheduleMode === 'cycle' && cycle?.days?.length && cycle.start) {
    // Escala de revezamento (12x36, 6x1…): repete a sequência de dias a partir da data inicial.
    const n = cycle.days.length;
    const diff = Math.round((parseDay(key) - parseDay(cycle.start)) / (24 * HOUR));
    return cycle.days[((diff % n) + n) % n] ?? 0;
  }
  return settings.schedule?.[parseDay(key).getDay()] ?? 0;
}

// ---------- Horário de trabalho (por horários de relógio) ----------
// settings.workPlan = {
//   mode: 'same' (mesmo horário nos dias marcados) | 'perday' (um horário por dia da semana) | 'cycle' (escala),
//   days: [1..5], shift: { in, bs, be, out },       // 'same'
//   perDay: [shift | null] x7 (domingo = 0),         // 'perday'
//   cycle: { start: 'AAAA-MM-DD', pattern: [true, false…], shift },  // 'cycle': true = dia de trabalho
// }
// shift: entrada, saída e volta do almoço, saída ('HH:MM'). bs/be vazios = sem intervalo. Saída menor que a entrada = dia seguinte.

/** Minutos trabalhados num turno (descontando o almoço). */
export function shiftMinutes(sh) {
  if (!sh) return 0;
  const a = parseHHMM(sh.in || '');
  let b = parseHHMM(sh.out || '');
  if (a === null || b === null) return 0;
  while (b <= a) b += 1440;
  let total = b - a;
  const pause = shiftBreak(sh);
  if (pause) total -= pause.end - pause.start;
  return Math.max(0, total);
}

/** Almoço em minutos a partir da meia-noite do dia da entrada, ou null. */
export function shiftBreak(sh) {
  const a = parseHHMM(sh?.in || '');
  let s = parseHHMM(sh?.bs || '');
  let e = parseHHMM(sh?.be || '');
  if (a === null || s === null || e === null) return null;
  while (s < a) s += 1440;
  while (e <= s) e += 1440;
  let out = parseHHMM(sh.out || '');
  if (out !== null) { while (out <= a) out += 1440; if (e > out) return null; }
  return { start: s, end: e };
}

/** Turno de um dia, ou null se for folga. */
export function shiftFor(key, settings) {
  const wp = settings.workPlan;
  if (!wp) return null;
  const wd = parseDay(key).getDay();
  if (wp.mode === 'cycle') {
    const c = wp.cycle;
    if (!c?.pattern?.length || !c.start) return null;
    const n = c.pattern.length;
    const diff = Math.round((parseDay(key) - parseDay(c.start)) / (24 * HOUR));
    return c.pattern[((diff % n) + n) % n] ? c.shift : null;
  }
  if (wp.mode === 'perday') return wp.perDay?.[wd] || null;
  if (!(wp.days || []).includes(wd)) return null;
  return wp.overrides?.[wd] || wp.shift;
}

// Escalas conhecidas: true = trabalho. Todas terminam em folga.
export const CYCLE_TYPES = {
  '6x1': { label: '6x1', hint: '6 trabalho, 1 folga', pattern: [true, true, true, true, true, true, false] },
  '5x1': { label: '5x1', hint: '5 trabalho, 1 folga', pattern: [true, true, true, true, true, false] },
  '4x2': { label: '4x2', hint: '4 trabalho, 2 folgas', pattern: [true, true, true, true, false, false] },
  '12x36': { label: '12x36', hint: 'Dia sim, dia não', pattern: [true, false] },
  '24x48': { label: '24x48', hint: '24h, 2 folgas', pattern: [true, false, false] },
};

export function cycleTypeOf(pattern) {
  const key = JSON.stringify(pattern || []);
  return Object.keys(CYCLE_TYPES).find((k) => JSON.stringify(CYCLE_TYPES[k].pattern) === key) || 'custom';
}

/** Início da sequência a partir do último dia de folga (último dia do padrão). */
export function cycleStartFromLastOff(lastOff, pattern) {
  return addDays(lastOff, -(pattern.length - 1));
}

/** Último dia de folga (fim do padrão) até hoje, a partir do início da sequência. */
export function cycleLastOff(start, pattern, todayKey) {
  const n = pattern.length;
  const diff = Math.round((parseDay(todayKey) - parseDay(start)) / (24 * HOUR));
  const idx = ((diff % n) + n) % n;
  return addDays(todayKey, -((idx - (n - 1) + n) % n));
}

/** Converte formatos anteriores para { mode: 'week' | 'cycle' }. */
export function normalizePlan(wp) {
  if (!wp || wp.mode === 'week') return wp;
  if (wp.mode === 'cycle') return { ...wp, cycle: { ...wp.cycle, type: wp.cycle?.type || cycleTypeOf(wp.cycle?.pattern) } };
  if (wp.mode === 'perday') {
    const list = (wp.perDay || []).map((sh, i) => [i, sh]).filter(([, sh]) => sh);
    const count = {};
    list.forEach(([, sh]) => { const k = JSON.stringify(sh); count[k] = (count[k] || 0) + 1; });
    const main = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    const shift = main ? JSON.parse(main[0]) : (wp.shift || { in: '08:00', bs: '12:00', be: '13:00', out: '17:00' });
    const overrides = {};
    list.forEach(([i, sh]) => { if (JSON.stringify(sh) !== JSON.stringify(shift)) overrides[i] = sh; });
    return { mode: 'week', days: list.map(([i]) => i), shift, overrides, cycle: wp.cycle };
  }
  return { mode: 'week', days: wp.days || [1, 2, 3, 4, 5], shift: wp.shift, overrides: {}, cycle: wp.cycle };
}

/** "10:00–18:20 · almoço 14:00–15:00" */
export function shiftText(sh) {
  if (!sh) return 'Folga';
  return shiftBreak(sh) ? `${sh.in}–${sh.out} · almoço ${sh.bs}–${sh.be}` : `${sh.in}–${sh.out}`;
}

/** Converte a configuração antiga (horas por dia + horário padrão) para horários de relógio. */
export function migrateWorkPlan(s) {
  const toShift = (min) => {
    if (!min) return null;
    const entry = parseHHMM(s.workStart || '08:00') ?? 480;
    const pause = breakMinutes(min, s);
    const hm = (m) => minutesToHHMM(((m % 1440) + 1440) % 1440);
    if (!pause) return { in: hm(entry), bs: '', be: '', out: hm(entry + min) };
    let start = parseHHMM(s.mealStart || '12:00') ?? 720;
    if (start <= entry || start >= entry + min) start = entry + Math.max(30, Math.round(min / 2 / 30) * 30);
    return { in: hm(entry), bs: hm(start), be: hm(start + pause), out: hm(entry + min + pause) };
  };
  const base = { mode: 'same', days: [1, 2, 3, 4, 5], shift: toShift(480), perDay: [null, null, null, null, null, null, null], cycle: { start: '', pattern: [true, false], shift: toShift(720) } };
  if (s.scheduleMode === 'cycle' && s.cycle?.days?.length) {
    const first = s.cycle.days.find((m) => m > 0) || 480;
    return { ...base, mode: 'cycle', cycle: { start: s.cycle.start || '', pattern: s.cycle.days.map((m) => m > 0), shift: toShift(first) } };
  }
  const sched = s.schedule || [0, 480, 480, 480, 480, 480, 0];
  const perDay = sched.map(toShift);
  const work = perDay.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
  const same = work.every((i) => JSON.stringify(perDay[i]) === JSON.stringify(perDay[work[0]]));
  if (work.length && same) return { ...base, mode: 'same', days: work, shift: perDay[work[0]], perDay };
  return { ...base, mode: 'perday', perDay, shift: perDay[work[0]] || base.shift, days: work };
}

/** Texto curto da jornada configurada: "44h semanais" ou "Escala 12x36". */
export function scheduleSummary(settings) {
  const wp = settings.workPlan;
  if (wp) {
    if (wp.mode === 'cycle') {
      const p = wp.cycle?.pattern || [];
      const work = p.filter(Boolean).length;
      const avg = p.length ? (work * shiftMinutes(wp.cycle.shift) / p.length) * 7 : 0;
      return `${fmtDur(shiftMinutes(wp.cycle?.shift) * MIN)} por dia de trabalho · escala de ${p.length} dias (${work} de trabalho, ${p.length - work} de folga) · média de ${fmtDur(avg * MIN)} por semana`;
    }
    let week = 0;
    for (let wd = 0; wd < 7; wd++) {
      week += shiftMinutes(wp.mode === 'perday' ? wp.perDay?.[wd] : (wp.days || []).includes(wd) ? (wp.overrides?.[wd] || wp.shift) : null);
    }
    return `${fmtDur(week * MIN)} por semana`;
  }
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
 * Marcações de um dia montadas a partir do horário padrão e da jornada prevista.
 * Jornada acima de 6h ganha o intervalo de refeição; a saída fecha exatamente a jornada do dia.
 */
export function dayTemplate(key, settings, dayInfo, opts = {}) {
  const exp = expectedMinutes(key, settings, dayInfo);
  if (exp <= 0) return [];
  if (settings.workPlan) {
    const sh = shiftFor(key, settings);
    const a = parseHHMM(sh.in);
    const at = (min) => { const d = parseDay(key); d.setHours(0, min, 0, 0); return d.getTime(); };
    const pause = opts.withBreak === false ? null : shiftBreak(sh);
    if (!pause) return [{ type: 'in', ts: at(a) }, { type: 'out', ts: at(a + exp) }];
    return [
      { type: 'in', ts: at(a) },
      { type: 'break_start', ts: at(pause.start), reason: 'Refeição' },
      { type: 'break_end', ts: at(pause.end) },
      { type: 'out', ts: at(a + exp + (pause.end - pause.start)) },
    ];
  }
  const entry = parseHHMM(settings.workStart || '08:00') ?? 480;
  const pause = breakMinutes(exp, settings, opts.withBreak);
  const base = parseDay(key);
  const at = (min) => {
    const d = new Date(base);
    d.setHours(0, min, 0, 0); // minutos além de 24h caem no dia seguinte (turno noturno)
    return d.getTime();
  };
  if (pause > 0) {
    let start = parseHHMM(settings.mealStart || '12:00') ?? 720;
    // Intervalo fora do turno (turno da noite, jornada curta): vai para o meio da jornada, em hora cheia ou meia hora.
    if (start <= entry || start >= entry + exp) start = entry + Math.max(30, Math.round(exp / 2 / 30) * 30);
    const after = exp - (start - entry);
    return [
      { type: 'in', ts: at(entry) },
      { type: 'break_start', ts: at(start), reason: 'Refeição' },
      { type: 'break_end', ts: at(start + pause) },
      { type: 'out', ts: at(start + pause + after) },
    ];
  }
  return [{ type: 'in', ts: at(entry) }, { type: 'out', ts: at(entry + exp) }];
}

/**
 * Minutos de intervalo para uma jornada. Acima de 6h sempre há refeição.
 * Até 6h depende de settings.shortBreak: 'meal' (mesma refeição), 'clt' (15 min acima de 4h) ou 'none'.
 * withBreak força com (true) ou sem (false) a refeição.
 */
export function breakMinutes(exp, settings, withBreak) {
  const meal = Math.max(0, Number(settings.mealMinutes ?? 60));
  if (withBreak === true) return meal;
  if (withBreak === false) return 0;
  if (exp > 360) return meal;
  const mode = settings.shortBreak || 'meal';
  if (mode === 'meal') return meal;
  if (mode === 'clt') return exp > 240 ? 15 : 0;
  return 0;
}

/** Completa um dia: mantém o que já foi marcado e acrescenta só os tipos que faltam. */
export function completeWithTemplate(existing, template) {
  const have = new Set(existing.map((p) => p.type));
  return template.filter((t) => !have.has(t.type));
}

/**
 * Resumo de um dia: trabalhado, previsto, saldo (com tolerância), alertas.
 * Dias futuros não geram saldo negativo.
 */
export function summarizeDay(key, days, settings, dayInfo, todayKey) {
  const d = days.get(key) || { punches: [], work: 0, breaks: 0, paidBreaks: 0, open: false, issues: [] };
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
    paidBreaks: d.paidBreaks || 0,
    mode: d.mode || null,
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
    t.paidBreaks += r.paidBreaks;
    if (r.mode && r.work > 0) t.modes[r.mode] = (t.modes[r.mode] || 0) + 1;
    t.warnings += r.warnings.length;
    return t;
  }, { work: 0, breaks: 0, paidBreaks: 0, modes: {}, expected: 0, balance: 0, extra: 0, debt: 0, daysWorked: 0, absences: 0, excused: 0, warnings: 0 });
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
  // Água: meta diária (ml), tamanho do copo e se o cartão aparece na tela Ponto.
  waterGoal: 2000,
  waterCup: 250,
  waterCard: true,
  // Modalidade
  defaultMode: 'presencial',
  askMode: false,
  // Alertas automáticos do ponto (minutos / horários)
  alertEntry: false,
  alertEntryTime: '08:00',
  alertMealEnd: true,
  mealMinutes: 60,
  alertNoBreak: true,
  alertJourneyDone: true,
  alertForgotOut: true,
  alertStyle: 'notify',
  // Horário padrão usado para preencher e corrigir dias
  workStart: '08:00',
  mealStart: '12:00',
  shortBreak: 'meal',
  holidays: true,
};
