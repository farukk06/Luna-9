// Run actual frontend modules without editing frontend source or installing packages.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'frontend/package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const server = await createServer({ root: resolve(root, 'frontend'), configFile: false,
  server: { middlewareMode: true }, appType: 'custom' });
try {
  const engine = await server.ssrLoadModule('/src/routing/index.ts');
  const data = await server.ssrLoadModule('/src/services/data.ts');
  const colors = await server.ssrLoadModule('/src/map/colorScale.ts');
  const images = await server.ssrLoadModule('/src/map/rasterImages.ts');
  const grid = JSON.parse(readFileSync(resolve(root, 'frontend/public/data/grid.json'), 'utf8'));
  const layers = JSON.parse(readFileSync(resolve(root, 'frontend/public/data/layers.json'), 'utf8'));
  assert(data.isValidGrid(grid));
  assert.deepEqual(layers.map(l => l.id), ['ortho', 'slope', 'roughness']);
  assert.equal(engine.DEFAULT_OPTIONS.maxSlopeDeg, 25);
  const roughness = Buffer.from(images.roughnessPixels(grid));
  assert.deepEqual(roughness, readFileSync(resolve(root, 'data-pipeline/processed/roughness.rgba')));
  const slope = readFileSync(resolve(root, 'data-pipeline/processed/slope.rgba'));
  for (let i = 0; i < 160000; i++) {
    const valid = grid.slope[i] !== grid.nodata && grid.elevation[i] !== grid.nodata;
    const expected = valid ? [...colors.slopeColor(grid.slope[i], 25), 255] : [0,0,0,0];
    assert.deepEqual([...slope.subarray(i*4, i*4+4)], expected);
  }
  const habitat = { col:306, row:318 };
  const points = [['Habitat',habitat],['Stop1',{col:235,row:265}],['Stop2',{col:202,row:202}],['Stop3',{col:146,row:152}]];
  const report = { frontendGridValid: true, exactColorParity: true, points: [], routes: [] };
  for (const [name, cell] of points) {
    const i = cell.row * grid.width + cell.col;
    report.points.push({name,...cell,elevationM:grid.elevation[i],slopeDeg:grid.slope[i],roughnessM:grid.roughness[i],
      passable: grid.elevation[i] !== grid.nodata && grid.slope[i] !== grid.nodata && grid.roughness[i] !== grid.nodata && grid.slope[i] <= engine.DEFAULT_OPTIONS.maxSlopeDeg});
    if (name === 'Habitat') continue;
    const route = engine.findRoute(grid, habitat, cell, engine.DEFAULT_OPTIONS);
    report.routes.push({target:name,ok:route.ok,reason:route.reason,distanceM:route.distanceM,
      maxSlopeDeg:route.maxSlopeDeg,meanSlopeDeg:route.meanSlopeDeg,durationMin:route.durationMin,
      returnDurationMin:route.returnDurationMin,cells:route.path.length});
  }
  writeFileSync(resolve(root, 'data-pipeline/processed/mvp_validation.json'), JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally { await server.close(); }
