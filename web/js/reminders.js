// Lembretes: regras de repetição, dias úteis com feriados nacionais, descrição em português e exportação para agenda (.ics).
// Funções puras: não acessam DOM nem armazenamento.
import { MIN, HOUR, dayKey, parseDay, addDays, parseHHMM, minutesToHHMM, WEEKDAYS, MONTHS, fmtDay } from './calc.js';

export const RULE_TYPES = {
  once: 'Uma vez',
  daily: 'Todo dia',
  week: 'Dias da semana',
  interval: 'A cada N dias / semanas / meses',
  hourly: 'De tempo em tempo no dia',
  monthDay: 'Todo mês num dia fixo',
  monthBusinessDay: 'Dia útil do mês (1º, 2º… último)',
  monthWeekday: 'Dia da semana do mês (ex.: 2ª segunda)',
  yearly: 'Todo ano',
};

const WD_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const WD_PLURAL = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados'];
const WD_ICS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const ORD = (n) => (n === -1 ? 'último' : `${n}º`);
const ORD_F = (n) => (n === -1 ? 'última' : `${n}ª`);

// ---------- Feriados nacionais (Brasil) ----------

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easter(y) {
  const a = y % 19; const b = Math.floor(y / 100); const c = y % 100;
  const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dayKey(new Date(y, month - 1, day).getTime());
}

const holidayCache = new Map();
/** Feriados nacionais e datas em que bancos e a maioria das empresas não abrem (Carnaval, Sexta-feira Santa, Corpus Christi). */
export function brHolidays(y) {
  if (holidayCache.has(y)) return holidayCache.get(y);
  const map = new Map([
    [`${y}-01-01`, 'Confraternização Universal'],
    [`${y}-04-21`, 'Tiradentes'],
    [`${y}-05-01`, 'Dia do Trabalho'],
    [`${y}-09-07`, 'Independência do Brasil'],
    [`${y}-10-12`, 'Nossa Senhora Aparecida'],
    [`${y}-11-02`, 'Finados'],
    [`${y}-11-15`, 'Proclamação da República'],
    [`${y}-11-20`, 'Dia da Consciência Negra'],
    [`${y}-12-25`, 'Natal'],
  ]);
  const e = easter(y);
  map.set(addDays(e, -48), 'Carnaval');
  map.set(addDays(e, -47), 'Carnaval');
  map.set(addDays(e, -2), 'Sexta-feira Santa');
  map.set(addDays(e, 60), 'Corpus Christi');
  holidayCache.set(y, map);
  return map;
}

export function holidayName(key) {
  return brHolidays(Number(key.slice(0, 4))).get(key) || null;
}

/**
 * ctx: { holidays: boolean (considerar feriados nacionais), extraHolidays: Set<dayKey>, isJornadaDay?: (key) => boolean }
 */
export function isBusinessDay(key, ctx = {}) {
  const wd = parseDay(key).getDay();
  if (wd === 0 || wd === 6) return false;
  if (ctx.holidays !== false && holidayName(key)) return false;
  if (ctx.extraHolidays?.has(key)) return false;
  return true;
}

// ---------- Datas do mês ----------

const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate(); // m: 0-11
const keyOf = (y, m, d) => dayKey(new Date(y, m, d).getTime());

function businessDaysOfMonth(y, m, ctx) {
  const out = [];
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const k = keyOf(y, m, d);
    if (isBusinessDay(k, ctx)) out.push(k);
  }
  return out;
}

/** Dia fixo do mês (-1 = último dia), com ajuste opcional quando não é dia útil. */
export function monthDayTarget(y, m, day, adjust, ctx) {
  const dim = daysInMonth(y, m);
  let k = keyOf(y, m, day === -1 ? dim : Math.min(day, dim));
  if (adjust === 'before' || adjust === 'after') {
    const step = adjust === 'before' ? -1 : 1;
    for (let i = 0; i < 15 && !isBusinessDay(k, ctx); i++) k = addDays(k, step);
  }
  return k;
}

