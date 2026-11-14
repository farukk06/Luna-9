// Single switch point for the routing engine.
// The rest of the app imports route functions and constants ONLY from here.
// Now backed by Person 2's real A* engine in ../routing (CONTRACT Section 9).
// To fall back to the mock engine for debugging, change '../routing' to '../mocks'.
export { findRoute, findAlternatives, checkEva } from '../routing';
export { DEFAULT_OPTIONS, DEFAULT_EVA_PROFILE, SUIT_FACTOR, MIN_DISTANCE_WEIGHT } from '../routing';

// Shared types do not change on the switch.
export type {
  Grid,
  Cell,
  RouteOptions,
  ProfilePoint,
  RouteResult,
  Alternatives,
  EvaProfile,
  EvaCheck,
} from '../routing/types';
