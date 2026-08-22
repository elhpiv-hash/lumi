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
const KEY = 'lumi.best';

let cached = null;

export function getBest() {
  if (cached !== null) return cached;

  let stored = 0;
  try {
    const value = Number(localStorage.getItem(KEY));
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
    localStorage.setItem(KEY, String(value));
  } catch {
    // Записать не вышло — рекорд останется только на эту сессию.
  }
}
