export const POSITIONS = ['bg', 'l', 'c', 'r'] as const

export enum ViewRatio {
  unconstrained = "",
  fourByThree = "4/3",
  sixteenByNine = "16/9",
}

export const TEXT_SPEED_MAX = 3000
export const TEXT_SPEED_STEP_WIDTH = TEXT_SPEED_MAX / 30 // to always have 30 steps like the other settings

export function TextSettingsToCharacterDelay(xi: number) {
  xi = 1 - xi / TEXT_SPEED_MAX; // normalize input between 1 and 0
  const slowest = 50;
  const zoom = 0.18; // zoom on the exponent function (steepness of the curve)
  return (((slowest * zoom + 1) ** xi) - 1) / zoom
}