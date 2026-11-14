import { describe, expect, it } from 'vitest';
import { createMockGrid } from '../mocks/mockGrid';
import { isValidGrid } from './data';

describe('isValidGrid', () => {
  const grid = createMockGrid();

  it('accepts the mock grid', () => {
    expect(isValidGrid(grid)).toBe(true);
  });

  it('rejects non-objects (e.g. HTML text or null)', () => {
    expect(isValidGrid(null)).toBe(false);
    expect(isValidGrid('<!doctype html>')).toBe(false);
    expect(isValidGrid([])).toBe(false);
  });

  it.each(['version', 'width', 'height', 'cellSize', 'nodata', 'stats', 'elevation', 'slope', 'roughness'])(
    'rejects a grid without "%s"',
    (field) => {
      const broken: Record<string, unknown> = { ...grid };
      delete broken[field];
      expect(isValidGrid(broken)).toBe(false);
    },
  );

  it('rejects stats with a missing field', () => {
    const { roughnessP95: _dropped, ...stats } = grid.stats;
    expect(isValidGrid({ ...grid, stats })).toBe(false);
  });

  it('rejects arrays whose length is not width × height', () => {
    expect(isValidGrid({ ...grid, elevation: grid.elevation.slice(1) })).toBe(false);
    expect(isValidGrid({ ...grid, slope: [...grid.slope, 0] })).toBe(false);
    expect(isValidGrid({ ...grid, width: grid.width + 1 })).toBe(false);
  });

  it('rejects non-numeric array values', () => {
    const roughness: unknown[] = [...grid.roughness];
    roughness[5] = 'x';
    expect(isValidGrid({ ...grid, roughness })).toBe(false);
  });
});
