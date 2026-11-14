// Display settings for the three alternative routes (CONTRACT Section 9).
export type RouteKind = 'shortest' | 'safest' | 'balanced'

export const ROUTE_KINDS: readonly RouteKind[] = ['shortest', 'safest', 'balanced']

export const ROUTE_LABELS: Record<RouteKind, string> = {
  shortest: 'Shortest',
  safest: 'Safest',
  balanced: 'Balanced',
}

export const ROUTE_COLORS: Record<RouteKind, string> = {
  shortest: '#f08a24', // orange
  safest: '#3d8fe0', // blue
  balanced: '#3fbf5f', // green
}

/** Map marker colours, shared by the map layer and the legend. */
export const MARKER_COLORS = {
  habitat: '#3fae5c',
  target: '#e8892c',
  pointOfNoReturn: '#e5484d',
  scienceStop: '#ffffff',
} as const
