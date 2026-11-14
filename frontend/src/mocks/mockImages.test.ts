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
    }
    for (const px of [hillshadePixels(grid), roughnessPixels(grid)]) {
      expect(alphaAt(px, grid.width - 1, grid.height - 1)).toBe(255);
    }
  });

  it('draws slope opacity from the slope: flat cells transparent, steep cells opaque', () => {
    const px = slopePixels(grid, 25);
    const steepest = grid.slope.indexOf(grid.stats.slopeMax);
    const flattest = grid.slope.findIndex((s) => s !== grid.nodata && s <= 3);
    expect(px[steepest * 4 + 3]).toBe(255);
    expect(px[flattest * 4 + 3]).toBe(0);
  });
});
