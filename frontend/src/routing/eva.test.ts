import { expect, it } from 'vitest';
import { checkEva, findRoute, DEFAULT_OPTIONS } from './index';
import type { EvaProfile, RouteResult } from './types';

const route: RouteResult = { ok: true, path: [{ col: 0, row: 0 }], profile: [{ distanceM: 0, elevationM: 0, slopeDeg: 0 }], distanceM: 0,
  maxSlopeDeg: 0, meanSlopeDeg: 0, durationMin: 40, returnDurationMin: 20 };
const profile: EvaProfile = { maxEvaMinutes: 100, researchMinutes: 20, safetyMarginPct: 20 };

it('uses independent outbound/return times and includes research at the exact limit', () => {
  expect(checkEva(route, profile)).toEqual({ outboundMin: 40, returnMin: 20, researchMin: 20,
    totalMin: 80, limitMin: 80, withinLimit: true });
});
it('reports the habitat index for an over-limit single-cell EVA', () => {
  const result = checkEva(route, { ...profile, researchMinutes: 21 });
  expect(result.totalMin).toBe(81); expect(result.withinLimit).toBe(false);
  expect(result.pointOfNoReturnIndex).toBe(0);
});
it('handles zero duration and a 100 percent reserve', () => {
  expect(checkEva({ ...route, durationMin: 0, returnDurationMin: 0 },
    { ...profile, researchMinutes: 0, safetyMarginPct: 100 }).withinLimit).toBe(true);
  expect(checkEva(route, { ...profile, safetyMarginPct: 100 }).withinLimit).toBe(false);
});
it.each([
  { maxEvaMinutes: 0 }, { maxEvaMinutes: -1 }, { maxEvaMinutes: Infinity },
  { researchMinutes: -1 }, { researchMinutes: NaN }, { safetyMarginPct: -1 }, { safetyMarginPct: 101 },
])('fails closed on invalid profile %j', patch => {
  expect(checkEva(route, { ...profile, ...patch })).toEqual({ outboundMin: 0, returnMin: 0,
    researchMin: 0, totalMin: 0, limitMin: 0, withinLimit: false });
});
it.each([{ ok: false }, { durationMin: NaN }, { durationMin: -1 }, { returnDurationMin: Infinity },
  { durationMin: Number.MAX_VALUE, returnDurationMin: Number.MAX_VALUE }])('fails closed on invalid/failed route %j', patch => {
  const result = checkEva({ ...route, ...patch }, profile);
  expect(result.withinLimit).toBe(false); expect(result.totalMin).toBe(0);
  expect(Object.values(result).every(v => typeof v !== 'number' || Number.isFinite(v))).toBe(true);
});
it('handles missing runtime values without throwing', () => {
  expect(checkEva(null as unknown as RouteResult, profile).withinLimit).toBe(false);
  expect(checkEva(route, null as unknown as EvaProfile).withinLimit).toBe(false);
});
it('accepts actual A* output and does not mutate inputs', () => {
  const result = findRoute({ version: 1, width: 2, height: 1, cellSize: 10, nodata: -9999,
    elevation: [0, 1], slope: [5, 5], roughness: [0, 0],
    stats: { elevationMin: 0, elevationMax: 1, slopeMax: 5, roughnessP95: 0 } },
  { col: 0, row: 0 }, { col: 1, row: 0 }, DEFAULT_OPTIONS);
  const before = structuredClone(result);
  const eva = checkEva(result, Object.freeze(profile));
  expect(eva.outboundMin).toBe(result.durationMin); expect(eva.returnMin).toBe(result.returnDurationMin);
  expect(eva.outboundMin).not.toBe(eva.returnMin); expect(result).toEqual(before);
});

function directedRoute(): RouteResult {
  return findRoute({ version: 1, width: 3, height: 1, cellSize: 10, nodata: -9999,
    elevation: [0, 1, 0], slope: [5, 5, 5], roughness: [0, 0, 0],
    stats: { elevationMin: 0, elevationMax: 1, slopeMax: 5, roughnessP95: 0 } },
  { col: 0, row: 0 }, { col: 2, row: 0 }, DEFAULT_OPTIONS);
}
it('includes the exact last returnable index using both directed Tobler times', () => {
  const r = directedRoute();
  // Independent conversion: metres / 1000 / speed(km/h) * 60.
  const firstRoundTrip = 10 / 1000 / (6 * Math.exp(-3.5 * Math.abs(0.1 + 0.05)) * 0.6) * 60
    + 10 / 1000 / (6 * Math.exp(-3.5 * Math.abs(-0.1 + 0.05)) * 0.6) * 60;
  const p = { maxEvaMinutes: firstRoundTrip + 1e-12, researchMinutes: 0, safetyMarginPct: 0 };
  expect(checkEva(r, p).pointOfNoReturnIndex).toBe(1);
  expect(checkEva(r, { ...p, maxEvaMinutes: firstRoundTrip - 1e-6 }).pointOfNoReturnIndex).toBe(0);
});
it('excludes research from the return reserve even when research alone exceeds the limit', () => {
  const r = directedRoute();
  const p = { maxEvaMinutes: r.durationMin + r.returnDurationMin + 1, researchMinutes: 100, safetyMarginPct: 0 };
  const result = checkEva(r, p);
  expect(result.withinLimit).toBe(false); expect(result.pointOfNoReturnIndex).toBe(2);
  const within = checkEva(r, { ...p, researchMinutes: 0 });
  expect(within.withinLimit).toBe(true); expect(within).not.toHaveProperty('pointOfNoReturnIndex');
});
it.each([
  { path: [] }, { profile: [] },
  { profile: [{ distanceM: 0, elevationM: NaN, slopeDeg: 0 }] },
  { profile: [{ distanceM: 1, elevationM: 0, slopeDeg: 0 }] },
])('fails closed on malformed path/profile %j', patch => {
  const result = checkEva({ ...route, ...patch }, profile);
  expect(result.totalMin).toBe(0); expect(result.withinLimit).toBe(false);
  expect(result).not.toHaveProperty('pointOfNoReturnIndex');
});
