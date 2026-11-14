import type { Cell, Grid } from '../routing/types'
import type { MissionPosition } from '../config/mission'
import { mapToCell } from './coords'

// Converts grid-independent mission positions (config/mission.ts) to cells.

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Cell containing a fractional position; 1.0 is clamped to the last cell. */
export function fractionToCell(x: number, y: number, grid: Grid): Cell {
  return {
    col: clamp(Math.floor(x * grid.width), 0, grid.width - 1),
    row: clamp(Math.floor(y * grid.height), 0, grid.height - 1),
  }
}

/** Cell for a mission position, or null when a metre position lies outside the study area. */
export function positionToCell(position: MissionPosition, grid: Grid): Cell | null {
  if (position.kind === 'fraction') return fractionToCell(position.x, position.y, grid)
  return mapToCell(position.xM, position.yM, grid)
}

export function gridCenterCell(grid: Grid): Cell {
  return { col: Math.floor(grid.width / 2), row: Math.floor(grid.height / 2) }
}

export function describePosition(position: MissionPosition): string {
  return position.kind === 'fraction' ? `fraction (${position.x}, ${position.y})` : `map (${position.xM} m, ${position.yM} m)`
}
