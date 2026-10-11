import {
  PUNCH_TYPES, BREAK_REASONS, OCCURRENCES, WORK_MODES, WEEKDAYS, MONTHS, MIN, HOUR, isPaidBreak,
  buildDays, buildReport, summarizeDay, currentState, hourBank, suggestedNext,
  dayKey, parseDay, addDays, hhmm, fmtDur, fmtClock, fmtDay, fmtDayLong, parseHHMM, minutesToHHMM,
  weekRange, monthRange, yearRange, scheduleSummary, dayTemplate, completeWithTemplate,
  shiftFor, shiftBreak, shiftMinutes, shiftText, CYCLE_TYPES, cycleTypeOf, cycleStartFromLastOff, cycleLastOff,
} from './calc.js';
import {
  state, openStore, addPunch, updatePunch, deletePunch, saveSettings, setDayInfo,
  markBackup, exportBackup, importBackup, wipeAll, saveReminder, deleteReminder,
} from './store.js';
import {
  isAndroidApp, isIOS, isStandalone, shareFile, saveFile, printPage, shareText, vibrate, getLocation, setThemeColor,
  nativeAlarmStatus, nativeRequestNotifications, nativeOpenSettings, nativeTestAlarm, openCalendarFile,
} from './platform.js';
import {
  RULE_TYPES, describe, nextOccurrence, occurrences, toICS, newReminder, holidayName,
} from './reminders.js';
import {
  syncAlarms, upcomingAlarms, reminderCtx, startWebAlarms, snoozeWeb, webNotify, startChime, stopChime,
} from './alarms.js';

export const VERSION = '1.4.1';

// ---------- Utilidades ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const signCls = (ms) => (ms > 0 ? 'pos' : ms < 0 ? 'neg' : '');
const today = () => dayKey(Date.now());

const ICONS = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  in: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  break_start: '<path d="M17 8h1a4 4 0 0 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3"/>',
  break_end: '<path d="M5 3l14 9-14 9V3z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  warn: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h0"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h0"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/>',
  meal: '<path d="M3 2v7a3 3 0 0 0 3 3v10M9 2v7a3 3 0 0 1-3 3M6 2v5M18 22V2c-2.5 1.5-4 4-4 8v3h4"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  car: '<path d="M5 17h14M6 17v2M18 17v2M3 13l2-6a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 6v4H3v-4zM3 13h18"/><circle cx="7.5" cy="15" r=".5"/><circle cx="16.5" cy="15" r=".5"/>',
  book: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  health: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  alarm: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3L2 6M22 6l-3-3"/>',
  repeat: '<path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  home: '<path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  wand: '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/>',
};
const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

// ---------- Navegação ----------
const VIEWS = {
  home: { title: 'Ponto', icon: 'clock', label: 'Ponto', render: renderHome },
  history: { title: 'Histórico', icon: 'calendar', label: 'Histórico', render: renderHistory },
  reminders: { title: 'Lembretes', icon: 'bell', label: 'Lembretes', render: renderReminders },
  reports: { title: 'Relatórios', icon: 'chart', label: 'Relatórios', render: renderReports },
  settings: { title: 'Ajustes', icon: 'gear', label: 'Ajustes', render: renderSettings },
};
const ui = {
  view: 'home',
  historyMonth: today(),
  report: { mode: 'month', anchor: today(), from: addDays(today(), -29), to: today() },
};

function go(view) {
  if (view !== 'history') ui.select = null;
  ui.view = view;
  $('#toast').classList.remove('show');
  render();
  window.scrollTo(0, 0);
}

function render() {
  const v = VIEWS[ui.view];
  $('#page-title').textContent = v.title;
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === ui.view));
  $('#view').innerHTML = `${v.render()}<footer class="credit">Desenvolvido por Weber de Queiroz</footer>`;
  v.mount?.();
  bindView();
  syncAlarms();
}

// Ações declarativas: data-act="nome" data-arg="valor".
const ACTIONS = {};
function bindView() {
  $$('#view [data-act]').forEach((el) => {
    const evt = el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date' ? 'change' : 'click';
    el.addEventListener(evt, (e) => ACTIONS[el.dataset.act]?.(el.dataset.arg, el, e));
  });
}

// ---------- Painéis e avisos ----------
let sheetEl = null;
function openSheet(html, onMount) {
  closeSheet();
  sheetEl = document.createElement('div');
  sheetEl.className = 'sheet-backdrop';
  sheetEl.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  sheetEl.addEventListener('click', (e) => { if (e.target === sheetEl) closeSheet(); });
  $('#sheet-root').appendChild(sheetEl);
  const sheet = $('.sheet', sheetEl);
  $$('[data-close]', sheet).forEach((b) => b.addEventListener('click', closeSheet));
  onMount?.(sheet);
  return sheet;
}
function closeSheet() {
  sheetEl?.remove();
  sheetEl = null;
}

function confirmSheet({ title, text = '', ok = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    openSheet(`
      <h3>${esc(title)}</h3><p class="sub">${esc(text)}</p>
      <div class="btn-row">
        <button class="btn" data-r="0">Cancelar</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(ok)}</button>
      </div>`, (s) => {
      $$('[data-r]', s).forEach((b) => b.addEventListener('click', () => { closeSheet(); resolve(b.dataset.r === '1'); }));
    });
  });
}

let toastTimer;
function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) $('button', t).addEventListener('click', () => { t.classList.remove('show'); action.run(); });
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 6000 : 2800);
}

// ---------- Marcação de ponto ----------
const ACTION_HINT = {
  in: 'Começar a jornada',
  break_start: 'Refeição, café, pausa…',
  break_end: 'Voltar ao trabalho',
  out: 'Encerrar a jornada',
  meal: 'Saída para almoço / jantar',
  pause: 'Café, serviço externo, médico…',
};
const reasonInfo = (label) => BREAK_REASONS.find((r) => r.label === label);

async function punch(type, extra = {}) {
  const ts = Date.now();
  if (state.settings.confirmPunch) {
    const ok = await confirmSheet({ title: `Registrar ${PUNCH_TYPES[type].label.toLowerCase()}?`, text: `Horário: ${hhmm(ts)}`, ok: 'Registrar' });
    if (!ok) return;
  }
  const data = { type, ts, ...extra };
  if (state.settings.geolocation) {
    const loc = await getLocation();
    if (loc) data.loc = loc;
  }
  const p = await addPunch(data);
  vibrate([40]);
  render();
  toast(`${PUNCH_TYPES[type].label} registrada às ${hhmm(ts)}`, {
    label: 'Desfazer',
    run: async () => { await deletePunch(p.id); render(); toast('Marcação removida'); },
  });
}

ACTIONS.punch = (type) => {
  if (type === 'meal') return punch('break_start', { reason: 'Refeição' });
  if (type === 'break_start' || type === 'pause') return openBreakSheet();
  if (type === 'in') {
    if (state.settings.askMode) return openModeSheet();
    return punch('in', { mode: state.settings.defaultMode || 'presencial' });
  }
  return punch(type);
};

function openModeSheet() {
  openSheet(`
    <h3>Entrada</h3>
    <p class="sub">Onde você vai trabalhar hoje?</p>
    <div class="reasons">
      ${Object.entries(WORK_MODES).map(([k, v]) => `<button class="btn ${k === state.settings.defaultMode ? 'primary' : ''}" data-mode="${k}">${esc(v)}</button>`).join('')}
    </div>
    <button class="btn ghost block" data-close>Cancelar</button>`, (s) => {
    $$('[data-mode]', s).forEach((b) => b.addEventListener('click', () => {
      closeSheet();
      punch('in', { mode: b.dataset.mode });
    }));
  });
}

function openBreakSheet() {
  openSheet(`
    <h3>Pausa</h3>
    <p class="sub">Escolha o motivo. As marcadas com <span class="paid-tag">conta como trabalho</span> não descontam da jornada.</p>
    <div class="reason-list">
      ${BREAK_REASONS.map((r) => `<button class="reason-item" data-reason="${esc(r.label)}">
        ${icon(r.icon)}<span class="grow"><b>${esc(r.label)}</b><br><span class="small muted">${esc(r.hint)}</span></span>
        ${r.paid ? '<span class="paid-tag">conta como trabalho</span>' : ''}
      </button>`).join('')}
    </div>
    <button class="btn ghost block" data-close>Cancelar</button>`, (s) => {
    $$('[data-reason]', s).forEach((b) => b.addEventListener('click', () => {
      closeSheet();
      punch('break_start', { reason: b.dataset.reason });
    }));
  });
}

/** Painel para criar ou editar uma marcação (inclusive retroativa). */
function openPunchEditor(existing, presetDay) {
  const ts = existing?.ts ?? (presetDay && presetDay !== today()
    ? parseDay(presetDay).getTime() + 8 * HOUR : Date.now());
  const d = new Date(ts);
  const st = currentState(state.punches);
  const type = existing?.type ?? suggestedNext(st.state);
  openSheet(`
    <h3>${existing ? 'Editar marcação' : 'Marcação manual'}</h3>
    <p class="sub">${existing ? 'Alterações ficam identificadas como ajuste.' : 'Para registrar um horário que você esqueceu de marcar.'}</p>
    <div class="grid-2">
      <label class="field"><span>Data</span><input class="input" type="date" name="date" value="${dayKey(ts)}" max="${today()}" required></label>
      <label class="field"><span>Hora</span><input class="input" type="time" name="time" value="${pad(d.getHours())}:${pad(d.getMinutes())}" required></label>
    </div>
    <label class="field"><span>Tipo</span>
      <select class="input" name="type">
        ${Object.entries(PUNCH_TYPES).map(([k, v]) => `<option value="${k}" ${k === type ? 'selected' : ''}>${v.label}</option>`).join('')}
      </select>
    </label>
    <label class="field" data-reason-field><span>Motivo do intervalo</span>
      <select class="input" name="reason">
        ${BREAK_REASONS.map((r) => `<option value="${esc(r.label)}" ${r.label === (existing?.reason || 'Refeição') ? 'selected' : ''}>${esc(r.label)}${r.paid ? ' (conta como trabalho)' : ''}</option>`).join('')}
      </select>
    </label>
    <label class="field" data-mode-field><span>Modalidade</span>
      <select class="input" name="mode">
        ${Object.entries(WORK_MODES).map(([k, v]) => `<option value="${k}" ${k === (existing?.mode || state.settings.defaultMode) ? 'selected' : ''}>${esc(v)}</option>`).join('')}
      </select>
    </label>
    <label class="field"><span>Observação</span><input class="input" name="note" maxlength="200" value="${esc(existing?.note || '')}" placeholder="Opcional"></label>
    ${existing?.loc ? `<p class="small muted">${icon('pin')} Local registrado: ${existing.loc.lat}, ${existing.loc.lng} (±${existing.loc.acc} m)</p>` : ''}
    <div class="btn-row">
      ${existing ? `<button class="btn danger" data-del>${icon('trash')} Excluir</button>` : '<button class="btn" data-close>Cancelar</button>'}
      <button class="btn primary" data-save>Salvar</button>
    </div>`, (s) => {
    const typeSel = $('[name=type]', s);
    const syncReason = () => {
      $('[data-reason-field]', s).style.display = typeSel.value === 'break_start' ? '' : 'none';
      $('[data-mode-field]', s).style.display = typeSel.value === 'in' ? '' : 'none';
    };
    typeSel.addEventListener('change', syncReason);
    syncReason();
    $('[data-save]', s).addEventListener('click', async () => {
      const date = $('[name=date]', s).value;
      const time = $('[name=time]', s).value;
      if (!date || !time) return toast('Informe data e hora');
      const [h, m] = time.split(':').map(Number);
      const when = parseDay(date);
      when.setHours(h, m, 0, 0);
      if (when.getTime() > Date.now() + MIN) return toast('Não é possível marcar no futuro');
      const data = {
        ts: when.getTime(),
        type: typeSel.value,
        note: $('[name=note]', s).value.trim(),
        reason: typeSel.value === 'break_start' ? $('[name=reason]', s).value : undefined,
        mode: typeSel.value === 'in' ? $('[name=mode]', s).value : undefined,
      };
      if (existing) await updatePunch(existing.id, { ...data, edited: true });
      else await addPunch({ ...data, manual: true });
      closeSheet();
      render();
      toast(existing ? 'Marcação atualizada' : 'Marcação adicionada');
    });
    $('[data-del]', s)?.addEventListener('click', async () => {
      const ok = await confirmSheet({ title: 'Excluir marcação?', text: `${PUNCH_TYPES[existing.type].label} de ${fmtDay(dayKey(existing.ts))} às ${hhmm(existing.ts)}`, ok: 'Excluir', danger: true });
      if (!ok) return;
      await deletePunch(existing.id);
      render();
      toast('Marcação excluída');
    });
  });
}
ACTIONS.editPunch = (id) => openPunchEditor(state.punches.find((p) => p.id === id));
ACTIONS.addPunch = (day) => openPunchEditor(null, day);

function punchLabel(p) {
  let s = PUNCH_TYPES[p.type].label;
  if (p.type === 'break_start' && p.reason) s += ` · ${p.reason}`;
  if (p.type === 'in' && p.mode && WORK_MODES[p.mode]) s += ` · ${WORK_MODES[p.mode]}`;
  return s;
}

function timelineHTML(punches) {
  if (!punches.length) return '<div class="empty">Nenhuma marcação.</div>';
  return `<ul class="timeline">${punches.map((p) => `
    <li>
      <span class="tag t-${p.type}"></span>
      <span class="time">${hhmm(p.ts)}</span>
      <span class="grow">
        <div>${esc(punchLabel(p))}${p.type === 'break_start' && isPaidBreak(p.reason) ? ' <span class="paid-tag">remunerada</span>' : ''}</div>
        ${p.note || p.manual || p.auto || p.edited || p.loc ? `<div class="small muted">${[
          p.auto ? 'preenchida pela jornada' : p.manual ? 'manual' : '', p.edited ? 'ajustada' : '', p.loc ? 'com local' : '', esc(p.note || ''),
        ].filter(Boolean).join(' · ')}</div>` : ''}
      </span>
      <button class="link" data-act="editPunch" data-arg="${p.id}" aria-label="Editar">${icon('edit')}</button>
    </li>`).join('')}</ul>`;
}

// ---------- Tela: Ponto ----------
function greeting() {
  const h = new Date().getHours();
  const g = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const first = state.settings.name.trim().split(/\s+/)[0];
  return first ? `${g}, ${esc(first)}` : g;
}

