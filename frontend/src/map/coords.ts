import type { Cell, Grid } from '../routing/types'

// Map coordinate (x, y in metres, origin bottom-left, y north) <-> grid cell
// (col, row, origin top-left, row south). Formulas from CONTRACT Section 1.

export interface MapPoint {
  x: number
  y: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function mapSize(grid: Grid): { W: number; H: number } {
  return { W: grid.width * grid.cellSize, H: grid.height * grid.cellSize }
}

/** Cell under a map point, or null outside the study area. */
export function mapToCell(x: number, y: number, grid: Grid): Cell | null {
  const { W, H } = mapSize(grid)
  if (x < 0 || x > W || y < 0 || y > H) return null
  // clamp: x = W or y = 0 would give col = width / row = height (one past the end).
  return {
    col: clamp(Math.floor(x / grid.cellSize), 0, grid.width - 1),
    row: clamp(Math.floor((H - y) / grid.cellSize), 0, grid.height - 1),
  }
}

/** Map coordinate of the cell centre. */
export function cellToMap(cell: Cell, grid: Grid): MapPoint {
  const { H } = mapSize(grid)
  return {
    x: (cell.col + 0.5) * grid.cellSize,
    y: H - (cell.row + 0.5) * grid.cellSize,
  }
}

/** Row-major array index. */
export function cellIndex(cell: Cell, grid: Grid): number {
  return cell.row * grid.width + cell.col
}

/** True when the cell has data. The max-slope limit is the routing engine's job. */
export function isPassableCell(cell: Cell, grid: Grid): boolean {
  const i = cellIndex(cell, grid)
  return grid.elevation[i] !== grid.nodata && grid.slope[i] !== grid.nodata
}
