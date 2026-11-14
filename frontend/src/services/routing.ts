// Single switch point for the routing engine.
// The rest of the app imports route functions and constants ONLY from here.
// When Person 2's real routing module is ready, replace '../mocks' with '../routing'
// in the export line below; nothing else in the app has to change.
export { findRoute, findAlternatives, checkEva } from '../mocks';
export { DEFAULT_OPTIONS, DEFAULT_EVA_PROFILE, SUIT_FACTOR, MIN_DISTANCE_WEIGHT } from '../mocks';

// Shared types are already the real ones and do not change on the switch.
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
