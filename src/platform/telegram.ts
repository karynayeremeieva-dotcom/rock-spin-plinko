/**
 * Telegram Mini App integration. Everything here is optional: outside Telegram
 * (plain browser, SDK blocked or offline) every call is a silent no-op.
 * API reference: https://core.telegram.org/bots/webapps
 */

type HapticImpact = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type HapticNotice = 'error' | 'success' | 'warning';

interface TelegramWebApp {
  initData: string;
  platform: string;
  version: string;
  initDataUnsafe?: { user?: { id?: number; language_code?: string } };
  isVersionAtLeast(version: string): boolean;
  ready(): void;
  expand(): void;
  requestFullscreen?(): void;
  lockOrientation?(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  enableClosingConfirmation?(): void;
  disableClosingConfirmation?(): void;
  onEvent?(event: string, handler: (payload?: unknown) => void): void;
  HapticFeedback?: {
    impactOccurred(style: HapticImpact): void;
    notificationOccurred(type: HapticNotice): void;
    selectionChanged(): void;
  };
  BackButton?: {
    show(): void;
    hide(): void;
    onClick(handler: () => void): void;
    offClick(handler: () => void): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const BG = '#0b0b0d';

/** The WebApp object, only when really running inside Telegram. */
export function getWebApp(): TelegramWebApp | null {
  const app = window.Telegram?.WebApp;
  // The SDK defines WebApp in any browser; inside Telegram initData is non-empty.
  return app && app.initData ? app : null;
}

const atLeast = (app: TelegramWebApp, version: string) => {
  try {
    return app.isVersionAtLeast(version);
  } catch {
    return false;
  }
};

/** Runs `callback` once the SDK script (loaded async in index.html) is available. */
export function whenTelegramLoaded(callback: () => void): void {
  if (window.Telegram?.WebApp) {
    callback();
    return;
  }
  const script = document.getElementById('tg-sdk');
  script?.addEventListener('load', callback, { once: true });
}

export function initTelegram(): void {
  const app = getWebApp();
  if (!app) return;
  try {
    app.ready();
    app.expand();
    const mobile = app.platform === 'ios' || app.platform === 'android';
    // Full screen on phones (Bot API 8.0+); expand() above is the fallback.
    if (mobile && atLeast(app, '8.0')) {
      app.onEvent?.('fullscreenFailed', () => app.expand());
      app.requestFullscreen?.();
      app.lockOrientation?.();
    }
    // Swiping down on the board must not minimise the app (Bot API 7.7+).
    if (atLeast(app, '7.7')) app.disableVerticalSwipes?.();
    if (atLeast(app, '6.1')) {
      app.setHeaderColor?.(BG);
      app.setBackgroundColor?.(BG);
    }
    if (atLeast(app, '7.10')) app.setBottomBarColor?.(BG);
  } catch {
    // Older clients may throw on unsupported methods; the game works without them.
  }
}

function haptic(): TelegramWebApp['HapticFeedback'] | null {
  const app = getWebApp();
  return app && atLeast(app, '6.1') ? (app.HapticFeedback ?? null) : null;
}

export const haptics = {
  impact(style: HapticImpact = 'light') {
    haptic()?.impactOccurred(style);
  },
  notify(type: HapticNotice) {
    haptic()?.notificationOccurred(type);
  },
  select() {
    haptic()?.selectionChanged();
  },
};

/** Ask before closing while balls are in the air or auto mode runs. */
export function setClosingConfirmation(enabled: boolean): void {
  const app = getWebApp();
  if (!app || !atLeast(app, '6.2')) return;
  if (enabled) app.enableClosingConfirmation?.();
  else app.disableClosingConfirmation?.();
}

/** Shows Telegram's native Back button while `handler` is set. Returns a cleanup. */
export function showBackButton(handler: () => void): () => void {
  const app = getWebApp();
  const button = app && atLeast(app, '6.1') ? app.BackButton : undefined;
  if (!button) return () => {};
  button.onClick(handler);
  button.show();
  return () => {
    button.offClick(handler);
    button.hide();
  };
}

/**
 * Telegram user id, or null outside Telegram. Read at start-up, before the async SDK has
 * loaded, from the launch parameters Telegram puts in the URL hash (tgWebAppData), and
 * kept for the session so a reload inside the Mini App finds it again.
 */
export function telegramUserId(): string | null {
  const fromSdk = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  let id = typeof fromSdk === 'number' ? String(fromSdk) : null;
  if (!id) {
    try {
      const data = new URLSearchParams(window.location.hash.slice(1)).get('tgWebAppData');
      const user = data ? new URLSearchParams(data).get('user') : null;
      const parsed: unknown = user ? JSON.parse(user) : null;
      if (typeof parsed === 'object' && parsed !== null && 'id' in parsed) {
        id = String((parsed as { id: unknown }).id);
      }
    } catch {
      id = null;
    }
  }
  try {
    if (id && /^\d+$/.test(id)) sessionStorage.setItem('rockspin.tgUser', id);
    else id = sessionStorage.getItem('rockspin.tgUser');
  } catch {
    // no session storage: fine, the id from the URL is enough for this load
  }
  return id && /^\d+$/.test(id) ? id : null;
}

export function telegramLanguage(): string | undefined {
  return window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
}
