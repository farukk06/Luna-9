import type { Alternatives } from '../routing/types'
import { type BlockedContext, blockedCellDetail, firstFailureMessage, firstFailureReason } from './routeAssessment'

/** CONTRACT failure message, plus a reason line when the habitat/target cell is blocked. */
function RouteFailure({ alternatives, context }: { alternatives: Alternatives; context: BlockedContext }) {
  const detail = blockedCellDetail(firstFailureReason(alternatives), context)
  return (
    <div className="route-failure">
      <p>{firstFailureMessage(alternatives)}</p>
      {detail && <p className="route-failure-detail">{detail}</p>}
    </div>
  )
}

export default RouteFailure
