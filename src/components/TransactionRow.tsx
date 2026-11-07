import { formatEther } from 'viem'
import ExternalLink from './ExternalLink'
import type { Transaction } from '../types'
import {
  etherscanAddressUrl,
  etherscanTxUrl,
  formatDateTime,
  getFunctionInfo,
  getTransactionDirection,
  getTransactionType,
  shorten,
} from '../utils'

type Props = {
  tx: Transaction
  analyzedAddress: string
}

export default function TransactionRow({ tx, analyzedAddress }: Props) {
  // Direction and Type stay as two separate helpers and two separate badges.
  const direction = getTransactionDirection(tx, analyzedAddress)
  const type = getTransactionType(tx)
  const functionInfo = type === 'Contract Interaction' ? getFunctionInfo(tx) : ''
  const date = new Date(Number(tx.timeStamp) * 1000)

  return (
    <li className="tx-row">
      <div className="tx-badges">
        <span className={`badge badge-direction badge-${direction.toLowerCase()}`}>
          {direction}
        </span>
        <span className="badge badge-type">{type}</span>
      </div>

      {functionInfo && <p className="tx-function">{functionInfo}</p>}

      <dl className="tx-details">
        <div className="tx-detail">
          <dt>Hash</dt>
          <dd>
            <ExternalLink href={etherscanTxUrl(tx.hash)} title={tx.hash}>
              {shorten(tx.hash)}
            </ExternalLink>
          </dd>
        </div>
        <div className="tx-detail">
          <dt>From</dt>
          <dd>
            <ExternalLink href={etherscanAddressUrl(tx.from)} title={tx.from}>
              {shorten(tx.from)}
            </ExternalLink>
          </dd>
        </div>
        <div className="tx-detail">
          <dt>To</dt>
          <dd>
            {/* Contract creation has no "to" address, so no link */}
            {tx.to ? (
              <ExternalLink href={etherscanAddressUrl(tx.to)} title={tx.to}>
                {shorten(tx.to)}
              </ExternalLink>
            ) : (
              'Contract Creation'
            )}
          </dd>
        </div>
        <div className="tx-detail">
          <dt>Value</dt>
          <dd>{formatEther(BigInt(tx.value))} ETH</dd>
        </div>
        <div className="tx-detail">
          <dt>Time</dt>
          <dd>{formatDateTime(date)}</dd>
        </div>
      </dl>
    </li>
  )
}