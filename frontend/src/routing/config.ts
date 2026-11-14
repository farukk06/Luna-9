import type { EvaProfile, RouteOptions } from './types';

export const DEFAULT_OPTIONS: RouteOptions = { wDistance: 1, wSlope: 3, wRoughness: 2, maxSlopeDeg: 25 };
export const MIN_DISTANCE_WEIGHT = 0.1;
export const SUIT_FACTOR = 0.6;
export const DEFAULT_EVA_PROFILE: EvaProfile = { maxEvaMinutes: 240, researchMinutes: 30, safetyMarginPct: 20 };
