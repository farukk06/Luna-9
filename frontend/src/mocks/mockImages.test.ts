import { describe, expect, it } from 'vitest';
import { createMockGrid } from './mockGrid';
import { hillshadePixels } from './mockImages';
import { roughnessPixels, slopePixels } from '../map/rasterImages';

// Canvas is not available in the Node test environment, so the pure pixel
// functions are tested instead of the data-URL wrappers.
describe('generated images', () => {
  const grid = createMockGrid();
  const alphaAt = (px: Uint8ClampedArray, col: number, row: number) => px[(row * grid.width + col) * 4 + 3];

  it('leaves NoData cells transparent and keeps row 0 at the top', () => {
    // The mock NoData patch is in the north-east corner (row 0, last column).
    for (const px of [hillshadePixels(grid), slopePixels(grid, 25), roughnessPixels(grid)]) {
      expect(alphaAt(px, grid.width - 1, 0)).toBe(0);
      expect(alphaAt(px, grid.width - 1, grid.height - 1)).toBe(255);
    }
  });
});
