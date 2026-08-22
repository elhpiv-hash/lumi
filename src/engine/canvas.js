import { VIEW } from '../config.js';

/**
 * Canvas и система координат.
 *
 * Экраны разные, поэтому рисуем в мировых единицах, а не в пикселях.
 * Масштаб подбираем по правилу «contain»: игровое поле CORE от (0,0)
 * до (coreWidth, coreHeight) видно целиком всегда, а излишек экрана по
 * широкой оси уходит за его границы — там будет фон. Поэтому view.left
 * и view.top обычно отрицательные: это края видимой области, а не поля.
 *
 * Два режима трансформации:
 *   beginWorld()  — координаты в wu, для всей игры;
 *   beginScreen() — координаты в CSS-пикселях, для HUD и текста (так он чёткий).
 */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });

  const view = {
    dpr: 1,
    scale: 1,          // пикселей на одну мировую единицу
    cssWidth: 0,
    cssHeight: 0,
    width: 0,          // видимая область в wu
    height: 0,
    left: 0,           // границы видимой области в координатах поля
    top: 0,
    right: 0,
    bottom: 0,
  };

  function resize() {
    const cssWidth = canvas.clientWidth || window.innerWidth;
    const cssHeight = canvas.clientHeight || window.innerHeight;

    // Скрытая вкладка или ещё не разложенный iframe (а на Яндекс Играх мы именно
    // в iframe) отдают нулевой размер. Молча выходим и ждём следующего замера:
    // лучше сохранить прошлый валидный масштаб, чем обнулить холст.
    if (cssWidth < 1 || cssHeight < 1) return;

    const dpr = Math.min(window.devicePixelRatio || 1, VIEW.maxDpr);

    view.cssWidth = cssWidth;
    view.cssHeight = cssHeight;
    view.dpr = dpr;
    view.scale = Math.min(cssWidth / VIEW.coreWidth, cssHeight / VIEW.coreHeight);
    view.width = cssWidth / view.scale;
    view.height = cssHeight / view.scale;
    view.left = (VIEW.coreWidth - view.width) / 2;
    view.top = (VIEW.coreHeight - view.height) / 2;
    view.right = view.left + view.width;
    view.bottom = view.top + view.height;

    // Смена width/height чистит холст, поэтому трогаем их только при реальном изменении.
    const pixelWidth = Math.round(cssWidth * dpr);
    const pixelHeight = Math.round(cssHeight * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
  }

  function beginWorld() {
    const k = view.scale * view.dpr;
    ctx.setTransform(k, 0, 0, k, -view.left * k, -view.top * k);
  }

  function beginScreen() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  }

  // ResizeObserver ловит и поворот экрана, и схлопывание адресной строки на мобилке —
  // window.resize там срабатывает не всегда.
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  window.addEventListener('orientationchange', resize);
  resize();

  function dispose() {
    observer.disconnect();
    window.removeEventListener('orientationchange', resize);
  }

  return { ctx, view, beginWorld, beginScreen, resize, dispose };
}
