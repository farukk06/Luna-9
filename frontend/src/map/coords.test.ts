import { describe, expect, it } from 'vitest'
import type { Cell, Grid } from '../routing/types'
import { createMockGrid } from '../mocks/mockGrid'
import { cellIndex, cellToMap, isPassableCell, mapToCell } from './coords'

/** Minimal grid; non-square with a fractional cell size to catch width/height mix-ups. */
function smallGrid(width: number, height: number, cellSize: number): Grid {
  const n = width * height
  const zeros = new Array<number>(n).fill(0)
  return {
    version: 1,
    width,
    height,
    cellSize,
    nodata: -9999,
    elevation: [...zeros],
    slope: [...zeros],
    roughness: [...zeros],
    stats: { elevationMin: 0, elevationMax: 0, slopeMax: 0, roughnessP95: 0 },
  }
}

const grids: [string, Grid][] = [
  ['mock 100×100, 10 m', createMockGrid()],
  ['7×5, 2.5 m', smallGrid(7, 5, 2.5)],
]

describe.each(grids)('coords on %s grid', (_name, grid) => {
  const W = grid.width * grid.cellSize
  const H = grid.height * grid.cellSize
  const lastCol = grid.width - 1
  const lastRow = grid.height - 1

  it('maps the four corners without overflowing', () => {
    expect(mapToCell(0, 0, grid)).toEqual({ col: 0, row: lastRow })
    expect(mapToCell(W, 0, grid)).toEqual({ col: lastCol, row: lastRow })
    expect(mapToCell(0, H, grid)).toEqual({ col: 0, row: 0 })
    expect(mapToCell(W, H, grid)).toEqual({ col: lastCol, row: 0 })
  })

  it('keeps the middle of each edge inside the grid', () => {
    const edges: [number, number][] = [
      [W, H / 2],
      [0, H / 2],
      [W / 2, H],
      [W / 2, 0],
    ]
    for (const [x, y] of edges) {
      const cell = mapToCell(x, y, grid)
      expect(cell).not.toBeNull()
      expect(cell!.col).toBeGreaterThanOrEqual(0)
      expect(cell!.col).toBeLessThanOrEqual(lastCol)
      expect(cell!.row).toBeGreaterThanOrEqual(0)
      expect(cell!.row).toBeLessThanOrEqual(lastRow)
      expect(cellIndex(cell!, grid)).toBeLessThan(grid.width * grid.height)
    }
  })

  it('returns null outside the study area', () => {
    expect(mapToCell(-1, H / 2, grid)).toBeNull()
    expect(mapToCell(W + 1, H / 2, grid)).toBeNull()
    expect(mapToCell(W / 2, -1, grid)).toBeNull()
    expect(mapToCell(W / 2, H + 1, grid)).toBeNull()
    expect(mapToCell(-0.001, -0.001, grid)).toBeNull()
  })

  it('round-trips cell → map → cell for corner and sample cells', () => {
    const cells: Cell[] = [
      { col: 0, row: 0 },
      { col: lastCol, row: 0 },
      { col: 0, row: lastRow },
      { col: lastCol, row: lastRow },
      { col: Math.floor(lastCol / 2), row: Math.floor(lastRow / 3) },
      { col: 1, row: lastRow - 1 },
      { col: lastCol - 2, row: 2 },
    ]
    for (const cell of cells) {
      const p = cellToMap(cell, grid)
      expect(mapToCell(p.x, p.y, grid)).toEqual(cell)
    }
  })
})

describe('cellIndex / isPassableCell', () => {
  const grid = createMockGrid()

  it('uses row-major order', () => {
    expect(cellIndex({ col: 0, row: 0 }, grid)).toBe(0)
    expect(cellIndex({ col: 3, row: 2 }, grid)).toBe(203)
  })

  it('treats NoData cells as impassable and data cells as passable', () => {
    expect(isPassableCell({ col: 99, row: 0 }, grid)).toBe(false) // mock NoData corner
    expect(isPassableCell({ col: 10, row: 90 }, grid)).toBe(true)
  })
})
