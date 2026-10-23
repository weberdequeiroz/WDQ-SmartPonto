// Avisos com o app fechado no iPhone/navegador, por um servidor do próprio usuário (pasta server/ do repositório).
// O app envia ao servidor a lista dos próximos avisos; o servidor manda a notificação na hora certa.
import { state, saveSettings } from './store.js';

const LS_SYNC = 'sp-push-sync';
const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } },
};

export const pushSupported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;

export const pushActive = () => !!state.settings.push?.endpoint;
export const lastPushSync = () => ls.get(LS_SYNC);

/** "https://site/pasta/api.php?k=CHAVE" → { api, key } */
export function parseLink(link) {
  const u = new URL(String(link).trim());
  const key = u.searchParams.get('k');
  if (u.protocol !== 'https:' || !key) throw new Error('Cole o link completo que aparece na página de instalação do servidor (começa com https:// e termina com ?k=…).');
  u.search = '';
  u.hash = '';
  return { api: u.toString(), key };
}

async function call(cfg, action, body, extra = '') {
  const url = `${cfg.api}?action=${action}&k=${encodeURIComponent(cfg.key)}${extra}`;
  let res;
  try {
    res = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  } catch {
    throw new Error('Não foi possível falar com o servidor. Confira o link e a internet.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `O servidor respondeu com erro ${res.status}.`);
  return data;
}

function keyBytes(b64u) {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64u.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
}

/** O service worker precisa do link para buscar o texto do aviso quando a notificação chega. */
async function storeForWorker(cfg, endpoint) {
  const cache = await caches.open('sp-push');
  await cache.put('config', new Response(JSON.stringify({ ...cfg, endpoint })));
}

export async function enablePush(link) {
  if (!pushSupported()) throw new Error('Este aparelho não aceita notificações deste app. No iPhone, use iOS 16.4 ou mais novo e abra o app pela Tela de Início.');
  const cfg = parseLink(link);
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('As notificações foram bloqueadas. Libere em Ajustes do iPhone → Notificações → SmartPonto.');
  const info = await call(cfg, 'info');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, info.vapid)) { await sub.unsubscribe(); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(info.vapid) });
  await storeForWorker(cfg, sub.endpoint);
  await saveSettings({ push: { link: String(link).trim(), endpoint: sub.endpoint } });
  lastHash = '';
}

function sameKey(sub, vapid) {
  try {
    const k = new Uint8Array(sub.options.applicationServerKey);
    const want = keyBytes(vapid);
    return k.length === want.length && k.every((v, i) => v === want[i]);
  } catch { return true; }
}

export async function disablePush() {
  const p = state.settings.push;
  if (p) {
    try { await call(parseLink(p.link), 'unsubscribe', { endpoint: p.endpoint }); } catch { /* servidor fora do ar: segue */ }
  }
  try { const reg = await navigator.serviceWorker.ready; await (await reg.pushManager.getSubscription())?.unsubscribe(); } catch { /* ok */ }
  try { await (await caches.open('sp-push')).delete('config'); } catch { /* ok */ }
  await saveSettings({ push: null });
  ls.set(LS_SYNC, null);
}

export async function testPush() {
  const p = state.settings.push;
  if (!p) throw new Error('Ative os avisos primeiro.');
  await call(parseLink(p.link), 'test', { endpoint: p.endpoint });
}

let lastHash = '';
let timer;
/** Envia a lista de avisos ao servidor (só quando muda). */
export function syncPush(list) {
  const p = state.settings.push;
  if (!p) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const alarms = list.map(({ id, at, title, body }) => ({ id, at, title, body }));
    const hash = JSON.stringify(alarms);
    if (hash === lastHash) return;
    try {
      const cfg = parseLink(p.link);
      await storeForWorker(cfg, p.endpoint);
      await call(cfg, 'sync', { endpoint: p.endpoint, alarms });
      lastHash = hash;
      ls.set(LS_SYNC, { at: Date.now(), count: alarms.length, ok: true });
    } catch (e) {
      ls.set(LS_SYNC, { at: Date.now(), ok: false, error: e.message });
    }
  }, 1500);
}
