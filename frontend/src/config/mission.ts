import type { Cell } from '../routing/types'

// Preferred habitat position: a flat area in the lower-left of the mock grid.
// It is only a starting point; the app snaps it to the nearest passable cell,
// so it still lands on a valid spot when the real grid replaces the mock.
export const DEFAULT_HABITAT_CELL: Cell = { col: 15, row: 85 }
