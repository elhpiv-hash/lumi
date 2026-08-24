/**
 * Скины светлячка.
 *
 * Названия лежат в locale.js — здесь только данные: идентификатор, цена, цвета.
 * Покупаются за монеты. Купленное хранится битовой маской в одном числе:
 * шесть скинов — шесть бит, никаких списков и разбора строк. Нулевой скин
 * бесплатный и считается своим всегда, даже если хранилище пустое.
 */
export const SKINS = [
  {
    id: 'ember', price: 0,
    body: 'hsl(48, 100%, 64%)', belly: 'hsl(40, 100%, 76%)', outline: 'hsl(24, 60%, 26%)',
    glow: 'hsla(48, 100%, 70%, 0.26)', halo: 'hsla(48, 100%, 66%, 0.13)',
  },
  {
    id: 'ice', price: 30,
    body: 'hsl(192, 90%, 72%)', belly: 'hsl(186, 100%, 86%)', outline: 'hsl(210, 60%, 28%)',
    glow: 'hsla(192, 100%, 74%, 0.26)', halo: 'hsla(192, 100%, 70%, 0.13)',
  },
  {
    id: 'cherry', price: 70,
    body: 'hsl(342, 90%, 70%)', belly: 'hsl(348, 100%, 84%)', outline: 'hsl(340, 55%, 26%)',
    glow: 'hsla(342, 100%, 72%, 0.26)', halo: 'hsla(342, 100%, 68%, 0.13)',
  },
  {
    id: 'mint', price: 140,
    body: 'hsl(152, 72%, 66%)', belly: 'hsl(150, 90%, 84%)', outline: 'hsl(160, 55%, 22%)',
    glow: 'hsla(152, 90%, 70%, 0.26)', halo: 'hsla(152, 90%, 66%, 0.13)',
  },
  {
    id: 'sunset', price: 250,
    body: 'hsl(18, 95%, 66%)', belly: 'hsl(32, 100%, 78%)', outline: 'hsl(10, 60%, 24%)',
    glow: 'hsla(18, 100%, 68%, 0.26)', halo: 'hsla(18, 100%, 64%, 0.13)',
  },
  {
    id: 'ghost', price: 450,
    body: 'hsl(230, 30%, 92%)', belly: 'hsl(230, 60%, 98%)', outline: 'hsl(232, 40%, 34%)',
    glow: 'hsla(230, 60%, 90%, 0.28)', halo: 'hsla(230, 60%, 88%, 0.14)',
  },
];

/** Нулевой скин бесплатный, поэтому свой всегда. */
export function isOwned(index, owned) {
  return index === 0 || (owned & (1 << index)) !== 0;
}

export function withOwned(index, owned) {
  return owned | (1 << index);
}

export function ownedCount(owned) {
  let count = 0;
  for (let i = 0; i < SKINS.length; i++) if (isOwned(i, owned)) count++;
  return count;
}

/** Листание по кругу. Показываем и некупленные — иначе не видно, на что копить. */
export function stepSkin(index, direction) {
  return (index + direction + SKINS.length) % SKINS.length;
}