function homeStats(now = Date.now()) {
  const st = currentState(state.punches, now);
  const days = buildDays(state.punches, now);
  const key = st.day || today();
  const s = summarizeDay(key, days, state.settings, state.dayInfo, key);
  const remaining = s.expected - s.work;
  let forecast = null;
  if (s.expected > 0 && remaining > 0 && st.state !== 'off') {
    // Sem intervalo ainda e jornada longa: soma 1h prevista de refeição.
    const pendingBreak = st.state === 'working' && s.breaks === 0 && s.expected > 6 * HOUR ? HOUR : 0;
    forecast = now + remaining + pendingBreak;
  }
  return { st, s, remaining, forecast, bank: hourBank(state.punches, state.settings, state.dayInfo, now) };
}

function statusText(st, now = Date.now()) {
  if (st.state === 'working') return `Trabalhando desde ${hhmm(st.since)} · ${fmtDur(now - st.since)}`;
  if (st.state === 'break') {
    const r = st.last?.reason;
    const label = r === 'Refeição' ? 'Em refeição' : r ? `Em pausa (${r}${isPaidBreak(r) ? ', conta como trabalho' : ''})` : 'Em intervalo';
    return `${label} desde ${hhmm(st.since)} · ${fmtDur(now - st.since)}`;
  }
  return 'Fora do expediente';
}

function renderHome() {
  const now = Date.now();
  const { st, s, forecast, bank } = homeStats(now);
  const main = suggestedNext(st.state);
  const others = st.state === 'working' ? ['meal', 'pause'] : st.state === 'break' ? ['out'] : [];
  const onMeal = st.state === 'break' && st.last?.reason === 'Refeição';
  const mainLabel = main === 'break_end' ? (onMeal ? 'Voltar da refeição' : 'Voltar da pausa') : PUNCH_TYPES[main].label;
  const label = (t) => (t === 'meal' ? 'Refeição' : t === 'pause' ? 'Pausa' : PUNCH_TYPES[t].short);
  const pct = s.expected ? Math.min(100, Math.round((s.work / s.expected) * 100)) : 0;
  const d = new Date(now);
  const occ = state.dayInfo[today()]?.occurrence;

  const daysSinceBackup = state.meta.lastBackup ? Math.floor((now - state.meta.lastBackup) / (24 * HOUR)) : null;
  const needBackup = state.punches.length >= 4 && (daysSinceBackup === null || daysSinceBackup >= state.settings.backupReminderDays);
  const showInstall = isIOS && !isStandalone;

  return `
    ${showInstall ? `<div class="banner">${icon('download')}<span>Para instalar no iPhone: toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.</span></div>` : ''}
    ${missingBannerHTML()}
    ${needBackup ? `<div class="banner">${icon('shield')}<span>${daysSinceBackup === null ? 'Você ainda não fez backup.' : `Último backup há ${daysSinceBackup} dias.`}</span><button class="btn" data-act="backup">Fazer agora</button></div>` : ''}

    <section class="card hero">
      <div class="greet">${greeting()} · ${esc(fmtDayLong(today()))}</div>
      <div class="clock" data-live="clock">${pad(d.getHours())}:${pad(d.getMinutes())}<small>:${pad(d.getSeconds())}</small></div>
      <div class="status"><span class="dot ${st.state}"></span><span data-live="status">${statusText(st, now)}</span></div>
      ${occ ? `<div class="small" style="margin-top:8px;opacity:.85">Hoje: ${esc(OCCURRENCES[occ].label)}</div>` : ''}
    </section>

    <section class="actions">
      <button class="action main a-${main}" data-act="punch" data-arg="${main}">
        ${icon(main)}<div><strong>${mainLabel}</strong><br><span>${ACTION_HINT[main]}</span></div>
      </button>
      ${others.map((t) => `
        <button class="action a-${t} ${others.length === 1 ? 'wide' : ''}" data-act="punch" data-arg="${t}">
          ${icon(t)}<strong>${label(t)}</strong><span>${ACTION_HINT[t]}</span>
        </button>`).join('')}
    </section>

    <section class="card">
      <h2>Hoje</h2>
      <div class="stats">
        <div class="stat"><div class="k">Trabalhado</div><div class="v" data-live="work">${fmtDur(s.work)}</div><div class="s">de ${fmtDur(s.expected)} previstas</div></div>
        <div class="stat"><div class="k">Intervalos</div><div class="v" data-live="breaks">${fmtDur(s.breaks)}</div><div class="s">pausas no dia</div></div>
        <div class="stat"><div class="k">Saldo do dia</div><div class="v ${signCls(s.work - s.expected)}" data-live="dayBalance">${fmtDur(s.work - s.expected, { sign: true })}</div><div class="s">em relação à jornada</div></div>
        <div class="stat"><div class="k">Saída prevista</div><div class="v" data-live="forecast">${forecast ? hhmm(forecast) : '—'}</div><div class="s">para cumprir a jornada</div></div>
      </div>
      <div class="progress"><div data-live="progress" style="width:${pct}%"></div></div>
      <div class="small muted" data-live="pct">${s.expected ? `${pct}% da jornada` : 'Dia sem jornada prevista'}</div>
    </section>

    <section class="card">
      <div class="row between"><h2 style="margin:0">Banco de horas</h2>${icon('bank', 'muted')}</div>
      <div class="v ${signCls(bank)}" style="font-size:30px;font-weight:800;margin-top:6px" data-live="bank">${fmtDur(bank, { sign: true })}</div>
      <div class="small muted">Acumulado ${state.settings.bankStart ? `desde ${fmtDay(state.settings.bankStart, { weekday: false })}` : 'desde a primeira marcação'}</div>
    </section>

    ${homeRemindersHTML(now)}

    <section class="card">
      <div class="row between" style="margin-bottom:6px">
        <h2 style="margin:0">Marcações de hoje</h2>
        <button class="link" data-act="addPunch" data-arg="${today()}">${icon('plus')}</button>
      </div>
      ${timelineHTML(s.punches)}
      ${!s.punches.length && dayTemplate(today(), state.settings, state.dayInfo).some((t) => t.ts < now - 30 * MIN) ? `<button class="btn block wand-btn" data-act="fillDay" data-arg="${today()}" style="margin-top:10px">${icon('wand')} Esqueceu de marcar? Preencher até agora</button>` : ''}
      ${s.warnings.length ? `<div class="banner" style="margin:10px 0 0">${icon('warn')}<span>${s.warnings.map(esc).join('<br>')}</span></div>` : ''}
    </section>`;
}

/** Aviso de dias recentes esquecidos (últimos 14 dias). */
function missingBannerHTML() {
  // Só a partir de quando o app começou a ser usado (primeira abertura ou primeira marcação).
  const first = Math.min(state.meta.createdAt || Date.now(), ...state.punches.map((p) => p.ts));
  const from = [addDays(today(), -14), dayKey(first)].sort()[1];
  const blanks = blankWorkdays(from, today());
  if (blanks.length) {
    return `<div class="banner info-banner">${icon('wand')}<span>${blanks.length > 1 ? `${blanks.length} dias de trabalho sem marcação` : `${esc(fmtDay(blanks[0], { year: false }))} ficou sem marcação`}</span><button class="btn" data-act="bulkFill" data-arg="${from}|${today()}">Preencher</button></div>`;
  }
  const days = buildDays(state.punches);
  const broken = [...days.entries()].filter(([k, d]) => k >= from && k < today() && d.issues.includes('Saída não registrada')).map(([k]) => k);
  if (broken.length) {
    return `<div class="banner info-banner">${icon('warn')}<span>${esc(fmtDay(broken[0], { year: false }))} ficou sem a saída</span><button class="btn" data-act="completeDay" data-arg="${broken[0]}">Completar</button></div>`;
  }
  return '';
}
ACTIONS.completeDay = (key) => openFillSheet(key, 'complete');

function homeRemindersHTML(now) {
  const next = upcomingAlarms(now, now + 36 * HOUR).filter((a) => a.rid).slice(0, 3);
  return `<section class="card">
    <div class="row between" style="margin-bottom:6px">
      <h2 style="margin:0">Próximos lembretes</h2>
      <button class="link" data-act="newReminder" aria-label="Criar lembrete">${icon('plus')}</button>
    </div>
    ${next.length ? `<ul class="timeline">${next.map((a) => `<li>
      <span class="rem-ico small-ico ${a.style === 'alarm' ? 'alarm' : ''}">${icon(a.style === 'alarm' ? 'alarm' : 'bell')}</span>
      <span class="grow"><div><b>${esc(a.title)}</b></div><div class="small muted">${whenLabel(a.at)}</div></span>
      <button class="link" data-act="editReminder" data-arg="${a.rid}" aria-label="Editar">${icon('edit')}</button>
    </li>`).join('')}</ul>`
      : `<button class="btn block" data-act="newReminder">${icon('bell')} Criar lembrete</button>`}
  </section>`;
}

// Atualiza relógio e números ao vivo sem redesenhar a tela.
function tick() {
  if (ui.view !== 'home' || document.hidden) return;
  const now = Date.now();
  const d = new Date(now);
  const set = (k, html) => { const el = $(`[data-live="${k}"]`); if (el && el.innerHTML !== html) el.innerHTML = html; };
  set('clock', `${pad(d.getHours())}:${pad(d.getMinutes())}<small>:${pad(d.getSeconds())}</small>`);
  if (d.getSeconds() % 10 !== 0) return;
  const { st, s, forecast, bank } = homeStats(now);
  set('status', statusText(st, now));
  set('work', fmtDur(s.work));
  set('breaks', fmtDur(s.breaks));
  set('dayBalance', fmtDur(s.work - s.expected, { sign: true }));
  set('forecast', forecast ? hhmm(forecast) : '—');
  set('bank', fmtDur(bank, { sign: true }));
  const pct = s.expected ? Math.min(100, Math.round((s.work / s.expected) * 100)) : 0;
  const bar = $('[data-live="progress"]');
  if (bar) bar.style.width = `${pct}%`;
  set('pct', s.expected ? `${pct}% da jornada` : 'Dia sem jornada prevista');
}

// ---------- Tela: Histórico ----------
function monthLabel(key) {
  const d = parseDay(key);
  const m = MONTHS[d.getMonth()];
  return `${m[0].toUpperCase()}${m.slice(1)} de ${d.getFullYear()}`;
}

function renderHistory() {
  const [start, endOfMonth] = monthRange(ui.historyMonth);
  const end = endOfMonth > today() ? today() : endOfMonth;
  const rep = start <= end ? buildReport(start, end, state.punches, state.settings, state.dayInfo) : { rows: [], totals: { work: 0, balance: 0, daysWorked: 0 } };
  const isCurrent = monthRange(today())[0] === start;
  const rows = [...rep.rows].reverse();
  const blanks = start <= end ? blankWorkdays(start, end) : [];
  const sel = ui.select;
  return `
    <div class="pager">
      <button class="icon-btn" data-act="histMonth" data-arg="-1" aria-label="Mês anterior">${icon('left')}</button>
      <div class="label">${monthLabel(start)}</div>
      <button class="icon-btn" data-act="histMonth" data-arg="1" aria-label="Próximo mês" ${isCurrent ? 'disabled style="opacity:.3"' : ''}>${icon('right')}</button>
    </div>
    <section class="card">
      <div class="stats three">
        <div class="stat"><div class="k">Trabalhado</div><div class="v">${fmtDur(rep.totals.work)}</div></div>
        <div class="stat"><div class="k">Saldo</div><div class="v ${signCls(rep.totals.balance)}">${fmtDur(rep.totals.balance, { sign: true })}</div></div>
        <div class="stat"><div class="k">Dias</div><div class="v">${rep.totals.daysWorked}</div></div>
      </div>
      <div class="btn-row" style="margin-top:12px">
        ${blanks.length && !sel ? `<button class="btn wand-btn" data-act="bulkFill" data-arg="${start}|${end}">${icon('wand')} Preencher ${blanks.length} ${blanks.length > 1 ? 'dias' : 'dia'} em branco</button>` : ''}
        <button class="btn ${sel ? 'primary' : ''}" data-act="selectMode">${icon(sel ? 'check' : 'calendar')} ${sel ? 'Concluir seleção' : 'Selecionar dias'}</button>
      </div>
    </section>
    ${sel ? `<div class="sel-help">
      <span class="small">Toque nos dias para marcar. Atalhos:</span>
      <div class="chips">
        <button class="chip" data-act="selQuick" data-arg="blank">Dias em branco</button>
        <button class="chip" data-act="selQuick" data-arg="work">Todos os dias de trabalho</button>
        <button class="chip" data-act="selQuick" data-arg="none">Limpar</button>
      </div>
    </div>` : ''}
    ${rows.length ? `<ul class="day-list ${sel ? 'selecting' : ''}">${rows.map(dayItemHTML).join('')}</ul>` : '<div class="empty">Nada neste mês.</div>'}
    ${sel ? `<div class="sel-bar">
      <span><b>${sel.size}</b> ${sel.size === 1 ? 'dia selecionado' : 'dias selecionados'}</span>
      <button class="btn primary" data-act="selApply" ${sel.size ? '' : 'disabled'}>${icon('wand')} Preencher pela jornada</button>
    </div>` : ''}`;
}

function dayItemHTML(r) {
  const d = parseDay(r.key);
  const off = !r.punches.length && !r.expected && !r.occurrence;
  const sel = ui.select;
  const on = sel?.has(r.key);
  return `<li><button class="day-item ${off ? 'off' : ''} ${on ? 'selected' : ''}" data-act="${sel ? 'toggleSel' : 'openDay'}" data-arg="${r.key}">
    ${sel ? `<span class="sel-dot">${on ? icon('check') : ''}</span>` : ''}
    <div class="day-date"><b>${pad(d.getDate())}</b><span>${WEEKDAYS[d.getDay()].slice(0, 3)}</span></div>
    <div class="grow">
      <div class="chips">
        ${r.occurrence ? `<span class="chip occ">${esc(OCCURRENCES[r.occurrence].label)}</span>` : ''}
        ${r.punches.map((p) => `<span class="chip t-${p.type}">${hhmm(p.ts)}</span>`).join('')}
        ${!r.punches.length && !r.occurrence ? `<span class="small muted">${r.expected ? 'Sem marcações' : 'Sem jornada'}</span>` : ''}
      </div>
    </div>
    <div class="day-nums">
      <b>${fmtDur(r.work)}</b>
      <span class="small ${signCls(r.balance)}">${r.balance ? fmtDur(r.balance, { sign: true }) : ''}</span>
      ${r.warnings.length ? `<span class="warn-ico">${icon('warn')}</span>` : ''}
    </div>
  </button></li>`;
}

