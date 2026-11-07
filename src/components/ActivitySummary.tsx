import { formatDateTime, formatTimeAgo, formatWalletAge } from '../utils'

type Props = {
  firstSeen: Date | null
  firstSeenChecked: boolean
  firstSeenError: string
  lastActive: Date | null
}

export default function ActivitySummary({
  firstSeen,
  firstSeenChecked,
  firstSeenError,
  lastActive,
}: Props) {
  // "—" means "not available (yet)"
  let firstSeenText = '—'
  if (firstSeen) {
    firstSeenText = formatDateTime(firstSeen)
  } else if (firstSeenChecked) {
    firstSeenText = 'No transaction history found'
  }

  return (
    <section className="card">
      <h2>Activity</h2>

      {firstSeenError && (
        <p className="message message-error" role="alert">
          {firstSeenError}
        </p>
      )}

      <dl className="stat-grid">
        <div className="stat">
          <dt>First Seen</dt>
          <dd>{firstSeenText}</dd>
        </div>
        <div className="stat">
          <dt>Wallet Age</dt>
          <dd>{firstSeen ? formatWalletAge(firstSeen) : '—'}</dd>
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
        Based on normal transactions indexed by Etherscan only. Token
        transfers and internal transactions are not included.
      </p>
    </section>
  )
}