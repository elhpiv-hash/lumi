import { PLAYER, VIEW } from '../config.js';

/**
 * Светлячок: чистая физика вертикали.
 *
 * Не знает ни про canvas, ни про ввод — получает dt, отдаёт состояние.
 * Поэтому его можно гонять в Node без браузера, чем я и проверял баланс.
 * По горизонтали он стоит на месте: мимо него едет мир.
 */
export function createPlayer() {
  const state = {
    x: PLAYER.x,
    y: PLAYER.startY,
    /** Высота на прошлом шаге — для интерполяции в render, как у зонда шага 1. */
    previousY: PLAYER.startY,
    velocityY: 0,
  };

  let hoverTime = 0;

  function reset() {
    state.y = PLAYER.startY;
    state.previousY = PLAYER.startY;
    state.velocityY = 0;
    hoverTime = 0;
  }

  function flap() {
    // Присваивание, а не сложение: взмах всегда даёт одну и ту же скорость.
    // Иначе серия быстрых тапов складывается и выстреливает светлячка в потолок.
    state.velocityY = -PLAYER.flapImpulse;
  }

  /** Покачивание до начала партии. Гравитация в это время не работает. */
  function hover(dt) {
    hoverTime += dt;
    state.previousY = state.y;
    state.y = PLAYER.startY + Math.sin(hoverTime * PLAYER.hoverRate) * PLAYER.hoverAmplitude;
    state.velocityY = 0;
  }

  function update(dt) {
    state.previousY = state.y;

    // Смещаемся на средней скорости за шаг, а не на конечной. Для постоянного
    // ускорения это точно, а не приближённо: высота взмаха совпадает с формулой
    // v^2/2g. При наивном варианте она была бы ниже на v*dt/2, то есть числа
    // в config.js врали бы и балансировать пришлось бы вслепую.
    const previousVelocity = state.velocityY;
    state.velocityY = Math.min(previousVelocity + PLAYER.gravity * dt, PLAYER.maxFallSpeed);
    state.y += (previousVelocity + state.velocityY) * 0.5 * dt;

    // Потолок — упор, а не смерть. Пола здесь нет намеренно: касание земли
    // ловит collision.js и это конец партии.
    const ceiling = PLAYER.radius;
    if (state.y < ceiling) {
      state.y = ceiling;
      state.velocityY = 0;
    }
  }

  return { state, reset, flap, hover, update };
}
