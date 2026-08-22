import { LOOP, VIEW, PLAYER, FACE, OBSTACLES, JUICE, HUD, COLORS, DEBUG } from './config.js';
import { createRenderer } from './engine/canvas.js';
import { createLoop } from './engine/loop.js';
import { createInput } from './engine/input.js';
import { createAudio } from './engine/audio.js';
import { createGame, STATE } from './game/states.js';
import { createBackground } from './game/background.js';

const TAU = Math.PI * 2;
/**
 * Шрифт нарочно круглый и детский. Порядок стека и решает вид: на Windows
 * сработает Comic Sans MS, на мобилках — системный. Не нравится — поменяй
 * порядок здесь, это единственное место.
 */
const FONT = '"Baloo 2", Fredoka, "Comic Sans MS", "Trebuchet MS", system-ui, sans-serif';
const HAS_ROUND_RECT = typeof CanvasRenderingContext2D.prototype.roundRect === 'function';

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const { ctx, view } = renderer;
const audio = createAudio();
const game = createGame(audio);
const background = createBackground();

/** Область кнопки звука в css-пикселях. Обновляется при отрисовке, читается при тапе. */
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

function hitsMuteButton(x, y) {
  if (Number.isNaN(x) || muteTarget.radius === 0) return false;
  const dx = x - muteTarget.x;
  const dy = y - muteTarget.y;
  return dx * dx + dy * dy < muteTarget.radius * muteTarget.radius;
}

function lerp(from, to, alpha) {
  return from + (to - from) * alpha;
}

function circle(x, y, radius) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

