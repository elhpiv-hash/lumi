import { VIEW, OBSTACLES } from '../config.js';

/**
 * Стая препятствий: пары колонн с проходом между ними, едут справа налево.
 *
 * Не знает ни про canvas, ни про игрока, ни про размер экрана, ни даже про
 * время: наружу торчит путь в wu, а не dt. Скорость живёт в difficulty.js,
 * сюда приходит уже пройденное за шаг расстояние.
 *
 * Пул. Препятствия не создаются и не выбрасываются по ходу игры: на старте
 * заводим poolSize штук, уехавшие возвращаются в список свободных и оттуда же
 * достаются под новый спавн. За час игры аллокаций ровно ноль, значит и пауз
 * от сборщика мусора тоже.
 *
 * Спавн по расстоянию, а не по таймеру. Копим пройденный путь и ставим новую
 * пару каждые interval единиц. Плотность колонн тогда не зависит ни от FPS, ни
 * от скорости: разгон мира делает колонны быстрее, но не гуще.
 */
export function createObstacles() {
  /** Свободные объекты. Достаём отсюда при спавне, возвращаем при уезде за край. */
  const free = [];
  /** Едущие сейчас. Порядок не важен, поэтому удаляем перестановкой с конца. */
  const active = [];

  let distanceSinceSpawn = 0;
  let lastGapCenter = VIEW.coreHeight / 2;
  let allocated = 0;

  function create() {
    allocated++;
    return { x: 0, previousX: 0, gapCenter: 0, gapHeight: 0, passed: false, nearMissed: false };
  }

  for (let i = 0; i < OBSTACLES.poolSize; i++) free.push(create());

  function nextGapCenter(gapHeight, maxGapShift) {
    const half = gapHeight / 2;
    const lowest = OBSTACLES.edgeMargin + half;
    const highest = VIEW.coreHeight - OBSTACLES.edgeMargin - half;
    // Ограничиваем скачок относительно прошлого прохода: подняться быстрее,
    // чем позволяет взмах, игрок физически не успеет — это была бы не
    // сложность, а несправедливость. Предел считает difficulty.js.
    const from = Math.max(lowest, lastGapCenter - maxGapShift);
    const to = Math.min(highest, lastGapCenter + maxGapShift);
    lastGapCenter = from + Math.random() * (to - from);
    return lastGapCenter;
  }

  function spawn(x, gapHeight, maxGapShift) {
    // Пул рассчитан с запасом; если он всё же кончился, лучше вырасти один раз,
    // чем оставить дыру в череде препятствий.
    const obstacle = free.length > 0 ? free.pop() : create();
    obstacle.x = x;
    obstacle.previousX = x;
    // Высоту прохода запоминаем на препятствии, а не читаем из конфига при
    // отрисовке: проход сужается по ходу партии, и уже вылетевшая колонна не
    // должна задним числом менять свой размер.
    obstacle.gapHeight = gapHeight;
    obstacle.gapCenter = nextGapCenter(gapHeight, maxGapShift);
    // Объект переиспользуется, поэтому флаги обязательно снимаем.
    obstacle.passed = false;
    obstacle.nearMissed = false;
    active.push(obstacle);
  }

  /** distance — на сколько wu мир сдвинулся за этот шаг. */
  function update(distance, gapHeight, maxGapShift) {
    for (let i = active.length - 1; i >= 0; i--) {
      const obstacle = active[i];
      obstacle.previousX = obstacle.x;
      obstacle.x -= distance;

      // Границей служит само поле, а не экран: игровая зона — всегда CORE,
      // всё за его пределами закрашено. Поэтому модуль не знает про view.
      if (obstacle.x + OBSTACLES.columnWidth < 0) {
        free.push(obstacle);
        active[i] = active[active.length - 1];
        active.length--;
      }
    }

    distanceSinceSpawn += distance;
    while (distanceSinceSpawn >= OBSTACLES.interval) {
      distanceSinceSpawn -= OBSTACLES.interval;
      // Сдвигаем на перелёт: иначе шаг между колоннами «дышал» бы на длину
      // кадра, а так расстояние между соседями ровно interval.
      spawn(VIEW.coreWidth - distanceSinceSpawn, gapHeight, maxGapShift);
    }
  }

  /** Полный сброс при рестарте: всё живое возвращаем в пул, не аллоцируя. */
  function reset() {
    for (const obstacle of active) free.push(obstacle);
    active.length = 0;
    distanceSinceSpawn = 0;
    lastGapCenter = VIEW.coreHeight / 2;
  }

  return {
    /** Живые препятствия. Наружу отдаём как есть — рендер снаружи. */
    list: active,
    update,
    reset,
    get alive() { return active.length; },
    get capacity() { return active.length + free.length; },
    get allocated() { return allocated; },
  };
}
