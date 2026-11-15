import type { DataSource } from '../services/data'

// Default mission positions, defined independently of the grid size so they
// land in the same place on any grid (e.g. the 100×100 mock and "?mock=400").
// The app converts them to cells in map/positions.ts.

/**
 * Position as a fraction (0–1) of the study area: x from the west edge,
 * y from the NORTH (top) edge, the same direction as grid rows.
 * Used for the synthetic mock terrain, whose features scale with the grid.
 */
export interface FractionPosition {
  kind: 'fraction'
  x: number
  y: number
}

/**
 * Position in local map metres (CONTRACT Section 1: origin bottom-left,
 * x east, y north). For real data, once positions are chosen on the real grid.
 */
export interface MapPosition {
  kind: 'map'
  xM: number
  yM: number
}

export type MissionPosition = FractionPosition | MapPosition

export interface MissionDefaults {
  /** null: habitat goes to the passable cell nearest the grid centre. */
  habitat: MissionPosition | null
  /** null: the app opens without a target. */
  target: MissionPosition | null
  /**
   * Why the default habitat site was chosen, shown as "Why here?" on the
   * habitat card while the habitat is still at that site. null: no rationale.
   */
  habitatRationale: HabitatRationale | null
}

export interface HabitatRationale {
  text: string
  /** Small attribution line under the text. */
  note: string
}

export const MISSION_DEFAULTS: Record<DataSource, MissionDefaults> = {
  mock: {
    // A flat area in the lower-left of the mock terrain. Only a starting point:
    // the app snaps it to the nearest passable cell.
    habitat: { kind: 'fraction', x: 0.15, y: 0.85 },
    // Ready-made demo mission: a target behind the central hill, where the
    // shortest route climbs the steep flank and the safest goes around it.
    // Not snapped: if it is not passable the app opens without a target.
    // (Cell 79, 13 on the 100×100 mock grid.)
    target: { kind: 'fraction', x: 0.795, y: 0.135 },
    habitatRationale: null, // synthetic terrain: no site selection to explain
  },
  real: {
    // Habitat site confirmed by the team's science lead (Person 3); the target is a demo choice.
    // Cell centres converted with CONTRACT Section 1 (400×400 grid, 5 m cells, H = 2000 m):
    // x = (col + 0.5) · 5, y = H − (row + 0.5) · 5.
    habitat: { kind: 'map', xM: 602.5, yM: 597.5 }, // cell (120, 280)
    target: { kind: 'map', xM: 1227.5, yM: 1672.5 }, // cell (245, 65)
    // Wording from the team's science lead, used verbatim.
    habitatRationale: {
      text:
        'Cell (120, 280) is selected over Cell (306, 318) (5.4° slope) because habitat deployment requires ground ' +
        'slopes strictly under 5° for module leveling and airlock stability. Located on the flat, consolidated dark ' +
        'mafic crater-floor plain at a 0.4° slope, it provides safe standoff distance from steep western delta ' +
        'scarps and loose sand dunes.',
      note: "Selected by the team's science lead.",
    },
  },
}

/**
 * Fallback grid size for the older stops.json format (a bare array without
 * "gridSize"): those placeholder stops were placed on the 100×100 mock grid.
 * The current file states its own grid size (CONTRACT Section 8).
 */
export const LEGACY_STOPS_GRID_SIZE = { width: 100, height: 100 }
