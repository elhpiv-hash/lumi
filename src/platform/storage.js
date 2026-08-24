/**
 * Адаптер хранилища. Снаружи — два синхронных вызова, внутри сейчас
 * localStorage, а на шаге 9 его заменит Yandex Player API.
 *
 * Кэш в памяти нужен не для скорости, а ради этой будущей замены: Player API
 * асинхронный, и на шаге 9 достаточно будет один раз залить в кэш загруженное
 * значение при старте — сигнатуры getBest/setBest останутся синхронными и
 * вызывающий код менять не придётся.
 *
 * Обращения обёрнуты в try: на Яндекс Играх игра живёт в iframe, а там доступ
 * к localStorage может быть закрыт политикой сторонних кук. Тогда рекорд просто
 * не переживёт перезагрузку, но в пределах сессии продолжит работать.
 */
const BEST_KEY = 'lumi.best';
const SKIN_KEY = 'lumi.skin';
const COINS_KEY = 'lumi.coins';
const OWNED_KEY = 'lumi.owned';

let cached = null;
let cachedSkin = null;
let cachedCoins = null;
let cachedOwned = null;

export function getBest() {
  if (cached !== null) return cached;

  let stored = 0;
  try {
    const value = Number(localStorage.getItem(BEST_KEY));
    if (Number.isFinite(value) && value > 0) stored = Math.floor(value);
  } catch {
    stored = 0;
  }

  cached = stored;
  return cached;
}

export function setBest(value) {
  cached = value;
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Записать не вышло — рекорд останется только на эту сессию.
  }
}

/**
 * Выбранный скин. Хранится один индекс: список открытого выводится из рекорда,
 * поэтому отдельного счётчика разблокировок не нужно и рассинхронизироваться
 * им не с чем.
 */
export function getSkinIndex() {
  if (cachedSkin !== null) return cachedSkin;

  let stored = 0;
  try {
    const value = Number(localStorage.getItem(SKIN_KEY));
    if (Number.isFinite(value) && value >= 0) stored = Math.floor(value);
  } catch {
    stored = 0;
  }

  cachedSkin = stored;
  return cachedSkin;
}

export function setSkinIndex(value) {
  cachedSkin = value;
  try {
    localStorage.setItem(SKIN_KEY, String(value));
  } catch {
    // Записать не вышло — выбор останется только на эту сессию.
  }
}

/** Целое неотрицательное из хранилища, или 0. Общий разбор для кошелька и маски. */
function readNumber(key) {
  try {
    const value = Number(localStorage.getItem(key));
    if (Number.isFinite(value) && value > 0) return Math.floor(value);
  } catch {
    return 0;
  }
  return 0;
}

function writeNumber(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Записать не вышло — прогресс останется только на эту сессию.
  }
}

export function getCoins() {
  if (cachedCoins === null) cachedCoins = readNumber(COINS_KEY);
  return cachedCoins;
}

export function setCoins(value) {
  cachedCoins = value;
  writeNumber(COINS_KEY, value);
}

/** Купленные скины — битовая маска в одном числе. */
export function getOwnedSkins() {
  if (cachedOwned === null) cachedOwned = readNumber(OWNED_KEY);
  return cachedOwned;
}

export function setOwnedSkins(value) {
  cachedOwned = value;
  writeNumber(OWNED_KEY, value);
}
