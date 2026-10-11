import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDays, buildReport, currentState, summarizeDay, hourBank, dayKey, fmtDur, parseHHMM,
  weekRange, monthRange, expectedMinutes, scheduleSummary, dayTemplate, completeWithTemplate, DEFAULT_SETTINGS, HOUR, MIN,
} from '../web/js/calc.js';

const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const p = (type, ts) => ({ id: String(ts) + type, type, ts });
const settings = { ...DEFAULT_SETTINGS, tolerance: 10 };

test('jornada normal com almoço', () => {
  const punches = [
    p('in', at(2026, 10, 5, 8)), p('break_start', at(2026, 10, 5, 12)),
    p('break_end', at(2026, 10, 5, 13)), p('out', at(2026, 10, 5, 17, 30)),
  ];
  const days = buildDays(punches, at(2026, 10, 6, 9));
  const d = days.get('2026-10-05');
  assert.equal(d.work, 8.5 * HOUR);
  assert.equal(d.breaks, HOUR);
  assert.equal(d.open, false);
  const s = summarizeDay('2026-10-05', days, settings, {}, '2026-10-06');
  assert.equal(s.balance, 30 * MIN);
  assert.deepEqual(s.warnings, []);
});

test('turno noturno pertence ao dia da entrada', () => {
  const punches = [p('in', at(2026, 10, 5, 22)), p('out', at(2026, 10, 6, 6))];
  const days = buildDays(punches, at(2026, 10, 7, 9));
  assert.equal(days.get('2026-10-05').work, 8 * HOUR);
  assert.equal(days.has('2026-10-06'), false);
});

test('tolerância zera pequenas diferenças', () => {
  const punches = [p('in', at(2026, 10, 5, 8, 5)), p('break_start', at(2026, 10, 5, 12)),
    p('break_end', at(2026, 10, 5, 13)), p('out', at(2026, 10, 5, 17))];
  const days = buildDays(punches, at(2026, 10, 6, 9));
  assert.equal(summarizeDay('2026-10-05', days, settings, {}, '2026-10-06').balance, 0);
});

test('jornada em andamento e estado atual', () => {
  const punches = [p('in', at(2026, 10, 9, 8)), p('break_start', at(2026, 10, 9, 12))];
  const now = at(2026, 10, 9, 12, 20);
  const st = currentState(punches, now);
  assert.equal(st.state, 'break');
  assert.equal(st.since, at(2026, 10, 9, 12));
  const d = buildDays(punches, now).get('2026-10-09');
  assert.equal(d.work, 4 * HOUR);
  assert.equal(d.breaks, 20 * MIN);
});

test('saída esquecida não conta para sempre', () => {
  const punches = [p('in', at(2026, 10, 5, 8)), p('in', at(2026, 10, 7, 8))];
  const days = buildDays(punches, at(2026, 10, 7, 9));
  assert.ok(days.get('2026-10-05').issues.includes('Saída não registrada'));
  assert.equal(days.get('2026-10-05').work, 0);
  assert.equal(days.get('2026-10-07').work, HOUR);
});

test('ocorrências: férias não geram débito, falta gera', () => {
  const info = { '2026-10-05': { occurrence: 'ferias' }, '2026-10-06': { occurrence: 'falta' } };
  const r = buildReport('2026-10-05', '2026-10-06', [], settings, info, at(2026, 10, 9, 9));
  assert.equal(r.rows[0].balance, 0);
  assert.equal(r.rows[1].balance, -8 * HOUR);
  assert.equal(r.totals.absences, 1);
  assert.equal(r.totals.excused, 1);
});

test('dias futuros não entram no previsto', () => {
  const r = buildReport('2026-10-09', '2026-10-10', [], settings, {}, at(2026, 10, 9, 9));
  assert.equal(r.totals.expected, 8 * HOUR);
  assert.equal(r.totals.balance, 0); // hoje sem marcação não gera débito ainda
});

test('banco de horas com saldo inicial', () => {
  const punches = [p('in', at(2026, 10, 5, 8)), p('out', at(2026, 10, 5, 18))];
  const s = { ...settings, bankStart: '2026-10-05', bankInitial: 60 };
  assert.equal(hourBank(punches, s, {}, at(2026, 10, 5, 20)), 3 * HOUR);
});

test('intervalo curto gera alerta', () => {
  const punches = [p('in', at(2026, 10, 5, 8)), p('break_start', at(2026, 10, 5, 12)),
    p('break_end', at(2026, 10, 5, 12, 30)), p('out', at(2026, 10, 5, 17))];
  const days = buildDays(punches, at(2026, 10, 6, 9));
  const s = summarizeDay('2026-10-05', days, settings, {}, '2026-10-06');
  assert.ok(s.warnings.some((w) => w.includes('Intervalo menor')));
});

test('formatação e intervalos de datas', () => {
  assert.equal(fmtDur(7 * HOUR + 48 * MIN), '7h48');
  assert.equal(fmtDur(-12 * MIN), '-0h12');
  assert.equal(fmtDur(5 * MIN, { sign: true }), '+0h05');
  assert.equal(parseHHMM('08:48'), 528);
  assert.equal(parseHHMM('x'), null);
  assert.deepEqual(weekRange('2026-10-09'), ['2026-10-04', '2026-10-10']);
  assert.deepEqual(monthRange('2026-02-10'), ['2026-02-01', '2026-02-28']);
  assert.equal(dayKey(at(2026, 1, 2, 23, 59)), '2026-01-02');
});

