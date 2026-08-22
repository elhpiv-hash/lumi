/**
 * Игровой цикл с фиксированным шагом.
 *
 * Кадр может занять 8 мс, 16 мс или 40 мс — симуляция об этом не знает:
 * update() всегда вызывается с одинаковым dt, столько раз, сколько времени
 * накопил аккумулятор. Остаток аккумулятора уходит в render() как alpha [0,1)
 * — коэффициент интерполяции между предыдущим и текущим шагом, чтобы картинка
 * была плавной даже когда шаг симуляции не совпадает с частотой экрана.
 */
export function createLoop({ update, render, step, maxFrameTime }) {
  let rafId = 0;
  let running = false;
  let lastTime = 0;
  let startTime = 0;
  let accumulator = 0;

  // Окно усреднения для fps/ups.
  let windowStart = 0;
  let windowFrames = 0;
  let windowSteps = 0;

  const stats = {
    fps: 0,        // кадров в секунду (сколько раз позвали render)
    ups: 0,        // шагов симуляции в секунду (должно быть ровно 1/step)
    frameMs: 0,    // средняя длина кадра
    simTime: 0,    // сколько секунд просимулировано
    wallTime: 0,   // сколько секунд прошло по часам с момента старта
    drift: 0,      // хвост аккумулятора: недосимулированное время, всегда < step
  };

  function frame(now) {
    rafId = requestAnimationFrame(frame);

    // Клампим, а не догоняем: после долгого лага лучше «потерять» время,
    // чем прогнать сотню шагов подряд и уронить кадр окончательно.
    const frameTime = Math.min(Math.max((now - lastTime) / 1000, 0), maxFrameTime);
    lastTime = now;
    accumulator += frameTime;

    while (accumulator >= step) {
      update(step);
      accumulator -= step;
      stats.simTime += step;
      windowSteps++;
    }

    render(accumulator / step);

    windowFrames++;
    const windowMs = now - windowStart;
    if (windowMs >= 500) {
      stats.fps = (windowFrames * 1000) / windowMs;
      stats.ups = (windowSteps * 1000) / windowMs;
      stats.frameMs = windowMs / windowFrames;
      windowStart = now;
      windowFrames = 0;
      windowSteps = 0;
    }

    stats.wallTime = (now - startTime) / 1000;
    stats.drift = accumulator;
  }

  // Пока вкладка скрыта, requestAnimationFrame не тикает. При возврате
  // сбрасываем точку отсчёта, иначе первый кадр придёт с дельтой в минуты.
  function onVisibility() {
    if (!document.hidden) lastTime = performance.now();
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = performance.now();
    startTime = lastTime;
    windowStart = lastTime;
    accumulator = 0;
    document.addEventListener('visibilitychange', onVisibility);
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    document.removeEventListener('visibilitychange', onVisibility);
  }

  return { start, stop, stats };
}
