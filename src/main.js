import { LOOP, VIEW, PIXEL, PLAYER, FACE, OBSTACLES, JUICE, HUD, COLORS, DEBUG } from './config.js';
import { createRenderer } from './engine/canvas.js';
import { createLoop } from './engine/loop.js';
import { createInput } from './engine/input.js';
import { createAudio } from './engine/audio.js';
import { createGame, STATE } from './game/states.js';
import { createBackground } from './game/background.js';

/**
 * Шрифт нарочно круглый и детский. Порядок стека и решает вид: на Windows
 * сработает Comic Sans MS, на мобилках — системный. Не нравится — поменяй
 * порядок здесь, это единственное место.
 */
const FONT = '"Baloo 2", Fredoka, "Comic Sans MS", "Trebuchet MS", system-ui, sans-serif';

/** Размер одного пикселя буфера в мировых единицах. Вся отрисовка кратна ему. */
const UNIT = 1 / PIXEL.perUnit;

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const { ctx, view } = renderer;
const audio = createAudio();
const game = createGame(audio);
const background = createBackground();

/** Кнопка звука хранится в мировых единицах — тап переводим в мир, а не наоборот. */
const muteTarget = { x: 0, y: 0, radius: 0 };

// Взмах не применяем прямо в обработчике события: команда легла бы в физику
// в произвольный момент между шагами, и симуляция снова стала бы зависеть
// от частоты кадров. Копим флаг, забираем в update на границе шага.
let flapRequested = false;

createInput(canvas, {
  onFlap(x, y) {
    // Единственное место, где жест пользователя ещё «свежий»: браузеры не дают
    // заводить AudioContext вне обработчика ввода.
    audio.unlock();
    if (hitsMuteButton(x, y)) {
      audio.toggle();
      return;
    }
    flapRequested = true;
  },
  onToggleSound() {
    audio.unlock();
    audio.toggle();
  },
});

function hitsMuteButton(cssX, cssY) {
  if (Number.isNaN(cssX) || muteTarget.radius === 0) return false;
  const worldX = view.left + cssX / view.scale;
  const worldY = view.top + cssY / view.scale;
  const dx = worldX - muteTarget.x;
  const dy = worldY - muteTarget.y;
  return dx * dx + dy * dy < muteTarget.radius * muteTarget.radius;
}

function lerp(from, to, alpha) {
  return from + (to - from) * alpha;
}

function snap(value) {
  return Math.round(value / UNIT) * UNIT;
}

/** Прямоугольник, выровненный по сетке буфера. */
function pixelRect(x, y, width, height) {
  const x0 = snap(x);
  const y0 = snap(y);
  const x1 = snap(x + width);
  const y1 = snap(y + height);
  if (x1 > x0 && y1 > y0) ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
}

/** Один пиксель со смещением в пикселях от центра — для мелких деталей мордочки. */
function plot(centerX, centerY, offsetX, offsetY) {
  ctx.fillRect(snap(centerX) + offsetX * UNIT, snap(centerY) + offsetY * UNIT, UNIT, UNIT);
}

/**
 * Эллипс горизонтальными полосами по сетке.
 *
 * Именно так, а не через arc: arc сглаживает края, и после растягивания буфера
 * сглаженная кайма превращается в грязные полупрозрачные блоки. Полосами край
 * получается честно ступенчатым.
 */
function pixelEllipse(centerX, centerY, radiusX, radiusY) {
  const rx = radiusX / UNIT;
  const ry = radiusY / UNIT;
  if (rx < 0.5 || ry < 0.5) {
    pixelRect(centerX - UNIT / 2, centerY - UNIT / 2, UNIT, UNIT);
    return;
  }
  const cx = centerX / UNIT;
  const cy = centerY / UNIT;
  const from = Math.round(cy - ry);
  const to = Math.round(cy + ry);
  for (let row = from; row < to; row++) {
    const normalized = (row + 0.5 - cy) / ry;
    const half = rx * Math.sqrt(Math.max(0, 1 - normalized * normalized));
    const x0 = Math.round(cx - half);
    const x1 = Math.round(cx + half);
    if (x1 > x0) ctx.fillRect(x0 * UNIT, row * UNIT, (x1 - x0) * UNIT, UNIT);
  }
}

