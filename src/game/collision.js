import { VIEW, PLAYER, OBSTACLES, COINS } from '../config.js';

/**
 * Столкновения. Модуль чистый: получает состояние игрока и список препятствий,
 * отвечает true/false. Ни про рендер, ни про состояния игры не знает.
 */

/**
 * Круг против прямоугольника через ближайшую точку.
 *
 * Берём точку прямоугольника, ближайшую к центру круга: по каждой оси это
 * центр, зажатый в границы прямоугольника. Если центр внутри по оси — координата
 * остаётся своя, если снаружи — прилипает к ближайшей грани. Дальше сравниваем
 * расстояние до этой точки с радиусом, в квадратах, чтобы не считать корень.
 *
 * Это важнее, чем кажется. Проверка по габаритным прямоугольникам считала бы
 * столкновением ситуацию, когда светлячок обходит угол колонны по диагонали и
 * реально её не касается — а угол прохода игрок задевает в каждой второй
 * партии. Такие смерти читаются как нечестные.
 */
function circleHitsRect(cx, cy, radius, rectX, rectY, rectWidth, rectHeight) {
  const closestX = Math.min(Math.max(cx, rectX), rectX + rectWidth);
  const closestY = Math.min(Math.max(cy, rectY), rectY + rectHeight);
  const dx = cx - closestX;
  const dy = cy - closestY;
  // Строгое «меньше»: касание впритык смертью не считается.
  return dx * dx + dy * dy < radius * radius;
}

/** Пол — смерть. Потолок игрок просто не может пройти, это делает player.js. */
export function hitsFloor(player) {
  return player.y + PLAYER.radius >= VIEW.coreHeight;
}

export function hitsObstacles(player, obstacles) {
  for (const obstacle of obstacles) {
    // Высоту прохода берём с самого препятствия: она зафиксирована при спавне
    // и не меняется, когда сложность сужает проход для следующих колонн.
    const half = obstacle.gapHeight / 2;
    const gapTop = obstacle.gapCenter - half;
    const gapBottom = obstacle.gapCenter + half;

    const hitsTop = circleHitsRect(
      player.x, player.y, PLAYER.radius,
      obstacle.x, 0, OBSTACLES.columnWidth, gapTop,
    );
    if (hitsTop) return true;

    const hitsBottom = circleHitsRect(
      player.x, player.y, PLAYER.radius,
      obstacle.x, gapBottom, OBSTACLES.columnWidth, VIEW.coreHeight - gapBottom,
    );
    if (hitsBottom) return true;
  }

  return false;
}

/**
 * Насколько близко светлячок прошёл к кромке прохода, wu.
 *
 * Считается только пока он перекрывается с колонной по горизонтали — иначе
 * «еле проскочил» засчитывалось бы за метр до препятствия. Возвращает меньший
 * из двух зазоров, сверху и снизу; отрицательное значение означает касание,
 * но до него дело не доходит: столкновение ловится раньше.
 */
export function gapClearance(player, obstacle) {
  const overlapsHorizontally =
    player.x + PLAYER.radius > obstacle.x &&
    player.x - PLAYER.radius < obstacle.x + OBSTACLES.columnWidth;
  if (!overlapsHorizontally) return Infinity;

  const half = obstacle.gapHeight / 2;
  const aboveGapEdge = player.y - PLAYER.radius - (obstacle.gapCenter - half);
  const belowGapEdge = (obstacle.gapCenter + half) - (player.y + PLAYER.radius);
  return Math.min(aboveGapEdge, belowGapEdge);
}

/** Круг против круга — для монет достаточно расстояния между центрами. */
export function touchesCoin(player, coin) {
  const dx = player.x - coin.x;
  const dy = player.y - coin.y;
  const reach = PLAYER.radius + COINS.radius;
  return dx * dx + dy * dy < reach * reach;
}
