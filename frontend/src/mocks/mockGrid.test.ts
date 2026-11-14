import { describe, expect, it } from 'vitest';
import { LARGE_MOCK_SPEC, createMockGrid } from './mockGrid';

// The large mock grid only exists for performance tests on the real grid's size.
describe('createMockGrid(LARGE_MOCK_SPEC)', () => {
  const small = createMockGrid();
  const large = createMockGrid(LARGE_MOCK_SPEC);
  const isNodata = (col: number, row: number) => large.elevation[row * large.width + col] === large.nodata;

  it('has the real grid size: 400×400 cells of 5 m (2 × 2 km)', () => {
    expect(large.width).toBe(400);
    expect(large.height).toBe(400);
    expect(large.cellSize).toBe(5);
    expect(large.elevation).toHaveLength(160000);
    expect(large.slope).toHaveLength(160000);
    expect(large.roughness).toHaveLength(160000);
  });

  it('scales the NoData corner (cols ≥ 368, rows ≤ 31)', () => {
    expect(isNodata(368, 31)).toBe(true);
    expect(isNodata(399, 0)).toBe(true);
    expect(isNodata(367, 0)).toBe(false);
    expect(isNodata(399, 32)).toBe(false);
  });

  it('keeps the same terrain shape: a central hill above 25° and the same elevation range', () => {
    expect(large.stats.slopeMax).toBeGreaterThan(25);
    const centre = large.slope[200 * 400 + 200];
    expect(centre).toBeLessThan(5); // the hill top is flat, its flanks are steep
    expect(large.stats.elevationMax - large.stats.elevationMin).toBeGreaterThan(
      small.stats.elevationMax - small.stats.elevationMin,
    );
  });
});
