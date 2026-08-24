import { PLAYER, OBSTACLES, RULES, JUICE, SPARKS } from '../config.js';
import { createPlayer } from './player.js';
import { createObstacles } from './obstacles.js';
import { createDifficulty } from './difficulty.js';
import { createBiome } from './biomes.js';
import { createScore } from './score.js';
import { createParticles } from '../engine/particles.js';
import { hitsFloor, hitsObstacles, gapClearance } from './collision.js';

export const STATE = {
  ready: 'ready',
  playing: 'playing',
  paused: 'paused',
  dead: 'dead',
};

/**
 * Машина состояний и правила партии.
 *
 * Владеет миром (игрок, препятствия, сложность, частицы, счёт) и решает, что
 * значит «взмах» прямо сейчас. Про canvas не знает ничего: main.js берёт отсюда
 * состояние и рисует.
 *
 * Состояния разведены таблицей, а не цепочкой if. Каждое — пара update/flap,
 * переход состоит ровно в подмене ключа. Добавить паузу будет означать
 * дописать одну запись, а не искать все ветвления по файлу.
 *
 * Звук инжектится снаружи: модуль не должен знать ни про WebAudio, ни про то,
 * что звук вообще существует — ему хватает объекта с методом play.
 */
export function createGame(audio) {
  const player = createPlayer();
  const obstacles = createObstacles();
  const difficulty = createDifficulty();
  const biome = createBiome();
  const particles = createParticles();
  const score = createScore();

  let state = STATE.ready;
  let stateTime = 0;
  let deadTime = 0;
  let shakeTime = 0;
  let nearMissTime = 0;
  let scorePop = 0;
  /** Общее время симуляции. Не сбрасывается: по нему идут моргание и трепет крыльев. */
  let clock = 0;
  let trailAccumulator = 0;

  function enter(next) {
    state = next;
    stateTime = 0;
  }

  function emitTrail(dt, drift) {
    const interval = 1 / JUICE.trailPerSecond;
    trailAccumulator += dt;
    while (trailAccumulator >= interval) {
      trailAccumulator -= interval;
      particles.emit(player.state.x, player.state.y, 1, SPARKS.trail, drift, 0);
    }
  }

  function start() {
    enter(STATE.playing);
    doFlap();
  }

  function doFlap() {
    player.flap();
    // Искры летят вниз — как отдача от рывка вверх.
    particles.emit(
      player.state.x, player.state.y + PLAYER.radius * 0.6,
      JUICE.flapSparks, SPARKS.flap, -difficulty.speed, 14,
    );
    audio.play('flap');
  }

  function die() {
    enter(STATE.dead);
    deadTime = 0;
    shakeTime = JUICE.shakeDuration;
    particles.emit(
      player.state.x, player.state.y,
      JUICE.deathSparks, SPARKS.death, -difficulty.speed * 0.4, 0,
    );
    audio.play('death');
    score.commit();
  }

  function pause() {
    if (state !== STATE.playing) return;
    enter(STATE.paused);
  }

  function resume() {
    if (state !== STATE.paused) return;
    enter(STATE.playing);
  }

  function restart() {
    player.reset();
    obstacles.reset();
    difficulty.reset();
    biome.reset();
    particles.reset();
    score.reset();
    shakeTime = 0;
    nearMissTime = 0;
    scorePop = 0;
    trailAccumulator = 0;
    start();
  }

  /** Начисляем очко, когда колонна целиком ушла левее центра светлячка. */
  function countPassed() {
    for (const obstacle of obstacles.list) {
      if (!obstacle.passed && obstacle.x + OBSTACLES.columnWidth < player.state.x) {
        obstacle.passed = true;
        score.add();
        scorePop = JUICE.scorePop;
        audio.play('score');
      }
    }
  }

  /** «Еле проскочил»: засчитываем один раз на препятствие. */
  function countNearMiss() {
    for (const obstacle of obstacles.list) {
      if (obstacle.nearMissed) continue;
      if (gapClearance(player.state, obstacle) >= JUICE.nearMissDistance) continue;

      obstacle.nearMissed = true;
      nearMissTime = JUICE.nearMissFlash;
      particles.emit(
        player.state.x, player.state.y,
        JUICE.nearMissSparks, SPARKS.nearMiss, -difficulty.speed, 0,
      );
      audio.play('nearMiss');
    }
  }

  const behaviour = {
    [STATE.ready]: {
      update(dt) {
        player.hover(dt);
        emitTrail(dt, 0);
      },
      flap() {
        start();
      },
    },

    [STATE.playing]: {
      update(dt) {
        player.update(dt);
        // difficulty отдаёт пройденный за шаг путь — им и двигаем мир, чтобы
        // расстояние в сложности и сдвиг колонн были одним и тем же числом.
        const travelled = difficulty.advance(dt);
        obstacles.update(travelled, difficulty.gapHeight, difficulty.maxGapShift);
        biome.update(difficulty.distance);
        emitTrail(dt, -difficulty.speed);
        countPassed();
        countNearMiss();
        if (hitsFloor(player.state) || hitsObstacles(player.state, obstacles.list)) die();
      },
      flap() {
        doFlap();
      },
    },

    [STATE.paused]: {
      // Мир замер целиком: ни физики, ни частиц, ни трепета крыльев.
      update() {},
      flap() {
        resume();
      },
    },

    [STATE.dead]: {
      update(dt) {
        // Физика мира стоит, идёт только отсчёт паузы перед принятием рестарта.
        deadTime += dt;
      },
      flap() {
        if (deadTime >= RULES.restartLock) restart();
      },
    },
  };

  return {
    player,
    obstacles,
    difficulty,
    biome,
    particles,
    score,

    get state() { return state; },
    /** Секунд в текущем состоянии — по нему экраны плавно проявляются. */
    get stateTime() { return stateTime; },
    get shakeTime() { return shakeTime; },
    get nearMissTime() { return nearMissTime; },
    /** Секунды, оставшиеся от подскока счёта после очка. */
    get scorePop() { return scorePop; },
    get clock() { return clock; },
    /** Готов ли экран смерти принять тап — чтобы не звать в пустоту. */
    get restartArmed() { return deadTime >= RULES.restartLock; },

    pause,
    resume,

    update(dt) {
      behaviour[state].update(dt);
      // Время экрана идёт всегда: на паузе по нему проявляется её собственный
      // экран. Всё остальное на паузе стоит.
      stateTime += dt;
      if (state === STATE.paused) return;

      // Частицы живут во всех прочих состояниях: искры смерти должны догореть,
      // а шлейф — рассеяться.
      particles.update(dt);
      clock += dt;
      if (shakeTime > 0) shakeTime = Math.max(0, shakeTime - dt);
      if (nearMissTime > 0) nearMissTime = Math.max(0, nearMissTime - dt);
      if (scorePop > 0) scorePop = Math.max(0, scorePop - dt);
    },

    flap() { behaviour[state].flap(); },
  };
}