export function nthBusinessDay(y, m, nth, ctx) {
  const list = businessDaysOfMonth(y, m, ctx);
  if (!list.length) return null;
  return nth === -1 ? list[list.length - 1] : list[nth - 1] || null;
}

export function nthWeekday(y, m, wd, nth) {
  if (nth === -1) {
    const last = new Date(y, m, daysInMonth(y, m));
    last.setDate(last.getDate() - ((last.getDay() - wd + 7) % 7));
    return dayKey(last.getTime());
  }
  const first = new Date(y, m, 1);
  const d = 1 + ((wd - first.getDay() + 7) % 7) + 7 * (nth - 1);
  return d <= daysInMonth(y, m) ? keyOf(y, m, d) : null;
}

const diffDays = (a, b) => Math.round((parseDay(b) - parseDay(a)) / (24 * HOUR));

// ---------- Regras ----------

/** O lembrete acontece neste dia? */
export function dayMatches(rem, key, ctx = {}) {
  const r = rem.rule || {};
  if (rem.start && key < rem.start) return false;
  if (rem.until && key > rem.until) return false;
  const d = parseDay(key);
  const y = d.getFullYear(); const m = d.getMonth(); const wd = d.getDay();
  let ok = false;
  switch (r.type) {
    case 'once': ok = key === r.date; break;
    case 'daily': ok = true; break;
    case 'week': ok = (r.days || []).includes(wd); break;
    case 'hourly': ok = !r.days?.length || r.days.includes(wd); break;
    case 'interval': {
      const base = r.date || rem.start || key;
      const n = Math.max(1, r.every || 1);
      if (key < base) break;
      const diff = diffDays(base, key);
      if (r.unit === 'week') ok = diff % (7 * n) === 0;
      else if (r.unit === 'month') {
        const b = parseDay(base);
        const months = (y - b.getFullYear()) * 12 + (m - b.getMonth());
        ok = months % n === 0 && d.getDate() === Math.min(b.getDate(), daysInMonth(y, m));
      } else ok = diff % n === 0;
      break;
    }
    case 'monthDay':
      // O ajuste pode levar a data para o mês vizinho, então confere os três meses.
      ok = [-1, 0, 1].some((dm) => {
        const t = new Date(y, m + dm, 1);
        return monthDayTarget(t.getFullYear(), t.getMonth(), r.day ?? 1, r.adjust, ctx) === key;
      });
      break;
    case 'monthBusinessDay': ok = nthBusinessDay(y, m, r.nth ?? 1, ctx) === key; break;
    case 'monthWeekday': ok = nthWeekday(y, m, r.weekday ?? 1, r.nth ?? 1) === key; break;
    case 'yearly': ok = m + 1 === r.month && d.getDate() === Math.min(r.day, daysInMonth(y, m)); break;
    default: ok = false;
  }
  if (!ok) return false;
  if (rem.businessOnly && ['daily', 'week', 'interval', 'hourly'].includes(r.type) && !isBusinessDay(key, ctx)) return false;
  if (rem.jornadaOnly && ctx.isJornadaDay && !ctx.isJornadaDay(key)) return false;
  return true;
}

/** Horários do dia em minutos. */
export function timesOfDay(rem) {
  const r = rem.rule || {};
  if (r.type === 'hourly') {
    const from = parseHHMM(r.from || '08:00') ?? 480;
    const to = parseHHMM(r.to || '18:00') ?? 1080;
    const step = Math.max(5, r.everyMin || 60);
    const out = [];
    for (let t = from; t <= to && out.length < 288; t += step) out.push(t);
    return out;
  }
  return [parseHHMM(rem.time || '09:00') ?? 540];
}