ACTIONS.histMonth = (delta) => {
  const d = parseDay(ui.historyMonth);
  d.setDate(1);
  d.setMonth(d.getMonth() + Number(delta));
  ui.historyMonth = dayKey(d.getTime());
  render();
};

/** Painel de um dia: marcações, ocorrência e observação. */
function openDay(key) {
  const days = buildDays(state.punches);
  const s = summarizeDay(key, days, state.settings, state.dayInfo, today());
  const info = state.dayInfo[key] || {};
  const sheet = openSheet(`
    <h3>${esc(fmtDayLong(key))}</h3>
    <p class="sub">Trabalhado ${fmtDur(s.work)} · Intervalos ${fmtDur(s.breaks)} · Previsto ${fmtDur(s.expected)} · Saldo <b class="${signCls(s.balance)}">${fmtDur(s.balance, { sign: true })}</b></p>
    ${s.warnings.length ? `<div class="banner">${icon('warn')}<span>${s.warnings.map(esc).join('<br>')}</span></div>` : ''}
    <div class="card" style="box-shadow:none">${timelineHTML(s.punches)}</div>
    ${dayTemplate(key, state.settings, state.dayInfo).length ? `<button class="btn block wand-btn" data-fill style="margin-bottom:10px">${icon('wand')} ${s.punches.length ? 'Corrigir pela jornada' : 'Preencher com a jornada'}</button>` : ''}
    <button class="btn block" data-add style="margin-bottom:16px">${icon('plus')} Adicionar marcação</button>
    <label class="field"><span>Ocorrência do dia</span>
      <select class="input" name="occ">
        <option value="">Dia normal</option>
        ${Object.entries(OCCURRENCES).map(([k, v]) => `<option value="${k}" ${info.occurrence === k ? 'selected' : ''}>${v.label}${v.paid ? ' (não desconta)' : ' (desconta)'}</option>`).join('')}
      </select>
    </label>
    <label class="field"><span>Observação</span><textarea class="input" name="note" maxlength="500" placeholder="Ex.: reunião externa, compensação…">${esc(info.note || '')}</textarea></label>
    <div class="btn-row"><button class="btn" data-close>Fechar</button><button class="btn primary" data-save>Salvar dia</button></div>`, (sh) => {
    $('[data-add]', sh).addEventListener('click', () => openPunchEditor(null, key));
    $('[data-fill]', sh)?.addEventListener('click', () => openFillSheet(key));
    $('[data-save]', sh).addEventListener('click', async () => {
      await setDayInfo(key, { occurrence: $('[name=occ]', sh).value || null, note: $('[name=note]', sh).value.trim() });
      closeSheet();
      render();
      toast('Dia salvo');
    });
  });
  // Editar marcação a partir do painel do dia
  $$('[data-act="editPunch"]', sheet).forEach((b) => b.addEventListener('click', () => ACTIONS.editPunch(b.dataset.arg)));
}
ACTIONS.openDay = (key) => openDay(key);

// ---------- Preencher e corrigir pela jornada ----------
const TYPE_DOT = { in: 'Entrada', break_start: 'Saída para refeição', break_end: 'Volta da refeição', out: 'Saída' };
const tplOf = (key, withBreak) => dayTemplate(key, state.settings, state.dayInfo, { withBreak })
  .filter((t) => t.ts <= Date.now());

/** Dias de trabalho já passados, sem nenhuma marcação e sem ocorrência. */
function blankWorkdays(from, to) {
  const marked = new Set(state.punches.map((p) => dayKey(p.ts)));
  const out = [];
  const last = to >= today() ? addDays(today(), -1) : to;
  for (let k = from; k <= last; k = addDays(k, 1)) {
    if (state.dayInfo[k]?.occurrence || marked.has(k)) continue;
    if (dayTemplate(k, state.settings, state.dayInfo).length) out.push(k);
  }
  return out;
}

/** "08:00 · 12:00–13:00 · 17:48" */
function templateText(tpl) {
  if (!tpl.length) return 'sem jornada';
  const t = tpl.map((p) => hhmm(p.ts));
  return tpl.length === 4 ? `${t[0]} · ${t[1]}–${t[2]} · ${t[3]}` : `${t[0]} – ${t[1]}`;
}

/** Desfazer: remove o que foi criado e devolve o que foi apagado. */
function undoToast(msg, added, removed) {
  toast(msg, {
    label: 'Desfazer',
    run: async () => {
      for (const p of added) await deletePunch(p.id);
      for (const p of removed) await addPunch(p);
      render();
      toast('Alteração desfeita');
    },
  });
}

const dayPunches = (key) => [...(buildDays(state.punches).get(key)?.punches || [])];

/**
 * Painel para preencher, completar ou corrigir um dia com o horário padrão.
 * mode: 'fill' (dia vazio), 'replace' (refaz tudo) ou 'complete' (só o que falta).
 */
function openFillSheet(key, preferred) {
  const now = Date.now();
  const existing = dayPunches(key);
  const ruleHasBreak = dayTemplate(key, state.settings, state.dayInfo).length === 4;
  let withBreak = ruleHasBreak;
  if (!tplOf(key, withBreak).length) {
    toast(dayTemplate(key, state.settings, state.dayInfo).length ? 'Ainda não chegou o horário da jornada' : 'Este dia não tem jornada prevista (veja Ajustes → Jornada)');
    return;
  }
  let mode = existing.length ? (preferred === 'complete' ? 'complete' : 'replace') : 'fill';
  let rows = [];
  const base = parseDay(key).getTime();
  const build = () => {
    const tpl = tplOf(key, withBreak);
    rows = (mode === 'complete' ? completeWithTemplate(existing, tpl) : tpl).map((t) => ({ ...t }));
  };
  build();

  const result = () => (mode === 'complete' ? [...existing, ...rows] : rows).sort((a, b) => a.ts - b.ts);
  const summary = () => {
    const list = result().map((p, i) => ({ ...p, id: p.id || `n${i}` }));
    const d = summarizeDay(key, buildDays(list, now), state.settings, state.dayInfo, today());
    return `<span>Trabalhado <b>${fmtDur(d.work)}</b></span><span>Intervalo <b>${fmtDur(d.breaks)}</b></span><span>Saldo <b class="${signCls(d.work - d.expected)}">${fmtDur(d.work - d.expected, { sign: true })}</b></span>`;
  };
  const rowsHTML = () => {
    const kept = mode === 'complete' ? existing : [];
    const all = [...kept.map((p) => ({ p, kept: true })), ...rows.map((p, i) => ({ p, i }))].sort((a, b) => a.p.ts - b.p.ts);
    if (mode === 'complete' && !rows.length) return '<p class="small muted" style="text-align:center;padding:10px">Nada a completar: o dia já tem todas as marcações.</p>';
    return all.map(({ p, kept, i }) => `<div class="fill-row ${kept ? 'kept' : ''}">
        <span class="tag t-${p.type}"></span>
        <span class="grow"><b>${TYPE_DOT[p.type]}</b>${kept ? '<br><span class="small muted">já marcado</span>' : dayKey(p.ts) !== key ? '<br><span class="small muted">dia seguinte</span>' : ''}</span>
        ${kept ? `<span class="fill-time">${hhmm(p.ts)}</span>` : `<input class="input fill-time" type="time" data-row="${i}" value="${hhmm(p.ts)}">`}
      </div>`).join('');
  };

  openSheet(`
    <div class="fill-head">
      <span class="fill-ico">${icon('wand')}</span>
      <div><h3>${mode === 'fill' ? 'Preencher com a jornada' : 'Corrigir pela jornada'}</h3><p class="sub" style="margin:0">${esc(fmtDayLong(key))}</p></div>
    </div>
    ${existing.length ? `<div class="seg" style="margin-top:14px">
      <button data-mode="replace" class="${mode === 'replace' ? 'active' : ''}">Refazer o dia</button>
      <button data-mode="complete" class="${mode === 'complete' ? 'active' : ''}">Completar o que falta</button>
    </div>
    <p class="small muted" data-mode-hint style="margin:-4px 0 10px"></p>` : '<p class="small muted" style="margin:12px 0 10px">Horários do seu horário padrão. Ajuste algum se precisar.</p>'}
    <label class="switch fill-switch" ${shiftBreak(shiftFor(key, state.settings)) ? '' : 'hidden'}><span><b>Intervalo de refeição</b><br><span class="small muted">${esc((() => { const sh = shiftFor(key, state.settings); return sh && shiftBreak(sh) ? `${sh.bs} às ${sh.be}` : 'Sem almoço no seu horário'; })())}</span></span><input type="checkbox" data-break ${withBreak ? 'checked' : ''}></label>
    <div class="fill-list" data-rows>${rowsHTML()}</div>
    <div class="fill-sum" data-sum>${summary()}</div>
    <p class="small muted" style="margin:10px 0 14px">${icon('info')} As marcações ficam identificadas como <b>preenchidas pela jornada</b> no histórico e no espelho de ponto.</p>
    <div class="btn-row">
      <button class="btn" data-close>Cancelar</button>
      <button class="btn primary" data-ok>${icon('check')} Confirmar</button>
    </div>`, (s) => {
    const hint = () => {
      const el = $('[data-mode-hint]', s);
      if (el) el.textContent = mode === 'replace'
        ? `Substitui as ${existing.length} marcações do dia pelos horários abaixo.`
        : 'Mantém o que você marcou e acrescenta só o que faltou.';
    };
    const bindRows = () => {
      $$('[data-row]', s).forEach((el) => el.addEventListener('change', () => {
        const r = rows[Number(el.dataset.row)];
        const m = parseHHMM(el.value);
        if (m === null) return;
        const offset = dayKey(r.ts) !== key ? 24 * 60 : 0;
        const d = new Date(base);
        d.setHours(0, m + offset, 0, 0);
        r.ts = d.getTime();
        $('[data-sum]', s).innerHTML = summary();
      }));
    };
    const refresh = () => {
      $('[data-rows]', s).innerHTML = rowsHTML();
      $('[data-sum]', s).innerHTML = summary();
      bindRows();
      hint();
    };
    hint();
    bindRows();
    $$('[data-mode]', s).forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      $$('[data-mode]', s).forEach((x) => x.classList.toggle('active', x === b));
      build();
      refresh();
    }));
    $('[data-break]', s).addEventListener('change', (e) => {
      withBreak = e.target.checked;
      build();
      refresh();
    });
    $('[data-ok]', s).addEventListener('click', async () => {
      const list = result();
      if (!rows.length) { closeSheet(); return; }
      for (let i = 1; i < list.length; i++) {
        if (list[i].ts <= list[i - 1].ts) return toast('Os horários precisam estar em ordem');
      }
      if (list.some((p) => p.ts > Date.now())) return toast('Não é possível marcar no futuro');
      const removed = mode === 'replace' ? existing : [];
      for (const p of removed) await deletePunch(p.id);
      const added = [];
      for (const r of rows) added.push(await addPunch({ type: r.type, ts: r.ts, reason: r.reason, auto: true }));
      closeSheet();
      render();
      undoToast(mode === 'replace' ? 'Dia corrigido pela jornada' : mode === 'complete' ? 'Marcações completadas' : 'Dia preenchido pela jornada', added, removed);
    });
  });
}
ACTIONS.fillDay = (key) => openFillSheet(key);

/**
 * Vários dias de uma vez. Para cada dia: preencher (vazio), refazer ou completar (com marcações),
 * lançar uma ocorrência (folga, falta…) ou deixar como está.
 */
