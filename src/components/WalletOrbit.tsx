import ExternalLink from './ExternalLink'
import type { OrbitItem } from '../orbit'
import { ORBIT_ACTIVITY_LIMIT } from '../orbit'
import {
  etherscanAddressUrl,
  etherscanTxUrl,
  formatDateTime,
  shorten,
} from '../utils'

type Props = {
  walletAddress: string
  items: OrbitItem[] // already derived from Activity[] by App
  complete: boolean // unifiedActivityComplete
  failedSources: string[] // sources that really failed
}

// Short text shown inside each node so the source type is visible.
const SOURCE_TAG: Record<OrbitItem['sourceType'], string> = {
  normal: 'TX',
  erc20: 'ERC20',
  erc721: '721',
  erc1155: '1155',
  internal: 'INT',
}

const DIRECTION_COLOR: Record<OrbitItem['direction'], string> = {
  IN: 'var(--green)',
  OUT: 'var(--orange)',
  SELF: 'var(--blue)',
  UNKNOWN: 'var(--border)',
}

const SIZE = 600
const CENTER = SIZE / 2
const RING_RADIUS = 220
const NODE_RADIUS = 22

// Presentation only. It receives already-derived items and makes NO requests.
export default function WalletOrbit({
  walletAddress,
  items,
  complete,
  failedSources,
}: Props) {
  // Refuse to draw anything that could pass partial data off as complete.
  if (!complete) {
    return (
      <section className="card">
        <h2>Wallet Orbit</h2>
        {failedSources.length > 0 ? (
          <p className="message message-error" role="alert">
            Wallet Orbit unavailable — activity data is incomplete
            (failed: {failedSources.join(', ')})
          </p>
        ) : (
          <p className="message message-info">Loading activity data…</p>
        )}
      </section>
    )
  }

  if (items.length === 0) {
    return (
      <section className="card">
        <h2>Wallet Orbit</h2>
        <p className="message message-info">
          No activity found in the analyzed window
        </p>
      </section>
    )
  }

  return (
    <section className="card">
      <h2>Wallet Orbit</h2>

      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ width: '100%', maxWidth: 560, display: 'block', margin: '0 auto' }}
        role="img"
        aria-label="Wallet Orbit: recent activity around the analyzed wallet"
      >
        {items.map((item, i) => {
          const angle = (2 * Math.PI * i) / items.length - Math.PI / 2
          const x = CENTER + RING_RADIUS * Math.cos(angle)
          const y = CENTER + RING_RADIUS * Math.sin(angle)
          const color = DIRECTION_COLOR[item.direction]

          return (
            <g key={item.id}>
              <title>
                {`${item.direction} · ${item.sourceLabel} · ${
                  item.counterparty ? shorten(item.counterparty) : 'no counterparty'
                }`}
              </title>
              <line
                x1={CENTER}
                y1={CENTER}
                x2={x}
                y2={y}
                style={{ stroke: color, strokeWidth: 1.5 }}
              />
              <circle
                cx={x}
                cy={y}
                r={NODE_RADIUS}
                style={{ fill: 'var(--surface-2)', stroke: color, strokeWidth: 1.5 }}
              />
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fill: 'var(--text)', fontSize: 10 }}
              >
                {SOURCE_TAG[item.sourceType]}
              </text>
            </g>
          )
        })}

        <circle
          cx={CENTER}
          cy={CENTER}
          r={42}
          style={{ fill: 'var(--surface-2)', stroke: 'var(--border)', strokeWidth: 2 }}
        />
        <text
          x={CENTER}
          y={CENTER}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fill: 'var(--text)', fontSize: 13 }}
        >
          Wallet
        </text>
      </svg>

      <p className="hint">
        Latest {Math.min(items.length, ORBIT_ACTIVITY_LIMIT)} activity records for{' '}
        <ExternalLink href={etherscanAddressUrl(walletAddress)} title={walletAddress}>
          {shorten(walletAddress)}
        </ExternalLink>
        . One node per record (no aggregation yet). Line color: green = IN,
        orange = OUT, blue = SELF.
      </p>

      {/* The same items as text, so every drawn node can be verified. */}
      <ul className="tx-list" style={{ marginTop: '0.9rem' }}>
        {items.map((item) => (
          <li className="tx-row" key={item.id}>
            <div className="tx-badges">
              <span
                className={`badge badge-direction badge-${item.direction.toLowerCase()}`}
              >
                {item.direction}
              </span>
              <span className="badge badge-type">{item.sourceLabel}</span>
            </div>
            <dl className="tx-details">
              <div className="tx-detail">
                <dt>Other</dt>
                <dd>
                  {item.counterparty ? (
                    <ExternalLink
                      href={etherscanAddressUrl(item.counterparty)}
                      title={item.counterparty}
                    >
                      {shorten(item.counterparty)}
                    </ExternalLink>
                  ) : (
                    item.note || 'No direct counterparty'
                  )}
                </dd>
              </div>
              <div className="tx-detail">
                <dt>Hash</dt>
                <dd>
                  <ExternalLink href={etherscanTxUrl(item.hash)} title={item.hash}>
                    {shorten(item.hash)}
                  </ExternalLink>
                </dd>
              </div>
              <div className="tx-detail">
                <dt>Time</dt>
                <dd>{formatDateTime(new Date(Number(item.timeStamp) * 1000))}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  )
}