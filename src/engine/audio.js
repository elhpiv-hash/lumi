import { SOUND, MUSIC } from '../config.js';
import { createMusic } from './music.js';

/**
 * Звук: короткие тоны на осцилляторах плюс фоновая музыка. Ни одного файла
 * и ни одной загрузки.
 *
 * AudioContext создаётся лениво и только из обработчика ввода: браузеры не дают
 * запускать звук до жеста пользователя, а обработчик — единственное место, где
 * этот жест гарантированно «свежий». Поэтому наружу торчит unlock().
 *
 * Шины разведены: эффекты и музыка висят на своих регуляторах, а общий мастер
 * нужен только для тумблера. Иначе громкость музыки пришлось бы пересчитывать
 * через громкость эффектов.
 *
 * Если WebAudio недоступен или запрещён, модуль молча превращается в заглушку —
 * игра не должна падать из-за украшения.
 */
export function createAudio() {
  const music = createMusic();

  let context = null;
  let master = null;
  let effects = null;
  let enabled = SOUND.enabled;
  let broken = false;

  function onVisibilityChange() {
    if (!context) return;
    // Планировщик музыки живёт на setInterval, а тот в скрытой вкладке
    // тормозится до секунды — ноты сыпались бы рвано. Проще усыпить контекст.
    if (document.hidden) context.suspend();
    else if (enabled) context.resume();
  }

  // Требование площадки: при потере фокуса звук обязан замолкать. Скрытая
  // вкладка и окно, ушедшее на второй план, — разные события, нужны оба.
  function onBlur() {
    if (context) context.suspend();
  }

  function onFocus() {
    if (context && enabled) context.resume();
  }

  function unlock() {
    if (context || broken || !enabled) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) { broken = true; return; }

    try {
      context = new AudioContextClass();

      master = context.createGain();
      master.gain.value = 1;
      master.connect(context.destination);

      effects = context.createGain();
      effects.gain.value = SOUND.volume;
      effects.connect(master);

      const musicBus = context.createGain();
      musicBus.gain.value = MUSIC.volume;
      musicBus.connect(master);

      music.start(context, musicBus);
      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('blur', onBlur);
      window.addEventListener('focus', onFocus);
    } catch {
      broken = true;
      context = null;
    }
  }

  function play(name) {
    if (!enabled || broken || !context) return;
    const tone = SOUND.tones[name];
    if (!tone) return;
    if (context.state === 'suspended') context.resume();

    const start = context.currentTime;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();

    oscillator.type = tone.type;
    oscillator.frequency.setValueAtTime(tone.from, start);
    if (tone.to !== tone.from) {
      oscillator.frequency.exponentialRampToValueAtTime(tone.to, start + tone.duration);
    }

    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(tone.gain, start + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);

    oscillator.connect(envelope);
    envelope.connect(effects);
    oscillator.start(start);
    oscillator.stop(start + tone.duration + 0.02);
  }

  function toggle() {
    enabled = !enabled;
    if (enabled) {
      unlock();
      if (master) master.gain.value = 1;
      if (context) context.resume();
    } else if (master) {
      master.gain.value = 0;
    }
    return enabled;
  }

  /** Замолчать, не трогая пользовательскую настройку: на время рекламы. */
  function suspend() {
    if (context) context.suspend();
  }

  function resume() {
    if (context && enabled) context.resume();
  }

  return {
    unlock,
    play,
    toggle,
    suspend,
    resume,
    setIntensity: music.setIntensity,
    get enabled() { return enabled; },
  };
}
