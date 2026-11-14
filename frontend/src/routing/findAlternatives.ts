import type { Alternatives, Cell, Grid, RouteOptions } from './types';
import { findRoute } from './findRoute';
import { RECOMMENDATION_ORDER, SAFEST_WEIGHTS } from './config';

export function findAlternatives(grid: Grid, start: Cell, goal: Cell, options: RouteOptions): Alternatives {
  const balanced = findRoute(grid, start, goal, options);
  // Do not hide invalid user weights by overwriting them with scenario defaults.
  const valid = !!options && [options.wDistance, options.wSlope, options.wRoughness].every(v => Number.isFinite(v) && v >= 0)
    && Number.isFinite(options.maxSlopeDeg) && options.maxSlopeDeg >= 0 && options.maxSlopeDeg <= 90;
  const shortest = valid ? findRoute(grid, start, goal, { ...options, wSlope: 0, wRoughness: 0 }) : balanced;
  const safest = valid ? findRoute(grid, start, goal, { ...options, ...SAFEST_WEIGHTS,
    wSlope: Math.max(SAFEST_WEIGHTS.wSlope, options.wSlope),
    wRoughness: Math.max(SAFEST_WEIGHTS.wRoughness, options.wRoughness) }) : balanced;
  const routes = { shortest, safest, balanced };
  const candidates = RECOMMENDATION_ORDER.filter(key => routes[key].ok);
  // Scenario ranking: lower slopes first, then round-trip time and distance; stable ties prefer balanced.
  candidates.sort((a, b) => {
    const x = routes[a], y = routes[b];
    return x.maxSlopeDeg - y.maxSlopeDeg || x.meanSlopeDeg - y.meanSlopeDeg
      || (x.durationMin + x.returnDurationMin) - (y.durationMin + y.returnDurationMin)
      || x.distanceM - y.distanceM;
  });
  const recommended = candidates[0] ?? 'balanced';
  const reason = candidates.length === 0
    ? 'No usable route was produced; balanced is a placeholder, not a recommendation.'
    : `${recommended}: scenario ranking uses maximum slope, mean slope, round-trip time, then distance; ties prefer balanced, safest, shortest.`;
  return { ...routes, recommended, reason };
}
