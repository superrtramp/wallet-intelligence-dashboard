import ExternalLink from './ExternalLink'
import { etherscanAddressUrl, shorten } from '../utils'

type Props = {
  address: string
  balance: string
  nonce: number | null
  accountType: string
  blockNumber: string
  dataSource: string
}

// Presentation only: receives props, renders them. No fetching, no state.
export default function WalletSummary({
  address,
  balance,
  nonce,
  accountType,
  blockNumber,
  dataSource,
}: Props) {
  return (
    <section className="card">
      <div className="card-header">
        <h2>Wallet Overview</h2>
        <ExternalLink href={etherscanAddressUrl(address)} title={address}>
          {shorten(address)}
        </ExternalLink>
      </div>

      <dl className="stat-grid">
        <div className="stat">
          <dt>ETH Balance</dt>
          <dd>{balance ? `${balance} ETH` : '—'}</dd>
        </div>
        <div className="stat">
          <dt>Nonce</dt>
          <dd>{nonce !== null ? nonce : '—'}</dd>
        </div>
        <div className="stat">
          <dt>Account Type</dt>
          <dd>{accountType || '—'}</dd>
        </div>
        <div className="stat">
          <dt>Current Block</dt>
          <dd>{blockNumber || '—'}</dd>
        </div>
        <div className="stat">
          <dt>Data Source</dt>
          <dd>
            {dataSource ? (
              <span className="badge badge-source">{dataSource}</span>
            ) : (
              '—'
            )}
          </dd>
        </div>
      </dl>
    </section>
  )
}