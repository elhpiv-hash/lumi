import { LOOP, VIEW, PIXEL, PLAYER, FACE, OBSTACLES, COINS, SPARKS, JUICE, HUD, COLORS, DEBUG } from './config.js';
import { createRenderer } from './engine/canvas.js';
import { createLoop } from './engine/loop.js';
import { createInput } from './engine/input.js';
import { createAudio } from './engine/audio.js';
import { createGame, STATE } from './game/states.js';
import { createBackground } from './game/background.js';
import { SKINS, stepSkin } from './game/skins.js';
import { getSkinIndex, setSkinIndex } from './platform/storage.js';
import { t, skinName } from './locale.js';

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

/**
 * Кнопки хранятся в мировых координатах, а тап переводится в мир — а не
 * наоборот. Иначе пришлось бы держать отдельную математику для буфера,
 * css-пикселей и dpr.
 */
const buttons = {
  mute: { x: 0, y: 0, radius: 0, active: true },
  pause: { x: 0, y: 0, radius: 0, active: false },
  home: { x: 0, y: 0, radius: 0, active: false },
  previousSkin: { x: 0, y: 0, radius: 0, active: false },
  nextSkin: { x: 0, y: 0, radius: 0, active: false },
  buySkin: { x: 0, y: 0, radius: 0, active: false },
};

/** Надетый скин — и отдельно курсор магазина: листать можно и то, что не куплено. */
let skinIndex = getSkinIndex();
let browseIndex = skinIndex;

function currentSkin() {
  return SKINS[Math.min(Math.max(skinIndex, 0), SKINS.length - 1)];
}

/**
 * Шлейф и искры взмаха красятся в цвет героя: жёлтые искры за голубым
 * светлячком выглядели бы чужими. Пресеты — статические объекты, поэтому
 * правим их один раз на смену скина, а не на каждый выброс частиц.
 */
function applySkin() {
  const skin = currentSkin();
  SPARKS.trail.color = skin.body;
  SPARKS.flap.color = skin.belly;
}

// Хранилище могло обнулиться — тогда надетый скин окажется неоплаченным,
// и надо честно откатиться на бесплатный.
if (!game.wallet.isOwned(skinIndex)) {
  skinIndex = 0;
  browseIndex = 0;
}
applySkin();

function wear(index) {
  skinIndex = index;
  setSkinIndex(index);
  applySkin();
}

function cycleSkin(direction) {
  browseIndex = stepSkin(browseIndex, direction);
  // Купленное надеваем сразу; некупленное только показываем в витрине,
  // светлячок продолжает летать в оплаченном.
  if (game.wallet.isOwned(browseIndex)) wear(browseIndex);
  audio.play('score');
}

function buyBrowsedSkin() {
  const skin = SKINS[browseIndex];
  if (!game.wallet.buy(browseIndex, skin.price)) return;
  wear(browseIndex);
  audio.play('coin');
}

// Взмах не применяем прямо в обработчике события: команда легла бы в физику
// в произвольный момент между шагами, и симуляция снова стала бы зависеть
// от частоты кадров. Копим флаг, забираем в update на границе шага.
let flapRequested = false;

createInput(canvas, {
  onFlap(x, y) {
    // Единственное место, где жест пользователя ещё «свежий»: браузеры не дают
    // заводить AudioContext вне обработчика ввода.
    audio.unlock();
    if (pressButton(x, y)) return;
    flapRequested = true;
  },
  onToggleSound() {
    audio.unlock();
    audio.toggle();
  },
  onPause() {
    if (game.state === STATE.playing) game.pause();
    else if (game.state === STATE.paused) game.resume();
  },
});

// Свернули вкладку посреди партии — ставим на паузу, а не роняем игрока об пол.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause();
});
window.addEventListener('blur', () => game.pause());

