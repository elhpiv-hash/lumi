import { getCoins, setCoins, getOwnedSkins, setOwnedSkins } from '../platform/storage.js';
import { isOwned, withOwned, ownedCount } from './skins.js';

/**
 * Кошелёк: собранные монеты и купленные скины.
 *
 * Монеты во время партии копятся только в памяти и записываются один раз, на
 * смерти — как и рекорд. На шаге девять за этой записью окажется сетевой вызов
 * Player API, дёргать его на каждую подобранную монету нельзя.
 *
 * Покупка, наоборот, пишется сразу: она происходит на стартовом экране, терять
 * там нечего, а потерять купленный скин из-за закрытой вкладки — обидно.
 */
export function createWallet() {
  let total = getCoins();
  let owned = getOwnedSkins();
  let earned = 0;

  return {
    get total() { return total; },
    /** Собрано за текущую партию — для надписи на экране смерти. */
    get earned() { return earned; },
    get ownedCount() { return ownedCount(owned); },

    add(amount) {
      total += amount;
      earned += amount;
    },

    /** Зафиксировать заработанное. Вызывается один раз, на смерти. */
    commit() {
      setCoins(total);
    },

    resetRun() {
      earned = 0;
    },

    isOwned(index) {
      return isOwned(index, owned);
    },

    buy(index, price) {
      if (isOwned(index, owned) || total < price) return false;
      total -= price;
      owned = withOwned(index, owned);
      setCoins(total);
      setOwnedSkins(owned);
      return true;
    },
  };
}
