// The fixed set of profile icons players can choose from. These are simple
// placeholders — swap the files in public/icons/ for real illustrated art
// whenever it's ready; the ids below don't need to change, so nothing else
// in the code needs touching.
export const ICON_IDS = ["icon-1", "icon-2", "icon-3", "icon-4", "icon-5", "icon-6", "icon-7"];

export function iconSrc(iconId) {
  return ICON_IDS.includes(iconId) ? `/icons/${iconId}.png` : null;
}