function pixelCircle(centerX, centerY, radius) {
  pixelEllipse(centerX, centerY, radius, radius);
}

/** Столбик со скруглением «лесенкой»: в пикселях гладких углов не бывает. */
function pixelColumn(x, y, width, height, roundTop, roundBottom) {
  const steps = PIXEL.cornerSteps;
  const top = roundTop ? steps : 0;
  const bottom = roundBottom ? steps : 0;
  pixelRect(x, y + top * UNIT, width, height - (top + bottom) * UNIT);
  for (let i = 0; i < top; i++) {
    const inset = (top - i) * UNIT;
    pixelRect(x + inset, y + i * UNIT, width - inset * 2, UNIT);
  }
  for (let i = 0; i < bottom; i++) {
    const inset = (bottom - i) * UNIT;
    pixelRect(x + inset, y + height - (i + 1) * UNIT, width - inset * 2, UNIT);
  }
}

function update(dt) {
  if (flapRequested) {
    flapRequested = false;
    game.flap();
  }
  game.update(dt);
  // Музыка густеет вместе со сложностью — тем же числом, что гонит мир.
  audio.setIntensity(game.difficulty.progress);
}

function render(alpha) {
  renderer.beginWorld();
  background.renderSky(ctx, view, game.difficulty.warmth);
  background.renderStars(ctx, view, lerp(game.difficulty.previousDistance, game.difficulty.distance, alpha));

  ctx.save();
  applyShake();
  renderObstacles(alpha);
  renderParticles(alpha);
  renderPlayer(alpha);
  ctx.restore();

  // Рама рисуется без тряски: иначе на её краю мелькала бы щель.
  background.renderFrame(ctx, view);
  renderHud();
  if (DEBUG.stats) renderStats();

  // Буфер готов — растягиваем его на экран без сглаживания.
  renderer.present();
}

/** Крошечная тряска на смерти. Сдвиг кратен пикселю, иначе поедет вся сетка. */
function applyShake() {
  if (game.shakeTime <= 0) return;
  const decay = game.shakeTime / JUICE.shakeDuration;
  const amplitude = JUICE.shakeAmplitude * decay * decay;
  const elapsed = JUICE.shakeDuration - game.shakeTime;
  ctx.translate(
    snap(Math.sin(elapsed * JUICE.shakeFrequency) * amplitude),
    snap(Math.cos(elapsed * JUICE.shakeFrequency * 1.37) * amplitude),
  );
}

/**
 * Препятствия — лианы: тело со ступенчатым торцом, светлая грань для объёма,
 * шляпка у прохода и три ягодки. Обводка рисуется не штрихом, а той же фигурой
 * на пиксель больше: штрих в пиксельной графике всегда мылит край.
 */
function renderObstacles(alpha) {
  for (const obstacle of game.obstacles.list) {
    const x = snap(lerp(obstacle.previousX, obstacle.x, alpha));
    const half = obstacle.gapHeight / 2;
    const gapTop = snap(obstacle.gapCenter - half);
    const gapBottom = snap(obstacle.gapCenter + half);

    // Уводим дальние торцы за поле, чтобы обводка не рисовала линию поперёк
    // экрана. Всё лишнее потом закроет рама.
    drawVine(x, -8, gapTop + 8, false);
    drawVine(x, gapBottom, VIEW.coreHeight - gapBottom + 8, true);
  }
}

