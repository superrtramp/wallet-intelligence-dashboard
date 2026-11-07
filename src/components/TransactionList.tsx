import TransactionRow from './TransactionRow'
import type { Transaction } from '../types'

type Props = {
  transactions: Transaction[] | null // null = not loaded yet
  transactionError: string
  analyzedAddress: string
}

export default function TransactionList({
  transactions,
  transactionError,
  analyzedAddress,
}: Props) {
  return (
    <section className="card">
      <h2>Recent Transactions</h2>

      {transactionError && (
        <p className="message message-error" role="alert">
          {transactionError}
        </p>
      )}

      {!transactionError && transactions === null && (
        <p className="message message-info">Loading transactions…</p>
      )}

      {transactions !== null && transactions.length === 0 && (
        <p className="message message-info">No recent transactions found</p>
      )}

      {transactions !== null && transactions.length > 0 && (
        <ul className="tx-list">
          {transactions.map((tx) => (
            <TransactionRow
              key={tx.hash}
              tx={tx}
              analyzedAddress={analyzedAddress}
            />
          ))}
        </ul>
      )}
    </section>
  )
}