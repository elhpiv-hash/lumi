import { PLAYER, OBSTACLES, DIFFICULTY } from '../config.js';

/**
 * Нарастание сложности.
 *
 * Ведёт пройденный миром путь и выдаёт по нему текущие скорость, высоту прохода
 * и допустимый вертикальный скачок между проходами. Про время знает только
 * через dt, про canvas и игрока — ничего.
 *
 * Ключевая мысль: скачок прохода нельзя держать константой, когда скорость
 * растёт. Чем быстрее едет мир, тем меньше секунд остаётся между колоннами и
 * тем меньше игрок успевает набрать высоты. Поэтому потолок скачка не задан
 * числом, а выводится из физики взмаха при текущей скорости.
 */

/**
 * Устойчивая скорость набора высоты при непрерывном тапанье, wu/сек.
 * Ровно flapImpulse/4: подъём за взмах v^2/(2g), делённый на длину цикла 2v/g.
 * Записано формулой, а не числом, чтобы не разъехалось при перебалансировке.
 */
const CLIMB_RATE = PLAYER.flapImpulse / 4;

/** Насыщающаяся кривая: быстро в начале, дальше выполаживание, предел недостижим. */
function approach(from, to, distance, tau) {
  return to - (to - from) * Math.exp(-distance / tau);
}

export function createDifficulty() {
  let distance = 0;
  let previousDistance = 0;
  let speed = 0;
  let gapHeight = 0;
  let maxGapShift = 0;

  function recompute() {
    speed = approach(DIFFICULTY.speedStart, DIFFICULTY.speedMax, distance, DIFFICULTY.speedTau);
    gapHeight = approach(DIFFICULTY.gapStart, DIFFICULTY.gapMin, distance, DIFFICULTY.gapTau);

    // Свободного полёта между колоннами столько, сколько мир едет от правого
    // края одной до левого края следующей. Больше этого подъёма требовать
    // нечестно: игрок физически не успеет, сколько бы он ни тапал.
    const freeFlight = (OBSTACLES.interval - OBSTACLES.columnWidth) / speed;
    maxGapShift = Math.min(
      DIFFICULTY.gapShiftCeiling,
      CLIMB_RATE * freeFlight * DIFFICULTY.gapShiftSafety,
    );
  }

  recompute();

  return {
    get distance() { return distance; },
    /** Путь на прошлом шаге — параллакс фона интерполируется так же, как всё остальное. */
    get previousDistance() { return previousDistance; },
    get speed() { return speed; },
    /** 0..1: насколько прогрелся фон. Отдельная кривая, медленнее разгона скорости. */
    get warmth() { return 1 - Math.exp(-distance / DIFFICULTY.warmthTau); },
    get gapHeight() { return gapHeight; },
    get maxGapShift() { return maxGapShift; },
    /** 0..1, насколько партия ушла к пределу сложности. Пригодится фону на шаге C. */
    get progress() {
      return (speed - DIFFICULTY.speedStart) / (DIFFICULTY.speedMax - DIFFICULTY.speedStart);
    },

    /** Двигает мир и возвращает пройденный за шаг путь в wu. */
    advance(dt) {
      const travelled = speed * dt;
      previousDistance = distance;
      distance += travelled;
      recompute();
      return travelled;
    },

    reset() {
      distance = 0;
      previousDistance = 0;
      recompute();
    },
  };
}
