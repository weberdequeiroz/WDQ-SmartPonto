// Mantém o app funcionando sem internet. Ao mudar arquivos, aumente a versão.
const CACHE = 'smartponto-v1.9.0';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/calc.js', 'js/store.js', 'js/platform.js', 'js/reminders.js', 'js/alarms.js', 'js/push.js', 'js/changelog.js', 'js/water.js', 'js/sync.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'sp-push').map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Rede primeiro (para receber atualizações); sem conexão, usa o cache.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('.apk')) return;
  e.respondWith(
    // Sempre confere com o site (sem cache do navegador), para a versão nova aparecer ao reabrir o app.
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});

// ---------- Avisos do servidor (app fechado) ----------
// O servidor manda um aviso sem texto; aqui o app busca o texto e mostra a notificação.
self.addEventListener('push', (e) => { e.waitUntil(showPush(e)); });

async function showPush(e) {
  let items = [];
  try { if (e.data) { const d = e.data.json(); items = d.items || [d]; } } catch { /* sem conteúdo */ }
  if (!items.length) {
    try {
      const cfg = await (await (await caches.open('sp-push')).match('config')).json();
      const url = `${cfg.api}?action=pending&k=${encodeURIComponent(cfg.key)}&e=${encodeURIComponent(cfg.endpoint)}`;
      items = (await (await fetch(url, { cache: 'no-store' })).json()).items || [];
    } catch { /* servidor fora do ar */ }
  }
  if (!items.length) items = [{ title: 'WDQ SmartPonto', body: 'Você tem um aviso. Abra o app para ver.' }];
  for (const it of items) {
    await self.registration.showNotification(it.title || 'WDQ SmartPonto', {
      body: it.body || '', tag: it.id || undefined, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './' },
    });
  }
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const win = list.find((c) => 'focus' in c);
    return win ? win.focus() : self.clients.openWindow('./');
  }));
});
