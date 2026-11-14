import { describe, expect, it } from 'vitest';
import { createMockGrid } from './mockGrid';
import { colorForValue, hillshadePixels, slopePixels } from './mockImages';

// Canvas is not available in the Node test environment, so the pure pixel
// functions are tested instead of the data-URL wrappers.
describe('mock images', () => {
  const grid = createMockGrid();
  const alphaAt = (px: Uint8ClampedArray, col: number, row: number) => px[(row * grid.width + col) * 4 + 3];

  it('leaves NoData cells transparent and keeps row 0 at the top', () => {
    // The mock NoData patch is in the north-east corner (row 0, last column).
    for (const px of [hillshadePixels(grid), slopePixels(grid)]) {
      expect(alphaAt(px, grid.width - 1, 0)).toBe(0);
      expect(alphaAt(px, grid.width - 1, grid.height - 1)).toBe(255);
    }
  });

  it('uses the CONTRACT legend colours at the stops', () => {
    expect(colorForValue(0, [{ value: 0, color: '#2b83ba' }, { value: 30, color: '#d7191c' }])).toEqual([43, 131, 186]);
    expect(colorForValue(45, [{ value: 0, color: '#2b83ba' }, { value: 30, color: '#d7191c' }])).toEqual([215, 25, 28]);
  });
});
