import { getBest, setBest } from '../platform/storage.js';

/**
 * Счёт и рекорд.
 *
 * Рекорд пишется в хранилище только на смерти, а не на каждом очке: на шаге 9
 * за setBest окажется сетевой вызов Player API, и дёргать его по разу на
 * колонну нельзя.
 */
export function createScore() {
  let current = 0;
  let best = getBest();
  let previousBest = best;
  let beaten = false;

  return {
    get current() { return current; },
    get best() { return best; },
    /** Рекорд на момент начала партии — по нему видно, что открылось именно сейчас. */
    get previousBest() { return previousBest; },
    /** Побит ли рекорд именно в этой партии — для надписи на экране смерти. */
    get beaten() { return beaten; },

    add() {
      current++;
      if (current > best) {
        best = current;
        beaten = true;
      }
    },

    /** Зафиксировать результат партии. Вызывается один раз, на смерти. */
    commit() {
      setBest(best);
    },

    reset() {
      current = 0;
      previousBest = best;
      beaten = false;
    },
  };
}
