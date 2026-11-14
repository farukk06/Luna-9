import type { Cell, Grid } from '../routing/types'
import { cellIndex, isPassableCell } from './coords'
import { formatNumber } from './format'

function inBounds(cell: Cell, grid: Grid): boolean {
  return cell.col >= 0 && cell.col < grid.width && cell.row >= 0 && cell.row < grid.height
}

/**
 * Why a cell cannot be used as a habitat/target, or null if it can.
 * Same rule as the routing engine (NoData or slope above the limit), checked
 * here too so the user gets immediate feedback instead of a failed route.
 */
export function passabilityIssue(cell: Cell, grid: Grid, maxSlopeDeg: number): string | null {
  if (!inBounds(cell, grid) || !isPassableCell(cell, grid)) return 'Not passable: no data'
  const slope = grid.slope[cellIndex(cell, grid)]
  if (slope > maxSlopeDeg) {
    return `Not passable: slope ${formatNumber(slope, 1)}° (limit ${formatNumber(maxSlopeDeg, 0)}°)`
  }
  return null
}

export function isPassableWithSlope(cell: Cell, grid: Grid, maxSlopeDeg: number): boolean {
  return passabilityIssue(cell, grid, maxSlopeDeg) === null
}

/** Cells on the square ring at Chebyshev distance r around the centre. */
function ringCells(center: Cell, r: number): Cell[] {
  if (r === 0) return [center]
  const cells: Cell[] = []
  for (let d = -r; d <= r; d++) {
    cells.push({ col: center.col + d, row: center.row - r }, { col: center.col + d, row: center.row + r })
  }
  for (let d = -r + 1; d <= r - 1; d++) {
    cells.push({ col: center.col - r, row: center.row + d }, { col: center.col + r, row: center.row + d })
  }
  return cells
}

function distance(a: Cell, b: Cell): number {
  return Math.hypot(a.col - b.col, a.row - b.row)
}

/**
 * The cell itself if passable, otherwise the passable cell with the smallest
 * straight-line distance, searched in growing rings; null if none exists.
 * The centre may lie outside the grid (e.g. a default from another dataset).
 */
export function findNearestPassableCell(cell: Cell, grid: Grid, maxSlopeDeg: number): Cell | null {
  const maxRing = Math.max(grid.width, grid.height) + Math.abs(cell.col) + Math.abs(cell.row)
  let best: Cell | null = null
  for (let r = 0; r <= maxRing; r++) {
    // Every cell on ring r is at least r away, so a closer hit cannot appear later.
    if (best && distance(best, cell) <= r) break
    for (const c of ringCells(cell, r)) {
      if (!isPassableWithSlope(c, grid, maxSlopeDeg)) continue
      if (!best || distance(c, cell) < distance(best, cell)) best = c
    }
  }
  return best
}
