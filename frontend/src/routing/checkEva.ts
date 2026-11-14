import type { EvaCheck, EvaProfile, RouteResult } from './types';

export function checkEva(route: RouteResult, profile: EvaProfile): EvaCheck {
  // v2 has no invalid-input status: fail closed without exposing fabricated usable times.
  const invalid: EvaCheck = { outboundMin: 0, researchMin: 0, returnMin: 0, totalMin: 0, limitMin: 0, withinLimit: false };
  if (!route || !route.ok || !profile
    || ![route.durationMin, route.returnDurationMin, profile.maxEvaMinutes, profile.researchMinutes, profile.safetyMarginPct]
      .every(v => Number.isFinite(v) && v >= 0)
    || profile.maxEvaMinutes <= 0 || profile.safetyMarginPct > 100) return invalid;
  const totalMin = route.durationMin + profile.researchMinutes + route.returnDurationMin;
  const limitMin = profile.maxEvaMinutes * (1 - profile.safetyMarginPct / 100);
  if (!Number.isFinite(totalMin) || !Number.isFinite(limitMin)) return invalid;
  // pointOfNoReturnIndex needs a contract definition of the per-point return reserve.
  return { outboundMin: route.durationMin, researchMin: profile.researchMinutes,
    returnMin: route.returnDurationMin, totalMin, limitMin, withinLimit: totalMin <= limitMin };
}
