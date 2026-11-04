import { useState } from 'react'
import {
  createPublicClient,
  http,
  isAddress,
  formatEther,
} from 'viem'
import { mainnet } from 'viem/chains'

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
})

type Transaction = {
  hash: string
  from: string
  to: string
  value: string
  blockNumber: string
  timeStamp: string
}

function shorten(text: string) {
  return `${text.slice(0, 6)}...${text.slice(-4)}`
}

async function fetchTransactions(address: string): Promise<Transaction[]> {
  const response = await fetch(`http://localhost:3001/api/transactions/${address}`)

  if (!response.ok) {
    throw new Error('Transaction request failed')
  }

  return response.json()
}

function App() {
  const [address, setAddress] = useState('')
  const [balance, setBalance] = useState('')
  const [transactionCount, setTransactionCount] = useState<number | null>(null)
  const [accountType, setAccountType] = useState('')
  const [blockNumber, setBlockNumber] = useState('')
  // null = not loaded yet, [] = loaded but empty
  const [transactions, setTransactions] = useState<Transaction[] | null>(null)
  const [transactionError, setTransactionError] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [backendStatus, setBackendStatus] = useState('')

  async function loadWalletData(validAddress: `0x${string}`) {
    try {
      const [rawBalance, count, bytecode, block] = await Promise.all([
        publicClient.getBalance({ address: validAddress }),
        publicClient.getTransactionCount({ address: validAddress }),
        publicClient.getBytecode({ address: validAddress }),
        publicClient.getBlockNumber(),
      ])

      setBalance(formatEther(rawBalance))
      setTransactionCount(count)

      if (bytecode && bytecode !== '0x') {
        setAccountType('Contract')
      } else {
        setAccountType('EOA')
      }

      setBlockNumber(block.toString())
    } catch (err) {
      setError('Unable to fetch wallet data')
    }
  }

  async function loadTransactions(validAddress: string) {
    try {
      const recentTransactions = await fetchTransactions(validAddress)
      setTransactions(recentTransactions)
    } catch (err) {
      setTransactionError('Unable to fetch transaction history')
    }
  }

  async function handleAnalyze() {
    setError('')
    setBalance('')
    setTransactionCount(null)
    setAccountType('')
    setBlockNumber('')
    setTransactions(null)
    setTransactionError('')

    if (!isAddress(address)) {
      setError('Invalid Ethereum address')
      return
    }

    setLoading(true)

    // Each function handles its own errors, so one failing
    // does not break the other. They still run at the same time.
    await Promise.all([loadWalletData(address), loadTransactions(address)])

    setLoading(false)
  }

  async function handleCheckBackend() {
    setBackendStatus('')

    try {
      const response = await fetch('http://localhost:3001/api/health')
      const data = await response.json()

      if (data.status === 'ok') {
        setBackendStatus('Connected')
      } else {
        setBackendStatus('Unavailable')
      }
    } catch (err) {
      setBackendStatus('Unavailable')
    }
  }

  return (
    <section id="center">
      <h1>Wallet Intelligence</h1>
      <p>Enter an Ethereum address to inspect the wallet.</p>
      <input
        type="text"
        placeholder="0x..."
        value={address}
        onChange={(e) => setAddress(e.target.value)}
      />
      <button type="button" onClick={handleAnalyze} disabled={loading}>
        {loading ? 'Analyzing...' : 'Analyze Wallet'}
      </button>
      {balance && <p>ETH Balance: {balance} ETH</p>}
      {transactionCount !== null && <p>Transaction Count: {transactionCount}</p>}
      {accountType && <p>Account Type: {accountType}</p>}
      {blockNumber && <p>Current Block: {blockNumber}</p>}
      {error && <p>{error}</p>}

      {transactionError && <p>{transactionError}</p>}

      {transactions !== null && transactions.length === 0 && (
        <p>No recent transactions found</p>
      )}

      {transactions !== null && transactions.length > 0 && (
        <div>
          <h2>Recent Transactions</h2>
          {transactions.map((tx) => (
            <p key={tx.hash}>
              Hash: {shorten(tx.hash)} | From: {shorten(tx.from)} | To:{' '}
              {tx.to ? shorten(tx.to) : 'Contract Creation'} | Value:{' '}
              {formatEther(BigInt(tx.value))} ETH |{' '}
              {new Date(Number(tx.timeStamp) * 1000).toLocaleString()}
            </p>
          ))}
        </div>
      )}

      <button type="button" onClick={handleCheckBackend}>
        Check Backend
      </button>
      {backendStatus && <p>Backend Status: {backendStatus}</p>}
    </section>
  )
}

export default App