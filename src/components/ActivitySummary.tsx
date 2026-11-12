import type { FirstObservedActivity } from '../types'
import { formatDateTime, formatTimeAgo, formatWalletAge } from '../utils'

type Props = {
  firstObserved: FirstObservedActivity | null
  firstObservedChecked: boolean
  firstObservedError: string
  lastActive: Date | null
}

export default function ActivitySummary({
  firstObserved,
  firstObservedChecked,
  firstObservedError,
  lastActive,
}: Props) {
  // Dates are derived here from the Unix-seconds timestamp.
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
  const sourceText = firstObserved
    ? firstObserved.sources.map((s) => s.sourceLabel).join(' + ')
    : '—'

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
          <dt>Source</dt>
          <dd>{sourceText}</dd>
        </div>
        <div className="stat">
          <dt>Wallet Age</dt>
          <dd>{firstObservedDate ? formatWalletAge(firstObservedDate) : '—'}</dd>
        </div>
        <div className="stat">
          <dt>Last Active</dt>
          <dd>
            {lastActive ? (
              <>
                <span>{formatTimeAgo(lastActive)}</span>
                <span className="stat-sub">{formatDateTime(lastActive)}</span>
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
      </dl>

      <p className="hint">
        First Observed Activity is the earliest activity found across normal,
        ERC-20, ERC-721, ERC-1155 and internal transactions indexed by Etherscan.
        It is not the date the wallet was created. Last Active uses normal
        transactions only.
      </p>
    </section>
  )
}