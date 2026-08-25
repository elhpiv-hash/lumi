/**
 * Тексты игры.
 *
 * Яндекс Игры показывают игру не только русскоязычной аудитории, поэтому все
 * строки живут здесь, а не в разметке экранов. Язык приходит снаружи: сейчас
 * из настроек браузера, после подключения SDK — из площадки. Неизвестный код
 * молча откатывается на русский, а недостающий ключ — на русский вариант,
 * чтобы дырка в переводе не превращалась в пустое место на экране.
 *
 * Названия скинов лежат тут же, а не в skins.js: там остаются идентификаторы
 * и цены, то есть данные, а не текст.
 */
const DICTIONARIES = {
  ru: {
    tapToFly: 'тап, чтобы лететь',
    equipped: 'надет',
    buy: 'купить',
    paused: 'пауза',
    tapToResume: 'тап — продолжить',
    homeHint: 'домик слева — в меню',
    score: 'счёт',
    newRecord: 'новый рекорд!',
    record: 'рекорд',
    tapToRetry: 'тап — ещё раз',
    doubleCoins: 'удвоить за ролик',
    skins: {
      ember: 'Огонёк',
      ice: 'Льдинка',
      cherry: 'Вишенка',
      mint: 'Мятный',
      sunset: 'Закат',
      ghost: 'Призрак',
    },
  },

  en: {
    tapToFly: 'tap to fly',
    equipped: 'equipped',
    buy: 'buy',
    paused: 'paused',
    tapToResume: 'tap to resume',
    homeHint: 'house on the left — menu',
    score: 'score',
    newRecord: 'new record!',
    record: 'best',
    tapToRetry: 'tap to retry',
    doubleCoins: 'double for an ad',
    skins: {
      ember: 'Ember',
      ice: 'Frost',
      cherry: 'Cherry',
      mint: 'Mint',
      sunset: 'Sunset',
      ghost: 'Ghost',
    },
  },
};

/** Порядок важен: он же порядок флажков на экране и индекс в хранилище. */
export const LANGUAGES = ['ru', 'en'];

const FALLBACK = 'ru';
let current = FALLBACK;

/** Код языка вроде 'ru' или 'en-US'. Незнакомый — откат на русский. */
export function setLanguage(code) {
  if (typeof code !== 'string') return current;
  const short = code.slice(0, 2).toLowerCase();
  current = DICTIONARIES[short] ? short : FALLBACK;
  return current;
}

export function getLanguage() {
  return current;
}

export function t(key) {
  const dictionary = DICTIONARIES[current];
  if (dictionary && dictionary[key] !== undefined) return dictionary[key];
  return DICTIONARIES[FALLBACK][key] ?? key;
}

export function skinName(id) {
  const dictionary = DICTIONARIES[current];
  return (dictionary && dictionary.skins[id]) || DICTIONARIES[FALLBACK].skins[id] || id;
}

/** До подключения SDK язык берём из браузера. Потом его перебьёт площадка. */
setLanguage(typeof navigator === 'undefined' ? FALLBACK : navigator.language);
