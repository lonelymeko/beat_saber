export const LANE_X = [-0.9, -0.3, 0.3, 0.9]
export const ROW_Y = [0.85, 1.35, 1.85]
export const SABER_Z = -1.6
export const SPAWN_DIST = 73.4
export const MISS_Z = -0.35
export const CUT_WINDOW = 1.15
export const CUT_RADIUS = 0.6
export const MIN_SPEED = 1.1

export const DIR_VEC = [
  [0, 1], [0, -1], [-1, 0], [1, 0],
  [-0.7071, 0.7071], [0.7071, 0.7071],
  [-0.7071, -0.7071], [0.7071, -0.7071], [0, 0],
]

export const DIR_ROT = [
  0, Math.PI, Math.PI / 2, -Math.PI / 2,
  Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4, 0,
]

export const NEED = [2, 4, 8]
export const MULT = [1, 2, 4, 8]
export const RING_C = 238.76

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12)
