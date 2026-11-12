import type { FirstObservedActivity } from '../types'
import type { LastObservedActivity } from '../activity'
import { formatDateTime, formatTimeAgo, formatWalletAge } from '../utils'

type Props = {
  firstObserved: FirstObservedActivity | null
  firstObservedChecked: boolean
  firstObservedError: string
  // Only non-null when the unified Activity[] is COMPLETE.
  lastObserved: LastObservedActivity | null
  activityComplete: boolean // all five sources resolved (empty counts as resolved)
  activityFailed: boolean // at least one source really failed
}

export default function ActivitySummary({
  firstObserved,
  firstObservedChecked,
  firstObservedError,
  lastObserved,
  activityComplete,
  activityFailed,
}: Props) {
  const firstObservedDate = firstObserved
    ? new Date(Number(firstObserved.timeStamp) * 1000)
    : null

  // "—" means "not available (yet)"
  let firstObservedText = '—'
  if (firstObservedDate) {
    firstObservedText = formatDateTime(firstObservedDate)
  } else if (firstObservedChecked) {
    firstObservedText = 'No activity found'
  }

  // If several sources tie at the earliest moment, show all of them.
  const firstSourceText = firstObserved
    ? firstObserved.sources.map((s) => s.sourceLabel).join(' + ')
    : '—'

  // Last Observed: authoritative only when the unified data is complete.
  const lastObservedDate = lastObserved
    ? new Date(Number(lastObserved.timeStamp) * 1000)
    : null

  let lastObservedContent = <>—</>
  if (activityComplete) {
    lastObservedContent = lastObservedDate ? (
      <>
        <span>{formatTimeAgo(lastObservedDate)}</span>
        <span className="stat-sub">{formatDateTime(lastObservedDate)}</span>
      </>
    ) : (
      <>No activity found</>
    )
  } else if (activityFailed) {
    lastObservedContent = <>Unavailable — activity data incomplete</>
  }

  const lastSourceText = lastObserved ? lastObserved.sourceLabels.join(' + ') : '—'

  return (
    <section className="card">
      <h2>Activity</h2>

      {firstObservedError && (
        <p className="message message-error" role="alert">
          {firstObservedError}
        </p>
      )}

      <dl className="stat-grid">
        <div className="stat">
          <dt>First Observed Activity</dt>
          <dd>{firstObservedText}</dd>
        </div>
        <div className="stat">
          <dt>First Observed Source</dt>
          <dd>{firstSourceText}</dd>
        </div>
        <div className="stat">
          <dt>Wallet Age</dt>
          <dd>{firstObservedDate ? formatWalletAge(firstObservedDate) : '—'}</dd>
        </div>
        <div className="stat">
          <dt>Last Observed Activity</dt>
          <dd>{lastObservedContent}</dd>
        </div>
        <div className="stat">
          <dt>Last Observed Source</dt>
          <dd>{lastSourceText}</dd>
        </div>
      </dl>

      <p className="hint">
        Based on normal, ERC-20, ERC-721, ERC-1155 and internal activity indexed
        by Etherscan. First Observed Activity is not the date the wallet was
        created. Last Observed Activity is computed from the most recent records
        we fetched.
      </p>
    </section>
  )
}