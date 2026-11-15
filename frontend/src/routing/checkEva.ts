import type { EvaCheck, EvaProfile, RouteResult } from './types';
import { stepMinutes } from './tobler';

export function checkEva(route: RouteResult, profile: EvaProfile): EvaCheck {
  // EvaCheck has no invalid-input status: fail closed without exposing usable times.
  const invalid: EvaCheck = { outboundMin: 0, researchMin: 0, returnMin: 0, totalMin: 0, limitMin: 0, withinLimit: false };
  if (!route || !route.ok || !profile
    || ![route.durationMin, route.returnDurationMin, profile.maxEvaMinutes, profile.researchMinutes, profile.safetyMarginPct]
      .every(v => Number.isFinite(v) && v >= 0)
    || profile.maxEvaMinutes <= 0 || profile.safetyMarginPct > 100) return invalid;
  const totalMin = route.durationMin + profile.researchMinutes + route.returnDurationMin;
  const limitMin = profile.maxEvaMinutes * (1 - profile.safetyMarginPct / 100);
  if (!Number.isFinite(totalMin) || !Number.isFinite(limitMin)) return invalid;
  if (!Array.isArray(route.path) || !Array.isArray(route.profile) || route.path.length === 0
    || route.path.length !== route.profile.length) return invalid;
  let outbound = 0, back = 0, pointOfNoReturnIndex = 0;
  for (let i = 0; i < route.profile.length; i++) {
    const p = route.profile[i], cell = route.path[i];
    if (!p || !cell || !Number.isInteger(cell.col) || !Number.isInteger(cell.row)
      || cell.col < 0 || cell.row < 0 || !Number.isFinite(p.distanceM) || !Number.isFinite(p.elevationM)
      || !Number.isFinite(p.slopeDeg) || p.slopeDeg < 0 || p.slopeDeg > 90
      || (i === 0 && p.distanceM !== 0)) return invalid;
    if (i > 0) {
      const previous = route.profile[i - 1];
      const d = p.distanceM - previous.distanceM;
      if (d <= 0) return invalid;
      outbound += stepMinutes(d, previous.elevationM, p.elevationM);
      back += stepMinutes(d, p.elevationM, previous.elevationM);
      if (!Number.isFinite(outbound + back)) return invalid;
      if (outbound + back <= limitMin) pointOfNoReturnIndex = i;
    }
  }
  const withinLimit = totalMin <= limitMin;
  return { outboundMin: route.durationMin, researchMin: profile.researchMinutes,
    returnMin: route.returnDurationMin, totalMin, limitMin, withinLimit,
    ...(!withinLimit ? { pointOfNoReturnIndex } : {}) };
}
