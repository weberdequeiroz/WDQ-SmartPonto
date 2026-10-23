// Armazenamento local em IndexedDB. Tudo fica no aparelho; com login, sync.js copia para a conta.
// Cada registro guarda quando foi alterado (updatedAt) e cada exclusão vira uma "lápide" (tombs),
// para a sincronização saber o que é mais recente e nunca apagar por engano.
import { DEFAULT_SETTINGS, migrateWorkPlan, normalizePlan } from './calc.js';

const DB_NAME = 'wdq-smartponto';
const DB_VERSION = 1;
export const BACKUP_FORMAT = 'wdq-smartponto-backup';

let db;
export const state = {
  punches: [],
  settings: { ...DEFAULT_SETTINGS },
  dayInfo: {},
  reminders: [],
  meta: { lastBackup: null, createdAt: null },
  tombs: {}, // 'kind:id' → quando foi excluído
};

// Configurações que valem só para este aparelho (não vão para a conta).
export const DEVICE_SETTINGS = ['push'];

let onChange = () => {};
/** sync.js registra aqui para enviar as alterações. */
export function setOnChange(fn) { onChange = fn; }
const changed = () => { try { onChange(); } catch { /* ok */ } };

/** Quando o registro foi alterado pela última vez (registros antigos usam a data de criação). */
export const updatedOf = (x) => x?.updatedAt || x?.editedAt || x?.createdAt || 1;

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function tx(stores, mode = 'readonly') {
  const t = db.transaction(stores, mode);
  const done = new Promise((resolve, reject) => {
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
  return { t, done };
}

/** Garante o horário de trabalho por relógio (converte a configuração antiga). */
function withPlan(settings) {
  return { ...settings, workPlan: normalizePlan(settings.workPlan || migrateWorkPlan(settings)) };
}

export async function openStore() {
  db = await new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('punches')) d.createObjectStore('punches', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const { t } = tx(['punches', 'kv']);
  const [punches, settings, dayInfo, meta, reminders, tombs] = await Promise.all([
    req(t.objectStore('punches').getAll()),
    req(t.objectStore('kv').get('settings')),
    req(t.objectStore('kv').get('dayInfo')),
    req(t.objectStore('kv').get('meta')),
    req(t.objectStore('kv').get('reminders')),
    req(t.objectStore('kv').get('tombstones')),
  ]);
  state.tombs = tombs || {};
  state.reminders = reminders || [];
  state.punches = punches.sort((a, b) => a.ts - b.ts);
  state.settings = withPlan({ ...DEFAULT_SETTINGS, ...(settings || {}) });
  state.dayInfo = dayInfo || {};
  state.meta = { lastBackup: null, createdAt: Date.now(), ...(meta || {}) };
  if (!meta) await putKV('meta', state.meta);
  // Pede ao navegador para não apagar os dados em caso de pouco espaço.
  try { await navigator.storage?.persist?.(); } catch { /* opcional */ }
}

export async function getKV(key) {
  const { t } = tx(['kv']);
  return req(t.objectStore('kv').get(key));
}

export async function putKV(key, value) {
  const { t, done } = tx(['kv'], 'readwrite');
  t.objectStore('kv').put(value, key);
  await done;
}

async function tomb(kind, id) {
  state.tombs[`${kind}:${id}`] = Date.now();
  await putKV('tombstones', state.tombs);
}
async function untomb(kind, id) {
  if (state.tombs[`${kind}:${id}`]) { delete state.tombs[`${kind}:${id}`]; await putKV('tombstones', state.tombs); }
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export async function addPunch(data) {
  const punch = { id: newId(), createdAt: Date.now(), ...data, updatedAt: Date.now() };
  const { t, done } = tx(['punches'], 'readwrite');
  t.objectStore('punches').put(punch);
  await done;
  state.punches = state.punches.filter((p) => p.id !== punch.id);
  state.punches.push(punch);
  state.punches.sort((a, b) => a.ts - b.ts);
  await untomb('punch', punch.id);
  changed();
  return punch;
}

export async function updatePunch(id, changes) {
  const i = state.punches.findIndex((p) => p.id === id);
  if (i < 0) return;
  const punch = { ...state.punches[i], ...changes, editedAt: Date.now(), updatedAt: Date.now() };
  const { t, done } = tx(['punches'], 'readwrite');
  t.objectStore('punches').put(punch);
  await done;
  state.punches[i] = punch;
  state.punches.sort((a, b) => a.ts - b.ts);
  changed();
}

export async function deletePunch(id) {
  const { t, done } = tx(['punches'], 'readwrite');
  t.objectStore('punches').delete(id);
  await done;
  state.punches = state.punches.filter((p) => p.id !== id);
  await tomb('punch', id);
  changed();
}

export async function saveSettings(changes) {
  state.settings = { ...state.settings, ...changes };
  await putKV('settings', state.settings);
  // Só configurações compartilhadas contam como alteração para a conta.
  if (Object.keys(changes).some((k) => !DEVICE_SETTINGS.includes(k))) {
    state.meta.settingsUpdatedAt = Date.now();
    await putKV('meta', state.meta);
    changed();
  }
}

export async function setDayInfo(key, info) {
  if (!info || (!info.occurrence && !info.note)) {
    if (!state.dayInfo[key]) return;
    delete state.dayInfo[key];
    await tomb('dayinfo', key);
  } else {
    state.dayInfo[key] = { ...info, updatedAt: Date.now() };
    await untomb('dayinfo', key);
  }
  await putKV('dayInfo', state.dayInfo);
  changed();
}

export async function saveReminder(rem) {
  const r = { ...rem, id: rem.id || newId(), updatedAt: Date.now() };
  const i = state.reminders.findIndex((x) => x.id === r.id);
  if (i >= 0) state.reminders[i] = r; else state.reminders.push(r);
  await putKV('reminders', state.reminders);
  await untomb('reminder', r.id);
  changed();
  return r;
}

export async function deleteReminder(id) {
  state.reminders = state.reminders.filter((x) => x.id !== id);
  await putKV('reminders', state.reminders);
  await tomb('reminder', id);
  changed();
}

export async function markBackup() {
  state.meta.lastBackup = Date.now();
  await putKV('meta', state.meta);
}

export function exportBackup() {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    dayInfo: state.dayInfo,
    reminders: state.reminders,
    punches: state.punches,
  };
}

/** Valida e restaura um backup. mode 'merge' junta com o que já existe; 'replace' substitui tudo. */
export async function importBackup(data, mode = 'merge') {
  if (!data || data.format !== BACKUP_FORMAT || !Array.isArray(data.punches)) {
    throw new Error('Arquivo não é um backup do WDQ SmartPonto.');
  }
  const nowTs = Date.now();
  const valid = data.punches.filter((p) => p && typeof p.id === 'string' && Number.isFinite(p.ts)
    && ['in', 'out', 'break_start', 'break_end'].includes(p.type)).map((p) => ({ ...p, updatedAt: nowTs }));

  const { t, done } = tx(['punches', 'kv'], 'readwrite');
  const ps = t.objectStore('punches');
  if (mode === 'replace') ps.clear();
  valid.forEach((p) => ps.put(p));
  const settings = mode === 'replace' ? withPlan({ ...DEFAULT_SETTINGS, ...data.settings }) : state.settings;
  const dayInfo = mode === 'replace' ? (data.dayInfo || {}) : { ...(data.dayInfo || {}), ...state.dayInfo };
  t.objectStore('kv').put(settings, 'settings');
  t.objectStore('kv').put(dayInfo, 'dayInfo');
  const incoming = Array.isArray(data.reminders) ? data.reminders.filter((r) => r && typeof r.id === 'string' && r.rule).map((r) => ({ ...r, updatedAt: nowTs })) : [];
  let reminders = state.reminders;
  if (mode === 'replace') reminders = incoming;
  else {
    const byId = new Map(incoming.map((r) => [r.id, r]));
    state.reminders.forEach((r) => byId.set(r.id, r));
    reminders = [...byId.values()];
  }
  t.objectStore('kv').put(reminders, 'reminders');
  await done;
  state.reminders = reminders;

  if (mode === 'replace') state.punches = valid;
  else {
    const byId = new Map(state.punches.map((p) => [p.id, p]));
    valid.forEach((p) => byId.set(p.id, p));
    state.punches = [...byId.values()];
  }
  state.punches.sort((a, b) => a.ts - b.ts);
  state.settings = settings;
  state.dayInfo = Object.fromEntries(Object.entries(dayInfo).map(([k, v]) => [k, { ...v, updatedAt: nowTs }]));
  await putKV('dayInfo', state.dayInfo);
  if (mode === 'replace') { state.meta.settingsUpdatedAt = nowTs; await putKV('meta', state.meta); }
  changed();
  return valid.length;
}

export async function wipeAll() {
  const { t, done } = tx(['punches', 'kv'], 'readwrite');
  t.objectStore('punches').clear();
  t.objectStore('kv').clear();
  await done;
  state.punches = [];
  state.settings = withPlan({ ...DEFAULT_SETTINGS });
  state.dayInfo = {};
  state.reminders = [];
  state.tombs = {};
  state.meta = { lastBackup: null, createdAt: Date.now() };
  await putKV('meta', state.meta);
}

// ---------- Sincronização com a conta ----------

/** Tudo o que mudou depois de "since" (ms), no formato do servidor. */
export function collectChanges(since, { includeSettings = true } = {}) {
  const out = [];
  for (const p of state.punches) if (updatedOf(p) > since) out.push({ kind: 'punch', id: p.id, data: p, updated: updatedOf(p) });
  for (const r of state.reminders) if (updatedOf(r) > since) out.push({ kind: 'reminder', id: r.id, data: r, updated: updatedOf(r) });
  for (const [k, v] of Object.entries(state.dayInfo)) if (updatedOf(v) > since) out.push({ kind: 'dayinfo', id: k, data: v, updated: updatedOf(v) });
  for (const [key, at] of Object.entries(state.tombs)) {
    if (at > since) { const [kind, ...rest] = key.split(':'); out.push({ kind, id: rest.join(':'), deleted: true, updated: at }); }
  }
  const sAt = state.meta.settingsUpdatedAt || 1;
  if (includeSettings && sAt > since) {
    const shared = Object.fromEntries(Object.entries(state.settings).filter(([k]) => !DEVICE_SETTINGS.includes(k)));
    out.push({ kind: 'settings', id: 'main', data: shared, updated: sAt });
  }
  return out;
}

/**
 * Aplica o que veio da conta. Só troca o que for mais novo do que o que está no aparelho.
 * forceSettings: no primeiro login, os ajustes da conta valem sobre os do aparelho novo.
 */
export async function applyRemote(rows, { forceSettings = false } = {}) {
  let n = 0;
  const { t, done } = tx(['punches', 'kv'], 'readwrite');
  const ps = t.objectStore('punches');
  const punchById = new Map(state.punches.map((p) => [p.id, p]));
  const remById = new Map(state.reminders.map((r) => [r.id, r]));
  for (const r of rows) {
    const key = `${r.kind}:${r.id}`;
    const tombAt = state.tombs[key] || 0;
    if (r.kind === 'settings') {
      if (r.deleted || !r.data) continue;
      if (forceSettings || r.updated > (state.meta.settingsUpdatedAt || 1)) {
        const keep = Object.fromEntries(DEVICE_SETTINGS.map((k) => [k, state.settings[k]]));
        state.settings = { ...state.settings, ...r.data, ...keep };
        state.meta.settingsUpdatedAt = r.updated;
        n++;
      }
      continue;
    }
    const local = r.kind === 'punch' ? punchById.get(r.id) : r.kind === 'reminder' ? remById.get(r.id) : state.dayInfo[r.id];
    const localAt = Math.max(local ? updatedOf(local) : 0, tombAt);
    if (r.updated <= localAt) continue;
    n++;
    if (r.deleted) {
      state.tombs[key] = r.updated;
      if (r.kind === 'punch') { punchById.delete(r.id); ps.delete(r.id); }
      if (r.kind === 'reminder') remById.delete(r.id);
      if (r.kind === 'dayinfo') delete state.dayInfo[r.id];
      continue;
    }
    delete state.tombs[key];
    const data = { ...r.data, updatedAt: r.updated };
    if (r.kind === 'punch') { punchById.set(r.id, data); ps.put(data); }
    if (r.kind === 'reminder') remById.set(r.id, data);
    if (r.kind === 'dayinfo') state.dayInfo[r.id] = data;
  }
  state.punches = [...punchById.values()].sort((a, b) => a.ts - b.ts);
  state.reminders = [...remById.values()];
  const kv = t.objectStore('kv');
  kv.put(withPlan({ ...DEFAULT_SETTINGS, ...state.settings }), 'settings');
  kv.put(state.dayInfo, 'dayInfo');
  kv.put(state.reminders, 'reminders');
  kv.put(state.tombs, 'tombstones');
  kv.put(state.meta, 'meta');
  await done;
  state.settings = withPlan({ ...DEFAULT_SETTINGS, ...state.settings });
  return n;
}
