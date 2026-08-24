/**
 * Скины светлячка.
 *
 * Открываются рекордом, а не отдельным счётчиком: если рекорд дорос до
 * unlockAt — скин доступен. Значит хранить надо ровно одно число, выбранный
 * скин, а список открытого всегда выводится из рекорда и не может разъехаться
 * с ним при сбросе или переносе прогресса.
 */
export const SKINS = [
  {
    id: 'ember', name: 'Огонёк', unlockAt: 0,
    body: 'hsl(48, 100%, 64%)', belly: 'hsl(40, 100%, 76%)', outline: 'hsl(24, 60%, 26%)',
    glow: 'hsla(48, 100%, 70%, 0.26)', halo: 'hsla(48, 100%, 66%, 0.13)',
  },
  {
    id: 'ice', name: 'Льдинка', unlockAt: 15,
    body: 'hsl(192, 90%, 72%)', belly: 'hsl(186, 100%, 86%)', outline: 'hsl(210, 60%, 28%)',
    glow: 'hsla(192, 100%, 74%, 0.26)', halo: 'hsla(192, 100%, 70%, 0.13)',
  },
  {
    id: 'cherry', name: 'Вишенка', unlockAt: 40,
    body: 'hsl(342, 90%, 70%)', belly: 'hsl(348, 100%, 84%)', outline: 'hsl(340, 55%, 26%)',
    glow: 'hsla(342, 100%, 72%, 0.26)', halo: 'hsla(342, 100%, 68%, 0.13)',
  },
  {
    id: 'mint', name: 'Мятный', unlockAt: 80,
    body: 'hsl(152, 72%, 66%)', belly: 'hsl(150, 90%, 84%)', outline: 'hsl(160, 55%, 22%)',
    glow: 'hsla(152, 90%, 70%, 0.26)', halo: 'hsla(152, 90%, 66%, 0.13)',
  },
  {
    id: 'sunset', name: 'Закат', unlockAt: 150,
    body: 'hsl(18, 95%, 66%)', belly: 'hsl(32, 100%, 78%)', outline: 'hsl(10, 60%, 24%)',
    glow: 'hsla(18, 100%, 68%, 0.26)', halo: 'hsla(18, 100%, 64%, 0.13)',
  },
  {
    id: 'ghost', name: 'Призрак', unlockAt: 300,
    body: 'hsl(230, 30%, 92%)', belly: 'hsl(230, 60%, 98%)', outline: 'hsl(232, 40%, 34%)',
    glow: 'hsla(230, 60%, 90%, 0.28)', halo: 'hsla(230, 60%, 88%, 0.14)',
  },
];

export function isUnlocked(skin, best) {
  return best >= skin.unlockAt;
}

export function unlockedCount(best) {
  let count = 0;
  for (const skin of SKINS) if (skin.unlockAt <= best) count++;
  return count;
}

/** Ближайший неоткрытый скин — чтобы показать игроку, к чему стремиться. */
export function nextLocked(best) {
  for (const skin of SKINS) if (skin.unlockAt > best) return skin;
  return null;
}

/** Скин, открывшийся именно в этой партии. Нужен для надписи на экране смерти. */
export function unlockedBetween(previousBest, best) {
  for (const skin of SKINS) {
    if (skin.unlockAt > previousBest && skin.unlockAt <= best) return skin;
  }
  return null;
}

/**
 * Ближайший доступный скин в заданную сторону. Перебор по кругу, потому что
 * выбор в меню листается стрелками и должен замыкаться.
 */
export function stepSkin(index, direction, best) {
  for (let i = 1; i <= SKINS.length; i++) {
    const candidate = (index + direction * i + SKINS.length * i) % SKINS.length;
    if (isUnlocked(SKINS[candidate], best)) return candidate;
  }
  return index;
}
