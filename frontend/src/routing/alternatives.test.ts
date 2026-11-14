import { afterEach, expect, it, vi } from 'vitest';
import { findAlternatives, DEFAULT_OPTIONS } from './index';
import * as engine from './findRoute';
import type { Grid, RouteResult, RouteOptions } from './types';
import { SAFEST_WEIGHTS } from './config';

const cell = (col: number, row = 1) => ({ col, row });
function grid(): Grid {
  return { version: 1, width: 5, height: 3, cellSize: 10, nodata: -9999,
    elevation: Array(15).fill(0), slope: Array(15).fill(0), roughness: Array(15).fill(0),
    stats: { elevationMin: 0, elevationMax: 0, slopeMax: 20, roughnessP95: 1 } };
}
afterEach(() => vi.restoreAllMocks());
it.each([
  ['invalid-input', 'Route could not be computed (invalid input)'],
  ['out-of-bounds', 'Point is outside the study area'],
  ['start-blocked', 'Habitat cell is not passable'],
  ['goal-blocked', 'Target cell is not passable'],
  ['unreachable', 'No safe route within the slope limit'],
] as const)('explains balanced failure %s with no recommendation', (reason, message) => {
  vi.spyOn(engine, 'findRoute').mockReturnValue({ ...bad, reason });
  const result = findAlternatives(grid(), cell(0), cell(4), DEFAULT_OPTIONS);
  expect(result.recommended).toBeNull(); expect(result.reason).toBe(message);
});
it('returns identical flat routes and deterministically prefers balanced on ties', () => {
  const result = findAlternatives(grid(), cell(0), cell(4), DEFAULT_OPTIONS);
  expect(result.shortest).toEqual(result.balanced); expect(result.safest).toEqual(result.balanced);
  expect(result.recommended).toBe('balanced'); expect(result.reason).toContain('ties prefer balanced');
});
it('applies scenario weights and preserves balanced user options and shared obstacles', () => {
  const g = grid(); g.slope[7] = 20;
  const options = { ...DEFAULT_OPTIONS, wSlope: 0, wRoughness: 0 };
  const before = structuredClone(g);
  const result = findAlternatives(g, cell(0), cell(4), Object.freeze(options));
  expect(result.balanced).toEqual(engine.findRoute(g, cell(0), cell(4), options));
  expect(result.shortest.path).toContainEqual(cell(2)); expect(result.safest.path).not.toContainEqual(cell(2));
  expect(result.safest).toEqual(engine.findRoute(g, cell(0), cell(4), { ...options, ...SAFEST_WEIGHTS }));
  expect(result.recommended).toBe('safest'); expect(g).toEqual(before);
  g.slope.fill(40, 5, 10);
  const blocked = findAlternatives(g, cell(0), cell(4), options);
  expect([blocked.shortest, blocked.safest, blocked.balanced].every(r => !r.ok)).toBe(true);
});
it('reports no recommendation explicitly when every route fails', () => {
  const g = grid(); g.slope.fill(40, 5, 10);
  const result = findAlternatives(g, cell(0, 0), cell(4, 2), DEFAULT_OPTIONS);
  expect(result.recommended).toBeNull(); expect(result.reason).toBe('No safe route within the slope limit');
  expect([result.shortest, result.safest, result.balanced].every(r => !r.ok)).toBe(true);
});
it.each([{ wSlope: -1 }, { wRoughness: NaN }, { maxSlopeDeg: 91 }])('does not mask invalid options %j', patch => {
  const result = findAlternatives(grid(), cell(0), cell(4), { ...DEFAULT_OPTIONS, ...patch });
  expect([result.shortest, result.safest, result.balanced].every(r => !r.ok)).toBe(true);
});
it('handles missing options and out-of-bounds endpoints', () => {
  expect(findAlternatives(grid(), cell(0), cell(4), null as unknown as RouteOptions).balanced.ok).toBe(false);
  expect(findAlternatives(grid(), cell(-1), cell(4), DEFAULT_OPTIONS).shortest.reason).toBe('out-of-bounds');
});

const good: RouteResult = { ok: true, path: [cell(0)], profile: [], distanceM: 10,
  maxSlopeDeg: 5, meanSlopeDeg: 3, durationMin: 4, returnDurationMin: 2 };
const bad: RouteResult = { ...good, ok: false, reason: 'unreachable', path: [] };
it.each([
  [good, bad, bad, 'balanced'], [bad, good, bad, 'shortest'], [bad, bad, good, 'safest'],
  [good, good, bad, 'balanced'], [bad, good, good, 'safest'],
])('never recommends a failed candidate when a successful one exists', (balanced, shortest, safest, expected) => {
  vi.spyOn(engine, 'findRoute').mockReturnValueOnce(balanced as RouteResult)
    .mockReturnValueOnce(shortest as RouteResult).mockReturnValueOnce(safest as RouteResult);
  expect(findAlternatives(grid(), cell(0), cell(4), DEFAULT_OPTIONS).recommended).toBe(expected);
});
it.each([
  { maxSlopeDeg: 4 }, { meanSlopeDeg: 2 }, { durationMin: 3 }, { returnDurationMin: 1 }, { distanceM: 9 },
])('compares slope, both durations and distance deterministically: %j', patch => {
  vi.spyOn(engine, 'findRoute').mockReturnValueOnce(good).mockReturnValueOnce({ ...good, ...patch }).mockReturnValueOnce(bad);
  expect(findAlternatives(grid(), cell(0), cell(4), DEFAULT_OPTIONS).recommended).toBe('shortest');
});
