import { test } from 'node:test';
import assert from 'node:assert/strict';
import { punchAlertsICS } from '../web/js/reminders.js';

const at = (y, m, d, h = 0) => new Date(y, m - 1, d, h).getTime();
const sh = { in: '10:00', bs: '14:00', be: '15:00', out: '18:20' };

test('alertas do ponto na agenda: dias fixos', () => {
  const s = { workPlan: { mode: 'week', days: [1, 2, 3, 4, 5, 6], shift: sh, overrides: { 6: { in: '08:00', bs: '', be: '', out: '12:00' } } } };
  const ics = punchAlertsICS(s, { entry: true, meal: true, out: true }, at(2026, 10, 23, 9)); // sexta
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 4 + 2); // seg–sex: 4 avisos; sábado sem almoço: 2
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR/);
  assert.match(ics, /DTSTART:20261023T100000/);
  assert.match(ics, /DTSTART:20261024T120000/); // sábado, saída 12:00
  assert.match(ics, /SUMMARY:Volta do almoço/);
});

test('alertas do ponto na agenda: escala e turno noturno', () => {
  const s = { workPlan: { mode: 'cycle', cycle: { start: '2026-10-01', pattern: [true, false], shift: { in: '19:00', bs: '00:00', be: '01:00', out: '07:00' } } } };
  const ics = punchAlertsICS(s, { entry: true, meal: false, out: true });
  assert.match(ics, /RRULE:FREQ=DAILY;INTERVAL=2/);
  assert.match(ics, /DTSTART:20261001T190000/);
  assert.match(ics, /DTSTART:20261002T070000/); // saída na manhã seguinte
  assert.equal(punchAlertsICS(s, { entry: false, meal: false, out: false }), null);
});