function drawVine(x, y, height, capOnTop) {
  if (height <= 0) return;
  const { columnWidth, capHeight, capOverhang } = OBSTACLES;
  const roundTop = capOnTop;
  const roundBottom = !capOnTop;

  ctx.fillStyle = COLORS.obstacleOutline;
  pixelColumn(x - UNIT, y - UNIT, columnWidth + UNIT * 2, height + UNIT * 2, roundTop, roundBottom);

  ctx.fillStyle = COLORS.obstacle;
  pixelColumn(x, y, columnWidth, height, roundTop, roundBottom);

  const inset = UNIT * 2;
  if (height > inset * 4) {
    ctx.fillStyle = COLORS.obstacleLight;
    pixelRect(x + inset, y + inset * 2, UNIT * 2, height - inset * 4);
  }

  const capY = capOnTop ? y : y + height - capHeight;
  ctx.fillStyle = COLORS.obstacleOutline;
  pixelColumn(x - capOverhang - UNIT, capY - UNIT, columnWidth + capOverhang * 2 + UNIT * 2, capHeight + UNIT * 2, true, true);
  ctx.fillStyle = COLORS.obstacleCap;
  pixelColumn(x - capOverhang, capY, columnWidth + capOverhang * 2, capHeight, true, true);

  ctx.fillStyle = COLORS.obstacleBerry;
  for (let i = 0; i < 3; i++) {
    pixelCircle(x + columnWidth * (0.2 + i * 0.3), capY + capHeight * 0.5, capHeight * 0.2);
  }
}

/** Искры — квадратные пиксели. В пиксельной графике это и уместнее, и дешевле. */
function renderParticles(alpha) {
  for (const particle of game.particles.list) {
    const life = particle.life / particle.maxLife;
    ctx.globalAlpha = life * life;
    ctx.fillStyle = particle.color;
    const size = Math.max(UNIT, snap(particle.size * (0.4 + 0.6 * life)));
    pixelRect(
      lerp(particle.previousX, particle.x, alpha) - size / 2,
      lerp(particle.previousY, particle.y, alpha) - size / 2,
      size, size,
    );
  }
  ctx.globalAlpha = 1;
}

/**
 * Светлячок с мордочкой.
 *
 * Никаких rotate и scale: любой поворот или дробное масштабирование увели бы
 * фигуру с пиксельной сетки, и края поплыли бы. Сплющивание на взмахе делаем
 * честно — разными радиусами эллипса, наклон передаём смещением зрачков
 * и высотой крыльев.
 */
function renderPlayer(alpha) {
  const { x, y, previousY, velocityY } = game.player.state;
  const centerX = snap(x);
  const centerY = snap(lerp(previousY, y, alpha));
  const radius = PLAYER.radius;
  const clock = game.clock;
  const lean = Math.max(-1, Math.min(1, velocityY / PLAYER.maxFallSpeed));
  const stretch = Math.abs(lean) * JUICE.maxStretch;
  const radiusX = radius * (1 - stretch * 0.5);
  const radiusY = radius * (1 + stretch);
  const boost = 1 + (game.nearMissTime / JUICE.nearMissFlash) * 0.6;

  ctx.fillStyle = COLORS.playerHalo;
  pixelCircle(centerX, centerY, radius * 3.2 * boost);
  ctx.fillStyle = COLORS.playerGlow;
  pixelCircle(centerX, centerY, radius * 1.9 * boost);

  // Крылья: трепет передаём высотой, а не поворотом.
  const beat = 0.55 + Math.sin(clock * FACE.wingRate) * 0.45;
  const wingHeight = radius * FACE.wingSpan * 0.5 * beat;
  ctx.fillStyle = COLORS.playerWing;
  for (let side = -1; side <= 1; side += 2) {
    pixelEllipse(centerX + side * radiusX * 0.85, centerY - radiusY * 0.75, radiusX * 0.45, wingHeight);
  }

  ctx.fillStyle = COLORS.playerOutline;
  pixelEllipse(centerX, centerY, radiusX + UNIT, radiusY + UNIT);
  ctx.fillStyle = COLORS.playerBody;
  pixelEllipse(centerX, centerY, radiusX, radiusY);
  ctx.fillStyle = COLORS.playerBelly;
  pixelEllipse(centerX, centerY + radiusY * 0.42, radiusX * 0.5, radiusY * 0.4);

  const dizzy = game.state === STATE.dead;
  const blinking = clock % FACE.blinkEvery < FACE.blinkDuration;
  const look = Math.round(lean * FACE.lookShift * radius / UNIT);
  const eyeY = centerY + radiusY * FACE.eyeOffsetY;

  for (let side = -1; side <= 1; side += 2) {
    const eyeX = centerX + side * radiusX * FACE.eyeOffsetX;

    if (dizzy) {
      ctx.fillStyle = COLORS.playerPupil;
      for (let i = -1; i <= 1; i++) {
        plot(eyeX, eyeY, i, i);
        plot(eyeX, eyeY, i, -i);
      }
    } else if (blinking) {
      ctx.fillStyle = COLORS.playerPupil;
      for (let i = -1; i <= 1; i++) plot(eyeX, eyeY, i, 0);
    } else {
      ctx.fillStyle = COLORS.playerEye;
      pixelCircle(eyeX, eyeY, radius * FACE.eyeRadius);
      ctx.fillStyle = COLORS.playerPupil;
      pixelCircle(eyeX, eyeY + look * UNIT, radius * FACE.pupilRadius);
    }
  }

  // Рот выкладываем пикселями поштучно: на такой сетке дуга через arc
  // превратилась бы в мутное пятно.
  ctx.fillStyle = COLORS.playerPupil;
  const mouthY = centerY + radiusY * FACE.smileDrop;
  if (dizzy || lean > FACE.surprisedFrom) {
    plot(centerX, mouthY, -1, 0);
    plot(centerX, mouthY, 0, -1);
    plot(centerX, mouthY, 1, 0);
    plot(centerX, mouthY, 0, 1);
  } else {
    plot(centerX, mouthY, -2, -1);
    plot(centerX, mouthY, -1, 0);
    plot(centerX, mouthY, 0, 0);
    plot(centerX, mouthY, 1, 0);
    plot(centerX, mouthY, 2, -1);
  }
}

