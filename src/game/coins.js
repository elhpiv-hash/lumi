import { VIEW, OBSTACLES, COINS } from '../config.js';

/**
 * Монеты: летят вместе с миром, собираются касанием.
 *
 * Пул устроен как у лиан и частиц — на старте создаём poolSize штук и больше
 * не аллоцируем. Про время модуль не знает: снаружи приходит уже пройденное
 * за шаг расстояние, ровно как у препятствий.
 *
 * Монета выкладывается не там же, где лиана, а на полпути до следующей —
 * то есть на свободном участке. И не по центру прохода, а со смещением:
 * иначе она собиралась бы сама собой по оптимальной траектории и ничего
 * бы не решала.
 */
export function createCoins() {
  const free = [];
  const active = [];
  let allocated = 0;

  function create() {
    allocated++;
    return { x: 0, previousX: 0, y: 0, phase: 0 };
  }

  for (let i = 0; i < COINS.poolSize; i++) free.push(create());

  /** gapCenter — проход лианы, за которой выкладываем монету. */
  function spawn(obstacleX, gapCenter, gapHeight) {
    if (Math.random() > COINS.chance) return;
    if (free.length === 0) return;

    const coin = free.pop();
    // Ставим за лианой, а не перед ней: там мир ещё за краем поля, и монета
    // въезжает в кадр, а не возникает посреди него.
    coin.x = obstacleX + OBSTACLES.interval / 2;
    coin.previousX = coin.x;

    const drift = (Math.random() * 2 - 1) * COINS.offset;
    const lowest = OBSTACLES.edgeMargin + COINS.radius;
    const highest = VIEW.coreHeight - OBSTACLES.edgeMargin - COINS.radius;
    coin.y = Math.min(Math.max(gapCenter + drift, lowest), highest);
    // Разная фаза вращения, чтобы монеты не мигали в унисон.
    coin.phase = Math.random() * Math.PI * 2;

    active.push(coin);
  }

  function release(index) {
    free.push(active[index]);
    active[index] = active[active.length - 1];
    active.length--;
  }

  function update(distance) {
    for (let i = active.length - 1; i >= 0; i--) {
      const coin = active[i];
      coin.previousX = coin.x;
      coin.x -= distance;
      if (coin.x + COINS.radius < 0) release(i);
    }
  }

  function reset() {
    for (const coin of active) free.push(coin);
    active.length = 0;
  }

  return {
    list: active,
    spawn,
    update,
    reset,
    /** Убрать собранную монету. Индекс приходит из проверки столкновений. */
    collect: release,
    get alive() { return active.length; },
    get capacity() { return active.length + free.length; },
    get allocated() { return allocated; },
  };
}
