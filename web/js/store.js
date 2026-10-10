// Armazenamento local em IndexedDB. Tudo fica no aparelho; nada é enviado a servidores.
import { DEFAULT_SETTINGS } from './calc.js';

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
};

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
  const [punches, settings, dayInfo, meta, reminders] = await Promise.all([
    req(t.objectStore('punches').getAll()),
    req(t.objectStore('kv').get('settings')),
    req(t.objectStore('kv').get('dayInfo')),
    req(t.objectStore('kv').get('meta')),
    req(t.objectStore('kv').get('reminders')),
  ]);
  state.reminders = reminders || [];
  state.punches = punches.sort((a, b) => a.ts - b.ts);
  state.settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  state.dayInfo = dayInfo || {};
  state.meta = { lastBackup: null, createdAt: Date.now(), ...(meta || {}) };
  if (!meta) await putKV('meta', state.meta);
  // Pede ao navegador para não apagar os dados em caso de pouco espaço.
  try { await navigator.storage?.persist?.(); } catch { /* opcional */ }
}

async function putKV(key, value) {
  const { t, done } = tx(['kv'], 'readwrite');
  t.objectStore('kv').put(value, key);
  await done;
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export async function addPunch(data) {
  const punch = { id: newId(), createdAt: Date.now(), ...data };
  const { t, done } = tx(['punches'], 'readwrite');
  t.objectStore('punches').put(punch);
  await done;
  state.punches.push(punch);
  state.punches.sort((a, b) => a.ts - b.ts);
  return punch;
}

export async function updatePunch(id, changes) {
  const i = state.punches.findIndex((p) => p.id === id);
  if (i < 0) return;
  const punch = { ...state.punches[i], ...changes, editedAt: Date.now() };
  const { t, done } = tx(['punches'], 'readwrite');
  t.objectStore('punches').put(punch);
  await done;
  state.punches[i] = punch;
  state.punches.sort((a, b) => a.ts - b.ts);
}

export async function deletePunch(id) {
  const { t, done } = tx(['punches'], 'readwrite');
  t.objectStore('punches').delete(id);
  await done;
  state.punches = state.punches.filter((p) => p.id !== id);
}

export async function saveSettings(changes) {
  state.settings = { ...state.settings, ...changes };
  await putKV('settings', state.settings);
}

export async function setDayInfo(key, info) {
  if (!info || (!info.occurrence && !info.note)) delete state.dayInfo[key];
  else state.dayInfo[key] = info;
  await putKV('dayInfo', state.dayInfo);
}

export async function saveReminder(rem) {
  const r = { ...rem, id: rem.id || newId(), updatedAt: Date.now() };
  const i = state.reminders.findIndex((x) => x.id === r.id);
  if (i >= 0) state.reminders[i] = r; else state.reminders.push(r);
  await putKV('reminders', state.reminders);
  return r;
}

export async function deleteReminder(id) {
  state.reminders = state.reminders.filter((x) => x.id !== id);
  await putKV('reminders', state.reminders);
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
  const valid = data.punches.filter((p) => p && typeof p.id === 'string' && Number.isFinite(p.ts)
    && ['in', 'out', 'break_start', 'break_end'].includes(p.type));

  const { t, done } = tx(['punches', 'kv'], 'readwrite');
  const ps = t.objectStore('punches');
  if (mode === 'replace') ps.clear();
  valid.forEach((p) => ps.put(p));
  const settings = mode === 'replace' ? { ...DEFAULT_SETTINGS, ...data.settings } : state.settings;
  const dayInfo = mode === 'replace' ? (data.dayInfo || {}) : { ...(data.dayInfo || {}), ...state.dayInfo };
  t.objectStore('kv').put(settings, 'settings');
  t.objectStore('kv').put(dayInfo, 'dayInfo');
  const incoming = Array.isArray(data.reminders) ? data.reminders.filter((r) => r && typeof r.id === 'string' && r.rule) : [];
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
  state.dayInfo = dayInfo;
  return valid.length;
}

export async function wipeAll() {
  const { t, done } = tx(['punches', 'kv'], 'readwrite');
  t.objectStore('punches').clear();
  t.objectStore('kv').clear();
  await done;
  state.punches = [];
  state.settings = { ...DEFAULT_SETTINGS };
  state.dayInfo = {};
  state.reminders = [];
  state.meta = { lastBackup: null, createdAt: Date.now() };
  await putKV('meta', state.meta);
}