/**
 * HUD рисуем в пикселях буфера, а не в мировых единицах: так размеры шрифта
 * получаются нормальными числами, а не долями, и текст пикселизуется вместе
 * со всем остальным при растягивании буфера.
 */
function renderHud() {
  renderer.beginScreen();
  const unit = PIXEL.perUnit;
  const centerX = (VIEW.coreWidth / 2 - view.left) * unit;
  const write = (text, size, worldY, color, scale) => {
    const fontSize = size * unit * (scale || 1);
    const y = (worldY - view.top) * unit;
    ctx.font = `800 ${fontSize}px ${FONT}`;
    ctx.lineWidth = fontSize * HUD.textOutline;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = COLORS.textOutline;
    ctx.strokeText(text, centerX, y);
    ctx.fillStyle = color;
    ctx.fillText(text, centerX, y);
  };

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Плавное появление экрана: smoothstep вместо линейного, чтобы не дёргалось.
  const raw = Math.min(1, game.stateTime / HUD.fadeIn);
  const appear = raw * raw * (3 - 2 * raw);
  const breathe = 0.62 + 0.38 * Math.sin(game.stateTime * 2.6);

  if (game.state === STATE.ready) {
    ctx.globalAlpha = appear;
    write('LUMI', HUD.titleSize, 28, COLORS.hudStrong);
    ctx.globalAlpha = appear * breathe;
    write('тап, чтобы лететь', HUD.hintSize, 68, COLORS.hud);
  } else if (game.state === STATE.playing) {
    ctx.globalAlpha = appear;
    // Счёт подпрыгивает на каждом очке — маленькая награда за лиану.
    const pop = 1 + (game.scorePop / JUICE.scorePop) * 0.28;
    write(String(game.score.current), HUD.scoreSize, 16, COLORS.hudStrong, pop);
  } else {
    ctx.globalAlpha = appear;
    ctx.fillStyle = COLORS.deadVeil;
    ctx.fillRect(0, 0, view.bufferWidth, view.bufferHeight);

    write('счёт', HUD.labelSize, 34, COLORS.hudDim);
    write(String(game.score.current), HUD.scoreSize, 46, COLORS.hudStrong);
    if (game.score.beaten) {
      write('новый рекорд!', HUD.hintSize, 61, COLORS.record, 1 + Math.sin(game.clock * 5) * 0.05);
    } else {
      write(`рекорд ${game.score.best}`, HUD.hintSize, 61, COLORS.hud);
    }

    // Пока пауза после смерти не истекла, подсказка приглушена — тап всё равно
    // не сработает, и нечестно предлагать то, что не отвечает.
    ctx.globalAlpha = appear * (game.restartArmed ? breathe : 0.3);
    write('тап — ещё раз', HUD.hintSize, 78, COLORS.hud);
  }

  ctx.globalAlpha = 1;
  renderMuteButton();
}

