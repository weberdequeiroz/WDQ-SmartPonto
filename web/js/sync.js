// Conta por e-mail e sincronização entre aparelhos, pelo servidor do WDQ SmartPonto (pasta server/).
// Login: o servidor envia um código de 6 dígitos ao e-mail. Sincronização: vale a alteração mais recente.
import { state, getKV, putKV, collectChanges, applyRemote, setOnChange } from './store.js';
import { parseLink } from './push.js';

// Servidor padrão do app. Preencha com o link da página de instalação para que os usuários só digitem o e-mail.
export const DEFAULT_SERVER = 'https://wdqbrasil.com.br/smartponto-push/api.php?k=7a99dd29c3bc2bb701b35745b9fae5a2';

let account = null; // { server, email, token }
let meta = { rev: 0, pushedAt: 0, lastSync: 0, firstDone: false };
let listeners = [];
let status = { state: 'idle', error: null };

export const onSyncChange = (fn) => { listeners.push(fn); };
const emit = () => listeners.forEach((fn) => { try { fn(status); } catch { /* ok */ } });
export const getAccount = () => account;
export const syncStatus = () => ({ ...status, lastSync: meta.lastSync });

/** Link do servidor: o salvo na conta, o do servidor de avisos ou o padrão do app. */
export function serverLink() {
  return account?.server || state.settings.push?.link || DEFAULT_SERVER || '';
}

async function call(link, action, body) {
  const cfg = parseLink(link);
  let res;
  try {
    res = await fetch(`${cfg.api}?action=${action}&k=${encodeURIComponent(cfg.key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
    });
  } catch {
    throw new Error('Sem conexão com o servidor. Confira a internet.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || data.auth === false) {
    const e = new Error(data.error || 'Sessão expirada. Entre de novo.');
    e.auth = true;
    throw e;
  }
  if (!res.ok || data.error) throw new Error(data.error || `O servidor respondeu com erro ${res.status}.`);
  return data;
}

export async function loadAccount() {
  account = (await getKV('account')) || null;
  meta = { ...meta, ...((await getKV('syncMeta')) || {}) };
  setOnChange(() => scheduleSync());
}

const saveMeta = () => putKV('syncMeta', meta);

export async function requestCode(link, email) {
  await call(link, 'auth_request', { email });
}

export async function verifyCode(link, email, code) {
  const device = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : 'Navegador';
  const r = await call(link, 'auth_verify', { email, code, device });
  account = { server: link.trim(), email: r.email, token: r.token };
  meta = { rev: 0, pushedAt: 0, lastSync: 0, firstDone: false };
  await putKV('account', account);
  await saveMeta();
  return syncNow();
}

let running = null;
/**
 * Sincroniza. No primeiro login: baixa tudo da conta, aplica (os ajustes da conta valem),
 * depois envia tudo o que existe no aparelho. Nada do aparelho é apagado.
 */
export function syncNow() {
  if (!account) return Promise.resolve(null);
  if (running) return running;
  running = (async () => {
    status = { state: 'syncing', error: null };
    emit();
    const startedAt = Date.now();
    let received = 0;
    let sent = 0;
    try {
      const first = !meta.firstDone;
      // 1) Receber (no primeiro login, antes de enviar, para os ajustes da conta prevalecerem)
      let more = true;
      let hadSettings = false;
      while (more) {
        const r = await call(account.server, 'data_sync', { token: account.token, rev: meta.rev, changes: [] });
        if (r.rows.some((x) => x.kind === 'settings')) hadSettings = true;
        received += await applyRemote(r.rows, { forceSettings: first });
        meta.rev = r.rev;
        more = r.more;
      }
      // 2) Enviar o que mudou no aparelho (no primeiro login: tudo)
      const changes = collectChanges(first ? 0 : meta.pushedAt, { includeSettings: !(first && hadSettings) });
      for (let i = 0; i < changes.length; i += 500) {
        const r = await call(account.server, 'data_sync', { token: account.token, rev: meta.rev, changes: changes.slice(i, i + 500) });
        sent += r.accepted;
        received += await applyRemote(r.rows.filter((x) => !changes.some((c) => c.kind === x.kind && c.id === x.id)));
        meta.rev = r.rev;
      }
      meta.pushedAt = startedAt;
      meta.lastSync = Date.now();
      meta.firstDone = true;
      await saveMeta();
      status = { state: 'ok', error: null, received, sent };
    } catch (e) {
      if (e.auth) { account = { ...account, token: null }; await putKV('account', account); }
      status = { state: 'error', error: e.message, auth: !!e.auth };
    }
    emit();
    running = null;
    return status;
  })();
  return running;
}

let timer;
/** Agenda uma sincronização alguns segundos depois de uma alteração. */
export function scheduleSync(delay = 3000) {
  if (!account?.token) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, delay);
}

export async function logout({ deleteAccount = false } = {}) {
  if (account?.token) {
    try { await call(account.server, deleteAccount ? 'delete_account' : 'logout', { token: account.token }); } catch (e) { if (deleteAccount) throw e; }
  }
  account = null;
  meta = { rev: 0, pushedAt: 0, lastSync: 0, firstDone: false };
  await putKV('account', null);
  await saveMeta();
  status = { state: 'idle', error: null };
  emit();
}
