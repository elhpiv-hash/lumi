import { VIEW, PIXEL, BACKGROUND, COLORS } from '../config.js';

/** Размер одного пикселя буфера в мировых единицах. */
const UNIT = 1 / PIXEL.perUnit;

/**
 * Фон: небо, которое теплеет с прогрессом, два слоя далёкого боке и рама,
 * закрывающая всё за пределами игрового поля.
 *
 * Это единственный игровой модуль, который принимает ctx: рисование градиента
 * иначе не выразить. Зато он не хранит игрового состояния — огоньки разложены
 * один раз при создании, а их положение считается из пройденного пути.
 *
 * Градиенты кэшируются. Создавать их каждый кадр — это семь объектов и столько
 * же строк в горячем пути; вместо этого прогрев квантуется на 96 ступеней, и
 * пересборка случается меньше сотни раз за партию.
 */
export function createBackground() {
  const layers = [];
  for (const spec of BACKGROUND.layers) {
    const xs = new Float64Array(spec.count);
    // Доля высоты вида, а не абсолютный y: тогда огоньки сами растягиваются
    // по любому экрану, от узкого портрета до ультраширокого.
    const heights = new Float64Array(spec.count);
    for (let i = 0; i < spec.count; i++) {
      xs[i] = Math.random() * BACKGROUND.wrapWidth;
      heights[i] = Math.random();
    }
    layers.push({ spec, xs, heights });
  }

  let sky = null;
  let skyWarmth = -1;
  let skyTop = NaN;
  let skyBottom = NaN;

  const frame = { left: null, right: null, top: null, bottom: null, vignetteTop: null, vignetteBottom: null };
  let frameLeft = NaN;
  let frameRight = NaN;
  let frameTop = NaN;
  let frameBottom = NaN;

  function mixColor(cold, warm, t) {
    const r = Math.round(cold[0] + (warm[0] - cold[0]) * t);
    const g = Math.round(cold[1] + (warm[1] - cold[1]) * t);
    const b = Math.round(cold[2] + (warm[2] - cold[2]) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function renderSky(ctx, view, warmth) {
    const quantized = Math.round(warmth * 96) / 96;
    if (!sky || quantized !== skyWarmth || view.top !== skyTop || view.bottom !== skyBottom) {
      sky = ctx.createLinearGradient(0, view.top, 0, view.bottom);
      sky.addColorStop(0, mixColor(COLORS.skyColdTop, COLORS.skyWarmTop, quantized));
      sky.addColorStop(1, mixColor(COLORS.skyColdBottom, COLORS.skyWarmBottom, quantized));
      skyWarmth = quantized;
      skyTop = view.top;
      skyBottom = view.bottom;
    }
    ctx.fillStyle = sky;
    ctx.fillRect(view.left, view.top, view.width, view.height);
  }

  function renderStars(ctx, view, distance) {
    const span = BACKGROUND.wrapWidth;
    ctx.fillStyle = COLORS.bokeh;

    for (const layer of layers) {
      const { spec, xs, heights } = layer;
      const offset = distance * spec.factor;

      for (let i = 0; i < spec.count; i++) {
        // Заворачиваем в полосу шириной span, сдвинутую к левому краю вида.
        // span заведомо шире любого экрана, поэтому дыр в покрытии не бывает.
        const raw = xs[i] - offset - view.left;
        const x = view.left + ((raw % span) + span) % span;
        const y = view.top + heights[i] * view.height;

        // Боке из двух квадратов по пиксельной сетке: круг через arc дал бы
        // сглаженный край, и после растягивания буфера он превратился бы
        // в грязную кайму.
        const outer = Math.max(UNIT, Math.round(spec.size * 1.8 / UNIT) * UNIT);
        const inner = Math.max(UNIT, Math.round(spec.size / UNIT) * UNIT);
        const px = Math.round(x / UNIT) * UNIT;
        const py = Math.round(y / UNIT) * UNIT;
        ctx.globalAlpha = spec.alpha * 0.4;
        ctx.fillRect(px - outer / 2, py - outer / 2, outer, outer);
        ctx.globalAlpha = spec.alpha;
        ctx.fillRect(px - inner / 2, py - inner / 2, inner, inner);
      }
    }

    ctx.globalAlpha = 1;
  }

  function rebuildFrame(ctx, view) {
    const fade = BACKGROUND.frameFade;
    const [r, g, b] = COLORS.frameRgb;
    const shade = (alpha) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

    // Ослабевает внутрь поля, поэтому колонны не возникают из воздуха на
    // широком экране, а проявляются на подлёте.
    const band = (x0, y0, x1, y1) => {
      const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
      gradient.addColorStop(0, shade(BACKGROUND.frameOpacity));
      gradient.addColorStop(1, shade(0));
      return gradient;
    };

    frame.left = band(0, 0, fade, 0);
    frame.right = band(VIEW.coreWidth, 0, VIEW.coreWidth - fade, 0);
    frame.top = band(0, 0, 0, fade);
    frame.bottom = band(0, VIEW.coreHeight, 0, VIEW.coreHeight - fade);

    const depth = BACKGROUND.vignetteDepth;
    const inner = (y0, y1) => {
      const gradient = ctx.createLinearGradient(0, y0, 0, y1);
      gradient.addColorStop(0, shade(BACKGROUND.vignetteAlpha));
      gradient.addColorStop(1, shade(0));
      return gradient;
    };
    frame.vignetteTop = inner(0, depth);
    frame.vignetteBottom = inner(VIEW.coreHeight, VIEW.coreHeight - depth);

    frameLeft = view.left;
    frameRight = view.right;
    frameTop = view.top;
    frameBottom = view.bottom;
  }

  function renderFrame(ctx, view) {
    if (view.left !== frameLeft || view.right !== frameRight || view.top !== frameTop || view.bottom !== frameBottom) {
      rebuildFrame(ctx, view);
    }

    const fade = BACKGROUND.frameFade;
    ctx.fillStyle = COLORS.frame;
    ctx.globalAlpha = BACKGROUND.frameOpacity;
    if (view.left < 0) {
      ctx.fillRect(view.left, view.top, -view.left, view.height);
      ctx.fillRect(VIEW.coreWidth, view.top, view.right - VIEW.coreWidth, view.height);
    }
    if (view.top < 0) {
      ctx.fillRect(view.left, view.top, view.width, -view.top);
      ctx.fillRect(view.left, VIEW.coreHeight, view.width, view.bottom - VIEW.coreHeight);
    }
    ctx.globalAlpha = 1;

    if (view.left < 0) {
      ctx.fillStyle = frame.left;
      ctx.fillRect(0, view.top, fade, view.height);
      ctx.fillStyle = frame.right;
      ctx.fillRect(VIEW.coreWidth - fade, view.top, fade, view.height);
    }
    if (view.top < 0) {
      ctx.fillStyle = frame.top;
      ctx.fillRect(view.left, 0, view.width, fade);
      ctx.fillStyle = frame.bottom;
      ctx.fillRect(view.left, VIEW.coreHeight - fade, view.width, fade);
    }

    const depth = BACKGROUND.vignetteDepth;
    ctx.fillStyle = frame.vignetteTop;
    ctx.fillRect(0, 0, VIEW.coreWidth, depth);
    ctx.fillStyle = frame.vignetteBottom;
    ctx.fillRect(0, VIEW.coreHeight - depth, VIEW.coreWidth, depth);
  }

  return { renderSky, renderStars, renderFrame };
}
