/**
 * Хранилище прогресса. Снаружи — синхронные геттеры и сеттеры, внутри две
 * копии: локальная и облачная.
 *
 * Синхронный интерфейс с кэшем был заложен ещё тогда, когда никакого облака
 * не было, — ровно ради этого момента. Player API асинхронный, но вызывающему
 * коду об этом знать не нужно: при старте кэш один раз заполняется загруженным
 * значением, дальше всё читается из памяти.
 *
 * localStorage остаётся всегда: на Яндексе игра живёт в iframe, где доступ
 * к нему может быть закрыт политикой сторонних кук, а на GitHub Pages нет
 * облака. Две копии страхуют друг друга.
 *
 * В облако пишем через setStats, а не setData: документация советует его для
 * часто меняющихся чисел, и лимит там мягче. Но и он ограничен, поэтому записи
 * копятся и уходят не чаще раза в несколько секунд.
 */
const LOCAL_KEYS = {
  best: 'lumi.best',
  coins: 'lumi.coins',
  owned: 'lumi.owned',
  skin: 'lumi.skin',
  lang: 'lumi.lang',
};
const CLOUD_KEYS = Object.keys(LOCAL_KEYS);
const CLOUD_MIN_INTERVAL_MS = 5000;

const cache = { best: null, coins: null, owned: null, skin: null, lang: null };

let sdk = null;
let dirty = null;
let lastFlushAt = -Infinity;
let flushTimer = 0;

function readLocal(name) {
  try {
    const value = Number(localStorage.getItem(LOCAL_KEYS[name]));
    if (Number.isFinite(value) && value > 0) return Math.floor(value);
  } catch {
    return 0;
  }
  return 0;
}

function writeLocal(name, value) {
  try {
    localStorage.setItem(LOCAL_KEYS[name], String(value));
  } catch {
    // Хранилище закрыто — прогресс проживёт сессию, а в облако всё равно уйдёт.
  }
}

function flushCloud() {
  flushTimer = 0;
  if (!dirty || !sdk) return;
  lastFlushAt = Date.now();
  const payload = dirty;
  dirty = null;
  sdk.saveStats(payload);
}

/** Копим изменения и отправляем пачкой: у setStats есть лимит частоты. */
function scheduleCloud(name, value) {
  if (!sdk) return;
  if (dirty === null) dirty = {};
  dirty[name] = value;

  if (flushTimer !== 0) return;
  const wait = Math.max(0, CLOUD_MIN_INTERVAL_MS - (Date.now() - lastFlushAt));
  flushTimer = setTimeout(flushCloud, wait);
}

function get(name) {
  if (cache[name] === null) cache[name] = readLocal(name);
  return cache[name];
}

function set(name, value) {
  cache[name] = value;
  writeLocal(name, value);
  scheduleCloud(name, value);
}

/** Подключить площадку. До вызова хранилище работает чисто локально. */
export function connectCloud(platform) {
  sdk = platform && platform.hasCloud ? platform : null;
}

/**
 * Забрать прогресс из облака в кэш. Вызывается один раз до старта партии,
 * поэтому дальше синхронные геттеры отдают уже верные значения.
 *
 * Облако главнее локальной копии: игрок мог играть на другом устройстве.
 * Но если в облаке пусто, а локально что-то есть — оставляем локальное
 * и сразу отправляем наверх, иначе прогресс первого запуска потерялся бы.
 */
export async function loadProgress() {
  for (const name of CLOUD_KEYS) get(name);
  if (!sdk) return false;

  const stats = await sdk.loadStats(CLOUD_KEYS);
  if (!stats) return false;

  let restored = false;
  for (const name of CLOUD_KEYS) {
    const value = stats[name];
    if (Number.isFinite(value) && value >= 0) {
      cache[name] = Math.floor(value);
      writeLocal(name, cache[name]);
      restored = true;
    } else if (cache[name] > 0) {
      scheduleCloud(name, cache[name]);
    }
  }
  return restored;
}

export function getBest() { return get('best'); }
export function setBest(value) { set('best', value); }

export function getCoins() { return get('coins'); }
export function setCoins(value) { set('coins', value); }

/** Купленные скины — битовая маска в одном числе. */
export function getOwnedSkins() { return get('owned'); }
export function setOwnedSkins(value) { set('owned', value); }

export function getSkinIndex() { return get('skin'); }
export function setSkinIndex(value) { set('skin', value); }

/**
 * Выбранный игроком язык: 0 — не выбирал, дальше индекс в LANGUAGES плюс один.
 * Ноль как «не выбирал» ложится ровно на общий разбор чисел и позволяет
 * отличить осознанный выбор от его отсутствия: без выбора язык берётся
 * из площадки, с выбором — перебивает её.
 */
export function getLanguageChoice() { return get('lang'); }
export function setLanguageChoice(value) { set('lang', value); }
