// Água: total do dia, meta, sequência de dias, pontos e níveis.
// Funções puras: recebem o mapa de dias { 'AAAA-MM-DD': { log: [{ ts, ml }], goal } }.
import { addDays } from './calc.js';

export const DEFAULT_GOAL = 2000;
export const AMOUNTS = [100, 150, 200, 250, 300, 350, 500, 750, 1000];

/** Pontos: 10 por dia com a meta batida + 1 por dia seguido de sequência (até +10). */
export const POINTS_GOAL = 10;
export const STREAK_BONUS_MAX = 10;

export const LEVELS = [
  { name: 'Gota', min: 0 },
  { name: 'Copo', min: 50 },
  { name: 'Garrafa', min: 150 },
  { name: 'Fonte', min: 350 },
  { name: 'Rio', min: 700 },
  { name: 'Cachoeira', min: 1200 },
  { name: 'Oceano', min: 2000 },
];

export const totalOf = (day) => (day?.log || []).reduce((a, e) => a + (e.ml || 0), 0);
export const goalOf = (day, fallback = DEFAULT_GOAL) => day?.goal || fallback;
export const metGoal = (day, fallback) => totalOf(day) >= goalOf(day, fallback);

/** "1,25 L" ou "750 ml". */
export function fmtWater(ml) {
  if (Math.abs(ml) < 1000) return `${Math.round(ml)} ml`;
  const l = (ml / 1000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${l.replace('.', ',')} L`;
}

export function levelOf(points) {
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1].min) i++;
  const next = LEVELS[i + 1] || null;
  const pct = next ? Math.round(((points - LEVELS[i].min) / (next.min - LEVELS[i].min)) * 100) : 100;
  return { ...LEVELS[i], index: i, next, pct };
}

/** Pontos ganhos em cada dia com a meta batida e a sequência atual. */
export function waterStats(water, todayKey, fallbackGoal = DEFAULT_GOAL) {
  const keys = Object.keys(water || {}).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && k <= todayKey).sort();
  const earned = {};
  let points = 0;
  let run = 0;
  let best = 0;
  if (keys.length) {
    for (let k = keys[0]; k <= todayKey; k = addDays(k, 1)) {
      if (metGoal(water[k], fallbackGoal)) {
        run++;
        best = Math.max(best, run);
        earned[k] = POINTS_GOAL + Math.min(run - 1, STREAK_BONUS_MAX);
        points += earned[k];
      } else if (k !== todayKey) {
        run = 0; // hoje ainda está em andamento: não quebra a sequência
      }
    }
  }
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const k = addDays(todayKey, -i);
    const goal = goalOf(water?.[k], fallbackGoal);
    week.push({ key: k, total: totalOf(water?.[k]), goal, pct: Math.min(100, Math.round((totalOf(water?.[k]) / goal) * 100)) });
  }
  return { points, streak: run, best, earned, week, level: levelOf(points), daysMet: Object.keys(earned).length };
}

/** Pontos que hoje vai render ao bater a meta (para mostrar antes de bater). */
export function nextReward(water, todayKey, fallbackGoal = DEFAULT_GOAL) {
  const { streak, earned } = waterStats(water, todayKey, fallbackGoal);
  if (earned[todayKey]) return earned[todayKey];
  return POINTS_GOAL + Math.min(streak, STREAK_BONUS_MAX);
}
