export const siteThemes = [
  ["light", "Светлая"],
  ["midnight", "Полночь"],
  ["black", "Абсолютно чёрная"],
  ["dark", "Графит"],
  ["slate", "Сланец"],
  ["olive", "Олива"],
  ["mist", "Туман"],
  ["steel", "Сталь"],
  ["emerald", "Изумруд"],
  ["sand", "Песок"],
  ["monochrome", "Монохром"],
] as const;

export function isSiteTheme(value: string) {
  return siteThemes.some(([id]) => id === value);
}
