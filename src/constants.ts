export const POSITIONS = ['bg', 'l', 'c', 'r'] as const

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