import { test } from 'node:test';
import assert from 'node:assert/strict';
import { totalOf, fmtWater, waterStats, levelOf, nextReward } from '../web/js/water.js';

const day = (...ml) => ({ goal: 2000, log: ml.map((m, i) => ({ ts: i, ml: m })) });

test('soma e formata', () => {
  assert.equal(totalOf(day(250, 500)), 750);
  assert.equal(fmtWater(750), '750 ml');
  assert.equal(fmtWater(1250), '1,25 L');
  assert.equal(fmtWater(2000), '2 L');
});

test('pontos com sequência e dia de hoje em andamento', () => {
  const w = {
    '2026-10-19': day(2000),
    '2026-10-20': day(2000),
    '2026-10-21': day(500), // quebra
    '2026-10-22': day(2500),
    '2026-10-23': day(250), // hoje, ainda não bateu
  };
  const s = waterStats(w, '2026-10-23');
  assert.equal(s.points, 10 + 11 + 10);
  assert.equal(s.streak, 1);
  assert.equal(s.best, 2);
  assert.equal(nextReward(w, '2026-10-23'), 11);
  assert.equal(s.week.at(-1).pct, 13);
});

test('dia sem registro quebra a sequência', () => {
  const w = { '2026-10-20': day(2000), '2026-10-22': day(2000) };
  assert.equal(waterStats(w, '2026-10-22').streak, 1);
});

test('níveis', () => {
  assert.equal(levelOf(0).name, 'Gota');
  assert.equal(levelOf(60).name, 'Copo');
  assert.equal(levelOf(100).pct, 50);
  assert.equal(levelOf(5000).next, null);
});