/** Ocorrências (aviso já descontada a antecedência) entre fromMs (inclusive) e toMs (exclusive). */
export function occurrences(rem, fromMs, toMs, ctx = {}) {
  if (!rem.active) return [];
  const adv = (rem.advance || 0) * MIN;
  const out = [];
  const times = timesOfDay(rem);
  const startKey = rem.rule?.type === 'once' ? rem.rule.date : dayKey(fromMs + adv);
  const endKey = rem.rule?.type === 'once' ? rem.rule.date : dayKey(toMs + adv);
  if (!startKey || !endKey) return out;
  for (let k = startKey; k <= endKey; k = addDays(k, 1)) {
    if (!dayMatches(rem, k, ctx)) continue;
    const base = parseDay(k);
    for (const t of times) {
      const ev = new Date(base);
      ev.setHours(Math.floor(t / 60), t % 60, 0, 0);
      const at = ev.getTime() - adv;
      if (at >= fromMs && at < toMs) out.push({ id: rem.id, at, eventAt: ev.getTime() });
    }
  }
  return out;
}

export function nextOccurrence(rem, now = Date.now(), ctx = {}, horizonDays = 400) {
  const list = occurrences(rem, now, now + horizonDays * 24 * HOUR, ctx);
  return list[0] || null;
}

// ---------- Descrição ----------

