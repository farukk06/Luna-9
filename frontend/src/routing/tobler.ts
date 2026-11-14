import { SUIT_FACTOR } from './config';

export function stepMinutes(distanceM: number, fromElevationM: number, toElevationM: number): number {
  // grade = tan(theta); 60 / (1000 * 6) converts metres and km/hour to minutes.
  const grade = (toElevationM - fromElevationM) / distanceM;
  return distanceM / (100 * SUIT_FACTOR) * Math.exp(3.5 * Math.abs(grade + 0.05));
}