function roundedPath(x, y, width, height, topRadius, bottomRadius) {
  ctx.beginPath();
  if (HAS_ROUND_RECT) {
    ctx.roundRect(x, y, width, height, [topRadius, topRadius, bottomRadius, bottomRadius]);
  } else {
    ctx.rect(x, y, width, height);
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

  if (DEBUG.stats) {
    ctx.strokeStyle = COLORS.coreOutline;
    ctx.lineWidth = 0.3;
    ctx.strokeRect(0, 0, VIEW.coreWidth, VIEW.coreHeight);
  }

  renderHud();
  if (DEBUG.stats) renderStats();
}

/** Крошечная тряска на смерти. Затухает квадратично, чтобы обрывалась мягко. */
function applyShake() {
  if (game.shakeTime <= 0) return;
  const decay = game.shakeTime / JUICE.shakeDuration;
  const amplitude = JUICE.shakeAmplitude * decay * decay;
  const elapsed = JUICE.shakeDuration - game.shakeTime;
  ctx.translate(
    Math.sin(elapsed * JUICE.shakeFrequency) * amplitude,
    Math.cos(elapsed * JUICE.shakeFrequency * 1.37) * amplitude,
  );
}

/**
 * Препятствия — не колонны, а лианы: тело с толстой обводкой, светлая грань
 * для объёма, шляпка у прохода и три ягодки на ней. Всё плоскими заливками,
 * без градиентов: их пришлось бы пересоздавать на каждую лиану каждый кадр.
 */
function renderObstacles(alpha) {
  for (const obstacle of game.obstacles.list) {
    const x = lerp(obstacle.previousX, obstacle.x, alpha);
    const half = obstacle.gapHeight / 2;
    const gapTop = obstacle.gapCenter - half;
    const gapBottom = obstacle.gapCenter + half;

    // Уводим дальние торцы за поле, чтобы обводка не рисовала линию поперёк
    // экрана. Всё лишнее потом закроет рама.
    drawVine(x, -8, gapTop + 8, false);
    drawVine(x, gapBottom, VIEW.coreHeight - gapBottom + 8, true);
  }
}

function drawVine(x, y, height, capOnTop) {
  if (height <= 0) return;
  const { columnWidth, cornerRadius, capHeight, capOverhang } = OBSTACLES;

  ctx.lineWidth = FACE.outline;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = COLORS.obstacleOutline;

  ctx.fillStyle = COLORS.obstacle;
  roundedPath(x, y, columnWidth, height, capOnTop ? cornerRadius : 0, capOnTop ? 0 : cornerRadius);
  ctx.fill();
  ctx.stroke();

  const inset = columnWidth * 0.16;
  if (height > inset * 3) {
    ctx.fillStyle = COLORS.obstacleLight;
    const stripeRadius = columnWidth * 0.11;
    roundedPath(x + inset, y + inset, columnWidth * 0.22, height - inset * 2, stripeRadius, stripeRadius);
    ctx.fill();
  }

  const capY = capOnTop ? y : y + height - capHeight;
  ctx.fillStyle = COLORS.obstacleCap;
  roundedPath(x - capOverhang, capY, columnWidth + capOverhang * 2, capHeight, capHeight / 2, capHeight / 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = COLORS.obstacleBerry;
  for (let i = 0; i < 3; i++) {
    circle(x + columnWidth * (0.2 + i * 0.3), capY + capHeight * 0.5, capHeight * 0.17);
  }
}

function renderParticles(alpha) {
  for (const particle of game.particles.list) {
    const life = particle.life / particle.maxLife;
    ctx.globalAlpha = life * life;
    ctx.fillStyle = particle.color;
    circle(
      lerp(particle.previousX, particle.x, alpha),
      lerp(particle.previousY, particle.y, alpha),
      particle.size * (0.35 + 0.65 * life),
    );
  }
  ctx.globalAlpha = 1;
}

/**
 * Светлячок с мордочкой.
 *
 * Ореол рисуем до поворота, чтобы он не вытягивался вместе с телом. Наклон
 * и сплющивание — чисто визуальный отклик на вертикальную скорость: круг сам
 * по себе поворота не показывает, поэтому вместе с поворотом сжимаем его
 * по одной оси. Зрачки уезжают в сторону движения, рот на быстром падении
 * становится удивлённым «о», а после смерти глаза — крестики.
 */
function renderPlayer(alpha) {
  const { x, y, previousY, velocityY } = game.player.state;
  const drawY = lerp(previousY, y, alpha);
  const radius = PLAYER.radius;
  const clock = game.clock;
  const lean = Math.max(-1, Math.min(1, velocityY / PLAYER.maxFallSpeed));
  const stretch = Math.abs(lean) * JUICE.maxStretch;
  const boost = 1 + (game.nearMissTime / JUICE.nearMissFlash) * 0.6;

  ctx.fillStyle = COLORS.playerHalo;
  circle(x, drawY, radius * 3.4 * boost);
  ctx.fillStyle = COLORS.playerGlow;
  circle(x, drawY, radius * 2.0 * boost);

  ctx.save();
  ctx.translate(x, drawY);

  // Крылья за телом: трепещут всегда, поэтому светлячок «живой» даже в покое.
  const beat = Math.sin(clock * FACE.wingRate);
  ctx.fillStyle = COLORS.playerWing;
  ctx.strokeStyle = COLORS.playerOutline;
  ctx.lineWidth = FACE.outline * 0.5;
  for (let side = -1; side <= 1; side += 2) {
    ctx.save();
    ctx.translate(side * radius * 0.5, -radius * 0.5);
    ctx.rotate(side * (0.45 + beat * 0.35));
    ctx.beginPath();
    ctx.ellipse(0, -radius * FACE.wingSpan * 0.5, radius * 0.4, radius * FACE.wingSpan * 0.55, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.rotate(lean * JUICE.maxTilt);
  ctx.scale(1 - stretch * 0.5, 1 + stretch);

  ctx.lineWidth = FACE.outline;
  ctx.strokeStyle = COLORS.playerOutline;
  ctx.fillStyle = COLORS.playerBody;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = COLORS.playerBelly;
  circle(0, radius * 0.42, radius * 0.5);

  const dizzy = game.state === STATE.dead;
  const blinking = clock % FACE.blinkEvery < FACE.blinkDuration;
  const look = lean * FACE.lookShift * radius;
  ctx.lineCap = 'round';

  for (let side = -1; side <= 1; side += 2) {
    const eyeX = side * radius * FACE.eyeOffsetX;
    const eyeY = radius * FACE.eyeOffsetY;
    const eyeR = radius * FACE.eyeRadius;

    if (dizzy) {
      ctx.strokeStyle = COLORS.playerPupil;
      ctx.lineWidth = FACE.outline * 0.75;
      ctx.beginPath();
      ctx.moveTo(eyeX - eyeR * 0.8, eyeY - eyeR * 0.8);
      ctx.lineTo(eyeX + eyeR * 0.8, eyeY + eyeR * 0.8);
      ctx.moveTo(eyeX + eyeR * 0.8, eyeY - eyeR * 0.8);
      ctx.lineTo(eyeX - eyeR * 0.8, eyeY + eyeR * 0.8);
      ctx.stroke();
    } else if (blinking) {
      ctx.strokeStyle = COLORS.playerPupil;
      ctx.lineWidth = FACE.outline * 0.75;
      ctx.beginPath();
      ctx.moveTo(eyeX - eyeR * 0.9, eyeY);
      ctx.lineTo(eyeX + eyeR * 0.9, eyeY);
      ctx.stroke();
    } else {
      ctx.fillStyle = COLORS.playerEye;
      circle(eyeX, eyeY, eyeR);
      ctx.fillStyle = COLORS.playerPupil;
      circle(eyeX, eyeY + look, radius * FACE.pupilRadius);
    }
  }

  ctx.strokeStyle = COLORS.playerPupil;
  ctx.lineWidth = FACE.outline * 0.7;
  ctx.beginPath();
  if (dizzy || lean > FACE.surprisedFrom) {
    ctx.arc(0, radius * FACE.smileDrop, radius * 0.17, 0, TAU);
  } else {
    ctx.arc(0, radius * FACE.smileDrop * 0.3, radius * FACE.smileWidth, 0.4, Math.PI - 0.4);
  }
  ctx.stroke();

  ctx.restore();
}

/**
 * HUD рисуем в экранных координатах, чтобы текст был чётким, но размеры и
 * позиции берём в wu и переводим через view.scale — тогда надписи держат
 * пропорцию к полю и одинаково читаются на телефоне и на мониторе.
 * Толстая тёмная обводка вокруг букв — то, что делает текст мультяшным
 * и заодно читаемым на любом фоне.
 */
function renderHud() {
  renderer.beginScreen();
  const unit = view.scale;
  const centerX = (VIEW.coreWidth / 2 - view.left) * unit;
  const write = (text, size, worldY, color, scale) => {
    const px = size * unit * (scale || 1);
    ctx.font = `800 ${px}px ${FONT}`;
    ctx.lineWidth = px * HUD.textOutline;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = COLORS.textOutline;
    ctx.strokeText(text, centerX, (worldY - view.top) * unit);
    ctx.fillStyle = color;
    ctx.fillText(text, centerX, (worldY - view.top) * unit);
  };

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Плавное появление экрана: smoothstep вместо линейного, чтобы не дёргалось.
  const raw = Math.min(1, game.stateTime / HUD.fadeIn);
  const appear = raw * raw * (3 - 2 * raw);
  const breathe = 0.62 + 0.38 * Math.sin(game.stateTime * 2.6);

  if (game.state === STATE.ready) {
    ctx.globalAlpha = appear;
    write('Lumi', HUD.titleSize, 26, COLORS.hudStrong, 1 + Math.sin(game.clock * 1.6) * 0.03);
    ctx.globalAlpha = appear * 0.85;
    write('светлячок в тёмном лесу', HUD.labelSize, 36, COLORS.hudDim);
    ctx.globalAlpha = appear * breathe;
    write('тап, чтобы лететь', HUD.hintSize, 68, COLORS.hud);
  } else if (game.state === STATE.playing) {
    ctx.globalAlpha = appear;
    // Счёт подпрыгивает на каждом очке — маленькая награда за колонну.
    const pop = 1 + (game.scorePop / JUICE.scorePop) * 0.28;
    write(String(game.score.current), HUD.scoreSize, 16, COLORS.hudStrong, pop);
  } else {
    ctx.globalAlpha = appear;
    ctx.fillStyle = COLORS.deadVeil;
    ctx.fillRect(0, 0, view.cssWidth, view.cssHeight);

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

function renderMuteButton() {
  const unit = view.scale;
  const size = HUD.muteSize * unit;
  const x = (VIEW.coreWidth - HUD.muteMargin - HUD.muteSize / 2 - view.left) * unit;
  const y = (HUD.muteMargin + HUD.muteSize / 2 - view.top) * unit;

  muteTarget.x = x;
  muteTarget.y = y;
  muteTarget.radius = size * 0.8;

  ctx.globalAlpha = audio.enabled ? 0.9 : 0.45;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, size * 0.12);
  ctx.strokeStyle = COLORS.textOutline;
  ctx.fillStyle = COLORS.hud;

  ctx.beginPath();
  ctx.moveTo(x - size * 0.30, y - size * 0.11);
  ctx.lineTo(x - size * 0.14, y - size * 0.11);
  ctx.lineTo(x + size * 0.04, y - size * 0.30);
  ctx.lineTo(x + size * 0.04, y + size * 0.30);
  ctx.lineTo(x - size * 0.14, y + size * 0.11);
  ctx.lineTo(x - size * 0.30, y + size * 0.11);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();

  ctx.lineWidth = Math.max(1.2, size * 0.09);
  ctx.strokeStyle = COLORS.hud;
  ctx.beginPath();
  if (audio.enabled) {
    ctx.arc(x + size * 0.08, y, size * 0.20, -0.85, 0.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + size * 0.08, y, size * 0.34, -0.85, 0.85);
  } else {
    ctx.moveTo(x + size * 0.16, y - size * 0.15);
    ctx.lineTo(x + size * 0.38, y + size * 0.15);
    ctx.moveTo(x + size * 0.38, y - size * 0.15);
    ctx.lineTo(x + size * 0.16, y + size * 0.15);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function renderStats() {
  const { fps, ups, frameMs, drift } = loop.stats;
  const lines = [
    `fps    ${fps.toFixed(0)}   кадр ${frameMs.toFixed(1)} мс`,
    `ups    ${ups.toFixed(1)}   цель ${(1 / LOOP.step).toFixed(0)}`,
    `drift  ${(drift * 1000).toFixed(2)} мс`,
    ``,
    `режим  ${game.state}`,
    `счёт   ${game.score.current}   рекорд ${game.score.best}`,
    ``,
    `путь   ${game.difficulty.distance.toFixed(0)} wu   прогрев ${(game.difficulty.warmth * 100).toFixed(0)}%`,
    `скор.  ${game.difficulty.speed.toFixed(2)} wu/с`,
    `проход ${game.difficulty.gapHeight.toFixed(2)}   скачок ${game.difficulty.maxGapShift.toFixed(2)}`,
    ``,
    `лиан   ${game.obstacles.alive}/${game.obstacles.capacity}  создано ${game.obstacles.allocated}`,
    `искр   ${game.particles.alive}/${game.particles.capacity}  создано ${game.particles.allocated}`,
    ``,
    `view   ${view.width.toFixed(1)} x ${view.height.toFixed(1)} wu   dpr ${view.dpr}`,
  ];

  renderer.beginScreen();
  ctx.font = '12px ui-monospace, SFMono-Regular, Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS.hud;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 12, 12 + i * 15);
  }
}

const loop = createLoop({
  update,
  render,
  step: LOOP.step,
  maxFrameTime: LOOP.maxFrameTime,
});

loop.start();
