// Recursos que mudam entre o APK Android e o navegador (iPhone/Android/PC).
// No APK, a ponte nativa "SmartPontoAndroid" salva e compartilha arquivos e imprime em PDF.

const bridge = typeof window !== 'undefined' ? window.SmartPontoAndroid : undefined;
export const isAndroidApp = !!bridge;
export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = isAndroidApp || window.matchMedia?.('(display-mode: standalone)').matches
  || navigator.standalone === true;

/** Compartilha um arquivo (Drive, WhatsApp, e-mail, Arquivos…). Cai para download se não houver suporte. */
export async function shareFile(name, mime, text) {
  if (bridge) { bridge.shareFile(name, mime, text); return 'shared'; }
  const file = new File([text], name, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
    }
  }
  download(name, mime, text);
  return 'downloaded';
}

/** Salva o arquivo direto em Downloads (APK) ou baixa pelo navegador. */
export function saveFile(name, mime, text) {
  if (bridge) return bridge.saveFile(name, mime, text);
  download(name, mime, text);
  return 'Downloads';
}

function download(name, mime, text) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Abre a impressão do sistema; nela o usuário escolhe "Salvar como PDF". */
export function printPage(title) {
  if (bridge) { bridge.print(title); return; }
  const old = document.title;
  document.title = title;
  window.print();
  setTimeout(() => { document.title = old; }, 1000);
}

export function shareText(text) {
  if (bridge) { bridge.shareText(text); return Promise.resolve(); }
  if (navigator.share) return navigator.share({ text }).catch(() => {});
  return navigator.clipboard?.writeText(text);
}

export function vibrate(pattern = 30) {
  if (bridge?.vibrate) bridge.vibrate(Array.isArray(pattern) ? pattern[0] : pattern);
  else navigator.vibrate?.(pattern);
}

/** Localização aproximada da marcação (opcional, desligada por padrão). */
export function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: Number(pos.coords.latitude.toFixed(5)),
        lng: Number(pos.coords.longitude.toFixed(5)),
        acc: Math.round(pos.coords.accuracy),
      }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  });
}

export function setThemeColor(color) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  bridge?.setBarColor?.(color);
}