function listPt(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

function daysText(days) {
  const set = [...days].sort((a, b) => a - b);
  const key = set.join(',');
  if (key === '1,2,3,4,5') return 'de segunda a sexta';
  if (key === '0,6') return 'nos fins de semana';
  if (set.length === 7) return 'todos os dias';
  if (set.length === 1) return `às ${WD_PLURAL[set[0]]}`;
  return `${listPt(set.map((d) => WD_SHORT[d]))}`;
}

/** "1º dia útil do mês às 09:00" */
export function describe(rem) {
  const r = rem.rule || {};
  const at = `às ${rem.time || '09:00'}`;
  let s;
  switch (r.type) {
    case 'once': s = `Em ${fmtDay(r.date)} ${at}`; break;
    case 'daily': s = `Todo dia ${at}`; break;
    case 'week': s = `${daysText(r.days || [])} ${at}`; break;
    case 'hourly': {
      const step = r.everyMin || 60;
      const every = step % 60 === 0 ? `${step / 60}h` : step > 60 ? `${Math.floor(step / 60)}h${String(step % 60).padStart(2, '0')}` : `${step} min`;
      s = `A cada ${every}, das ${r.from || '08:00'} às ${r.to || '18:00'}${r.days?.length && r.days.length < 7 ? `, ${daysText(r.days)}` : ''}`;
      break;
    }
    case 'interval': {
      const n = r.every || 1;
      const unit = r.unit === 'week' ? (n > 1 ? 'semanas' : 'semana') : r.unit === 'month' ? (n > 1 ? 'meses' : 'mês') : (n > 1 ? 'dias' : 'dia');
      s = `A cada ${n > 1 ? `${n} ` : ''}${unit}${r.date ? ` (desde ${fmtDay(r.date, { weekday: false })})` : ''} ${at}`;
      break;
    }
    case 'monthDay': {
      const adj = r.adjust === 'before' ? '; se não for dia útil, antecipa' : r.adjust === 'after' ? '; se não for dia útil, adia' : '';
      s = `${r.day === -1 ? 'Último dia do mês' : `Todo dia ${r.day} do mês`} ${at}${adj}`;
      break;
    }
    case 'monthBusinessDay': s = `${ORD(r.nth ?? 1)} dia útil do mês ${at}`; break;
    case 'monthWeekday': s = `${ORD_F(r.nth ?? 1)} ${WEEKDAYS[r.weekday ?? 1].toLowerCase()} do mês ${at}`; break;
    case 'yearly': s = `Todo ano em ${r.day} de ${MONTHS[(r.month || 1) - 1]} ${at}`; break;
    default: s = '';
  }
  s = s.charAt(0).toUpperCase() + s.slice(1);
  const extra = [];
  if (rem.businessOnly && ['daily', 'week', 'interval', 'hourly'].includes(r.type)) extra.push('só em dias úteis');
  if (rem.jornadaOnly) extra.push('só em dias de trabalho');
  if (rem.advance) extra.push(`aviso ${rem.advance >= 60 ? `${rem.advance / 60}h` : `${rem.advance} min`} antes`);
  if (rem.until) extra.push(`até ${fmtDay(rem.until, { weekday: false })}`);
  return extra.length ? `${s} · ${extra.join(' · ')}` : s;
}

// ---------- Agenda (.ics) ----------

const icsDate = (key, min) => `${key.replace(/-/g, '')}T${minutesToHHMM(min).replace(':', '')}00`;
const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

function icsRule(rem, ctx) {
  const r = rem.rule || {};
  const parts = [];
  const bizDays = 'MO,TU,WE,TH,FR';
  switch (r.type) {
    case 'once': return null;
    case 'daily': parts.push(rem.businessOnly ? `FREQ=WEEKLY;BYDAY=${bizDays}` : 'FREQ=DAILY'); break;
    case 'hourly':
    case 'week': {
      const days = r.days?.length ? r.days : [0, 1, 2, 3, 4, 5, 6];
      const list = rem.businessOnly ? days.filter((d) => d >= 1 && d <= 5) : days;
      parts.push(`FREQ=WEEKLY;BYDAY=${list.map((d) => WD_ICS[d]).join(',')}`);
      break;
    }
    case 'interval':
      parts.push(`FREQ=${r.unit === 'week' ? 'WEEKLY' : r.unit === 'month' ? 'MONTHLY' : 'DAILY'};INTERVAL=${Math.max(1, r.every || 1)}`);
      break;
    case 'monthDay': parts.push(`FREQ=MONTHLY;BYMONTHDAY=${r.day === -1 ? -1 : r.day}`); break;
    case 'monthBusinessDay': parts.push(`FREQ=MONTHLY;BYDAY=${bizDays};BYSETPOS=${r.nth ?? 1}`); break;
    case 'monthWeekday': parts.push(`FREQ=MONTHLY;BYDAY=${r.nth ?? 1}${WD_ICS[r.weekday ?? 1]}`); break;
    case 'yearly': parts.push(`FREQ=YEARLY;BYMONTH=${r.month};BYMONTHDAY=${r.day}`); break;
    default: return null;
  }
  if (rem.until) parts.push(`UNTIL=${rem.until.replace(/-/g, '')}T235959`);
  void ctx;
  return parts.join(';');
}

/** Gera um arquivo de agenda com os lembretes (o iPhone e o Android avisam mesmo com o app fechado). */
export function toICS(rems, now = Date.now(), ctx = {}) {
  const stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WDQ SmartPonto//Lembretes//PT-BR', 'CALSCALE:GREGORIAN'];
  for (const rem of rems) {
    if (!rem.active) continue;
    const first = nextOccurrence(rem, now - 24 * HOUR, ctx) || null;
    const startKey = rem.rule?.type === 'once' ? rem.rule.date : first ? dayKey(first.eventAt) : (rem.start || dayKey(now));
    const rule = icsRule(rem, ctx);
    const times = timesOfDay(rem);
    times.forEach((t, i) => {
      lines.push('BEGIN:VEVENT',
        `UID:${rem.id}-${i}@smartponto`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${icsDate(startKey, t)}`,
        `DTEND:${icsDate(startKey, Math.min(t + 15, 1439))}`,
        `SUMMARY:${icsText(rem.title)}`,
        `DESCRIPTION:${icsText([rem.notes, describe(rem)].filter(Boolean).join('\n'))}`);
      if (rule) lines.push(`RRULE:${rule}`);
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(rem.title)}`,
        `TRIGGER:-PT${rem.advance || 0}M`, 'END:VALARM', 'END:VEVENT');
    });
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function newReminder() {
  return {
    id: '',
    title: '',
    notes: '',
    active: true,
    style: 'alarm', // 'alarm' = tela cheia com som contínuo; 'notify' = notificação
    time: '09:00',
    advance: 0,
    businessOnly: false,
    jornadaOnly: false,
    start: '',
    until: '',
    rule: { type: 'daily', days: [1, 2, 3, 4, 5], every: 1, unit: 'day', from: '09:00', to: '18:00', everyMin: 60, day: 1, adjust: 'none', nth: 1, weekday: 1, month: 1, date: '' },
  };
}
