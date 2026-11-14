import type { Cell, Grid } from '../routing/types'
import type { AssessmentResult } from './routeAssess'

// Messages between useRouteAssessment and routeWorker. The grid is sent once
// (copying 3 × 160 000 numbers per request would cost more than it saves);
// each request then carries only the two cells and an id.

export type WorkerRequest =
  | { type: 'grid'; grid: Grid }
  | { type: 'assess'; id: number; habitat: Cell; target: Cell }

export type WorkerResponse =
  | ({ type: 'result'; id: number } & AssessmentResult)
  | { type: 'error'; id: number; message: string }
