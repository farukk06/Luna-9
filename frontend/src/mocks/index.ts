// Mirrors the public API of frontend/src/routing/index.ts (CONTRACT Section 9),
// so services/routing.ts can switch between '../mocks' and '../routing' with one line.
export { findRoute, findAlternatives, checkEva } from './mockRouting';
export { DEFAULT_OPTIONS, DEFAULT_EVA_PROFILE, SUIT_FACTOR, MIN_DISTANCE_WEIGHT } from './mockRouting';
export { createMockGrid } from './mockGrid';
