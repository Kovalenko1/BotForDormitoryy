declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: Record<string, unknown>;
        ready?: () => void;
        expand?: () => void;
        requestFullscreen?: () => void | Promise<void>;
      };
    };
  }
}

export function initTelegramWebApp() {
  const webApp = window.Telegram?.WebApp;
  webApp?.ready?.();
  webApp?.expand?.();

  window.setTimeout(() => {
    try {
      webApp?.expand?.();
      webApp?.requestFullscreen?.();
    } catch {
      // Desktop and mobile Telegram clients support fullscreen unevenly.
    }
  }, 80);
}

export function getTelegramInitData() {
  return window.Telegram?.WebApp?.initData?.trim() ?? '';
}

export async function waitForTelegramInitData(timeoutMs = 2500) {
  const token = new URLSearchParams(window.location.search).get('token')?.trim();
  if (token || getTelegramInitData()) {
    return;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    if (getTelegramInitData()) {
      return;
    }
  }
}