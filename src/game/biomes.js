import { WORLD } from '../config.js';

/**
 * Биомы: мир меняется по мере полёта.
 *
 * Каждый биом — это палитра целиком: небо, лианы, ягоды, боке. Между соседними
 * биомами не переключаемся рывком, а плавно перетекаем на последней трети
 * отрезка, поэтому смена читается как путешествие, а не как смена уровня.
 *
 * Цвета лежат числами, а не строками, потому что их надо интерполировать.
 * Строки собираются только когда смесь заметно поменялась — иначе на каждый
 * кадр приходилось бы клеить десяток строк в горячем пути.
 */
export const BIOMES = [
  {
    name: 'сумерки',
    skyTop: [44, 32, 92], skyBottom: [120, 76, 156],
    vine: [62, 155, 110], vineLight: [96, 190, 130], vineCap: [138, 205, 110],
    vineOutline: [26, 70, 50], berry: [255, 214, 110], bokeh: [255, 240, 200],
  },
  {
    name: 'рассвет',
    skyTop: [96, 54, 112], skyBottom: [255, 158, 98],
    vine: [92, 150, 70], vineLight: [130, 190, 95], vineCap: [196, 216, 104],
    vineOutline: [42, 70, 32], berry: [255, 238, 150], bokeh: [255, 232, 190],
  },
  {
    name: 'полдень',
    skyTop: [86, 170, 230], skyBottom: [196, 236, 232],
    vine: [66, 162, 80], vineLight: [110, 205, 110], vineCap: [162, 220, 92],
    vineOutline: [28, 78, 40], berry: [255, 118, 118], bokeh: [255, 255, 255],
  },
  {
    name: 'закат',
    skyTop: [198, 88, 120], skyBottom: [255, 182, 112],
    vine: [128, 108, 60], vineLight: [176, 150, 86], vineCap: [222, 172, 80],
    vineOutline: [58, 44, 24], berry: [255, 242, 172], bokeh: [255, 220, 170],
  },
  {
    name: 'ночь',
    skyTop: [10, 14, 40], skyBottom: [32, 42, 92],
    vine: [40, 72, 96], vineLight: [72, 112, 142], vineCap: [92, 142, 176],
    vineOutline: [14, 26, 44], berry: [172, 222, 255], bokeh: [200, 226, 255],
  },
];

/** Плавный переход без изломов на стыках. */
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

export function createBiome() {
  /** Готовая палитра текущего момента. Мутируется на месте — ноль аллокаций. */
  const palette = {
    name: BIOMES[0].name,
    skyTop: [0, 0, 0],
    skyBottom: [0, 0, 0],
    vine: '',
    vineLight: '',
    vineCap: '',
    vineOutline: '',
    berry: '',
    bokeh: '',
  };

  let index = 0;
  let blend = 0;
  let cachedIndex = -1;
  let cachedBlend = -1;

  function mixInto(target, from, to, t) {
    target[0] = Math.round(from[0] + (to[0] - from[0]) * t);
    target[1] = Math.round(from[1] + (to[1] - from[1]) * t);
    target[2] = Math.round(from[2] + (to[2] - from[2]) * t);
  }

  function mixToString(from, to, t) {
    const r = Math.round(from[0] + (to[0] - from[0]) * t);
    const g = Math.round(from[1] + (to[1] - from[1]) * t);
    const b = Math.round(from[2] + (to[2] - from[2]) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function update(distance) {
    const position = distance / WORLD.biomeLength;
    index = Math.floor(position) % BIOMES.length;
    const local = position - Math.floor(position);

    // Держим биом целиком, а перетекаем только на хвосте отрезка.
    blend = local <= WORLD.holdFraction
      ? 0
      : smoothstep((local - WORLD.holdFraction) / (1 - WORLD.holdFraction));

    // Пересобираем палитру только когда смесь заметно сдвинулась: 32 ступени
    // глазом не отличить, зато и цвета, и градиент неба перестают меняться
    // каждый кадр — а значит их можно кэшировать дальше по конвейеру.
    const quantized = Math.round(blend * 32);
    if (index === cachedIndex && quantized === cachedBlend) return;
    cachedIndex = index;
    cachedBlend = quantized;

    const from = BIOMES[index];
    const to = BIOMES[(index + 1) % BIOMES.length];
    const t = quantized / 32;

    mixInto(palette.skyTop, from.skyTop, to.skyTop, t);
    mixInto(palette.skyBottom, from.skyBottom, to.skyBottom, t);
    palette.name = t < 0.5 ? from.name : to.name;
    palette.vine = mixToString(from.vine, to.vine, t);
    palette.vineLight = mixToString(from.vineLight, to.vineLight, t);
    palette.vineCap = mixToString(from.vineCap, to.vineCap, t);
    palette.vineOutline = mixToString(from.vineOutline, to.vineOutline, t);
    palette.berry = mixToString(from.berry, to.berry, t);
    palette.bokeh = mixToString(from.bokeh, to.bokeh, t);
  }

  function reset() {
    cachedIndex = -1;
    cachedBlend = -1;
    update(0);
  }

  reset();

  return {
    palette,
    update,
    reset,
    get index() { return index; },
    get blend() { return blend; },
  };
}
