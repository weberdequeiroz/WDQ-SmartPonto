import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  easter, holidayName, isBusinessDay, nthBusinessDay, nthWeekday, monthDayTarget,
  dayMatches, occurrences, nextOccurrence, describe, toICS, newReminder,
} from '../web/js/reminders.js';

const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const rem = (rule, extra = {}) => ({ ...newReminder(), id: 'r1', title: 'Teste', ...extra, rule: { ...newReminder().rule, ...rule } });
const ctx = { holidays: true };

test('Páscoa e feriados móveis', () => {
  assert.equal(easter(2026), '2026-04-05');
  assert.equal(easter(2027), '2027-03-28');
  assert.equal(holidayName('2026-04-03'), 'Sexta-feira Santa');
  assert.equal(holidayName('2026-02-17'), 'Carnaval');
  assert.equal(holidayName('2026-06-04'), 'Corpus Christi');
  assert.equal(holidayName('2026-11-20'), 'Dia da Consciência Negra');
  assert.equal(isBusinessDay('2026-10-12', ctx), false); // feriado
  assert.equal(isBusinessDay('2026-10-13', ctx), true);
  assert.equal(isBusinessDay('2026-10-12', { holidays: false }), true);
});

test('1º e último dia útil do mês', () => {
  assert.equal(nthBusinessDay(2026, 0, 1, ctx), '2026-01-02'); // 01/01 é feriado
  assert.equal(nthBusinessDay(2026, 10, 1, ctx), '2026-11-03'); // 01 dom, 02 Finados
  assert.equal(nthBusinessDay(2026, 9, -1, ctx), '2026-10-30');
  assert.equal(nthBusinessDay(2026, 9, 5, ctx), '2026-10-07');
});

test('dia da semana do mês', () => {
  assert.equal(nthWeekday(2026, 9, 1, 2), '2026-10-12'); // 2ª segunda de outubro
  assert.equal(nthWeekday(2026, 9, 5, -1), '2026-10-30'); // última sexta
  assert.equal(nthWeekday(2026, 1, 1, 5), null); // não existe 5ª segunda em fev/2026
});

test('dia fixo com ajuste para dia útil', () => {
  assert.equal(monthDayTarget(2026, 9, 10, 'none', ctx), '2026-10-10'); // sábado
  assert.equal(monthDayTarget(2026, 9, 10, 'before', ctx), '2026-10-09');
  assert.equal(monthDayTarget(2026, 9, 10, 'after', ctx), '2026-10-13'); // pula sáb, dom e feriado 12/10
  assert.equal(monthDayTarget(2026, 1, 31, 'none', ctx), '2026-02-28');
  assert.equal(monthDayTarget(2026, 1, -1, 'none', ctx), '2026-02-28');
  // ajuste que cai no mês anterior: 01/11/2026 é domingo → antecipa para 30/10
  const r = rem({ type: 'monthDay', day: 1, adjust: 'before' });
  assert.ok(dayMatches(r, '2026-10-30', ctx));
  assert.ok(dayMatches(r, '2026-10-01', ctx));
});

test('a cada N dias, semanas e meses', () => {
  const d = rem({ type: 'interval', every: 3, unit: 'day', date: '2026-10-01' });
  assert.ok(dayMatches(d, '2026-10-04', ctx));
  assert.ok(!dayMatches(d, '2026-10-05', ctx));
  assert.ok(!dayMatches(d, '2026-09-28', ctx));
  const w = rem({ type: 'interval', every: 2, unit: 'week', date: '2026-10-05' });
  assert.ok(dayMatches(w, '2026-10-19', ctx));
  assert.ok(!dayMatches(w, '2026-10-12', ctx));
  const m = rem({ type: 'interval', every: 1, unit: 'month', date: '2026-01-31' });
  assert.ok(dayMatches(m, '2026-02-28', ctx));
  assert.ok(dayMatches(m, '2026-03-31', ctx));
});

test('de tempo em tempo e antecedência', () => {
  const r = rem({ type: 'hourly', from: '09:00', to: '11:00', everyMin: 60, days: [1, 2, 3, 4, 5] });
  const occ = occurrences(r, at(2026, 10, 9, 0), at(2026, 10, 10, 0), ctx);
  assert.deepEqual(occ.map((o) => new Date(o.at).getHours()), [9, 10, 11]);
  assert.equal(occurrences(r, at(2026, 10, 10, 0), at(2026, 10, 11, 0), ctx).length, 0); // sábado
  const adv = rem({ type: 'daily' }, { time: '09:00', advance: 15 });
  const o = nextOccurrence(adv, at(2026, 10, 9, 8, 0), ctx);
  assert.equal(o.at, at(2026, 10, 9, 8, 45));
  assert.equal(o.eventAt, at(2026, 10, 9, 9, 0));
});

test('só em dias úteis, dias da jornada, data final e desativado', () => {
  const r = rem({ type: 'daily' }, { businessOnly: true, until: '2026-10-14' });
  const keys = occurrences(r, at(2026, 10, 9), at(2026, 10, 20), ctx).map((o) => new Date(o.at).getDate());
  assert.deepEqual(keys, [9, 13, 14]); // pula fim de semana, feriado 12/10 e depois do fim
  const j = rem({ type: 'daily' }, { jornadaOnly: true });
  assert.ok(!dayMatches(j, '2026-10-09', { isJornadaDay: () => false }));
  assert.equal(occurrences({ ...r, active: false }, at(2026, 10, 9), at(2026, 10, 20), ctx).length, 0);
});

test('uma vez', () => {
  const r = rem({ type: 'once', date: '2026-12-01' }, { time: '15:30' });
  assert.equal(nextOccurrence(r, at(2026, 10, 9), ctx).at, at(2026, 12, 1, 15, 30));
  assert.equal(nextOccurrence(r, at(2026, 12, 2), ctx), null);
});

test('descrições em português', () => {
  assert.equal(describe(rem({ type: 'monthBusinessDay', nth: 1 })), '1º dia útil do mês às 09:00');
  assert.equal(describe(rem({ type: 'monthBusinessDay', nth: -1 })), 'Último dia útil do mês às 09:00');
  assert.equal(describe(rem({ type: 'week', days: [1, 3, 5] }, { time: '10:00' })), 'Seg, qua e sex às 10:00');
  assert.equal(describe(rem({ type: 'week', days: [1, 2, 3, 4, 5] })), 'De segunda a sexta às 09:00');
  assert.equal(describe(rem({ type: 'monthWeekday', nth: 2, weekday: 1 })), '2ª segunda do mês às 09:00');
  assert.equal(describe(rem({ type: 'hourly', everyMin: 90, from: '08:00', to: '17:00', days: [] })), 'A cada 1h30, das 08:00 às 17:00');
  assert.match(describe(rem({ type: 'monthDay', day: 10, adjust: 'before' })), /Todo dia 10 do mês às 09:00; se não for dia útil, antecipa/);
});

test('arquivo de agenda', () => {
  const ics = toICS([
    rem({ type: 'monthBusinessDay', nth: 1 }, { title: 'Enviar relatório' }),
    rem({ type: 'hourly', from: '09:00', to: '10:00', everyMin: 60, days: [1, 2, 3, 4, 5] }, { id: 'r2', title: 'Água', advance: 5 }),
  ], at(2026, 10, 9, 12), ctx);
  assert.match(ics, /RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1/);
  assert.match(ics, /DTSTART:20261103T090000/); // próximo 1º dia útil: 01/11 é domingo e 02/11 é Finados
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.match(ics, /TRIGGER:-PT5M/);
});
