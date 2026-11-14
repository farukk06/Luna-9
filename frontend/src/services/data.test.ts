import { describe, expect, it } from 'vitest';
import { createMockGrid } from '../mocks/mockGrid';
import { type SourceContext, isValidGrid, layerSourceLabel, mockSpecFromSearch, parseGridSource } from './data';

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

describe('parseGridSource', () => {
  it('reads only string dem/ortho fields', () => {
    expect(parseGridSource({ source: { dem: ' DEM name ', ortho: 'Ortho name', crs: 'x' } })).toEqual({
      dem: 'DEM name',
      ortho: 'Ortho name',
    });
    expect(parseGridSource({ source: { dem: 5, ortho: '' } })).toEqual({});
    expect(parseGridSource({})).toEqual({});
  });
});

describe('layerSourceLabel', () => {
  const real: SourceContext = {
    gridSource: 'real',
    gridSourceInfo: { dem: 'DEM from grid.json', ortho: 'Ortho from grid.json' },
    layersSource: 'real',
    layers: [{ id: 'slope', title: 'Slope', file: 'slope.png', source: 'Slope from layers.json' }],
  };

  it('prefers layers.json, then grid.json source', () => {
    expect(layerSourceLabel('slope', real)).toBe('Slope from layers.json');
    expect(layerSourceLabel('ortho', real)).toBe('Ortho from grid.json');
    expect(layerSourceLabel('roughness', real)).toBe('DEM from grid.json (derived)');
  });

  it('says "not specified" instead of inventing a source', () => {
    expect(layerSourceLabel('ortho', { ...real, gridSourceInfo: {}, layers: [] })).toBe('not specified');
  });

  it('shows the mock text whenever the grid is mock', () => {
    expect(layerSourceLabel('slope', { ...real, gridSource: 'mock' })).toBe('Mock data – real data pending');
  });
});

describe('mockSpecFromSearch', () => {
  it('forces the 400×400 mock grid only for ?mock=400', () => {
    expect(mockSpecFromSearch('?mock=400')).toEqual({ cells: 400, cellSize: 5 });
    expect(mockSpecFromSearch('?foo=1&mock=400')).toEqual({ cells: 400, cellSize: 5 });
    expect(mockSpecFromSearch('')).toBeNull();
    expect(mockSpecFromSearch('?mock=100')).toBeNull();
    expect(mockSpecFromSearch('?mock')).toBeNull();
  });
});
