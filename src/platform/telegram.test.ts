import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getWebApp,
  haptics,
  initTelegram,
  setClosingConfirmation,
  showBackButton,
  telegramLanguage,
  telegramUserId,
} from './telegram';

/** Minimal fake of Telegram.WebApp that records every call. */
function fakeWebApp({
  version = '8.0',
  platform = 'ios',
  initData = 'query_id=1',
}: { version?: string; platform?: string; initData?: string } = {}) {
  const events: Record<string, (payload?: unknown) => void> = {};
  const cmp = (a: string, b: string) => {
    const [a1 = 0, a2 = 0] = a.split('.').map(Number);
    const [b1 = 0, b2 = 0] = b.split('.').map(Number);
    return a1 - b1 || a2 - b2;
  };
  return {
    initData,
    platform,
    version,
    initDataUnsafe: { user: { language_code: 'ru' } },
    isVersionAtLeast: (v: string) => cmp(version, v) >= 0,
    ready: vi.fn(),
    expand: vi.fn(),
    requestFullscreen: vi.fn(),
    lockOrientation: vi.fn(),
    disableVerticalSwipes: vi.fn(),
    setHeaderColor: vi.fn(),
    setBackgroundColor: vi.fn(),
    setBottomBarColor: vi.fn(),
    enableClosingConfirmation: vi.fn(),
    disableClosingConfirmation: vi.fn(),
    onEvent: vi.fn((name: string, handler: (payload?: unknown) => void) => {
      events[name] = handler;
    }),
    fire: (name: string) => events[name]?.(),
    HapticFeedback: {
      impactOccurred: vi.fn(),
      notificationOccurred: vi.fn(),
      selectionChanged: vi.fn(),
    },
    BackButton: { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() },
  };
}

type Fake = ReturnType<typeof fakeWebApp>;

function install(app: Fake | undefined) {
  (globalThis as { window?: unknown }).window = app ? { Telegram: { WebApp: app } } : {};
}

describe('telegram integration', () => {
  beforeEach(() => install(undefined));
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('does nothing outside Telegram', () => {
    expect(getWebApp()).toBeNull();
    expect(() => {
      initTelegram();
      haptics.impact();
      haptics.notify('success');
      setClosingConfirmation(true);
      showBackButton(() => {})();
    }).not.toThrow();
  });

  it('ignores the SDK when opened in a plain browser (empty initData)', () => {
    const app = fakeWebApp({ initData: '' });
    install(app);
    initTelegram();
    haptics.impact();
    expect(app.ready).not.toHaveBeenCalled();
    expect(app.HapticFeedback.impactOccurred).not.toHaveBeenCalled();
  });

  it('on a phone with Bot API 8.0: ready, expand, fullscreen, no swipes, colours', () => {
    const app = fakeWebApp();
    install(app);
    initTelegram();
    expect(app.ready).toHaveBeenCalledOnce();
    expect(app.expand).toHaveBeenCalledOnce();
    expect(app.requestFullscreen).toHaveBeenCalledOnce();
    expect(app.lockOrientation).toHaveBeenCalledOnce();
    expect(app.disableVerticalSwipes).toHaveBeenCalledOnce();
    expect(app.setHeaderColor).toHaveBeenCalledWith('#0b0b0d');
    expect(app.setBackgroundColor).toHaveBeenCalledWith('#0b0b0d');
  });

  it('falls back to expand() when fullscreen fails', () => {
    const app = fakeWebApp();
    install(app);
    initTelegram();
    app.fire('fullscreenFailed');
    expect(app.expand).toHaveBeenCalledTimes(2);
  });

  it('desktop Telegram and old clients skip fullscreen and newer calls', () => {
    const desktop = fakeWebApp({ platform: 'tdesktop' });
    install(desktop);
    initTelegram();
    expect(desktop.requestFullscreen).not.toHaveBeenCalled();
    expect(desktop.expand).toHaveBeenCalledOnce();

    const old = fakeWebApp({ version: '6.0' });
    install(old);
    initTelegram();
    expect(old.ready).toHaveBeenCalledOnce();
    expect(old.requestFullscreen).not.toHaveBeenCalled();
    expect(old.disableVerticalSwipes).not.toHaveBeenCalled();
    expect(old.setHeaderColor).not.toHaveBeenCalled();
  });

  it('survives a client that throws on an unsupported method', () => {
    const app = fakeWebApp();
    app.requestFullscreen.mockImplementation(() => {
      throw new Error('WebAppMethodUnsupported');
    });
    install(app);
    expect(() => initTelegram()).not.toThrow();
    expect(app.ready).toHaveBeenCalled();
  });

  it('haptics, close confirmation, Back button and language', () => {
    const app = fakeWebApp();
    install(app);
    haptics.impact('medium');
    haptics.notify('success');
    haptics.select();
    expect(app.HapticFeedback.impactOccurred).toHaveBeenCalledWith('medium');
    expect(app.HapticFeedback.notificationOccurred).toHaveBeenCalledWith('success');
    expect(app.HapticFeedback.selectionChanged).toHaveBeenCalledOnce();

    setClosingConfirmation(true);
    setClosingConfirmation(false);
    expect(app.enableClosingConfirmation).toHaveBeenCalledOnce();
    expect(app.disableClosingConfirmation).toHaveBeenCalledOnce();

    const handler = () => {};
    const hide = showBackButton(handler);
    expect(app.BackButton.onClick).toHaveBeenCalledWith(handler);
    expect(app.BackButton.show).toHaveBeenCalledOnce();
    hide();
    expect(app.BackButton.offClick).toHaveBeenCalledWith(handler);
    expect(app.BackButton.hide).toHaveBeenCalledOnce();

    expect(telegramLanguage()).toBe('ru');
  });
});

describe('telegramUserId', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('reads the user id from the launch parameters before the SDK loads', () => {
    const data = new URLSearchParams({ user: JSON.stringify({ id: 4242, first_name: 'K' }) });
    (globalThis as { window?: unknown }).window = {
      location: { hash: `#${new URLSearchParams({ tgWebAppData: data.toString() }).toString()}` },
    };
    expect(telegramUserId()).toBe('4242');
  });

  it('prefers the SDK when it is there', () => {
    (globalThis as { window?: unknown }).window = {
      location: { hash: '' },
      Telegram: { WebApp: { initDataUnsafe: { user: { id: 7 } } } },
    };
    expect(telegramUserId()).toBe('7');
  });

  it('is null in a plain browser', () => {
    (globalThis as { window?: unknown }).window = { location: { hash: '' } };
    expect(telegramUserId()).toBeNull();
  });
});
