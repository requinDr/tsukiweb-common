export const ASSETS_PATH = `${import.meta.env.BASE_URL}static/`

export enum ViewRatio {
  unconstrained = "",
  fourByThree = "4/3",
  sixteenByNine = "16/9",
}

export enum TEXT_SPEED {
  instant = 0,
  fast = 1,
  normal = 20,
  slow = 50,
}