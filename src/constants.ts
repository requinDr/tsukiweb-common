export const ASSETS_PATH = `${import.meta.env.BASE_URL}static/`

export enum ViewRatio {
  unconstrained = "",
  fourByThree = "4/3",
  sixteenByNine = "16/9",
}

export const TEXT_SPEEDS = [
  250, 200, 175, 150, 125, 100, 90, 80, 70, 60, 50, 45, 40, 35,
  30, 25, 20, 18, 16, 14, 12, 10, 8, 6, 5, 4, 3, 2, 1, 0,
] as const
export type TEXT_SPEED = (typeof TEXT_SPEEDS)[any]