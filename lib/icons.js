// The full set of icon ids that can ever be resolved to an image — kept
// complete (including icon-1) so anyone who already picked an id still
// renders correctly, even once that id stops being offered below.
export const ICON_IDS = ["icon-1", "icon-2", "icon-3", "icon-4", "icon-5", "icon-6", "icon-7"];

// What IconPicker actually offers for a NEW pick. icon-1 is excluded here —
// it turned out to be a duplicate of icon-3's artwork — but stays in
// ICON_IDS above since April already has it selected and it should keep
// rendering for her.
export const PICKER_ICON_IDS = ICON_IDS.filter((id) => id !== "icon-1");

export function iconSrc(iconId) {
  return ICON_IDS.includes(iconId) ? `/icons/${iconId}.png` : null;
}
