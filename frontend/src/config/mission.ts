import type { Cell } from '../routing/types'

// Preferred habitat position: a flat area in the lower-left of the mock grid.
// It is only a starting point; the app snaps it to the nearest passable cell,
// so it still lands on a valid spot when the real grid replaces the mock.
export const DEFAULT_HABITAT_CELL: Cell = { col: 15, row: 85 }

// Ready-made demo mission: a target behind the central hill on the mock grid,
// where the shortest route climbs the steep flank (max ≈ 24.6°) and the safest
// goes around it (max ≈ 5.5°). Unlike the habitat it is not snapped: if the
// cell is invalid on another grid, the app simply opens without a target.
export const DEFAULT_TARGET_CELL: Cell = { col: 79, row: 13 }