function openBulkFill(keys, title = 'Preencher pela jornada') {
  keys = [...new Set(keys)].sort();
  if (!keys.length) return toast('Nenhum dia selecionado');
  const info = Object.fromEntries(keys.map((k) => [k, {
    has: dayPunches(k).length > 0,
    jornada: dayTemplate(k, state.settings, state.dayInfo).length > 0,
    occ: state.dayInfo[k]?.occurrence || null,
  }]));
  const choice = Object.fromEntries(keys.map((k) => {
    const i = info[k];
    return [k, !i.jornada ? 'skip' : i.has ? 'replace' : 'fill'];
  }));
  let withBreak = null; // null = regra de Ajustes
  const options = (k) => {
    const i = info[k];
    const work = !i.jornada ? [] : i.has
      ? [['replace', 'Refazer pela jornada'], ['complete', 'Completar o que falta']]
      : [['fill', 'Preencher pela jornada']];
    return [...work, ...Object.entries(OCCURRENCES).map(([v, o]) => [v, o.label]), ...(i.has ? [['clear', 'Apagar as marcações']] : []), ['skip', i.has ? 'Manter como está' : 'Deixar em branco']];
  };
  const detail = (k) => {
    const c = choice[k];
    const i = info[k];
    if (c === 'clear') return 'as marcações do dia serão apagadas';
    if (c === 'skip') return !i.jornada ? (i.has ? 'folga no seu horário · marcações mantidas' : 'folga no seu horário') : i.has ? 'sem alteração' : 'continua em branco';
    if (OCCURRENCES[c]) return OCCURRENCES[c].label;
    const tpl = tplOf(k, withBreak ?? undefined);
    if (c === 'complete') {
      const add = completeWithTemplate(dayPunches(k), tpl);
      return add.length ? `acrescenta ${add.map((t) => hhmm(t.ts)).join(', ')}` : 'já está completo';
    }
    return templateText(tpl);
  };
  const count = () => Object.values(choice).filter((v) => v !== 'skip').length;
  const listHTML = () => keys.map((k) => `<div class="bulk-row">
      <div class="grow"><b>${esc(fmtDay(k, { year: false }))}</b>${info[k].has ? ' <span class="chip mini">com marcações</span>' : ''}<br><span class="small muted" data-tt="${k}">${esc(detail(k))}</span></div>
      <select class="input" data-day="${k}">${options(k).map(([v, l]) => `<option value="${v}" ${choice[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
    </div>`).join('');

  openSheet(`
    <div class="fill-head">
      <span class="fill-ico">${icon('wand')}</span>
      <div><h3>${esc(title)}</h3><p class="sub" style="margin:0">${keys.length} ${keys.length > 1 ? 'dias selecionados' : 'dia selecionado'}</p></div>
    </div>
    <div class="bulk-tools">
      <span class="small muted">Aplicar a todos:</span>
      <select class="input" data-all>
        <option value="">Escolher…</option>
        <option value="work">Preencher / refazer pela jornada</option>
        <option value="complete">Completar o que falta</option>
        ${Object.entries(OCCURRENCES).map(([v, o]) => `<option value="${v}">${esc(o.label)}</option>`).join('')}
        <option value="skip">Não alterar</option>
      </select>
    </div>
    <label class="switch fill-switch"><span><b>Intervalo de refeição</b><br><span class="small muted" data-break-hint>Conforme Ajustes</span></span><input type="checkbox" data-break ${keys.some((k) => dayTemplate(k, state.settings, state.dayInfo).length === 4) ? 'checked' : ''}></label>
    <div class="bulk-list" data-list>${listHTML()}</div>
    <p class="small muted" style="margin:10px 0 14px">${icon('info')} Horários do seu horário padrão (Ajustes → Jornada). As marcações ficam identificadas como preenchidas pela jornada.</p>
    <div class="btn-row">
      <button class="btn" data-close>Cancelar</button>
      <button class="btn primary" data-ok>${icon('check')} <span data-ok-label></span></button>
    </div>`, (s) => {
    const label = () => {
      const n = count();
      $('[data-ok-label]', s).textContent = n ? `Aplicar em ${n} ${n === 1 ? 'dia' : 'dias'}` : 'Nada a aplicar';
    };
    const bindList = () => {
      $$('[data-day]', s).forEach((el) => el.addEventListener('change', () => {
        choice[el.dataset.day] = el.value;
        $(`[data-tt="${el.dataset.day}"]`, s).textContent = detail(el.dataset.day);
        label();
      }));
    };
    const redraw = () => { $('[data-list]', s).innerHTML = listHTML(); bindList(); label(); };
    bindList();
    label();
    $('[data-all]', s).addEventListener('change', (e) => {
      const v = e.target.value;
      if (!v) return;
      keys.forEach((k) => {
        const opts = options(k).map(([o]) => o);
        const want = v === 'work' ? (info[k].has ? 'replace' : 'fill') : v;
        if (opts.includes(want)) choice[k] = want;
      });
      e.target.value = '';
      redraw();
    });
    $('[data-break]', s).addEventListener('change', (e) => {
      withBreak = e.target.checked ? true : false;
      $('[data-break-hint]', s).textContent = withBreak ? 'Almoço do seu horário em todos os dias' : 'Sem almoço';
      redraw();
    });
    $('[data-ok]', s).addEventListener('click', async () => {
      if (!count()) { closeSheet(); return; }
      const added = [];
      const removed = [];
      let worked = 0; let marked = 0;
      for (const k of keys) {
        const c = choice[k];
        if (c === 'skip') continue;
        if (OCCURRENCES[c]) {
          await setDayInfo(k, { ...(state.dayInfo[k] || {}), occurrence: c });
          marked++;
          continue;
        }
        if (c === 'clear') {
          for (const p of dayPunches(k)) { await deletePunch(p.id); removed.push(p); }
          worked++;
          continue;
        }
        const tpl = tplOf(k, withBreak ?? undefined);
        const existing = dayPunches(k);
        let toAdd = tpl;
        if (c === 'replace') { for (const p of existing) { await deletePunch(p.id); removed.push(p); } }
        if (c === 'complete') toAdd = completeWithTemplate(existing, tpl);
        // Dia que tinha ocorrência e passou a ser trabalhado: tira a ocorrência.
        if (state.dayInfo[k]?.occurrence) await setDayInfo(k, { ...state.dayInfo[k], occurrence: null });
        for (const t of toAdd) added.push(await addPunch({ type: t.type, ts: t.ts, reason: t.reason, auto: true }));
        if (toAdd.length) worked++;
      }
      ui.select = null;
      closeSheet();
      render();
      const msg = [worked ? `${worked} ${worked > 1 ? 'dias ajustados' : 'dia ajustado'} pela jornada` : '', marked ? `${marked} com ocorrência` : ''].filter(Boolean).join(' · ') || 'Nada alterado';
      if (added.length || removed.length) undoToast(msg, added, removed); else toast(msg);
    });
  });
}
ACTIONS.bulkFill = (range) => {
  const [a, b] = range.split('|');
  openBulkFill(blankWorkdays(a, b), 'Dias sem marcação');
};

// Seleção de vários dias no Histórico
ACTIONS.selectMode = () => {
  ui.select = ui.select ? null : new Set();
  render();
};
ACTIONS.toggleSel = (key) => {
  if (!ui.select) return;
  if (ui.select.has(key)) ui.select.delete(key); else ui.select.add(key);
  render();
};
ACTIONS.selQuick = (kind) => {
  const [start, endOfMonth] = monthRange(ui.historyMonth);
  const end = endOfMonth > today() ? today() : endOfMonth;
  ui.select = new Set();
  if (kind === 'blank') blankWorkdays(start, end).forEach((k) => ui.select.add(k));
  if (kind === 'work') {
    for (let k = start; k <= end; k = addDays(k, 1)) {
      if (dayTemplate(k, state.settings, state.dayInfo).length && !state.dayInfo[k]?.occurrence) ui.select.add(k);
    }
  }
  render();
};
ACTIONS.selApply = () => openBulkFill([...(ui.select || [])], 'Dias selecionados');

// ---------- Tela: Relatórios ----------
const REPORT_MODES = { day: 'Dia', week: 'Semana', month: 'Mês', year: 'Ano', custom: 'Período' };

function reportRange() {
  const r = ui.report;
  if (r.mode === 'day') return [r.anchor, r.anchor];
  if (r.mode === 'week') return weekRange(r.anchor);
  if (r.mode === 'month') return monthRange(r.anchor);
  if (r.mode === 'year') return yearRange(r.anchor);
  return r.from <= r.to ? [r.from, r.to] : [r.to, r.from];
}

function rangeLabel([a, b]) {
  const r = ui.report;
  if (r.mode === 'day') return fmtDayLong(a);
  if (r.mode === 'month') return monthLabel(a);
  if (r.mode === 'year') return String(parseDay(a).getFullYear());
  return `${fmtDay(a, { weekday: false })} a ${fmtDay(b, { weekday: false })}`;
}

function currentReport() {
  const [a, b] = reportRange();
  return buildReport(a, b, state.punches, state.settings, state.dayInfo);
}

function byMonth(rep) {
  const groups = new Map();
  rep.rows.forEach((r) => {
    const k = r.key.slice(0, 7);
    if (!groups.has(k)) groups.set(k, { key: k, work: 0, expected: 0, balance: 0, breaks: 0, days: 0 });
    const g = groups.get(k);
    g.work += r.work; g.breaks += r.breaks; g.balance += r.balance;
    if (!r.future) g.expected += r.expected;
    if (r.work > 0) g.days += 1;
  });
  return [...groups.values()];
}

function chartSVG(items) {
  // items: [{ label, value, expected }] em ms
  if (!items.length) return '';
  const W = 600; const H = 170; const top = 10; const bottom = 22;
  const max = Math.max(HOUR, ...items.map((i) => Math.max(i.value, i.expected))) * 1.1;
  const bw = W / items.length;
  const y = (v) => top + (H - top - bottom) * (1 - v / max);
  const every = Math.ceil(items.length / 12);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Horas trabalhadas por período">
    ${items.map((it, i) => {
      const x = i * bw + bw * 0.18; const w = bw * 0.64;
      const h = Math.max(0, H - bottom - y(it.value));
      return `<rect class="bar ${it.value > it.expected && it.expected ? 'over' : ''}" x="${x}" y="${H - bottom - h}" width="${w}" height="${h}" rx="${Math.min(4, w / 3)}"><title>${esc(it.label)}: ${fmtDur(it.value)}</title></rect>
        ${it.expected ? `<line class="exp" x1="${i * bw + 2}" x2="${(i + 1) * bw - 2}" y1="${y(it.expected)}" y2="${y(it.expected)}"/>` : ''}
        ${i % every === 0 ? `<text x="${i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(it.short)}</text>` : ''}`;
    }).join('')}
  </svg>
  <div class="legend"><span><i style="background:var(--brand)"></i>Trabalhado</span><span><i style="background:var(--brand-2)"></i>Acima do previsto</span><span><i style="background:var(--accent);height:3px"></i>Previsto</span></div>`;
}

function renderReports() {
  const r = ui.report;
  const range = reportRange();
  const rep = currentReport();
  const t = rep.totals;
  const yearly = r.mode === 'year';
  const months = yearly ? byMonth(rep) : [];

  const chartItems = r.mode === 'day' ? [] : yearly
    ? months.map((m) => ({ label: m.key, short: MONTHS[Number(m.key.slice(5)) - 1].slice(0, 3), value: m.work, expected: m.expected }))
    : rep.rows.map((x) => ({ label: fmtDay(x.key), short: String(parseDay(x.key).getDate()), value: x.work, expected: x.future ? 0 : x.expected }));

  const dayDetail = r.mode === 'day' ? rep.rows[0] : null;

  return `
    <div class="seg" role="tablist">
      ${Object.entries(REPORT_MODES).map(([k, v]) => `<button data-act="repMode" data-arg="${k}" class="${r.mode === k ? 'active' : ''}">${v}</button>`).join('')}
    </div>
    ${r.mode === 'custom' ? `
      <div class="grid-2" style="margin-bottom:12px">
        <label class="field" style="margin:0"><span>De</span><input class="input" type="date" value="${r.from}" data-act="repFrom"></label>
        <label class="field" style="margin:0"><span>Até</span><input class="input" type="date" value="${r.to}" data-act="repTo"></label>
      </div>` : `
      <div class="pager">
        <button class="icon-btn" data-act="repNav" data-arg="-1" aria-label="Anterior">${icon('left')}</button>
        <div class="label">${esc(rangeLabel(range))}</div>
        <button class="icon-btn" data-act="repNav" data-arg="1" aria-label="Próximo">${icon('right')}</button>
      </div>`}

    <section class="card">
      <div class="stats">
        <div class="stat"><div class="k">Trabalhado</div><div class="v">${fmtDur(t.work)}</div></div>
        <div class="stat"><div class="k">Previsto</div><div class="v">${fmtDur(t.expected)}</div></div>
        <div class="stat"><div class="k">Saldo</div><div class="v ${signCls(t.balance)}">${fmtDur(t.balance, { sign: true })}</div></div>
        <div class="stat"><div class="k">Horas extras</div><div class="v pos">${fmtDur(t.extra)}</div></div>
        <div class="stat"><div class="k">Débito</div><div class="v ${t.debt ? 'neg' : ''}">${fmtDur(t.debt)}</div></div>
        <div class="stat"><div class="k">Dias trabalhados</div><div class="v">${t.daysWorked}</div></div>
        <div class="stat"><div class="k">Média por dia</div><div class="v">${fmtDur(t.avgPerDay)}</div></div>
        <div class="stat"><div class="k">Faltas / abonos</div><div class="v">${t.absences} / ${t.excused}</div></div>
        <div class="stat"><div class="k">Intervalos</div><div class="v">${fmtDur(t.breaks)}</div><div class="s">+ ${fmtDur(t.paidBreaks)} de pausas pagas</div></div>
      </div>
      ${Object.keys(t.modes).length ? `<div class="chips" style="margin-top:12px">${Object.entries(t.modes).map(([k, n]) => `<span class="chip">${esc(WORK_MODES[k] || k)}: ${n} ${n > 1 ? 'dias' : 'dia'}</span>`).join('')}</div>` : ''}
    </section>

    ${chartItems.length ? `<section class="card"><h2>Horas por ${yearly ? 'mês' : 'dia'}</h2>${chartSVG(chartItems)}</section>` : ''}

    ${dayDetail ? `<section class="card"><h2>Marcações</h2>${timelineHTML(dayDetail.punches)}
      ${dayDetail.warnings.length ? `<div class="banner" style="margin:10px 0 0">${icon('warn')}<span>${dayDetail.warnings.map(esc).join('<br>')}</span></div>` : ''}
      <button class="btn block" style="margin-top:10px" data-act="openDay" data-arg="${dayDetail.key}">${icon('edit')} Ajustar dia</button></section>` : ''}

    <section class="card">
      <h2>Exportar</h2>
      <div class="btn-row">
        <button class="btn primary" data-act="repPdf">${icon('pdf')} PDF</button>
        <button class="btn" data-act="repCsv">${icon('table')} Planilha</button>
        <button class="btn" data-act="repShare">${icon('share')} Resumo</button>
      </div>
      <p class="small muted" style="margin:10px 0 0">PDF: na tela de impressão, escolha “Salvar como PDF”. A planilha (CSV) abre no Excel e no Google Planilhas.</p>
    </section>

    ${r.mode === 'day' ? '' : `<section class="card">
      <h2>${yearly ? 'Por mês' : 'Por dia'}</h2>
      <div class="table-wrap"><table class="rep">
        <thead><tr><th>${yearly ? 'Mês' : 'Dia'}</th>${yearly ? '<th>Dias</th>' : '<th>Entrada</th><th>Saída</th>'}<th>Trab.</th><th>Prev.</th><th>Saldo</th></tr></thead>
        <tbody>
          ${yearly ? months.map((m) => `<tr><td style="text-transform:capitalize">${MONTHS[Number(m.key.slice(5)) - 1]}</td><td>${m.days}</td><td>${fmtDur(m.work)}</td><td>${fmtDur(m.expected)}</td><td class="${signCls(m.balance)}">${fmtDur(m.balance, { sign: true })}</td></tr>`).join('')
            : rep.rows.filter((x) => !x.future).map((x) => `<tr class="click" data-act="openDay" data-arg="${x.key}">
              <td>${fmtDay(x.key, { year: false })}${x.occurrence ? ` <span class="chip occ">${esc(OCCURRENCES[x.occurrence].label)}</span>` : ''}${x.warnings.length ? ' ⚠️' : ''}</td>
              <td>${x.firstIn ? hhmm(x.firstIn) : '—'}</td><td>${x.lastOut ? hhmm(x.lastOut) : x.open ? '…' : '—'}</td>
              <td>${fmtDur(x.work)}</td><td>${fmtDur(x.expected)}</td><td class="${signCls(x.balance)}">${x.balance ? fmtDur(x.balance, { sign: true }) : '—'}</td></tr>`).join('')}
        </tbody>
        <tfoot><tr><td>Total</td>${yearly ? `<td>${t.daysWorked}</td>` : '<td></td><td></td>'}<td>${fmtDur(t.work)}</td><td>${fmtDur(t.expected)}</td><td class="${signCls(t.balance)}">${fmtDur(t.balance, { sign: true })}</td></tr></tfoot>
      </table></div>
    </section>`}`;
}

ACTIONS.repMode = (mode) => { ui.report.mode = mode; render(); };
ACTIONS.repNav = (delta) => {
  const r = ui.report; const n = Number(delta);
  if (r.mode === 'day') r.anchor = addDays(r.anchor, n);
  else if (r.mode === 'week') r.anchor = addDays(r.anchor, 7 * n);
  else {
    const d = parseDay(r.anchor);
    d.setDate(1);
    if (r.mode === 'month') d.setMonth(d.getMonth() + n); else d.setFullYear(d.getFullYear() + n);
    r.anchor = dayKey(d.getTime());
  }
  render();
};
ACTIONS.repFrom = (_, el) => { if (el.value) { ui.report.from = el.value; render(); } };
ACTIONS.repTo = (_, el) => { if (el.value) { ui.report.to = el.value; render(); } };

function fileStamp(range) {
  return range[0] === range[1] ? range[0] : `${range[0]}_a_${range[1]}`;
}

ACTIONS.repCsv = async () => {
  const range = reportRange();
  const rep = currentReport();
  const head = ['Data', 'Dia da semana', 'Ocorrência', 'Modalidade', 'Marcações', 'Primeira entrada', 'Última saída', 'Trabalhado', 'Intervalos', 'Pausas remuneradas', 'Previsto', 'Saldo', 'Alertas', 'Observação'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rep.rows.filter((r) => !r.future).map((r) => [
    fmtDay(r.key, { weekday: false }), WEEKDAYS[parseDay(r.key).getDay()],
    r.occurrence ? OCCURRENCES[r.occurrence].label : '',
    r.mode ? WORK_MODES[r.mode] || r.mode : '',
    r.punches.map((p) => `${PUNCH_TYPES[p.type].short}${p.reason ? ` (${p.reason})` : ''} ${hhmm(p.ts)}`).join(' | '),
    r.firstIn ? hhmm(r.firstIn) : '', r.lastOut ? hhmm(r.lastOut) : '',
    fmtClock(r.work), fmtClock(r.breaks), fmtClock(r.paidBreaks), fmtClock(r.expected), fmtClock(r.balance),
    r.warnings.join('; '), r.note,
  ].map(q).join(';'));
  const t = rep.totals;
  lines.push(['TOTAL', '', '', '', '', '', '', fmtClock(t.work), fmtClock(t.breaks), fmtClock(t.paidBreaks), fmtClock(t.expected), fmtClock(t.balance), '', ''].map(q).join(';'));
  // BOM + ponto e vírgula para o Excel em português abrir com acentos e colunas corretas.
  const csv = `﻿${head.map(q).join(';')}\n${lines.join('\n')}\n`;
  await shareFile(`smartponto-relatorio-${fileStamp(range)}.csv`, 'text/csv', csv);
};

ACTIONS.repShare = () => {
  const range = reportRange();
  const t = currentReport().totals;
  const who = state.settings.name ? `${state.settings.name}\n` : '';
  shareText(`WDQ SmartPonto · ${rangeLabel(range)}\n${who}`
    + `Trabalhado: ${fmtDur(t.work)}\nPrevisto: ${fmtDur(t.expected)}\nSaldo: ${fmtDur(t.balance, { sign: true })}\n`
    + `Horas extras: ${fmtDur(t.extra)}\nDias trabalhados: ${t.daysWorked}\nFaltas: ${t.absences} · Abonos: ${t.excused}`);
};

ACTIONS.repPdf = () => {
  const range = reportRange();
  const rep = currentReport();
  const t = rep.totals;
  const s = state.settings;
  const maxPunches = Math.max(4, ...rep.rows.map((r) => r.punches.length));
  const cols = Math.min(8, maxPunches + (maxPunches % 2));
  $('#print-root').innerHTML = `
    <div class="p-head">
      <div class="p-brand"><img src="icons/icon.svg" alt="">WDQ SmartPonto</div>
      <div style="text-align:right"><b>Espelho de ponto</b><br>${esc(rangeLabel(range))}</div>
    </div>
    <div class="p-info">
      <div><b>Nome</b>${esc(s.name || '—')}</div>
      <div><b>Empresa</b>${esc(s.company || '—')}</div>
      <div><b>Cargo / matrícula</b>${esc([s.role, s.employeeId].filter(Boolean).join(' · ') || '—')}</div>
      <div><b>Período</b>${fmtDay(range[0], { weekday: false })} a ${fmtDay(range[1], { weekday: false })}</div>
      <div><b>Jornada</b>${esc(scheduleSummary(s))}</div>
      <div><b>Emitido em</b>${fmtDay(today(), { weekday: false })} ${hhmm(Date.now())}</div>
    </div>
    <div class="p-kpis">
      <div><span>Trabalhado</span><b>${fmtDur(t.work)}</b></div>
      <div><span>Previsto</span><b>${fmtDur(t.expected)}</b></div>
      <div><span>Saldo</span><b>${fmtDur(t.balance, { sign: true })}</b></div>
      <div><span>Horas extras</span><b>${fmtDur(t.extra)}</b></div>
      <div><span>Dias / faltas</span><b>${t.daysWorked} / ${t.absences}</b></div>
    </div>
    <table class="p-table">
      <thead><tr><th>Data</th>${Array.from({ length: cols }, (_, i) => `<th>${i % 2 ? 'Saída' : 'Entrada'} ${Math.floor(i / 2) + 1}</th>`).join('')}<th>Interv.</th><th>Trab.</th><th>Prev.</th><th>Saldo</th><th>Ocorrência / obs.</th></tr></thead>
      <tbody>${rep.rows.filter((r) => !r.future).map((r) => `<tr>
        <td>${fmtDay(r.key)}</td>
        ${Array.from({ length: cols }, (_, i) => `<td>${r.punches[i] ? hhmm(r.punches[i].ts) + (r.punches[i].manual || r.punches[i].auto || r.punches[i].edited ? '*' : '') : ''}</td>`).join('')}
        <td>${r.breaks ? fmtClock(r.breaks) : ''}</td><td>${r.work ? fmtClock(r.work) : ''}</td><td>${r.expected ? fmtClock(r.expected) : ''}</td>
        <td>${r.balance ? fmtClock(r.balance) : ''}</td>
        <td>${esc([r.occurrence ? OCCURRENCES[r.occurrence].label : '', r.note, ...r.warnings].filter(Boolean).join('; '))}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td>${'<td></td>'.repeat(cols)}<td>${fmtClock(t.breaks)}</td><td>${fmtClock(t.work)}</td><td>${fmtClock(t.expected)}</td><td>${fmtClock(t.balance)}</td><td></td></tr></tfoot>
    </table>
    <div class="p-sign"><div>${esc(s.name || 'Colaborador')}</div><div>Responsável</div></div>
    <div class="p-foot">* marcação inserida manualmente, preenchida pela jornada ou ajustada. Relatório de controle pessoal gerado pelo WDQ SmartPonto; não substitui o registro oficial do empregador.</div>`;
  printPage(`Espelho de ponto ${fileStamp(range)}`);
};

// ---------- Tela: Ajustes ----------
// ---------- Ajustes: horário de trabalho ----------
const SH = (i, bs, be, o) => ({ in: i, bs, be, out: o });
const DEFAULT_SHIFT = SH('08:00', '12:00', '13:00', '17:00');
const clone = (o) => JSON.parse(JSON.stringify(o));
const plan = () => state.settings.workPlan;
// Opções rápidas do primeiro acesso.
const PRESETS = [
  { name: 'Segunda a sexta, 08:00 às 17:00', plan: { mode: 'week', days: [1, 2, 3, 4, 5], shift: SH('08:00', '12:00', '13:00', '17:00'), overrides: {} } },
  { name: 'Segunda a sexta, 08:00 às 18:00', plan: { mode: 'week', days: [1, 2, 3, 4, 5], shift: SH('08:00', '12:00', '13:00', '18:00'), overrides: {} } },
  { name: 'Segunda a sábado (sábado até 12:00)', plan: { mode: 'week', days: [1, 2, 3, 4, 5, 6], shift: SH('08:00', '12:00', '13:00', '17:00'), overrides: { 6: SH('08:00', '', '', '12:00') } } },
  { name: 'Escala 6x1', plan: { mode: 'cycle', cycle: { type: '6x1', pattern: CYCLE_TYPES['6x1'].pattern, shift: SH('08:00', '12:00', '13:00', '16:20') } } },
  { name: 'Escala 12x36', plan: { mode: 'cycle', cycle: { type: '12x36', pattern: CYCLE_TYPES['12x36'].pattern, shift: SH('07:00', '12:00', '13:00', '19:00') } } },
];
function planFrom(p) {
  const next = { ...clone(plan() || {}), ...clone(p) };
  if (next.mode === 'cycle' && !next.cycle.start) next.cycle.start = cycleStartFromLastOff(today(), next.cycle.pattern);
  return next;
}
async function savePlan(next) {
  await saveSettings({ workPlan: next });
  render();
}

function shiftEditorHTML(sh, path) {
  const noBreak = !sh.bs && !sh.be;
  const bad = !noBreak && !shiftBreak(sh);
  const t = (k, label) => `<label class="sh-field ${(k === 'bs' || k === 'be') && noBreak ? 'off' : ''}"><span>${label}</span><input class="input" type="time" data-sh="${path}" data-k="${k}" value="${esc(sh[k] || '')}" ${(k === 'bs' || k === 'be') && noBreak ? 'disabled' : ''}></label>`;
  return `<div class="shift">${t('in', 'Entrada')}${t('out', 'Saída')}${t('bs', 'Saída p/ almoço')}${t('be', 'Volta do almoço')}</div>
    <div class="shift-foot">
      <label class="check"><input type="checkbox" data-nobreak="${path}" ${noBreak ? 'checked' : ''}> Sem almoço</label>
      <span class="shift-total ${bad ? 'neg' : ''}">${bad ? 'Almoço fora do horário' : `= ${fmtDur(shiftMinutes(sh) * MIN)} de trabalho`}</span>
    </div>`;
}

/** Calendário dos próximos 14 dias: trabalho ou folga. */
function planCalendarHTML() {
  const cells = [];
  for (let i = 0; i < 14; i++) {
    const k = addDays(today(), i);
    const sh = shiftFor(k, state.settings);
    const d = parseDay(k);
    cells.push(`<div class="cal-cell ${sh ? 'work' : 'off'} ${i === 0 ? 'today' : ''}">
      <small>${WEEKDAYS[d.getDay()].slice(0, 3)}</small><b>${d.getDate()}</b><span>${sh ? `${sh.in}` : 'folga'}</span></div>`);
  }
  return `<div class="cal">${cells.join('')}</div>`;
}

function planTotalHTML(s) {
  const wp = s.workPlan;
  let day; let week;
  if (wp.mode === 'cycle') {
    const p = wp.cycle.pattern;
    day = shiftMinutes(wp.cycle.shift);
    week = p.length ? (p.filter(Boolean).length * day / p.length) * 7 : 0;
  } else {
    const mins = (wp.days || []).map((d) => shiftMinutes(wp.overrides?.[d] || wp.shift));
    week = mins.reduce((a, b) => a + b, 0);
    day = mins.length && mins.every((m) => m === mins[0]) ? mins[0] : null;
  }
  return `<div class="plan-total">${icon('check')}<div class="big">${day !== null ? `${fmtDur(day * MIN)} por dia · ` : ''}${fmtDur(week * MIN)} por semana${wp.mode === 'cycle' ? ' <small>(média)</small>' : ''}</div></div>`;
}

function jornadaHTML(s) {
  const wp = s.workPlan;
  const isCycle = wp.mode === 'cycle';
  let body;
  if (!isCycle) {
    const days = wp.days || [];
    const order = [1, 2, 3, 4, 5, 6, 0];
    body = `
      <div class="step"><span class="step-n">1</span><b>Em quais dias você trabalha?</b></div>
      <div class="day-picker" style="margin-bottom:16px">${order.map((wd) => `<button type="button" class="${days.includes(wd) ? 'on' : ''}" data-wday="${wd}">${WEEKDAYS[wd].slice(0, 3)}</button>`).join('')}</div>
      <div class="step"><span class="step-n">2</span><b>Qual é o seu horário?</b></div>
      ${shiftEditorHTML(wp.shift, 'shift')}
      ${days.length > 1 ? `<details class="more" style="margin-top:14px" ${Object.keys(wp.overrides || {}).some((d) => days.includes(Number(d))) ? 'open' : ''}>
        <summary>Algum dia tem horário diferente?</summary>
        ${order.filter((wd) => days.includes(wd)).map((wd) => {
          const o = wp.overrides?.[wd];
          return `<div class="ovr-row"><b>${WEEKDAYS[wd]}</b>
            <span class="grow small ${o ? '' : 'muted'}">${o ? esc(shiftText(o)) : 'Igual aos outros dias'}</span>
            <button class="link" data-act="editOverride" data-arg="${wd}">${o ? 'Editar' : 'Mudar'}</button>
            ${o ? `<button class="link" data-act="clearOverride" data-arg="${wd}" aria-label="Voltar ao horário normal">${icon('trash')}</button>` : ''}
          </div>`;
        }).join('')}
      </details>` : ''}`;
  } else {
    const c = wp.cycle;
    const type = c.type || cycleTypeOf(c.pattern);
    const lastOff = cycleLastOff(c.start || today(), c.pattern, today());
    body = `
      <div class="step"><span class="step-n">1</span><b>Qual é a sua escala?</b></div>
      <div class="cycle-types">
        ${Object.entries(CYCLE_TYPES).map(([k, v]) => `<button type="button" class="${type === k ? 'on' : ''}" data-ctype="${k}"><b>${v.label}</b><small>${esc(v.hint)}</small></button>`).join('')}
        <button type="button" class="${type === 'custom' ? 'on' : ''}" data-ctype="custom"><b>Outra</b><small>Personalizada</small></button>
      </div>
      ${type === 'custom' ? `
        <p class="small muted" style="margin:10px 0 6px">Toque nos dias para trocar entre trabalho e folga. O dia 1 começa em:</p>
        <input class="input" type="date" data-cstart value="${esc(c.start || today())}" style="margin-bottom:8px">
        <div class="pattern">
          ${c.pattern.map((w, i) => `<button type="button" class="${w ? 'on' : ''}" data-pat="${i}"><small>Dia ${i + 1}</small>${w ? 'Trabalho' : 'Folga'}</button>`).join('')}
          <button type="button" class="pat-add" data-act="patAdd" aria-label="Adicionar dia">+</button>
          ${c.pattern.length > 1 ? '<button type="button" class="pat-add" data-act="patDel" aria-label="Remover último dia">−</button>' : ''}
        </div>` : `
        <div class="step" style="margin-top:16px"><span class="step-n">2</span><b>Qual foi o seu último dia de folga?</b></div>
        <input class="input" type="date" data-lastoff value="${esc(lastOff)}" max="${today()}">`}
      <div class="step" style="margin-top:16px"><span class="step-n">${type === 'custom' ? 2 : 3}</span><b>Horário nos dias de trabalho</b></div>
      ${shiftEditorHTML(c.shift, 'cycle.shift')}`;
  }
  return `
    <h2>Meu horário de trabalho</h2>
    <div class="mode-pick">
      <button data-act="planMode" data-arg="week" class="${!isCycle ? 'on' : ''}">${icon('calendar')}<b>Dias fixos</b><small>Ex.: segunda a sexta</small></button>
      <button data-act="planMode" data-arg="cycle" class="${isCycle ? 'on' : ''}">${icon('repeat')}<b>Escala</b><small>6x1, 12x36…</small></button>
    </div>
    ${body}
    <div class="plan-result">
      ${planTotalHTML(s)}
      <div class="cal-title small muted">Próximos 14 dias</div>
      ${planCalendarHTML()}
    </div>`;
}

function bindPlanEditor() {
  const update = async (mutate) => { const next = clone(plan()); mutate(next); await savePlan(next); };
  const at = (obj, path) => path.split('.').reduce((o, k) => o[k], obj);
  $$('#jornada [data-sh]').forEach((el) => el.addEventListener('change', () => {
    if (!el.value && (el.dataset.k === 'in' || el.dataset.k === 'out')) return toast('Informe o horário');
    update((n) => { at(n, el.dataset.sh)[el.dataset.k] = el.value; });
  }));
  $$('#jornada [data-nobreak]').forEach((el) => el.addEventListener('change', () => update((n) => {
    const sh = at(n, el.dataset.nobreak);
    if (el.checked) { sh.bs = ''; sh.be = ''; } else { sh.bs = '12:00'; sh.be = '13:00'; }
  })));
  $$('#jornada [data-wday]').forEach((el) => el.addEventListener('click', () => update((n) => {
    const wd = Number(el.dataset.wday);
    const d = new Set(n.days || []);
    if (d.has(wd)) d.delete(wd); else d.add(wd);
    n.days = [...d].sort();
  })));
  $$('#jornada [data-ctype]').forEach((el) => el.addEventListener('click', () => update((n) => {
    const t = el.dataset.ctype;
    const lastOff = cycleLastOff(n.cycle.start || today(), n.cycle.pattern, today());
    n.cycle.type = t;
    if (t !== 'custom') {
      n.cycle.pattern = [...CYCLE_TYPES[t].pattern];
      n.cycle.start = cycleStartFromLastOff(lastOff, n.cycle.pattern);
    }
  })));
  $('#jornada [data-lastoff]')?.addEventListener('change', (e) => {
    if (!e.target.value) return;
    update((n) => { n.cycle.start = cycleStartFromLastOff(e.target.value, n.cycle.pattern); });
  });
  $('#jornada [data-cstart]')?.addEventListener('change', (e) => {
    if (e.target.value) update((n) => { n.cycle.start = e.target.value; });
  });
  $$('#jornada [data-pat]').forEach((el) => el.addEventListener('click', () => update((n) => {
    const i = Number(el.dataset.pat);
    n.cycle.pattern = n.cycle.pattern.map((w, j) => (j === i ? !w : w));
  })));
}

ACTIONS.planMode = (mode) => {
  const cur = plan();
  if (cur.mode === mode) return;
  const next = clone(cur);
  const sh = clone(cur.mode === 'cycle' ? cur.cycle.shift : cur.shift || DEFAULT_SHIFT);
  next.mode = mode;
  if (mode === 'week') {
    next.shift = sh;
    next.days = next.days?.length ? next.days : [1, 2, 3, 4, 5];
    next.overrides = next.overrides || {};
  } else {
    const c = next.cycle?.pattern?.length ? next.cycle : { type: '6x1', pattern: [...CYCLE_TYPES['6x1'].pattern] };
    next.cycle = { ...c, type: c.type || cycleTypeOf(c.pattern), shift: sh, start: c.start || cycleStartFromLastOff(today(), c.pattern) };
  }
  savePlan(next);
};
ACTIONS.patAdd = () => { const n = clone(plan()); if (n.cycle.pattern.length < 31) n.cycle.pattern.push(false); savePlan(n); };
ACTIONS.patDel = () => { const n = clone(plan()); if (n.cycle.pattern.length > 1) n.cycle.pattern.pop(); savePlan(n); };
ACTIONS.clearOverride = (wd) => { const n = clone(plan()); delete n.overrides[wd]; savePlan(n); };

/** Horário diferente em um dia da semana (ex.: sábado só de manhã). */
ACTIONS.editOverride = (wdArg) => {
  const wd = Number(wdArg);
  let sh = clone(plan().overrides?.[wd] || plan().shift);
  openSheet(`
    <h3>${WEEKDAYS[wd]}</h3>
    <p class="sub">Horário deste dia, quando for diferente dos outros.</p>
    <div data-ed>${shiftEditorHTML(sh, 'tmp')}</div>
    <div class="btn-row" style="margin-top:16px"><button class="btn" data-close>Cancelar</button><button class="btn primary" data-ok>${icon('check')} Salvar</button></div>`, (s) => {
    const bind = () => {
      $$('[data-sh]', s).forEach((el) => el.addEventListener('change', () => { sh = { ...sh, [el.dataset.k]: el.value }; redraw(); }));
      $$('[data-nobreak]', s).forEach((el) => el.addEventListener('change', () => {
        sh = el.checked ? { ...sh, bs: '', be: '' } : { ...sh, bs: '12:00', be: '13:00' };
        redraw();
      }));
    };
    const redraw = () => { $('[data-ed]', s).innerHTML = shiftEditorHTML(sh, 'tmp'); bind(); };
    bind();
    $('[data-ok]', s).addEventListener('click', async () => {
      if (!sh.in || !sh.out) return toast('Informe entrada e saída');
      const n = clone(plan());
      n.overrides = n.overrides || {};
      if (JSON.stringify(sh) === JSON.stringify(n.shift)) delete n.overrides[wd]; else n.overrides[wd] = sh;
      closeSheet();
      await savePlan(n);
      toast(`Horário de ${WEEKDAYS[wd].toLowerCase()} salvo`);
    });
  });
};

function renderSettings() {
  const s = state.settings;
  const lastBackup = state.meta.lastBackup ? `${fmtDay(dayKey(state.meta.lastBackup))} às ${hhmm(state.meta.lastBackup)}` : 'nunca';
  return `
    <section class="card">
      <h2>Perfil</h2>
      <label class="field"><span>Nome</span><input class="input" data-set="name" value="${esc(s.name)}" autocomplete="name" placeholder="Seu nome"></label>
      <div class="grid-2">
        <label class="field"><span>Empresa</span><input class="input" data-set="company" value="${esc(s.company)}" placeholder="Opcional"></label>
        <label class="field"><span>Cargo</span><input class="input" data-set="role" value="${esc(s.role)}" placeholder="Opcional"></label>
      </div>
      <label class="field" style="margin:0"><span>Matrícula</span><input class="input" data-set="employeeId" value="${esc(s.employeeId)}" placeholder="Opcional"></label>
    </section>

    <section class="card" id="jornada">
      ${jornadaHTML(s)}
    </section>

    <section class="card" id="jornada-extra">
      <h2>Tolerância e lembretes</h2>
      <div class="grid-2">
        <label class="field"><span>Tolerância diária (min)</span><input class="input" type="number" min="0" max="60" inputmode="numeric" data-set="tolerance" value="${s.tolerance}"></label>
        <label class="field"><span>Lembrete de backup (dias)</span><input class="input" type="number" min="1" max="90" inputmode="numeric" data-set="backupReminderDays" value="${s.backupReminderDays}"></label>
      </div>
      <p class="small muted" style="margin:0">A CLT (art. 58, §1º) não considera variações de até 10 minutos por dia.</p>
    </section>

    <section class="card">
      <h2>Banco de horas</h2>
      <div class="grid-2">
        <label class="field"><span>Contar a partir de</span><input class="input" type="date" data-set="bankStart" value="${esc(s.bankStart)}"></label>
        <label class="field"><span>Saldo inicial (hh:mm)</span><input class="input" data-set="bankInitial" value="${s.bankInitial < 0 ? '-' : ''}${minutesToHHMM(Math.abs(s.bankInitial))}" placeholder="00:00"></label>
      </div>
      <p class="small muted" style="margin:0">Use o saldo inicial para trazer o banco de horas que você já tinha. Para saldo negativo, comece com “-”.</p>
    </section>

    <section class="card">
      <h2>Alertas do ponto</h2>
      <p class="small muted" style="margin-top:0">Avisos automáticos conforme suas marcações${isAndroidApp ? ', inclusive com o app fechado' : ' (com o app aberto)'}.</p>
      <label class="switch"><span><b>Lembrar de marcar a entrada</b><br><span class="small muted">5 min depois do seu horário de entrada, se ainda não marcou</span></span><input type="checkbox" data-set="alertEntry" ${s.alertEntry ? 'checked' : ''}></label>
      <label class="switch"><span><b>Fim do intervalo de refeição</b><br><span class="small muted">Avisa quando terminar o seu horário de almoço</span></span><input type="checkbox" data-set="alertMealEnd" ${s.alertMealEnd ? 'checked' : ''}></label>
      <label class="switch"><span><b>6 horas sem intervalo</b><br><span class="small muted">Avisa 15 min antes de completar 6h sem refeição</span></span><input type="checkbox" data-set="alertNoBreak" ${s.alertNoBreak ? 'checked' : ''}></label>
      <label class="switch"><span><b>Jornada cumprida</b><br><span class="small muted">Avisa na hora de sair</span></span><input type="checkbox" data-set="alertJourneyDone" ${s.alertJourneyDone ? 'checked' : ''}></label>
      <label class="switch"><span><b>Esqueceu a saída?</b><br><span class="small muted">2h depois do fim da jornada sem saída</span></span><input type="checkbox" data-set="alertForgotOut" ${s.alertForgotOut ? 'checked' : ''}></label>
      <label class="field" style="margin:12px 0 0"><span>Tipo de aviso</span>
        <select class="input" data-set="alertStyle"><option value="notify" ${s.alertStyle !== 'alarm' ? 'selected' : ''}>Notificação</option><option value="alarm" ${s.alertStyle === 'alarm' ? 'selected' : ''}>Alarme em tela cheia</option></select>
      </label>
    </section>

    <section class="card">
      <h2>Modalidade e feriados</h2>
      <label class="field"><span>Modalidade padrão da entrada</span>
        <select class="input" data-set="defaultMode">${Object.entries(WORK_MODES).map(([k, v]) => `<option value="${k}" ${s.defaultMode === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
      </label>
      <label class="switch"><span><b>Perguntar a modalidade na entrada</b><br><span class="small muted">Presencial, home office, externo ou viagem</span></span><input type="checkbox" data-set="askMode" ${s.askMode ? 'checked' : ''}></label>
      <label class="switch"><span><b>Considerar feriados nacionais</b><br><span class="small muted">Para “dias úteis” nos lembretes (inclui Carnaval, Sexta-feira Santa e Corpus Christi)</span></span><input type="checkbox" data-set="holidays" ${s.holidays !== false ? 'checked' : ''}></label>
    </section>

    <section class="card">
      <h2>Registro</h2>
      <label class="switch"><span><b>Confirmar antes de marcar</b><br><span class="small muted">Evita toques acidentais</span></span><input type="checkbox" data-set="confirmPunch" ${s.confirmPunch ? 'checked' : ''}></label>
      <label class="switch"><span><b>Salvar localização</b><br><span class="small muted">Guarda onde cada ponto foi marcado</span></span><input type="checkbox" data-set="geolocation" ${s.geolocation ? 'checked' : ''}></label>
      <label class="field" style="margin:12px 0 0"><span>Tema</span>
        <select class="input" data-set="theme">
          ${[['system', 'Automático (sistema)'], ['light', 'Claro'], ['dark', 'Escuro']].map(([k, v]) => `<option value="${k}" ${s.theme === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </label>
    </section>

    <section class="card">
      <h2>Backup e dados</h2>
      <p class="small muted" style="margin-top:0">Seus dados ficam só neste aparelho. Faça backup com frequência e guarde o arquivo no Google Drive, iCloud, e-mail ou WhatsApp. Último backup: <b>${lastBackup}</b>.</p>
      <button class="list-btn" data-act="backup">${icon('share')}<span class="grow"><b>Fazer backup e enviar</b><br><span class="small muted">Drive, iCloud, e-mail, WhatsApp…</span></span></button>
      <button class="list-btn" data-act="backupLocal">${icon('download')}<span class="grow"><b>Salvar backup no aparelho</b><br><span class="small muted">Pasta Downloads</span></span></button>
      <button class="list-btn" data-act="restore">${icon('upload')}<span class="grow"><b>Restaurar backup</b><br><span class="small muted">A partir de um arquivo .json</span></span></button>
      <button class="list-btn" data-act="exportAll">${icon('table')}<span class="grow"><b>Exportar todas as marcações</b><br><span class="small muted">Planilha CSV</span></span></button>
      <button class="list-btn danger" data-act="wipe">${icon('trash')}<span class="grow"><b>Apagar todos os dados</b></span></button>
      <input type="file" id="restore-file" accept=".json,application/json" hidden>
    </section>

    <section class="card">
      <div class="about-logo">
        <img src="icons/icon.svg" alt="Logotipo WDQ SmartPonto">
        <div><b>WDQ SmartPonto</b> <span class="muted">v${VERSION}${isAndroidApp ? ' · Android' : ''}</span></div>
        <div class="small muted">Controle pessoal de jornada. Funciona sem internet e não envia seus dados a nenhum servidor.<br>Este app não substitui o registro de ponto oficial do empregador.</div>
      </div>
    </section>`;
}

VIEWS.settings.mount = () => {
  $$('[data-set]').forEach((el) => {
    const key = el.dataset.set;
    const evt = el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input';
    el.addEventListener(evt, async () => {
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (key === 'tolerance' || key === 'backupReminderDays') v = Math.max(0, Number(v) || 0);
      if (key === 'bankInitial') {
        const neg = v.trim().startsWith('-');
        const m = parseHHMM(v.replace('-', ''));
        if (m === null) return;
        v = neg ? -m : m;
      }
      await saveSettings({ [key]: v });
      if (key === 'theme') applyTheme();
      syncAlarms();
    });
  });
  bindPlanEditor();
  $('#restore-file').addEventListener('change', onRestoreFile);
};

function backupPayload() {
  return [`smartponto-backup-${today()}.json`, 'application/json', JSON.stringify(exportBackup(), null, 1)];
}
ACTIONS.backup = async () => {
  const res = await shareFile(...backupPayload());
  if (res !== 'cancelled') { await markBackup(); render(); }
};
ACTIONS.backupLocal = async () => {
  const where = saveFile(...backupPayload());
  await markBackup();
  render();
  toast(`Backup salvo em ${where || 'Downloads'}`);
};
ACTIONS.restore = () => $('#restore-file').click();

async function onRestoreFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch { return toast('Arquivo inválido'); }
  openSheet(`
    <h3>Restaurar backup</h3>
    <p class="sub">${Array.isArray(data?.punches) ? `${data.punches.length} marcações` : 'Arquivo'}${data?.exportedAt ? ` · gerado em ${fmtDay(dayKey(Date.parse(data.exportedAt)))}` : ''}</p>
    <button class="btn primary block" data-mode="merge" style="margin-bottom:10px">Juntar com os dados atuais</button>
    <button class="btn danger block" data-mode="replace" style="margin-bottom:10px">Substituir tudo pelo backup</button>
    <button class="btn ghost block" data-close>Cancelar</button>`, (s) => {
    $$('[data-mode]', s).forEach((b) => b.addEventListener('click', async () => {
      try {
        const n = await importBackup(data, b.dataset.mode);
        closeSheet();
        applyTheme();
        render();
        toast(`${n} marcações restauradas`);
      } catch (err) {
        closeSheet();
        toast(err.message);
      }
    }));
  });
}

ACTIONS.exportAll = async () => {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = state.punches.map((p) => [fmtDay(dayKey(p.ts), { weekday: false }), hhmm(p.ts), PUNCH_TYPES[p.type].label,
    p.reason || '', p.auto ? 'preenchida pela jornada' : p.manual ? 'manual' : p.edited ? 'ajustada' : '', p.note || '', p.loc ? `${p.loc.lat},${p.loc.lng}` : ''].map(q).join(';'));
  const csv = `﻿${['Data', 'Hora', 'Tipo', 'Motivo', 'Origem', 'Observação', 'Local'].map(q).join(';')}\n${rows.join('\n')}\n`;
  await shareFile(`smartponto-marcacoes-${today()}.csv`, 'text/csv', csv);
};

ACTIONS.wipe = async () => {
  const ok = await confirmSheet({ title: 'Apagar todos os dados?', text: 'Todas as marcações e configurações serão removidas deste aparelho. Faça um backup antes.', ok: 'Apagar tudo', danger: true });
  if (!ok) return;
  await wipeAll();
  applyTheme();
  go('home');
  toast('Dados apagados');
};

// ---------- Tela: Lembretes ----------
const ADVANCE_OPTIONS = [[0, 'Na hora'], [5, '5 min antes'], [10, '10 min antes'], [15, '15 min antes'], [30, '30 min antes'], [60, '1 hora antes'], [120, '2 horas antes'], [1440, '1 dia antes']];
const NTH_OPTIONS = [[1, '1º'], [2, '2º'], [3, '3º'], [4, '4º'], [5, '5º'], [6, '6º'], [7, '7º'], [8, '8º'], [10, '10º'], [15, '15º'], [-1, 'Último']];
const NTH_WD_OPTIONS = [[1, '1ª'], [2, '2ª'], [3, '3ª'], [4, '4ª'], [-1, 'Última']];

function whenLabel(ts, now = Date.now()) {
  const k = dayKey(ts);
  const t = today();
  const prefix = k === t ? 'Hoje' : k === addDays(t, 1) ? 'Amanhã' : fmtDay(k, { year: parseDay(k).getFullYear() !== new Date(now).getFullYear() });
  return `${prefix} às ${hhmm(ts)}`;
}

function permissionBanner() {
  const st = nativeAlarmStatus();
  if (st) {
    const items = [];
    if (!st.notifications) items.push(['notifications', 'Permitir notificações']);
    if (!st.exact) items.push(['exact', 'Permitir alarmes no horário exato']);
    if (!st.fullScreen) items.push(['fullscreen', 'Permitir alarme em tela cheia']);
    if (!st.battery) items.push(['battery', 'Não economizar bateria no SmartPonto']);
    if (!items.length) return '';
    return `<div class="card warn-card">
      <b>${icon('warn')} Libere os avisos para não perder lembretes</b>
      <p class="small muted" style="margin:6px 0 10px">O Android precisa dessas permissões para tocar o alarme com o app fechado e na tela bloqueada.</p>
      <div class="btn-row">${items.map(([k, l]) => `<button class="btn" data-act="permit" data-arg="${k}">${l}</button>`).join('')}</div>
    </div>`;
  }
  const canNotify = 'Notification' in window;
  return `<div class="card warn-card">
    <b>${icon('info')} ${isIOS ? 'No iPhone' : 'No navegador'}, o alarme toca com o app aberto</b>
    <p class="small muted" style="margin:6px 0 10px">Para ser avisado com o app fechado e na tela bloqueada, adicione os lembretes à agenda do celular: a agenda avisa no horário certo, com a mesma repetição.</p>
    <div class="btn-row">
      <button class="btn primary" data-act="icsAll">${icon('calendar')} Adicionar todos à agenda</button>
      ${canNotify && Notification.permission === 'default' ? `<button class="btn" data-act="webNotif">${icon('bell')} Permitir notificações</button>` : ''}
    </div>
  </div>`;
}

function renderReminders() {
  const now = Date.now();
  const ctx = reminderCtx();
  const items = state.reminders.map((r) => ({ r, next: r.active ? nextOccurrence(r, now, ctx) : null }));
  const active = items.filter((x) => x.r.active && x.next).sort((a, b) => a.next.at - b.next.at);
  const ended = items.filter((x) => x.r.active && !x.next);
  const paused = items.filter((x) => !x.r.active);
  const auto = upcomingAlarms(now, now + 24 * HOUR).filter((a) => a.id.startsWith('auto:'));

  const card = ({ r, next }) => `
    <div class="rem-card ${r.active ? '' : 'off'}">
      <button class="rem-main" data-act="editReminder" data-arg="${r.id}">
        <span class="rem-ico ${r.style === 'alarm' ? 'alarm' : ''}">${icon(r.style === 'alarm' ? 'alarm' : 'bell')}</span>
        <span class="grow">
          <b>${esc(r.title || 'Lembrete')}</b>
          <span class="small muted rem-desc">${icon('repeat')} ${esc(describe(r))}</span>
          ${next ? `<span class="small rem-next">${whenLabel(next.at)}</span>` : r.active ? '<span class="small muted">Sem próximas datas</span>' : '<span class="small muted">Pausado</span>'}
        </span>
      </button>
      <label class="switch-mini" aria-label="Ativar ${esc(r.title)}"><input type="checkbox" data-act="toggleReminder" data-arg="${r.id}" ${r.active ? 'checked' : ''}></label>
    </div>`;

  return `
    <button class="btn primary block big-btn" data-act="newReminder">${icon('plus')} Criar lembrete</button>
    ${permissionBanner()}
    ${state.reminders.length ? '' : `<div class="card empty-rem">
      ${icon('bell')}
      <b>Nenhum lembrete ainda</b>
      <p class="small muted">Ex.: “Enviar relatório” no 1º dia útil do mês, “Beber água” a cada 1h, “Reunião de equipe” toda segunda às 9h.</p>
      <div class="chips" style="justify-content:center">
        ${QUICK_REMINDERS.map((q, i) => `<button class="chip" data-act="quickReminder" data-arg="${i}">${esc(q.title)}</button>`).join('')}
      </div>
    </div>`}
    ${active.length ? `<h2 class="section-title">Próximos</h2>${active.map(card).join('')}` : ''}
    ${paused.length ? `<h2 class="section-title">Pausados</h2>${paused.map(card).join('')}` : ''}
    ${ended.length ? `<h2 class="section-title">Concluídos</h2>${ended.map(card).join('')}` : ''}
    ${auto.length ? `<h2 class="section-title">Alertas do ponto nas próximas 24h</h2>
      <div class="card">${auto.map((a) => `<div class="row" style="padding:6px 0">${icon('clock', 'muted')}<span class="grow"><b>${esc(a.title)}</b><br><span class="small muted">${whenLabel(a.at)}</span></span></div>`).join('')}
      <p class="small muted" style="margin:6px 0 0">Configure em Ajustes → Alertas do ponto.</p></div>` : ''}
    ${state.reminders.length ? `<button class="btn block ghost" data-act="icsAll" style="margin-top:6px">${icon('calendar')} Exportar lembretes para a agenda</button>` : ''}`;
}

const QUICK_REMINDERS = [
  { title: 'Enviar relatório mensal', time: '09:00', rule: { type: 'monthBusinessDay', nth: 1 } },
  { title: 'Beber água', time: '09:00', style: 'notify', businessOnly: true, rule: { type: 'hourly', from: '09:00', to: '17:00', everyMin: 60, days: [1, 2, 3, 4, 5] } },
  { title: 'Reunião de equipe', time: '09:00', advance: 10, rule: { type: 'week', days: [1] } },
  { title: 'Pagar contas', time: '10:00', rule: { type: 'monthDay', day: 5, adjust: 'before' } },
  { title: 'Alongar e descansar a vista', time: '10:00', style: 'notify', rule: { type: 'hourly', from: '10:00', to: '17:00', everyMin: 120, days: [1, 2, 3, 4, 5] } },
];

ACTIONS.newReminder = () => openReminderEditor();
ACTIONS.quickReminder = (i) => {
  const q = QUICK_REMINDERS[Number(i)];
  const base = newReminder();
  openReminderEditor({ ...base, ...q, rule: { ...base.rule, ...q.rule } }, true);
};
ACTIONS.editReminder = (id) => openReminderEditor(state.reminders.find((r) => r.id === id));
ACTIONS.toggleReminder = async (id, el) => {
  const r = state.reminders.find((x) => x.id === id);
  if (!r) return;
  await saveReminder({ ...r, active: el.checked });
  render();
  toast(el.checked ? 'Lembrete ativado' : 'Lembrete pausado');
};
ACTIONS.permit = (kind) => {
  if (kind === 'notifications') nativeRequestNotifications(); else nativeOpenSettings(kind);
  setTimeout(() => { if (ui.view === 'reminders') render(); }, 1500);
};
ACTIONS.webNotif = async () => {
  try { await Notification.requestPermission(); } catch { /* opcional */ }
  render();
};
ACTIONS.icsAll = () => {
  const list = state.reminders.filter((r) => r.active);
  if (!list.length) return toast('Nenhum lembrete ativo');
  openCalendarFile('smartponto-lembretes.ics', toICS(list, Date.now(), reminderCtx()));
};

/** Campos que mudam conforme o tipo de repetição. */
function ruleFieldsHTML(d) {
  const r = d.rule;
  const sel = (name, opts, val) => `<select class="input" data-r="${name}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const dayPicker = (days) => `<div class="day-picker">${[1, 2, 3, 4, 5, 6, 0].map((wd) => `<button type="button" class="${(days || []).includes(wd) ? 'on' : ''}" data-wd="${wd}">${WEEKDAYS[wd].slice(0, 3)}</button>`).join('')}</div>`;
  const time = `<label class="field"><span>Horário</span><input class="input" type="time" data-f="time" value="${esc(d.time)}"></label>`;
  const bizOpt = `<label class="switch"><span><b>Só em dias úteis</b><br><span class="small muted">Pula fins de semana e feriados nacionais</span></span><input type="checkbox" data-f="businessOnly" ${d.businessOnly ? 'checked' : ''}></label>`;
  switch (r.type) {
    case 'once':
      return `<div class="grid-2"><label class="field"><span>Data</span><input class="input" type="date" data-r="date" value="${esc(r.date || today())}"></label>${time}</div>`;
    case 'daily':
      return `${time}${bizOpt}`;
    case 'week':
      return `<label class="field"><span>Dias</span>${dayPicker(r.days)}</label>${time}${bizOpt}`;
    case 'hourly':
      return `<div class="grid-2">
          <label class="field"><span>Repetir a cada</span>${sel('everyMin', [[15, '15 min'], [20, '20 min'], [30, '30 min'], [45, '45 min'], [60, '1 hora'], [90, '1h30'], [120, '2 horas'], [180, '3 horas'], [240, '4 horas']], r.everyMin)}</label>
          <span></span>
          <label class="field"><span>Das</span><input class="input" type="time" data-r="from" value="${esc(r.from)}"></label>
          <label class="field"><span>Até</span><input class="input" type="time" data-r="to" value="${esc(r.to)}"></label>
        </div>
        <label class="field"><span>Dias</span>${dayPicker(r.days)}</label>${bizOpt}`;
    case 'interval':
      return `<div class="grid-2">
          <label class="field"><span>A cada</span><input class="input" type="number" min="1" max="365" inputmode="numeric" data-r="every" value="${r.every || 1}"></label>
          <label class="field"><span>&nbsp;</span>${sel('unit', [['day', 'dia(s)'], ['week', 'semana(s)'], ['month', 'mês(es)']], r.unit)}</label>
          <label class="field"><span>Começando em</span><input class="input" type="date" data-r="date" value="${esc(r.date || today())}"></label>
          ${time}
        </div>${bizOpt}`;
    case 'monthDay':
      return `<div class="grid-2">
          <label class="field"><span>Dia do mês</span>${sel('day', [...Array.from({ length: 31 }, (_, i) => [i + 1, `Dia ${i + 1}`]), [-1, 'Último dia']], r.day)}</label>
          ${time}
        </div>
        <label class="field"><span>Se cair em fim de semana ou feriado</span>${sel('adjust', [['none', 'Manter a data'], ['before', 'Antecipar para o dia útil anterior'], ['after', 'Adiar para o próximo dia útil']], r.adjust)}</label>`;
    case 'monthBusinessDay':
      return `<div class="grid-2">
          <label class="field"><span>Qual dia útil</span>${sel('nth', NTH_OPTIONS, r.nth)}</label>
          ${time}
        </div><p class="small muted" style="margin-top:0">Conta de segunda a sexta, sem feriados nacionais e sem os feriados que você marcar no Histórico.</p>`;
    case 'monthWeekday':
      return `<div class="grid-2">
          <label class="field"><span>Qual</span>${sel('nth', NTH_WD_OPTIONS, r.nth)}</label>
          <label class="field"><span>Dia da semana</span>${sel('weekday', [1, 2, 3, 4, 5, 6, 0].map((w) => [w, WEEKDAYS[w]]), r.weekday)}</label>
        </div>${time}`;
    case 'yearly':
      return `<div class="grid-2">
          <label class="field"><span>Dia</span><input class="input" type="number" min="1" max="31" inputmode="numeric" data-r="day" value="${r.day || 1}"></label>
          <label class="field"><span>Mês</span>${sel('month', MONTHS.map((m, i) => [i + 1, m]), r.month)}</label>
        </div>${time}`;
    default: return '';
  }
}

function previewHTML(d) {
  if (!d.rule) return '';
  const now = Date.now();
  const occ = occurrences({ ...d, active: true }, now, now + 400 * 24 * HOUR, reminderCtx()).slice(0, 5);
  return `<div class="preview">
    <div class="small muted">${icon('repeat')} ${esc(describe(d))}</div>
    ${occ.length ? `<ul>${occ.map((o) => {
      const h = holidayName(dayKey(o.eventAt));
      return `<li>${whenLabel(o.at)}${d.advance ? ` <span class="muted">(evento ${hhmm(o.eventAt)})</span>` : ''}${h ? ` <span class="muted">· ${esc(h)}</span>` : ''}</li>`;
    }).join('')}</ul>` : '<p class="small neg" style="margin:6px 0 0">Nenhuma data futura com essas regras.</p>'}
  </div>`;
}

function openReminderEditor(existing, isTemplate = false) {
  const base = newReminder();
  const d = existing ? JSON.parse(JSON.stringify({ ...base, ...existing, rule: { ...base.rule, ...existing.rule } })) : base;
  if (!d.rule.date) d.rule.date = today();
  const editing = existing && !isTemplate;
  const sheet = openSheet(`
    <h3>${editing ? 'Editar lembrete' : 'Novo lembrete'}</h3>
    <label class="field"><span>O que você precisa lembrar?</span><input class="input" data-f="title" maxlength="80" placeholder="Ex.: Enviar relatório de vendas" value="${esc(d.title)}"></label>
    <label class="field"><span>Detalhes (opcional)</span><textarea class="input" data-f="notes" maxlength="400" rows="2" placeholder="Anotações, link, telefone…">${esc(d.notes)}</textarea></label>

    <label class="field"><span>Tipo de aviso</span>
      <div class="seg" style="margin:0">
        <button type="button" data-style="alarm" class="${d.style === 'alarm' ? 'active' : ''}">${icon('alarm')} Alarme</button>
        <button type="button" data-style="notify" class="${d.style !== 'alarm' ? 'active' : ''}">${icon('bell')} Notificação</button>
      </div>
    </label>
    <p class="small muted" style="margin:-4px 0 12px" data-style-hint></p>

    <label class="field"><span>Repetição</span>
      <select class="input" data-rtype>${Object.entries(RULE_TYPES).map(([k, v]) => `<option value="${k}" ${k === d.rule.type ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
    </label>
    <div data-rule-fields>${ruleFieldsHTML(d)}</div>

    <details class="more" ${d.advance || d.until || d.jornadaOnly ? 'open' : ''}>
      <summary>Mais opções</summary>
      <label class="field"><span>Avisar</span><select class="input" data-f="advance">${ADVANCE_OPTIONS.map(([v, l]) => `<option value="${v}" ${v === d.advance ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="switch"><span><b>Só nos dias da minha jornada</b><br><span class="small muted">Não avisa em folgas, férias e dias sem expediente</span></span><input type="checkbox" data-f="jornadaOnly" ${d.jornadaOnly ? 'checked' : ''}></label>
      <label class="field" style="margin-top:12px"><span>Repetir até (opcional)</span><input class="input" type="date" data-f="until" value="${esc(d.until)}"></label>
    </details>

    <div data-preview>${previewHTML(d)}</div>

    <div class="btn-row" style="margin-top:14px">
      <button class="btn" data-test>${icon('alarm')} Testar</button>
      <button class="btn" data-ics>${icon('calendar')} Agenda</button>
    </div>
    <div class="btn-row" style="margin-top:10px">
      ${editing ? `<button class="btn danger" data-del>${icon('trash')} Excluir</button>` : '<button class="btn" data-close>Cancelar</button>'}
      <button class="btn primary" data-save>${icon('check')} Salvar</button>
    </div>`, (s) => {
    const styleHint = () => {
      $('[data-style-hint]', s).textContent = d.style === 'alarm'
        ? 'Toca som contínuo e abre em tela cheia, inclusive com o celular bloqueado, até você concluir ou adiar.'
        : 'Notificação com som, visível na tela bloqueada.';
    };
    const refresh = () => { $('[data-preview]', s).innerHTML = previewHTML(d); };
    const bindRule = () => {
      $$('[data-r]', s).forEach((el) => el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', () => {
        const numeric = ['every', 'everyMin', 'day', 'nth', 'weekday', 'month'].includes(el.dataset.r);
        d.rule[el.dataset.r] = numeric ? Number(el.value) : el.value;
        refresh();
      }));
      $$('[data-wd]', s).forEach((b) => b.addEventListener('click', () => {
        const wd = Number(b.dataset.wd);
        const days = new Set(d.rule.days || []);
        if (days.has(wd)) days.delete(wd); else days.add(wd);
        d.rule.days = [...days].sort();
        b.classList.toggle('on');
        refresh();
      }));
      bindFields($('[data-rule-fields]', s));
    };
    const bindFields = (root) => {
      $$('[data-f]', root).forEach((el) => {
        if (el.dataset.bound) return;
        el.dataset.bound = '1';
        el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', () => {
          const k = el.dataset.f;
          d[k] = el.type === 'checkbox' ? el.checked : k === 'advance' ? Number(el.value) : el.value;
          refresh();
        });
      });
    };
    bindFields(s);
    bindRule();
    styleHint();
    $$('[data-style]', s).forEach((b) => b.addEventListener('click', () => {
      d.style = b.dataset.style;
      $$('[data-style]', s).forEach((x) => x.classList.toggle('active', x === b));
      styleHint();
    }));
    $('[data-rtype]', s).addEventListener('change', (e) => {
      d.rule.type = e.target.value;
      if (d.rule.type === 'week' && !d.rule.days?.length) d.rule.days = [1, 2, 3, 4, 5];
      $('[data-rule-fields]', s).innerHTML = ruleFieldsHTML(d);
      bindRule();
      refresh();
    });
    const valid = () => {
      if (!d.title.trim()) { toast('Escreva o que você quer lembrar'); $('[data-f=title]', s).focus(); return false; }
      if (['week', 'hourly'].includes(d.rule.type) && !d.rule.days?.length) { toast('Escolha pelo menos um dia'); return false; }
      return true;
    };
    $('[data-save]', s).addEventListener('click', async () => {
      if (!valid()) return;
      if (d.rule.type === 'once' && !d.rule.date) d.rule.date = today();
      d.title = d.title.trim();
      if (!editing) d.id = '';
      await saveReminder(d);
      closeSheet();
      // Primeiro lembrete no Android: pede a permissão de notificação.
      if (isAndroidApp && nativeAlarmStatus()?.notifications === false) nativeRequestNotifications();
      if (ui.view !== 'reminders') go('reminders'); else render();
      const next = nextOccurrence(d, Date.now(), reminderCtx());
      toast(next ? `Salvo · próximo: ${whenLabel(next.at)}` : 'Lembrete salvo');
    });
    $('[data-test]', s).addEventListener('click', () => {
      const title = d.title.trim() || 'Teste de lembrete';
      if (isAndroidApp) {
        nativeTestAlarm(d.style, title, d.notes || 'Este é um teste. O aviso real toca no horário programado.');
        toast('O teste toca em 5 segundos. Pode bloquear a tela.');
      } else {
        showAlarm({ id: `teste:${Date.now()}`, at: Date.now(), title, body: d.notes || 'Este é um teste do alarme.', style: d.style });
      }
    });
    $('[data-ics]', s).addEventListener('click', () => {
      if (!valid()) return;
      openCalendarFile(`lembrete-${d.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) || 'smartponto'}.ics`,
        toICS([{ ...d, id: d.id || `novo-${Date.now()}`, active: true }], Date.now(), reminderCtx()));
    });
    $('[data-del]', s)?.addEventListener('click', async () => {
      const ok = await confirmSheet({ title: `Excluir “${d.title}”?`, text: 'O lembrete e todos os avisos futuros serão removidos.', ok: 'Excluir', danger: true });
      if (!ok) return;
      await deleteReminder(d.id);
      render();
      toast('Lembrete excluído');
    });
  });
  if (!editing) setTimeout(() => $('[data-f=title]', sheet)?.focus(), 50);
}

// ---------- Alarme na tela (navegador / iPhone) ----------
let alarmEl = null;
const alarmQueue = [];
function showAlarm(a) {
  if (alarmEl) { alarmQueue.push(a); return; }
  webNotify(a);
  alarmEl = document.createElement('div');
  alarmEl.className = `alarm-screen ${a.style === 'alarm' ? '' : 'soft'}`;
  const now = new Date();
  alarmEl.innerHTML = `
    <div class="alarm-glow"></div>
    <div class="alarm-body">
      <div class="alarm-ring">${icon(a.style === 'alarm' ? 'alarm' : 'bell')}</div>
      <div class="alarm-time">${pad(now.getHours())}:${pad(now.getMinutes())}</div>
      <div class="alarm-title">${esc(a.title)}</div>
      <div class="alarm-text">${esc(a.body || '')}</div>
    </div>
    <div class="alarm-actions">
      <button class="alarm-done" data-done>${icon('check')} Concluir</button>
      <div class="alarm-snooze">
        ${[5, 10, 30].map((m) => `<button data-snooze="${m}">Adiar ${m} min</button>`).join('')}
      </div>
    </div>`;
  document.body.appendChild(alarmEl);
  if (a.style === 'alarm') startChime(); else { startChime(); setTimeout(stopChime, 2500); }
  const close = () => {
    stopChime();
    alarmEl?.remove();
    alarmEl = null;
    if (alarmQueue.length) showAlarm(alarmQueue.shift());
  };
  $('[data-done]', alarmEl).addEventListener('click', close);
  $$('[data-snooze]', alarmEl).forEach((b) => b.addEventListener('click', () => {
    snoozeWeb(a, Number(b.dataset.snooze));
    toast(`Adiado por ${b.dataset.snooze} min`);
    close();
  }));
}

// ---------- Primeiro acesso ----------
function onboarding() {
  openSheet(`
    <div class="about-logo"><img src="icons/icon.svg" alt=""><h3>Bem-vindo ao WDQ SmartPonto</h3></div>
    <p class="sub" style="text-align:center">Marque entrada, almoço e saída com um toque e gere relatórios quando precisar.</p>
    <label class="field"><span>Seu nome</span><input class="input" name="name" autocomplete="name" placeholder="Como quer ser chamado"></label>
    <label class="field"><span>Seu horário de trabalho</span>
      <select class="input" name="preset">${PRESETS.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('')}<option value="custom">Outro: vou informar o meu</option></select>
    </label>
    <p class="small muted">Você pode mudar quando quiser em Ajustes.</p>
    <button class="btn primary block" data-go>Começar</button>`, (s) => {
    $('[data-go]', s).addEventListener('click', async () => {
      const choice = $('[name=preset]', s).value;
      const p = PRESETS[Number(choice)];
      await saveSettings({ name: $('[name=name]', s).value.trim(), onboarded: true, ...(p ? { workPlan: planFrom(p.plan) } : {}) });
      closeSheet();
      if (choice === 'custom') {
        go('settings');
        $('#jornada')?.scrollIntoView({ block: 'start' });
        toast('Informe os dias e horários em que você trabalha');
      } else render();
    });
  });
}

// ---------- Tema ----------
function applyTheme() {
  const t = state.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  setThemeColor('#1e1b4b');
}

// ---------- Inicialização ----------
// Botão voltar do Android: fecha painel, depois volta para a tela de ponto.
window.spBack = () => {
  if (alarmEl) { $('[data-done]', alarmEl)?.click(); return true; }
  if (sheetEl) { closeSheet(); return true; }
  if (ui.view !== 'home') { go('home'); return true; }
  return false;
};

// O Android chama ao voltar para o app (ex.: depois de liberar permissões).
window.spResume = () => {
  syncAlarms();
  if (!sheetEl && !alarmEl && ['reminders', 'home'].includes(ui.view)) render();
};

async function init() {
  $$('.tabbar button').forEach((b) => {
    const v = VIEWS[b.dataset.view];
    b.innerHTML = `${icon(v.icon)}<span>${v.label}</span>`;
    b.addEventListener('click', () => go(b.dataset.view));
  });
  $('#btn-manual').innerHTML = icon('plus');
  $('#btn-manual').addEventListener('click', () => openPunchEditor());

  try {
    await openStore();
  } catch (e) {
    $('#view').innerHTML = `<div class="card"><b>Não foi possível abrir o armazenamento.</b><p class="muted">${esc(e.message)}. Se estiver em uma janela anônima, abra o app normalmente.</p></div>`;
    return;
  }
  applyTheme();
  const fromHash = location.hash.slice(1);
  if (VIEWS[fromHash]) ui.view = fromHash;
  render();
  if (!state.settings.onboarded && !state.punches.length) onboarding();
  else if (!state.settings.onboarded) saveSettings({ onboarded: true });

  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !sheetEl) render(); });
  startWebAlarms(showAlarm);
  // Recalcula avisos a cada 15 min (virada do dia, alertas do ponto).
  setInterval(syncAlarms, 15 * MIN);

  if ('serviceWorker' in navigator && !isAndroidApp && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
