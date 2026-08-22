import { MUSIC } from '../config.js';

/** Как часто планировщик просыпается и на сколько вперёд раскладывает ноты. */
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.2;

/**
 * Фоновая музыка — генератор, а не трек.
 *
 * Партия может длиться и минуту, и час, а зацикленный файл за это время
 * приедается. Здесь ноты раскладываются на лету из пентатоники: в ней любое
 * сочетание ступеней звучит согласно, поэтому случайные вариации не фальшивят
 * и мелодия не повторяется дословно.
 *
 * Планировщик стандартный для WebAudio: setInterval будит нас часто, но ноты
 * ставятся не «сейчас», а на точное время по часам аудиоконтекста на 200 мс
 * вперёд. Иначе джиттер таймера был бы слышен как рваный ритм.
 */
export function createMusic() {
  let context = null;
  let filter = null;
  let timer = 0;
  let nextNoteTime = 0;
  let stepIndex = 0;
  let intensity = 0;

  function frequencyOf(semitones) {
    return MUSIC.root * Math.pow(2, semitones / 12);
  }

  function voice(frequency, at, duration, type, gain) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    // Мягкая атака вместо щелчка, экспоненциальный спад вместо обрыва.
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.linearRampToValueAtTime(gain, at + 0.03);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    oscillator.connect(envelope);
    envelope.connect(filter);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.05);
  }

  function scheduleStep(index, at) {
    const stepsPerBar = MUSIC.pattern.length;
    const bar = Math.floor(index / stepsPerBar) % MUSIC.bassLine.length;
    const positionInBar = index % stepsPerBar;
    const shift = MUSIC.bassLine[bar];

    if (positionInBar === 0) {
      voice(frequencyOf(shift), at, 1.7, 'sine', MUSIC.bassGain);
      // Подложка: корень и квинта сверху — этого хватает, чтобы такт звучал аккордом.
      voice(frequencyOf(shift + 12), at, 2.6, 'triangle', MUSIC.padGain);
      voice(frequencyOf(shift + 19), at, 2.6, 'triangle', MUSIC.padGain * 0.75);
    }

    const degree = MUSIC.pattern[positionInBar];
    if (degree === null) return;
    // На спокойном старте часть нот пропускаем — мелодия дышит, а к пределу
    // сложности заполняется и подгоняет.
    if (Math.random() > 0.45 + intensity * 0.55) return;

    const semitone = MUSIC.scale[degree] + shift + 12;
    voice(frequencyOf(semitone), at, 0.55, 'triangle', MUSIC.leadGain);
    if (Math.random() < intensity * 0.3) {
      voice(frequencyOf(semitone + 12), at + 0.06, 0.32, 'sine', MUSIC.leadGain * 0.45);
    }
  }

  function tick() {
    if (!context) return;
    const secondsPerStep = 60 / MUSIC.bpm / 2;
    while (nextNoteTime < context.currentTime + SCHEDULE_AHEAD) {
      scheduleStep(stepIndex, nextNoteTime);
      nextNoteTime += secondsPerStep;
      stepIndex++;
    }
    filter.frequency.setTargetAtTime(
      MUSIC.filterHz + MUSIC.filterLift * intensity,
      context.currentTime,
      0.5,
    );
  }

  function start(audioContext, destination) {
    if (context || !MUSIC.enabled) return;
    context = audioContext;

    filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = MUSIC.filterHz;
    filter.Q.value = 0.6;
    filter.connect(destination);

    nextNoteTime = context.currentTime + 0.15;
    stepIndex = 0;
    timer = setInterval(tick, LOOKAHEAD_MS);
  }

  function stop() {
    clearInterval(timer);
    timer = 0;
  }

  /** 0..1 — насколько плотной должна быть музыка. Тянем от прогресса партии. */
  function setIntensity(value) {
    intensity = Math.max(0, Math.min(1, value));
  }

  return { start, stop, setIntensity };
}
