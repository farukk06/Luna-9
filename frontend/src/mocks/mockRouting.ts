import type {
  Alternatives,
  Cell,
  EvaCheck,
  EvaProfile,
  Grid,
  ProfilePoint,
  RouteOptions,
  RouteResult,
} from '../routing/types';

// Mock routing engine with the CONTRACT Section 9 signatures.
// The path is a straight Bresenham line (no A*), but all metrics on it are
// computed for real so the UI can be built against realistic numbers.

// Scenario parameters, values copied from CONTRACT Section 9.
export const DEFAULT_OPTIONS: RouteOptions = { wDistance: 1, wSlope: 3, wRoughness: 2, maxSlopeDeg: 25 };
export const MIN_DISTANCE_WEIGHT = 0.1;
export const SUIT_FACTOR = 0.6;
export const DEFAULT_EVA_PROFILE: EvaProfile = { maxEvaMinutes: 240, researchMinutes: 30, safetyMarginPct: 20 };

/** Tobler hiking speed (km/h) × suit factor. tanTheta > 0 means uphill. */
export function toblerSpeedKmh(tanTheta: number): number {
  return 6 * Math.exp(-3.5 * Math.abs(tanTheta + 0.05)) * SUIT_FACTOR;
}

/** Minutes needed for one step of horizontal length d with elevation change dz. */
function stepMinutes(d: number, dz: number): number {
  const hours = d / 1000 / toblerSpeedKmh(dz / d);
  return hours * 60;
}

/** Bresenham line between two cells, both ends included. */
export function bresenhamLine(start: Cell, goal: Cell): Cell[] {
  const cells: Cell[] = [];
  let { col, row } = start;
  const dc = Math.abs(goal.col - col);
  const dr = -Math.abs(goal.row - row);
  const sc = col < goal.col ? 1 : -1;
  const sr = row < goal.row ? 1 : -1;
  let err = dc + dr;
  for (;;) {
    cells.push({ col, row });
    if (col === goal.col && row === goal.row) break;
    const e2 = 2 * err;
    if (e2 >= dr) {
      err += dr;
      col += sc;
    }
    if (e2 <= dc) {
      err += dc;
      row += sr;
    }
  }
  return cells;
}

function inBounds(grid: Grid, c: Cell): boolean {
  return c.col >= 0 && c.col < grid.width && c.row >= 0 && c.row < grid.height;
}

function indexOf(grid: Grid, c: Cell): number {
  return c.row * grid.width + c.col;
}

/** Same passability rule as the real engine: NoData or slope above the limit is blocked. */
function isPassable(grid: Grid, c: Cell, maxSlopeDeg: number): boolean {
  const i = indexOf(grid, c);
  const slope = grid.slope[i];
  return grid.elevation[i] !== grid.nodata && slope !== grid.nodata && slope <= maxSlopeDeg;
}

function failedRoute(reason: NonNullable<RouteResult['reason']>): RouteResult {
  return {
    ok: false,
    reason,
    path: [],
    distanceM: 0,
    maxSlopeDeg: 0,
    meanSlopeDeg: 0,
    durationMin: 0,
    returnDurationMin: 0,
    profile: [],
  };
}

function buildProfile(grid: Grid, path: Cell[]): ProfilePoint[] {
  let distance = 0;
  return path.map((cell, k) => {
    if (k > 0) {
      const diagonal = cell.col !== path[k - 1].col && cell.row !== path[k - 1].row;
      distance += diagonal ? Math.SQRT2 * grid.cellSize : grid.cellSize;
    }
    const i = indexOf(grid, cell);
    return { distanceM: distance, elevationM: grid.elevation[i], slopeDeg: grid.slope[i] };
  });
}

/**
 * Distance-weighted mean slope (CONTRACT v3, Section 9): each edge's slope is
 * the mean of its two end cells, weighted by edge length, so diagonal steps
 * count √2 times more. A single-cell path returns that cell's slope.
 */
export function distanceWeightedMeanSlope(profile: ProfilePoint[]): number {
  if (profile.length === 1) return profile[0].slopeDeg
  let weighted = 0
  let length = 0
  for (let k = 1; k < profile.length; k++) {
    const d = profile[k].distanceM - profile[k - 1].distanceM
    weighted += ((profile[k].slopeDeg + profile[k - 1].slopeDeg) / 2) * d
    length += d
  }
  return weighted / length
}

/** Walking time along the profile; reverse=true walks goal → start (theta sign flips). */
function profileMinutes(profile: ProfilePoint[], from: number, to: number, reverse: boolean): number {
  let total = 0;
  for (let k = from + 1; k <= to; k++) {
    const d = profile[k].distanceM - profile[k - 1].distanceM;
    const dz = profile[k].elevationM - profile[k - 1].elevationM;
    total += stepMinutes(d, reverse ? -dz : dz);
  }
  return total;
}

export function findRoute(grid: Grid, start: Cell, goal: Cell, options: RouteOptions): RouteResult {
  if (!inBounds(grid, start) || !inBounds(grid, goal)) return failedRoute('out-of-bounds');
  if (!isPassable(grid, start, options.maxSlopeDeg)) return failedRoute('start-blocked');
  if (!isPassable(grid, goal, options.maxSlopeDeg)) return failedRoute('goal-blocked');

  const path = bresenhamLine(start, goal);
  // The mock cannot route around obstacles, so a blocked line is reported
  // as unreachable instead of returning a path the real engine never would.
  if (!path.every((c) => isPassable(grid, c, options.maxSlopeDeg))) return failedRoute('unreachable');

  const profile = buildProfile(grid, path);
  const slopes = profile.map((p) => p.slopeDeg);
  const last = profile.length - 1;
  return {
    ok: true,
    path,
    distanceM: profile[last].distanceM,
    maxSlopeDeg: Math.max(...slopes),
    meanSlopeDeg: distanceWeightedMeanSlope(profile),
    durationMin: profileMinutes(profile, 0, last, false),
    returnDurationMin: profileMinutes(profile, 0, last, true),
    profile,
  };
}

export function findAlternatives(grid: Grid, start: Cell, goal: Cell, options: RouteOptions): Alternatives {
  const route = findRoute(grid, start, goal, options);
  return {
    shortest: route,
    safest: route,
    balanced: route,
    recommended: 'balanced',
    reason: 'Mock route – real routing pending',
  };
}

/**
 * Last path index from which the astronaut can still turn back and reach the
 * start within the limit (outbound to k + return from k). Research time is not
 * counted because the target is not reached in that case.
 */
function pointOfNoReturn(route: RouteResult, limitMin: number): number {
  let lastSafe = 0;
  for (let k = 1; k < route.profile.length; k++) {
    const roundTrip = profileMinutes(route.profile, 0, k, false) + profileMinutes(route.profile, 0, k, true);
    if (roundTrip > limitMin) break;
    lastSafe = k;
  }
  return lastSafe;
}

export function checkEva(route: RouteResult, profile: EvaProfile): EvaCheck {
  const outboundMin = route.durationMin;
  const researchMin = profile.researchMinutes;
  const returnMin = route.returnDurationMin;
  const totalMin = outboundMin + researchMin + returnMin;
  const limitMin = profile.maxEvaMinutes * (1 - profile.safetyMarginPct / 100);
  // A failed route is never "within limit", even though its durations are 0.
  const withinLimit = route.ok && totalMin <= limitMin;
  const check: EvaCheck = { outboundMin, researchMin, returnMin, totalMin, limitMin, withinLimit };
  if (route.ok && !withinLimit) check.pointOfNoReturnIndex = pointOfNoReturn(route, limitMin);
  return check;
}