function pressButton(cssX, cssY) {
  if (Number.isNaN(cssX)) return false;
  const worldX = view.left + cssX / view.scale;
  const worldY = view.top + cssY / view.scale;

  for (const name of Object.keys(buttons)) {
    const button = buttons[name];
    if (!button.active || button.radius === 0) continue;
    const dx = worldX - button.x;
    const dy = worldY - button.y;
    if (dx * dx + dy * dy >= button.radius * button.radius) continue;

    if (name === 'mute') audio.toggle();
    else if (name === 'pause') game.pause();
    else if (name === 'home') game.toMenu();
    else if (name === 'previousSkin') cycleSkin(-1);
    else if (name === 'nextSkin') cycleSkin(1);
    else if (name === 'buySkin') buyBrowsedSkin();
    return true;
  }
  return false;
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
  const palette = game.biome.palette;

  renderer.beginWorld();
  background.renderSky(ctx, view, palette);
  background.renderStars(ctx, view, lerp(game.difficulty.previousDistance, game.difficulty.distance, alpha), palette);

  ctx.save();
  applyShake();
  renderObstacles(alpha, palette);
  renderCoins(alpha);
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
 * Лианы. Цвета берём не из конфига, а из палитры текущего биома — она
 * перетекает по мере полёта, и вместе с небом перекрашиваются и заросли.
 */
function renderObstacles(alpha, palette) {
  for (const obstacle of game.obstacles.list) {
    const x = snap(lerp(obstacle.previousX, obstacle.x, alpha));
    const half = obstacle.gapHeight / 2;
    const gapTop = snap(obstacle.gapCenter - half);
    const gapBottom = snap(obstacle.gapCenter + half);

    // Уводим дальние торцы за поле, чтобы обводка не рисовала линию поперёк
    // экрана. Всё лишнее потом закроет рама.
    drawVine(x, -8, gapTop + 8, false, palette);
    drawVine(x, gapBottom, VIEW.coreHeight - gapBottom + 8, true, palette);
  }
}

function drawVine(x, y, height, capOnTop, palette) {
  if (height <= 0) return;
  const { columnWidth, capHeight, capOverhang } = OBSTACLES;
  const roundTop = capOnTop;
  const roundBottom = !capOnTop;

  // Обводка — та же фигура на пиксель больше: штрих в пиксельной графике мылит край.
  ctx.fillStyle = palette.vineOutline;
  pixelColumn(x - UNIT, y - UNIT, columnWidth + UNIT * 2, height + UNIT * 2, roundTop, roundBottom);

  ctx.fillStyle = palette.vine;
  pixelColumn(x, y, columnWidth, height, roundTop, roundBottom);

  const inset = UNIT * 2;
  if (height > inset * 4) {
    ctx.fillStyle = palette.vineLight;
    pixelRect(x + inset, y + inset * 2, UNIT * 2, height - inset * 4);
  }

  const capY = capOnTop ? y : y + height - capHeight;
  ctx.fillStyle = palette.vineOutline;
  pixelColumn(x - capOverhang - UNIT, capY - UNIT, columnWidth + capOverhang * 2 + UNIT * 2, capHeight + UNIT * 2, true, true);
  ctx.fillStyle = palette.vineCap;
  pixelColumn(x - capOverhang, capY, columnWidth + capOverhang * 2, capHeight, true, true);

  ctx.fillStyle = palette.berry;
  for (let i = 0; i < 3; i++) {
    pixelCircle(x + columnWidth * (0.2 + i * 0.3), capY + capHeight * 0.5, capHeight * 0.2);
  }
}

/**
 * Монеты крутятся: горизонтальный радиус ходит по косинусу, вертикальный стоит.
 * Поворота нет — он увёл бы фигуру с пиксельной сетки, а сплющивание не уводит.
 */
function renderCoins(alpha) {
  for (const coin of game.coins.list) {
    const x = snap(lerp(coin.previousX, coin.x, alpha));
    const spin = Math.abs(Math.cos(game.clock * COINS.spinRate + coin.phase));
    const radiusX = Math.max(UNIT, COINS.radius * (0.22 + 0.78 * spin));

    ctx.fillStyle = COLORS.coinOutline;
    pixelEllipse(x, coin.y, radiusX + UNIT, COINS.radius + UNIT);
    ctx.fillStyle = COLORS.coin;
    pixelEllipse(x, coin.y, radiusX, COINS.radius);
    ctx.fillStyle = COLORS.coinLight;
    pixelEllipse(x, coin.y - COINS.radius * 0.25, radiusX * 0.45, COINS.radius * 0.35);
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
 * Светлячок с мордочкой. Окраска берётся из выбранного скина, всё остальное
 * общее: глаза, зрачки, улыбка, крылья.
 *
 * Никаких rotate и scale: любой поворот или дробное масштабирование увели бы
 * фигуру с пиксельной сетки, и края поплыли бы. Сплющивание на взмахе делаем
 * честно — разными радиусами эллипса, наклон передаём смещением зрачков.
 */
function renderPlayer(alpha) {
  const { x, y, previousY, velocityY } = game.player.state;
  const skin = currentSkin();
  const centerX = snap(x);
  const centerY = snap(lerp(previousY, y, alpha));
  const radius = PLAYER.radius;
  const clock = game.clock;
  const lean = Math.max(-1, Math.min(1, velocityY / PLAYER.maxFallSpeed));
  const stretch = Math.abs(lean) * JUICE.maxStretch;
  const radiusX = radius * (1 - stretch * 0.5);
  const radiusY = radius * (1 + stretch);
  const boost = 1 + (game.nearMissTime / JUICE.nearMissFlash) * 0.6;

  ctx.fillStyle = skin.halo;
  pixelCircle(centerX, centerY, radius * 3.2 * boost);
  ctx.fillStyle = skin.glow;
  pixelCircle(centerX, centerY, radius * 1.9 * boost);

  // Крылья: трепет передаём высотой, а не поворотом.
  const beat = 0.55 + Math.sin(clock * FACE.wingRate) * 0.45;
  ctx.fillStyle = COLORS.playerWing;
  for (let side = -1; side <= 1; side += 2) {
    pixelEllipse(
      centerX + side * radiusX * 0.85,
      centerY - radiusY * 0.75,
      radiusX * 0.45,
      radius * FACE.wingSpan * 0.5 * beat,
    );
  }

  ctx.fillStyle = skin.outline;
  pixelEllipse(centerX, centerY, radiusX + UNIT, radiusY + UNIT);
  ctx.fillStyle = skin.body;
  pixelEllipse(centerX, centerY, radiusX, radiusY);
  ctx.fillStyle = skin.belly;
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
  const wallet = game.wallet;

  buttons.pause.active = game.state === STATE.playing;
  // Из паузы и с экрана смерти нужен путь назад в меню — иначе за скином
  // не вернуться иначе как перезагрузкой страницы.
  buttons.home.active = game.state === STATE.paused || game.state === STATE.dead;
  buttons.previousSkin.active = false;
  buttons.nextSkin.active = false;
  buttons.buySkin.active = false;

  if (game.state === STATE.ready) {
    const skin = SKINS[browseIndex];
    const owned = wallet.isOwned(browseIndex);

    ctx.globalAlpha = appear;
    write(`● ${wallet.total}`, HUD.labelSize, 13, COLORS.coin);
    write('LUMI', HUD.titleSize, 31, COLORS.hudStrong, 1 + Math.sin(game.clock * 1.6) * 0.03);
    ctx.globalAlpha = appear * breathe;
    write(t('tapToFly'), HUD.hintSize, 58, COLORS.hud);

    ctx.globalAlpha = appear;
    write(skinName(skin.id), HUD.labelSize, HUD.arrowY, owned ? COLORS.hudStrong : COLORS.hudDim);
    buttons.previousSkin.active = true;
    buttons.nextSkin.active = true;
    renderSkinArrows();

    if (owned) {
      // Купленное надевается сразу при листании, поэтому вариант тут ровно один.
      write(t('equipped'), HUD.labelSize * 0.8, HUD.arrowY + 9, COLORS.hudDim);
    } else {
      const affordable = wallet.total >= skin.price;
      buttons.buySkin.active = affordable;
      buttons.buySkin.x = VIEW.coreWidth / 2;
      buttons.buySkin.y = HUD.arrowY + 9;
      buttons.buySkin.radius = 8;
      ctx.globalAlpha = appear * (affordable ? 1 : 0.5);
      write(`● ${skin.price} — ${t('buy')}`, HUD.labelSize * 0.85, HUD.arrowY + 9,
        affordable ? COLORS.coin : COLORS.hudDim);
    }
  } else if (game.state === STATE.playing) {
    ctx.globalAlpha = appear;
    // Счёт подпрыгивает на каждом очке — маленькая награда за лиану.
    const pop = 1 + (game.scorePop / JUICE.scorePop) * 0.28;
    write(String(game.score.current), HUD.scoreSize, 16, COLORS.hudStrong, pop);
    ctx.globalAlpha = appear * 0.9;
    write(`● ${wallet.total}`, HUD.labelSize * 0.9, 28, COLORS.coin);
  } else if (game.state === STATE.paused) {
    ctx.globalAlpha = appear;
    ctx.fillStyle = COLORS.deadVeil;
    ctx.fillRect(0, 0, view.bufferWidth, view.bufferHeight);
    write(t('paused'), HUD.titleSize * 0.8, 40, COLORS.hudStrong);
    ctx.globalAlpha = appear * breathe;
    write(t('tapToResume'), HUD.hintSize, 58, COLORS.hud);
    ctx.globalAlpha = appear * 0.7;
    write(t('homeHint'), HUD.labelSize * 0.85, 70, COLORS.hudDim);
  } else {
    ctx.globalAlpha = appear;
    ctx.fillStyle = COLORS.deadVeil;
    ctx.fillRect(0, 0, view.bufferWidth, view.bufferHeight);

    write(t('score'), HUD.labelSize, 30, COLORS.hudDim);
    write(String(game.score.current), HUD.scoreSize, 42, COLORS.hudStrong);
    if (game.score.beaten) {
      write(t('newRecord'), HUD.hintSize, 56, COLORS.record, 1 + Math.sin(game.clock * 5) * 0.05);
    } else {
      write(`${t('record')} ${game.score.best}`, HUD.hintSize, 56, COLORS.hud);
    }
    if (wallet.earned > 0) {
      write(`● +${wallet.earned}`, HUD.labelSize, 67, COLORS.coin);
    }

    // Пока пауза после смерти не истекла, подсказка приглушена — тап всё равно
    // не сработает, и нечестно предлагать то, что не отвечает.
    ctx.globalAlpha = appear * (game.restartArmed ? breathe : 0.3);
    write(t('tapToRetry'), HUD.hintSize, 78, COLORS.hud);
    ctx.globalAlpha = appear * 0.7;
    write(t('homeHint'), HUD.labelSize * 0.85, 88, COLORS.hudDim);
  }

  ctx.globalAlpha = 1;
  renderCornerButtons();
}

/** Треугольник из столбиков убывающей высоты — стрелка по пиксельной сетке. */
function pixelArrow(centerX, centerY, size, direction) {
  const columns = Math.max(2, Math.round(size / (2 * UNIT)));
  for (let i = 0; i < columns; i++) {
    const height = (columns - i) * 2 * UNIT;
    const offset = (i - (columns - 1) / 2) * UNIT * direction;
    pixelRect(centerX + offset - UNIT / 2, centerY - height / 2, UNIT, height);
  }
}

function renderSkinArrows() {
  renderer.beginWorld();
  const y = HUD.arrowY;
  buttons.previousSkin.x = VIEW.coreWidth / 2 - HUD.arrowOffset;
  buttons.previousSkin.y = y;
  buttons.previousSkin.radius = HUD.arrowSize;
  buttons.nextSkin.x = VIEW.coreWidth / 2 + HUD.arrowOffset;
  buttons.nextSkin.y = y;
  buttons.nextSkin.radius = HUD.arrowSize;

  for (const [button, direction] of [[buttons.previousSkin, -1], [buttons.nextSkin, 1]]) {
    ctx.fillStyle = COLORS.textOutline;
    pixelArrow(button.x + UNIT, y + UNIT, HUD.arrowSize, direction);
    ctx.fillStyle = COLORS.hud;
    pixelArrow(button.x, y, HUD.arrowSize, direction);
  }
  renderer.beginScreen();
}

/** Домик выложен по тем же клеткам 15x15, что и динамик. */
function drawHouse(originX, originY) {
  const cell = HUD.muteSize / 15;
  const roof = [[7, 3, 1, 1], [6, 4, 3, 1], [5, 5, 5, 1], [4, 6, 7, 1]];
  const walls = [[5, 7, 5, 5]];
  const box = (gx, gy, gw, gh, shift) =>
    pixelRect(originX + gx * cell + shift, originY + gy * cell + shift, gw * cell, gh * cell);
  const glyph = (shift) => {
    for (const [gx, gy, gw, gh] of roof) box(gx, gy, gw, gh, shift);
    for (const [gx, gy, gw, gh] of walls) box(gx, gy, gw, gh, shift);
  };

  ctx.globalAlpha = 0.9;
  ctx.fillStyle = COLORS.textOutline;
  glyph(UNIT);
  ctx.fillStyle = COLORS.hud;
  glyph(0);
  // Дверь вырезаем цветом обводки — так домик читается даже в 15 пикселей.
  ctx.fillStyle = COLORS.textOutline;
  box(7, 9, 2, 3, 0);
  ctx.globalAlpha = 1;
}

/** Кнопки в углах поля: пауза или домик слева, звук справа. Все по клеткам. */
function renderCornerButtons() {
  renderer.beginWorld();
  const half = HUD.muteSize / 2;

  if (buttons.home.active) {
    buttons.home.x = HUD.muteMargin + half;
    buttons.home.y = HUD.muteMargin + half;
    buttons.home.radius = HUD.muteSize * 0.8;
    drawHouse(HUD.muteMargin, HUD.muteMargin);
  } else {
    buttons.home.radius = 0;
  }

  if (buttons.pause.active) {
    buttons.pause.x = HUD.muteMargin + half;
    buttons.pause.y = HUD.muteMargin + half;
    buttons.pause.radius = HUD.muteSize * 0.8;
    const bar = HUD.muteSize * 0.22;
    const tall = HUD.muteSize * 0.62;
    const left = buttons.pause.x - HUD.muteSize * 0.26;
    const right = buttons.pause.x + HUD.muteSize * 0.04;
    const top = buttons.pause.y - tall / 2;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = COLORS.textOutline;
    pixelRect(left + UNIT, top + UNIT, bar, tall);
    pixelRect(right + UNIT, top + UNIT, bar, tall);
    ctx.fillStyle = COLORS.hud;
    pixelRect(left, top, bar, tall);
    pixelRect(right, top, bar, tall);
    ctx.globalAlpha = 1;
  } else {
    buttons.pause.radius = 0;
  }

  buttons.mute.x = VIEW.coreWidth - HUD.muteMargin - half;
  buttons.mute.y = HUD.muteMargin + half;
  buttons.mute.radius = HUD.muteSize * 0.8;

  const cell = HUD.muteSize / 15;
  const originX = VIEW.coreWidth - HUD.muteMargin - HUD.muteSize;
  const originY = HUD.muteMargin;
  const speaker = [[2, 6, 3, 3], [5, 5, 1, 5], [6, 4, 1, 7], [7, 3, 1, 9]];
  const waves = [[9, 6, 1, 3], [11, 4, 1, 7]];
  const cross = [[9, 5], [10, 6], [11, 7], [12, 8], [12, 5], [11, 6], [10, 7], [9, 8]];
  const box = (gx, gy, gw, gh, shift) =>
    pixelRect(originX + gx * cell + shift, originY + gy * cell + shift, gw * cell, gh * cell);
  const glyph = (shift) => {
    for (const [gx, gy, gw, gh] of speaker) box(gx, gy, gw, gh, shift);
    if (audio.enabled) for (const [gx, gy, gw, gh] of waves) box(gx, gy, gw, gh, shift);
    else for (const [gx, gy] of cross) box(gx, gy, 1, 1, shift);
  };

  ctx.globalAlpha = audio.enabled ? 0.9 : 0.45;
  ctx.fillStyle = COLORS.textOutline;
  glyph(UNIT);
  ctx.fillStyle = COLORS.hud;
  glyph(0);
  ctx.globalAlpha = 1;
  renderer.beginScreen();
}

function renderStats() {
  const { fps, ups, frameMs, drift } = loop.stats;
  const lines = [
    `fps ${fps.toFixed(0)} / кадр ${frameMs.toFixed(1)}мс / drift ${(drift * 1000).toFixed(1)}мс`,
    `${game.state}  счёт ${game.score.current}  рекорд ${game.score.best}`,
    `путь ${game.difficulty.distance.toFixed(0)} скор ${game.difficulty.speed.toFixed(1)}`,
    `биом ${game.biome.palette.name} #${game.biome.index} смесь ${game.biome.blend.toFixed(2)}`,
    `скин ${skinName(currentSkin().id)} витрина ${skinName(SKINS[browseIndex].id)} куплено ${game.wallet.ownedCount}/${SKINS.length}`,
    `монет ${game.wallet.total} (+${game.wallet.earned}) на поле ${game.coins.alive}/${game.coins.allocated}`,
    `лиан ${game.obstacles.alive}/${game.obstacles.allocated} искр ${game.particles.alive}/${game.particles.allocated}`,
    `буфер ${view.bufferWidth}x${view.bufferHeight} ups ${ups.toFixed(0)}`,
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
