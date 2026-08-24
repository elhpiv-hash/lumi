/**
 * Адаптер Яндекс Игр. Единственное место, где игра знает про площадку.
 *
 * Всё внутри устроено так, чтобы отсутствие SDK было нормальным состоянием,
 * а не ошибкой: локально и на GitHub Pages скрипт просто не загрузится, и
 * каждый метод превратится в тихую заглушку. Поэтому игра одинаково
 * запускается и там, и на площадке.
 *
 * Путь к скрипту относительный и это принципиально: требования Яндекса прямо
 * запрещают абсолютные ссылки на их S3 (пункт 1.7), а относительный /sdk.js
 * площадка подставляет сама.
 */
const SCRIPT_URL = '/sdk.js';

/** Техническое имя лидерборда из Консоли разработчика. */
const LEADERBOARD = 'score';

export function createSdk() {
  let ysdk = null;
  let player = null;
  let canSubmitScore = false;

  function loadScript() {
    if (window.YaGames) return Promise.resolve(true);
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve(Boolean(window.YaGames));
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  async function init() {
    if (!(await loadScript())) return false;
    try {
      ysdk = await window.YaGames.init();
    } catch {
      ysdk = null;
      return false;
    }

    // Игрок может не инициализироваться — тогда просто играем без облака.
    try {
      player = await ysdk.getPlayer();
    } catch {
      player = null;
    }

    // Отправка результата доступна только авторизованным, и площадка просит
    // спрашивать заранее, а не ловить ошибку постфактум.
    try {
      canSubmitScore = Boolean(await ysdk.isAvailableMethod('leaderboards.setScore'));
    } catch {
      canSubmitScore = false;
    }

    return true;
  }

  /** Игра загрузилась и готова к взаимодействию. Без этого площадка держит загрузчик. */
  function signalReady() {
    try {
      ysdk?.features?.LoadingAPI?.ready();
    } catch {
      // Разметка загрузки — не то, ради чего стоит ронять игру.
    }
  }

  function gameplayStart() {
    try { ysdk?.features?.GameplayAPI?.start(); } catch { /* не критично */ }
  }

  function gameplayStop() {
    try { ysdk?.features?.GameplayAPI?.stop(); } catch { /* не критично */ }
  }

  /**
   * Числовой прогресс. Именно setStats, а не setData: документация прямо
   * советует его для часто меняющихся чисел вроде очков и валюты, и лимит
   * там мягче.
   */
  async function loadStats(keys) {
    if (!player) return null;
    try {
      return await player.getStats(keys);
    } catch {
      return null;
    }
  }

  function saveStats(stats) {
    if (!player) return;
    try {
      player.setStats(stats)?.catch?.(() => {});
    } catch {
      // Сеть отвалилась — локальная копия всё равно записана.
    }
  }

  function submitScore(value) {
    if (!ysdk || !canSubmitScore) return;
    try {
      ysdk.leaderboards?.setScore(LEADERBOARD, value)?.catch?.(() => {});
    } catch {
      // Неавторизованный игрок или лидерборда нет в Консоли — не беда.
    }
  }

  function showInterstitial({ onOpen, onClose }) {
    if (!ysdk) {
      onClose?.(false);
      return;
    }
    try {
      ysdk.adv.showFullscreenAdv({
        callbacks: {
          onOpen: () => onOpen?.(),
          onClose: (wasShown) => onClose?.(Boolean(wasShown)),
          // onError тоже приводит к onClose, но подстрахуемся: игра не должна
          // остаться на паузе, если реклама сломалась.
          onError: () => onClose?.(false),
        },
      });
    } catch {
      onClose?.(false);
    }
  }

  function showRewarded({ onOpen, onRewarded, onClose }) {
    if (!ysdk) {
      onClose?.(false);
      return;
    }
    try {
      ysdk.adv.showRewardedVideo({
        callbacks: {
          onOpen: () => onOpen?.(),
          onRewarded: () => onRewarded?.(),
          onClose: (wasShown) => onClose?.(Boolean(wasShown)),
          onError: () => onClose?.(false),
        },
      });
    } catch {
      onClose?.(false);
    }
  }

  return {
    init,
    signalReady,
    gameplayStart,
    gameplayStop,
    loadStats,
    saveStats,
    submitScore,
    showInterstitial,
    showRewarded,
    get available() { return ysdk !== null; },
    get hasCloud() { return player !== null; },
    get canSubmitScore() { return canSubmitScore; },
    get language() { return ysdk?.environment?.i18n?.lang ?? null; },
  };
}
