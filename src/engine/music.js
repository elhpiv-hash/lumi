import { MUSIC } from '../config.js';

/** Как часто планировщик просыпается и на сколько вперёд раскладывает ноты. */
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.2;

/**
 * Фоновая музыка — генератор, а не трек.
 *
 * Планировщик стандартный для WebAudio: setInterval будит нас часто, но ноты
 * ставятся не «сейчас», а на точное время по часам аудиоконтекста на 200 мс
 * вперёд. Иначе джиттер таймера был бы слышен как рваный ритм — особенно
 * заметно на бочке и хэте.
 *
 * Разводка: гармония идёт через мягкий фильтр, ударные — мимо него. Хэт живёт
 * выше 7 кГц, и общий низкочастотный фильтр просто съел бы его целиком.
 */
export function createMusic() {
  let context = null;
  let bus = null;
  let filter = null;
  let noise = null;
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
    envelope.gain.linearRampToValueAtTime(gain, at + 0.02);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    oscillator.connect(envelope);
    envelope.connect(filter);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.05);
  }

  /** Бочка: синус, съезжающий по частоте вниз. Классика, и без единого сэмпла. */
  function kick(at) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(150, at);
    oscillator.frequency.exponentialRampToValueAtTime(45, at + 0.11);
    envelope.gain.setValueAtTime(MUSIC.kickGain, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.19);

    oscillator.connect(envelope);
    envelope.connect(bus);
    oscillator.start(at);
    oscillator.stop(at + 0.22);
  }

  /** Хэт: короткий кусочек шума через фильтр верхних частот. */
  function hat(at) {
    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const envelope = context.createGain();

    source.buffer = noise;
    highpass.type = 'highpass';
    highpass.frequency.value = 7200;
    envelope.gain.setValueAtTime(MUSIC.hatGain, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);

    source.connect(highpass);
    highpass.connect(envelope);
    envelope.connect(bus);
    source.start(at);
    source.stop(at + 0.07);
  }

  function scheduleStep(index, at) {
    const stepsPerBar = MUSIC.pattern.length;
    const bar = Math.floor(index / stepsPerBar) % MUSIC.bassLine.length;
    const position = index % stepsPerBar;
    const bass = MUSIC.bassLine[bar];

    if (MUSIC.kickSteps.includes(position)) kick(at);
    if (MUSIC.hatSteps.includes(position)) hat(at);

    if (MUSIC.bassSteps.includes(position)) {
      // На сильные доли корень, на слабые квинта — бас шагает, а не долбит
      // одну ноту весь такт.
      const strong = MUSIC.kickSteps.includes(position);
      voice(frequencyOf(strong ? bass : bass + 7), at, 0.24, 'triangle', MUSIC.bassGain);
    }

    if (position === 0) {
      const chord = MUSIC.chords[bar];
      for (let i = 0; i < chord.length; i++) {
        voice(frequencyOf(bass + chord[i]), at, 1.5, 'triangle', MUSIC.padGain * (1 - i * 0.15));
      }
    }

    const degree = MUSIC.pattern[position];
    if (degree === null) return;
    // На спокойном старте часть нот пропускаем — мелодия дышит, а к пределу
    // сложности заполняется и подгоняет.
    if (Math.random() > MUSIC.density + intensity * MUSIC.densityLift) return;

    // Мелодия остаётся в одной тональности, аккорды ходят под ней.
    const semitone = MUSIC.scale[degree] + MUSIC.melodyOctave;
    voice(frequencyOf(semitone), at, 0.26, 'triangle', MUSIC.leadGain);
    if (Math.random() < 0.25 + intensity * 0.35) {
      voice(frequencyOf(semitone + 12), at + 0.02, 0.16, 'sine', MUSIC.leadGain * 0.4);
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
    bus = destination;

    filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = MUSIC.filterHz;
    filter.Q.value = 0.6;
    filter.connect(bus);

    // Полсекунды шума хватает: хэт откусывает от него по 45 мс.
    const length = Math.floor(context.sampleRate * 0.5);
    noise = context.createBuffer(1, length, context.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;

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
