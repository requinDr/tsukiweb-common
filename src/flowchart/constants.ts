export const SCENE_WIDTH = 31
export const SCENE_HEIGHT = 22
export const COLUMN_WIDTH = SCENE_WIDTH + 2
export const DY = 3
export const OVERLAP_BREAK_LENGTH = 2

export const SCENE_RECT_ATTRS = {
	width: SCENE_WIDTH,
	height: SCENE_HEIGHT,
	x: -SCENE_WIDTH/2,
	y: -SCENE_HEIGHT/2
}

export enum FcNodeState {
	HIDDEN,
	UNSEEN,
	DISABLED,
	ENABLED
}