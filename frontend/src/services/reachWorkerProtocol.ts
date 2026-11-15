import type { Cell, Grid } from '../routing/types'
import type { StopReachInput } from '../panels/reachability'
import type { AssessParams } from './routeAssess'
import type { ReachStop } from './reachAssess'

// Messages between useReachability and reachWorker. Like the route worker,
// the grid is sent once; each request carries the habitat, stops and scenario.

export type ReachRequest =
  | { type: 'grid'; grid: Grid }
  | { type: 'reach'; id: number; habitat: Cell; stops: ReachStop[]; params: AssessParams }

export type ReachResponse =
  | { type: 'result'; id: number; results: StopReachInput[] }
  | { type: 'error'; id: number; message: string }
