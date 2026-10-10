// Agenda os avisos: lembretes do usuário e alertas automáticos do ponto.
// No APK, a lista vai para o Android (AlarmManager), que avisa com o app fechado e na tela bloqueada.
// No navegador / iPhone, os avisos disparam com o app aberto; para avisar com ele fechado, o app exporta para a agenda.
import { state } from './store.js';
import {
  MIN, HOUR, dayKey, parseDay, addDays, hhmm, fmtDur, parseHHMM, currentState, buildDays, expectedMinutes,
} from './calc.js';
import { occurrences, describe } from './reminders.js';
import { isAndroidApp, nativeSetAlarms } from './platform.js';

const HORIZON = 45 * 24 * HOUR;
const MAX_ALARMS = 500;

export function reminderCtx() {
  const extra = new Set(Object.entries(state.dayInfo)
    .filter(([, v]) => v.occurrence === 'feriado').map(([k]) => k));
  return {
    holidays: state.settings.holidays !== false,
    extraHolidays: extra,
    isJornadaDay: (k) => expectedMinutes(k, state.settings, state.dayInfo) > 0,
  };
}

/** Alertas que dependem do ponto: recalculados a cada marcação. */
export function autoAlerts(now = Date.now()) {
  const s = state.settings;
  const style = s.alertStyle || 'notify';
  const out = [];
  const st = currentState(state.punches, now);
  const today = dayKey(now);

  if (s.alertEntry) {
    const min = parseHHMM(s.alertEntryTime || '08:00') ?? 480;
    for (let i = 0; i < 14; i++) {
      const key = addDays(today, i);
      if (expectedMinutes(key, s, state.dayInfo) <= 0) continue;
      if (i === 0 && (st.state !== 'off' || state.punches.some((p) => p.type === 'in' && dayKey(p.ts) === key))) continue;
      const at = parseDay(key).getTime() + min * MIN;
      if (at > now) out.push({ id: `auto:entry:${key}`, at, title: 'Marcar a entrada', body: 'Você ainda não registrou a entrada hoje.', style });
    }
  }

  if (st.state === 'break' && s.alertMealEnd && st.last?.reason === 'Refeição') {
    const meal = (s.mealMinutes || 60) * MIN;
    const at = st.since + meal;
    if (at > now) {
      out.push({ id: `auto:meal:${st.since}`, at, title: 'Fim do intervalo de refeição', body: `${fmtDur(meal)} desde ${hhmm(st.since)}. Hora de marcar o retorno.`, style });
    }
  }

  if (st.state === 'working') {
    const d = buildDays(state.punches, now).get(st.day);
    if (d) {
      if (s.alertNoBreak && d.breaks === 0 && d.work < 6 * HOUR - 15 * MIN) {
        out.push({ id: `auto:nobreak:${st.day}`, at: now + (6 * HOUR - 15 * MIN - d.work), title: 'Faça um intervalo', body: 'Em 15 minutos você completa 6h sem pausa para refeição.', style });
      }
      const expected = expectedMinutes(st.day, s, state.dayInfo) * MIN;
      if (expected > 0) {
        const remaining = expected - d.work;
        if (s.alertJourneyDone && remaining > 0) {
          out.push({ id: `auto:done:${st.day}`, at: now + remaining, title: 'Jornada cumprida', body: `Você completou ${fmtDur(expected)} hoje. Hora de marcar a saída.`, style });
        }
        if (s.alertForgotOut) {
          out.push({ id: `auto:forgot:${st.day}`, at: now + Math.max(remaining, 0) + 2 * HOUR, title: 'Esqueceu de marcar a saída?', body: 'Sua jornada terminou há 2 horas e a saída não foi registrada.', style: 'notify' });
        }
      }
    }
  }
  return out;
}

/** Todos os avisos entre from e to, em ordem. */
export function upcomingAlarms(from = Date.now(), to = from + HORIZON) {
  const ctx = reminderCtx();
  const list = [];
  for (const rem of state.reminders) {
    for (const o of occurrences(rem, from, to, ctx)) {
      const when = hhmm(o.eventAt);
      list.push({
        id: `${rem.id}@${o.at}`,
        rid: rem.id,
        at: o.at,
        title: rem.title || 'Lembrete',
        body: rem.notes ? `${when} · ${rem.notes}` : `${when} · ${describe(rem)}`,
        style: rem.style || 'alarm',
      });
    }
  }
  autoAlerts(from).filter((a) => a.at >= from && a.at < to).forEach((a) => list.push(a));
  return list.sort((a, b) => a.at - b.at).slice(0, MAX_ALARMS);
}

// ---------- Envio para o Android ----------
let syncTimer;
export function syncAlarms() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    if (isAndroidApp) nativeSetAlarms(upcomingAlarms());
  }, 400);
}

// ---------- Avisos dentro do navegador ----------
const LS_LAST = 'sp-alarm-last';
const LS_SNOOZE = 'sp-alarm-snooze';
const ls = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } },
};

let onFire = () => {};
/** Começa a verificar avisos (somente fora do APK). handler(alarm) mostra o alarme na tela. */
export function startWebAlarms(handler) {
  if (isAndroidApp) return;
  onFire = handler;
  setInterval(checkDue, 10000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDue(); });
  checkDue();
}

function checkDue() {
  const now = Date.now();
  // Avisos perdidos há mais de 10 minutos (app fechado) não tocam.
  const last = Math.max(ls.get(LS_LAST, now - 60000), now - 10 * MIN);
  const snoozes = ls.get(LS_SNOOZE, []);
  const due = [
    ...upcomingAlarms(last + 1, now + 1),
    ...snoozes.filter((a) => a.at > last && a.at <= now),
  ];
  ls.set(LS_SNOOZE, snoozes.filter((a) => a.at > now));
  ls.set(LS_LAST, now);
  due.forEach((a) => onFire(a));
}

export function snoozeWeb(alarm, minutes) {
  const snoozes = ls.get(LS_SNOOZE, []);
  snoozes.push({ ...alarm, id: `${alarm.id}:adiado:${Date.now()}`, at: Date.now() + minutes * MIN });
  ls.set(LS_SNOOZE, snoozes);
}

/** Notificação do sistema pelo navegador (aparece se o app estiver em segundo plano e a permissão foi dada). */
export async function webNotify(alarm) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts = { body: alarm.body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: alarm.id, requireInteraction: alarm.style === 'alarm', vibrate: [300, 150, 300] };
    if (reg) reg.showNotification(alarm.title, opts); else new Notification(alarm.title, opts);
  } catch { /* opcional */ }
}

// Som do alarme: sequência suave de três notas, repetida.
let audioCtx; let chimeTimer;
export function startChime() {
  stopChime();
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const play = () => {
      const t0 = audioCtx.currentTime;
      [659.25, 830.61, 987.77].forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.22);
        g.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.22 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.22 + 1.2);
        o.connect(g).connect(audioCtx.destination);
        o.start(t0 + i * 0.22);
        o.stop(t0 + i * 0.22 + 1.3);
      });
      navigator.vibrate?.([300, 150, 300]);
    };
    play();
    let n = 0;
    chimeTimer = setInterval(() => { if (++n > 30) stopChime(); else play(); }, 2200);
  } catch { /* sem áudio */ }
}
export function stopChime() { clearInterval(chimeTimer); chimeTimer = null; }
