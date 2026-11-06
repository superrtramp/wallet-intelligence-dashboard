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

type FirstSeenResponse = {
  hash?: string
  blockNumber?: string
  timeStamp?: string
  firstSeen?: null
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

async function fetchFirstSeen(address: string): Promise<FirstSeenResponse> {
  const response = await fetch(`http://localhost:3001/api/first-seen/${address}`)

  if (!response.ok) {
    throw new Error('First seen request failed')
  }

  return response.json()
}

// Turns a start date into text like "3 years, 4 months", "7 months" or "12 days"
function formatWalletAge(startDate: Date) {
  const now = new Date()

  let years = now.getFullYear() - startDate.getFullYear()
  let months = now.getMonth() - startDate.getMonth()

  if (now.getDate() < startDate.getDate()) {
    months -= 1
  }

  if (months < 0) {
    years -= 1
    months += 12
  }

  if (years > 0) {
    const yearText = `${years} ${years === 1 ? 'year' : 'years'}`
    if (months === 0) {
      return yearText
    }
    return `${yearText}, ${months} ${months === 1 ? 'month' : 'months'}`
  }

  if (months > 0) {
    return `${months} ${months === 1 ? 'month' : 'months'}`
  }

  const msPerDay = 1000 * 60 * 60 * 24
  const days = Math.floor((now.getTime() - startDate.getTime()) / msPerDay)
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

// Turns a past date into text like "2 hours ago", "4 days ago" or "3 months ago"
function formatTimeAgo(pastDate: Date) {
  const seconds = Math.floor((Date.now() - pastDate.getTime()) / 1000)

  if (seconds < 60) {
    return 'just now'
  }

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  }

  const days = Math.floor(hours / 24)
  if (days < 30) {
    return `${days} ${days === 1 ? 'day' : 'days'} ago`
  }

  const months = Math.floor(days / 30)
  if (months < 12) {
    return `${months} ${months === 1 ? 'month' : 'months'} ago`
  }

  const years = Math.floor(days / 365)
  return `${years} ${years === 1 ? 'year' : 'years'} ago`
}

// Works out the searched wallet's role in a normal transaction.
// Addresses are lowercased first so letter case never affects the comparison.
function getTransactionDirection(tx: Transaction, walletAddress: string) {
  const wallet = walletAddress.toLowerCase()
  const from = tx.from.toLowerCase()
  const to = (tx.to || '').toLowerCase() // "to" can be empty for contract creation

  if (from === wallet && to === wallet) {
    return 'SELF'
  }

  if (from === wallet) {
    return 'OUT'
  }

  if (to === wallet) {
    return 'IN'
  }

  return 'UNKNOWN'
}

function App() {
  const [address, setAddress] = useState('')
  // The address that was actually analyzed (the input box can change afterwards)
  const [analyzedAddress, setAnalyzedAddress] = useState('')
  const [balance, setBalance] = useState('')
  const [transactionCount, setTransactionCount] = useState<number | null>(null)
  const [accountType, setAccountType] = useState('')
  const [blockNumber, setBlockNumber] = useState('')
  // null = not loaded yet, [] = loaded but empty
  const [transactions, setTransactions] = useState<Transaction[] | null>(null)
  const [transactionError, setTransactionError] = useState('')
  // null = not loaded yet
  const [firstSeen, setFirstSeen] = useState<Date | null>(null)
  const [firstSeenChecked, setFirstSeenChecked] = useState(false)
  const [firstSeenError, setFirstSeenError] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [backendStatus, setBackendStatus] = useState('')

  // Last Active comes from the newest transaction we already fetched.
  // The backend returns transactions newest first, so index 0 is the latest.
  const lastActive =
    transactions !== null && transactions.length > 0
      ? new Date(Number(transactions[0].timeStamp) * 1000)
      : null

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

  async function loadFirstSeen(validAddress: string) {
    try {
      const data = await fetchFirstSeen(validAddress)

      if (data.timeStamp) {
        setFirstSeen(new Date(Number(data.timeStamp) * 1000))
      }

      setFirstSeenChecked(true)
    } catch (err) {
      setFirstSeenError('Unable to fetch wallet age')
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
    setFirstSeen(null)
    setFirstSeenChecked(false)
    setFirstSeenError('')
    setAnalyzedAddress('')

    if (!isAddress(address)) {
      setError('Invalid Ethereum address')
      return
    }

    setAnalyzedAddress(address)
    setLoading(true)

    // Each function handles its own errors, so one failing
    // does not break the others. They still run at the same time.
    await Promise.all([
      loadWalletData(address),
      loadTransactions(address),
      loadFirstSeen(address),
    ])

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

      {firstSeen && (
        <>
          <p>First Seen: {firstSeen.toLocaleString()}</p>
          <p>Wallet Age: {formatWalletAge(firstSeen)}</p>
        </>
      )}

      {firstSeenChecked && !firstSeen && (
        <p>First Seen: No transaction history found</p>
      )}

      {firstSeenError && <p>{firstSeenError}</p>}

      {lastActive && (
        <>
          <p>Last Active: {lastActive.toLocaleString()}</p>
          <p>Last Active: {formatTimeAgo(lastActive)}</p>
        </>
      )}

      {transactionError && <p>{transactionError}</p>}

      {transactions !== null && transactions.length === 0 && (
        <p>No recent transactions found</p>
      )}

      {transactions !== null && transactions.length > 0 && (
        <div>
          <h2>Recent Transactions</h2>
          {transactions.map((tx) => (
            <p key={tx.hash}>
              {getTransactionDirection(tx, analyzedAddress)} | Hash:{' '}
              {shorten(tx.hash)} | From: {shorten(tx.from)} | To:{' '}
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