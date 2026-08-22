import { PARTICLES } from '../config.js';

const TAU = Math.PI * 2;

/**
 * Частицы: искры, шлейф, разлёт на смерти.
 *
 * Пул устроен как у препятствий — на старте создаём poolSize штук и больше
 * не аллоцируем никогда. Кончился запас — новые искры просто не появятся:
 * это украшение, и терять кадры ради него нельзя.
 *
 * Модуль не знает про canvas: считает физику в update и отдаёт список наружу.
 * previousX/previousY хранятся, чтобы render мог интерполировать по alpha —
 * иначе искры дёргались бы на фоне плавного светлячка.
 */
export function createParticles() {
  const free = [];
  const active = [];
  let allocated = 0;

  function create() {
    allocated++;
    return {
      x: 0, y: 0, previousX: 0, previousY: 0,
      vx: 0, vy: 0,
      life: 0, maxLife: 1,
      size: 1, color: '#fff',
      gravity: 0, drag: 0,
    };
  }

  for (let i = 0; i < PARTICLES.poolSize; i++) free.push(create());

  /**
   * Выпускает count частиц из точки. preset — статический объект из config.js,
   * baseVx/baseVy добавляют общий снос (шлейф должен уезжать вместе с миром).
   */
  function emit(x, y, count, preset, baseVx, baseVy) {
    for (let i = 0; i < count; i++) {
      if (free.length === 0) return;
      const particle = free.pop();

      const angle = Math.random() * TAU;
      const speed = preset.speed * (0.35 + Math.random() * 0.65);
      const spread = preset.spawnRadius * Math.random();

      particle.x = x + Math.cos(angle) * spread;
      particle.y = y + Math.sin(angle) * spread;
      particle.previousX = particle.x;
      particle.previousY = particle.y;
      particle.vx = Math.cos(angle) * speed + baseVx;
      particle.vy = Math.sin(angle) * speed + baseVy;
      particle.maxLife = preset.life * (0.7 + Math.random() * 0.6);
      particle.life = particle.maxLife;
      particle.size = preset.size * (0.7 + Math.random() * 0.6);
      particle.color = preset.color;
      particle.gravity = preset.gravity;
      particle.drag = preset.drag;

      active.push(particle);
    }
  }

  function update(dt) {
    for (let i = active.length - 1; i >= 0; i--) {
      const particle = active[i];
      particle.previousX = particle.x;
      particle.previousY = particle.y;

      // Линейное затухание, а не степенное: pow на частицу на шаг стоил бы
      // дороже всего остального вместе взятого. drag*dt здесь всегда << 1.
      const damping = particle.drag * dt;
      particle.vy += particle.gravity * dt;
      particle.vx -= particle.vx * damping;
      particle.vy -= particle.vy * damping;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;

      if (particle.life <= 0) {
        free.push(particle);
        active[i] = active[active.length - 1];
        active.length--;
      }
    }
  }

  function reset() {
    for (const particle of active) free.push(particle);
    active.length = 0;
  }

  return {
    list: active,
    emit,
    update,
    reset,
    get alive() { return active.length; },
    get capacity() { return active.length + free.length; },
    get allocated() { return allocated; },
  };
}
