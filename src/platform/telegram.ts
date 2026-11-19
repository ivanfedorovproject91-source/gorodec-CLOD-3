// Изолированная интеграция с Telegram Mini Apps. Движок о ней ничего не знает.
// Вне Telegram функция ничего не делает.
export function initTelegram(): void {
  const tg = (window as any).Telegram?.WebApp;
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    tg.disableVerticalSwipes?.(); // чтобы свайп по холсту не закрывал мини-приложение
  } catch {
    /* ignore */
  }
}