/** Динамик выложен по клеткам 15x15 — векторная иконка на такой сетке размылась бы. */
function renderMuteButton() {
  const unit = PIXEL.perUnit;
  muteTarget.x = VIEW.coreWidth - HUD.muteMargin - HUD.muteSize / 2;
  muteTarget.y = HUD.muteMargin + HUD.muteSize / 2;
  muteTarget.radius = HUD.muteSize * 0.8;

  const originX = (VIEW.coreWidth - HUD.muteMargin - HUD.muteSize - view.left) * unit;
  const originY = (HUD.muteMargin - view.top) * unit;
  const cell = (HUD.muteSize * unit) / 15;

  const speaker = [[2, 6, 3, 3], [5, 5, 1, 5], [6, 4, 1, 7], [7, 3, 1, 9]];
  const waves = [[9, 6, 1, 3], [11, 4, 1, 7]];
  const cross = [[9, 5], [10, 6], [11, 7], [12, 8], [12, 5], [11, 6], [10, 7], [9, 8]];

  const box = (gx, gy, gw, gh, shiftX, shiftY) => {
    ctx.fillRect(
      Math.round(originX + (gx + shiftX) * cell),
      Math.round(originY + (gy + shiftY) * cell),
      Math.max(1, Math.round(gw * cell)),
      Math.max(1, Math.round(gh * cell)),
    );
  };

  const glyph = (shiftX, shiftY) => {
    for (const [gx, gy, gw, gh] of speaker) box(gx, gy, gw, gh, shiftX, shiftY);
    if (audio.enabled) {
      for (const [gx, gy, gw, gh] of waves) box(gx, gy, gw, gh, shiftX, shiftY);
    } else {
      for (const [gx, gy] of cross) box(gx, gy, 1, 1, shiftX, shiftY);
    }
  };

  ctx.globalAlpha = audio.enabled ? 0.95 : 0.5;
  ctx.fillStyle = COLORS.textOutline;
  glyph(1, 1);
  ctx.fillStyle = COLORS.hud;
  glyph(0, 0);
  ctx.globalAlpha = 1;
}

function renderStats() {
  const { fps, ups, frameMs, drift } = loop.stats;
  const lines = [
    `fps ${fps.toFixed(0)} / кадр ${frameMs.toFixed(1)}мс`,
    `ups ${ups.toFixed(0)} / drift ${(drift * 1000).toFixed(1)}мс`,
    `${game.state}  счёт ${game.score.current}  рекорд ${game.score.best}`,
    `путь ${game.difficulty.distance.toFixed(0)} скор ${game.difficulty.speed.toFixed(1)}`,
    `проход ${game.difficulty.gapHeight.toFixed(1)} скачок ${game.difficulty.maxGapShift.toFixed(1)}`,
    `лиан ${game.obstacles.alive}/${game.obstacles.allocated} искр ${game.particles.alive}/${game.particles.allocated}`,
    `буфер ${view.bufferWidth}x${view.bufferHeight} -> ${view.cssWidth}x${view.cssHeight}`,
  ];

  renderer.beginScreen();
  const size = Math.max(5, Math.round(view.bufferHeight * 0.026));
  ctx.font = `${size}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS.hud;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 4, 4 + i * (size + 2));
  }
}

const loop = createLoop({
  update,
  render,
  step: LOOP.step,
  maxFrameTime: LOOP.maxFrameTime,
});

loop.start();