test('escala 12x36 repete a partir da data inicial', () => {
  const s = { ...settings, scheduleMode: 'cycle', cycle: { start: '2026-10-05', days: [720, 0] } };
  assert.equal(expectedMinutes('2026-10-05', s, {}), 720);
  assert.equal(expectedMinutes('2026-10-06', s, {}), 0);
  assert.equal(expectedMinutes('2026-10-07', s, {}), 720);
  assert.equal(expectedMinutes('2026-10-04', s, {}), 0); // antes do início também segue a escala
  assert.equal(expectedMinutes('2026-10-03', s, {}), 720);
  assert.equal(expectedMinutes('2026-10-05', s, { '2026-10-05': { occurrence: 'ferias' } }), 0);
  assert.match(scheduleSummary(s), /Escala de 2 dias/);
});

test('jornada semanal personalizada', () => {
  const s = { ...settings, schedule: [0, 600, 600, 600, 600, 240, 0] };
  assert.equal(expectedMinutes('2026-10-09', s, {}), 240); // sexta
  assert.equal(scheduleSummary(s), '44h00 semanais');
});

test('pausa remunerada conta como trabalho e refeição não', () => {
  const punches = [
    { id: '1', type: 'in', ts: at(2026, 10, 5, 8), mode: 'remoto' },
    { id: '2', type: 'break_start', ts: at(2026, 10, 5, 10), reason: 'Café' },
    { id: '3', type: 'break_end', ts: at(2026, 10, 5, 10, 15) },
    { id: '4', type: 'break_start', ts: at(2026, 10, 5, 12), reason: 'Refeição' },
    { id: '5', type: 'break_end', ts: at(2026, 10, 5, 13) },
    { id: '6', type: 'out', ts: at(2026, 10, 5, 17) },
  ];
  const d = buildDays(punches, at(2026, 10, 6, 9)).get('2026-10-05');
  assert.equal(d.work, 8 * HOUR);
  assert.equal(d.breaks, HOUR);
  assert.equal(d.paidBreaks, 15 * MIN);
  assert.equal(d.mode, 'remoto');
  const r = buildReport('2026-10-05', '2026-10-05', punches, settings, {}, at(2026, 10, 6, 9));
  assert.deepEqual(r.totals.modes, { remoto: 1 });
});

test('descanso entre jornadas menor que 11h', () => {
  const punches = [p('in', at(2026, 10, 5, 14)), p('out', at(2026, 10, 5, 23)), p('in', at(2026, 10, 6, 7)), p('out', at(2026, 10, 6, 15))];
  const days = buildDays(punches, at(2026, 10, 7, 9));
  assert.ok(days.get('2026-10-06').issues.some((i) => i.includes('Descanso entre jornadas de 8h00')));
});

test('modelo do dia a partir da jornada', () => {
  const s = { ...settings, schedule: [0, 528, 528, 528, 528, 528, 240], workStart: '08:00', mealStart: '12:00', mealMinutes: 60 };
  const seg = dayTemplate('2026-10-05', s, {}).map((t) => [t.type, new Date(t.ts).getHours(), new Date(t.ts).getMinutes()]);
  assert.deepEqual(seg, [['in', 8, 0], ['break_start', 12, 0], ['break_end', 13, 0], ['out', 17, 48]]);
  // Sábado de 4h: por padrão também tem a refeição salva (no meio da jornada, pois 12h é o fim do turno)
  const sab = dayTemplate('2026-10-10', s, {}).map((t) => [t.type, new Date(t.ts).getHours()]);
  assert.deepEqual(sab, [['in', 8], ['break_start', 10], ['break_end', 11], ['out', 13]]);
  const clt = dayTemplate('2026-10-10', { ...s, shortBreak: 'clt' }, {}).map((t) => [t.type, new Date(t.ts).getHours()]);
  assert.deepEqual(clt, [['in', 8], ['out', 12]]); // CLT: até 4h sem intervalo
  const clt5 = dayTemplate('2026-10-10', { ...s, shortBreak: 'clt', schedule: [0, 0, 0, 0, 0, 0, 300] }, {});
  assert.equal(clt5[2].ts - clt5[1].ts, 15 * MIN); // 5h: 15 min
  assert.equal(dayTemplate('2026-10-05', s, {}, { withBreak: false }).length, 2);
  assert.deepEqual(dayTemplate('2026-10-11', s, {}), []); // domingo sem jornada
  assert.deepEqual(dayTemplate('2026-10-05', s, { '2026-10-05': { occurrence: 'ferias' } }), []);
  // o modelo preenchido fecha exatamente a jornada
  const tpl = dayTemplate('2026-10-05', s, {}).map((t, i) => ({ ...t, id: String(i) }));
  assert.equal(buildDays(tpl, at(2026, 10, 6)).get('2026-10-05').work, 528 * MIN);
});

test('turno noturno no modelo e completar o que falta', () => {
  const s = { ...settings, scheduleMode: 'cycle', cycle: { start: '2026-10-05', days: [720, 0] }, workStart: '19:00', mealStart: '12:00', mealMinutes: 60 };
  const t = dayTemplate('2026-10-05', s, {});
  assert.equal(new Date(t[1].ts).getHours(), 1); // refeição no meio do turno: 19h + 6h = 01h
  assert.equal(dayKey(t[3].ts), '2026-10-06'); // saída na manhã seguinte
  assert.equal(buildDays(t.map((x, i) => ({ ...x, id: String(i) })), at(2026, 10, 7)).get('2026-10-05').work, 720 * MIN);
  const missing = completeWithTemplate([{ type: 'in', ts: 1 }], t);
  assert.deepEqual(missing.map((x) => x.type), ['break_start', 'break_end', 'out']);
});
